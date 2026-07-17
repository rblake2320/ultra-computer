/**
 * Docker Sandbox Execution Environment
 * 
 * Runs arbitrary shell commands inside ephemeral Docker containers instead of
 * the host filesystem. Each agent session gets its own container with:
 * 
 * - Bind-mounted sandbox directory for persistent file I/O
 * - CPU and memory resource limits
 * - Configurable network isolation (default: disabled)
 * - Automatic container cleanup on timeout or idle
 * - Fail-closed behavior if Docker is unavailable
 * 
 * Container lifecycle:
 * 1. On first bash call, a warm container is created (or reused from pool)
 * 2. Commands execute via `docker exec` inside the running container
 * 3. Container stays alive for the session (reused across tool calls)
 * 4. Idle containers are reaped after IDLE_TIMEOUT_MS
 * 5. All containers are force-killed on server shutdown
 */

import { execFile, spawn, spawnSync } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { isPathInside } from "./pathSafety.js";
import { resolveSandboxPath, SANDBOX_DIR } from "./sandboxPaths.js";

const execFileAsync = promisify(execFile);

// ─── Configuration ───────────────────────────────────────────────────────────

export interface DockerSandboxConfig {
  /** Docker image to use. Should have common tools (python3, node, curl, jq, git). */
  image: string;
  /** Max CPU cores per container (e.g., "1.0") */
  cpuLimit: string;
  /** Max memory per container (e.g., "512m") */
  memoryLimit: string;
  /** Command execution timeout in ms */
  execTimeoutMs: number;
  /** Whether containers have network access */
  networkEnabled: boolean;
  /** Max concurrent containers */
  maxContainers: number;
  /** Idle timeout before reaping a container (ms) */
  idleTimeoutMs: number;
  /** Whether Docker sandbox execution is enabled */
  enabled: boolean;
}

const DEFAULT_CONFIG: DockerSandboxConfig = {
  image: "ubuntu:22.04",
  cpuLimit: "1.0",
  memoryLimit: "512m",
  execTimeoutMs: 30_000,
  networkEnabled: false,
  maxContainers: 5,
  idleTimeoutMs: 300_000, // 5 minutes
  enabled: true,
};

const IMAGE_REFERENCE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:@]*$/;
const MEMORY_LIMIT_RE = /^([1-9]\d*)([kmgt])(?:i?b)?$/i;

export function validateDockerSandboxConfig(
  partial: Partial<DockerSandboxConfig>,
  current: DockerSandboxConfig = DEFAULT_CONFIG,
): DockerSandboxConfig {
  const candidate = { ...current, ...partial };
  if (!IMAGE_REFERENCE_RE.test(candidate.image)) {
    throw new Error("Invalid Docker image name");
  }
  if (!/^\d+(?:\.\d{1,3})?$/.test(candidate.cpuLimit)) {
    throw new Error("cpuLimit must be a decimal between 0.01 and 64");
  }
  const cpu = Number(candidate.cpuLimit);
  if (!Number.isFinite(cpu) || cpu < 0.01 || cpu > 64) {
    throw new Error("cpuLimit must be a decimal between 0.01 and 64");
  }
  const memory = MEMORY_LIMIT_RE.exec(candidate.memoryLimit);
  if (!memory) {
    throw new Error("memoryLimit must use a positive k, m, g, or t unit");
  }
  const factors: Record<string, number> = {
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
  };
  const bytes = Number(memory[1]) * factors[memory[2].toLowerCase()];
  if (!Number.isSafeInteger(bytes) || bytes < 16 * 1024 ** 2 || bytes > 64 * 1024 ** 3) {
    throw new Error("memoryLimit must be between 16m and 64g");
  }
  if (!Number.isInteger(candidate.execTimeoutMs) || candidate.execTimeoutMs < 1000 || candidate.execTimeoutMs > 600_000) {
    throw new Error("execTimeoutMs must be between 1000 and 600000");
  }
  if (!Number.isInteger(candidate.maxContainers) || candidate.maxContainers < 1 || candidate.maxContainers > 50) {
    throw new Error("maxContainers must be between 1 and 50");
  }
  if (!Number.isInteger(candidate.idleTimeoutMs) || candidate.idleTimeoutMs < 30_000 || candidate.idleTimeoutMs > 3_600_000) {
    throw new Error("idleTimeoutMs must be between 30000 and 3600000");
  }
  if (typeof candidate.networkEnabled !== "boolean" || typeof candidate.enabled !== "boolean") {
    throw new Error("networkEnabled and enabled must be booleans");
  }
  return {
    ...candidate,
    cpuLimit: String(cpu),
    memoryLimit: candidate.memoryLimit.toLowerCase(),
  };
}

// ─── Container State ─────────────────────────────────────────────────────────

interface ContainerState {
  containerId: string;
  sessionId: string;
  sandboxDir: string;
  createdAt: number;
  lastUsedAt: number;
  status: "starting" | "ready" | "busy" | "stopping" | "stopped";
}

// ─── DockerSandbox Class ─────────────────────────────────────────────────────

/** Validate a docker container ID (64-char hex or 12-char short hex) */
function isValidContainerId(id: string): boolean {
  return /^[a-f0-9]{12,64}$/.test(id);
}

export class DockerSandbox {
  private config: DockerSandboxConfig;
  private containers = new Map<string, ContainerState>();
  // Tracks sessions where container creation is in progress — prevents concurrent duplicate creation
  private pendingCreation = new Map<string, Promise<ContainerState>>();
  private dockerAvailable: boolean | null = null;
  private reaperInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<DockerSandboxConfig> = {}) {
    this.config = validateDockerSandboxConfig(config);
  }

  // ─── Docker availability detection ───────────────────────────────────────

  async isDockerAvailable(): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable;

    try {
      const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
        timeout: 5000,
      });
      this.dockerAvailable = !!stdout.trim();
      if (this.dockerAvailable) {
        console.log(`[DockerSandbox] Docker detected: v${stdout.trim()}`);
        this.startReaper();
      }
    } catch {
      this.dockerAvailable = false;
      console.warn("[DockerSandbox] Docker not available — shell execution will fail closed");
    }

    return this.dockerAvailable;
  }

  /** Reset detection cache (e.g. after Docker is installed) */
  resetDetection() {
    this.dockerAvailable = null;
  }

  /** Whether the sandbox is both enabled and Docker is available */
  async isActive(): Promise<boolean> {
    return this.config.enabled && (await this.isDockerAvailable());
  }

  // ─── Configuration ──────────────────────────────────────────────────────

  updateConfig(partial: Partial<DockerSandboxConfig>) {
    const next = validateDockerSandboxConfig(partial, this.config);
    // Reset detection if image changed
    if (next.image !== this.config.image) this.dockerAvailable = null;
    this.config = next;
  }

  getConfig(): DockerSandboxConfig {
    return { ...this.config };
  }

  getStatus(): {
    dockerAvailable: boolean;
    enabled: boolean;
    activeContainers: number;
    maxContainers: number;
    containers: Array<{
      sessionId: string;
      containerId: string;
      status: string;
      age: string;
      idleSince: string;
    }>;
  } {
    const now = Date.now();
    return {
      dockerAvailable: this.dockerAvailable ?? false,
      enabled: this.config.enabled,
      activeContainers: this.containers.size,
      maxContainers: this.config.maxContainers,
      containers: Array.from(this.containers.values()).map(c => ({
        sessionId: c.sessionId,
        containerId: c.containerId.substring(0, 12),
        status: c.status,
        age: formatDuration(now - c.createdAt),
        idleSince: formatDuration(now - c.lastUsedAt),
      })),
    };
  }

  // ─── Container lifecycle ─────────────────────────────────────────────────

  /**
   * Get or create a container for a session.
   * Sessions map to agent runs — each run gets an isolated container.
   * Handles concurrent creation via a pendingCreation map to avoid race conditions.
   */
  async getContainer(sessionId: string, sandboxDir: string): Promise<ContainerState> {
    // Reuse existing container for this session
    const existing = this.containers.get(sessionId);
    if (existing && existing.status === "ready") {
      existing.lastUsedAt = Date.now();
      return existing;
    }

    // If creation is already in progress for this session, wait for it
    const inFlight = this.pendingCreation.get(sessionId);
    if (inFlight) {
      return inFlight;
    }

    // Check pool limit
    if (this.containers.size >= this.config.maxContainers) {
      // Try to evict the oldest idle container
      const evicted = this.evictOldest();
      if (!evicted) {
        throw new Error(
          `Container pool full (${this.config.maxContainers} max). ` +
          "Increase maxContainers or wait for idle containers to be reaped."
        );
      }
    }

    // Create new container, tracking the promise to prevent concurrent duplicates
    const creationPromise = this.createContainer(sessionId, sandboxDir)
      .finally(() => this.pendingCreation.delete(sessionId));
    this.pendingCreation.set(sessionId, creationPromise);
    return creationPromise;
  }

  private async createContainer(sessionId: string, sandboxDir: string): Promise<ContainerState> {
    const sessionSlug = sessionId.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 24);
    const sessionHash = createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
    const label = `ultra-sandbox-${sessionSlug || "session"}-${sessionHash}`;

    const containedDir = resolveSandboxPath(sandboxDir);
    if (!containedDir) throw new Error("Sandbox mount must remain inside the application sandbox");
    if (!fs.existsSync(containedDir)) fs.mkdirSync(containedDir, { recursive: true });
    const realSandboxDir = fs.realpathSync(containedDir);
    if (!isPathInside(SANDBOX_DIR, realSandboxDir)) {
      throw new Error("Sandbox mount resolved outside the application sandbox");
    }

    const state: ContainerState = {
      containerId: "",
      sessionId,
      sandboxDir: realSandboxDir,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      status: "starting",
    };
    this.containers.set(sessionId, state);

    try {
      // Build docker run command
      const args = [
        "run", "-d",
        "--name", label,
        "--label", "ultra-computer=sandbox",
        // Resource limits
        "--cpus", this.config.cpuLimit,
        "--memory", this.config.memoryLimit,
        "--memory-swap", this.config.memoryLimit, // disable swap
        // Security: immutable root and no Linux capabilities.
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--cap-drop=ALL",
        // No new privileges
        "--security-opt=no-new-privileges:true",
        // PID limit to prevent fork bombs
        "--pids-limit=256",
        // Bind-mount sandbox directory
        "-v", `${realSandboxDir}:/workspace:rw`,
        "-w", "/workspace",
        // Environment
        "-e", "HOME=/workspace",
        "-e", "TERM=xterm-256color",
        "-e", `SANDBOX_SESSION=${sessionId}`,
      ];

      // Network isolation
      if (!this.config.networkEnabled) {
        args.push("--network=none");
      }

      // Use a long-running sleep so container stays alive for exec calls
      args.push(this.config.image, "sleep", "infinity");

      const { stdout } = await execFileAsync("docker", args, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });

      const rawId = stdout.trim();
      if (!isValidContainerId(rawId)) {
        throw new Error(`Docker returned unexpected container ID format: ${rawId.substring(0, 20)}`);
      }
      state.containerId = rawId;
      state.status = "ready";

      console.log(`[DockerSandbox] Container created: ${state.containerId.substring(0, 12)} for session ${sessionId.substring(0, 8)}`);
      return state;

    } catch (err: any) {
      state.status = "stopped";
      this.containers.delete(sessionId);
      throw new Error(`Failed to create container: ${err.message}`);
    }
  }

  /**
   * Execute a command inside a container.
   * Returns { stdout, stderr, exitCode }.
   */
  async exec(
    sessionId: string,
    command: string,
    sandboxDir: string,
    timeoutMs?: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    const container = await this.getContainer(sessionId, sandboxDir);
    container.status = "busy";
    container.lastUsedAt = Date.now();

    try {
      const result = await this.execInContainer(
        container,
        command,
        timeoutMs || this.config.execTimeoutMs
      );
      container.status = "ready";
      return result;
    } catch (err: any) {
      container.status = "ready";
      throw err;
    }
  }

  private execInContainer(
    container: ContainerState,
    command: string,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      if (!isValidContainerId(container.containerId)) {
        reject(new Error("Invalid Docker container ID"));
        return;
      }
      const child = spawn("docker", ["exec", container.containerId, "/bin/sh", "-c", command], {
        shell: false,
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let outputExceeded = false;
      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + chunk.length > 1024 * 1024) {
          outputExceeded = true;
          child.kill("SIGKILL");
          return;
        }
        if (target === "stdout") stdout += text;
        else stderr += text;
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (outputExceeded) stderr += "\nOutput exceeded the 1 MiB limit.";
        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? -1 : outputExceeded ? 1 : (code ?? 1),
          timedOut,
        });
      });
    });
  }

  // ─── Container cleanup ──────────────────────────────────────────────────

  /** Remove a specific session's container */
  async removeContainer(sessionId: string): Promise<void> {
    const state = this.containers.get(sessionId);
    if (!state) return;

    state.status = "stopping";
    try {
      // Validate containerId before passing to shell to prevent injection
      if (!isValidContainerId(state.containerId)) {
        throw new Error(`Invalid containerId format: ${state.containerId.substring(0, 20)}`);
      }
      await execFileAsync("docker", ["rm", "-f", state.containerId], { timeout: 10_000 });
    } catch { /* already gone */ }
    state.status = "stopped";
    this.containers.delete(sessionId);
    console.log(`[DockerSandbox] Container removed: ${state.containerId.substring(0, 12)}`);
  }

  /** Evict the oldest idle container. Returns true if one was evicted. */
  private evictOldest(): boolean {
    let oldest: ContainerState | null = null;
    for (const c of this.containers.values()) {
      if (c.status === "ready" && (!oldest || c.lastUsedAt < oldest.lastUsedAt)) {
        oldest = c;
      }
    }
    if (oldest) {
      this.removeContainer(oldest.sessionId).catch(() => {});
      return true;
    }
    return false;
  }

  /** Start the idle container reaper */
  private startReaper() {
    if (this.reaperInterval) return;
    this.reaperInterval = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, state] of this.containers) {
        if (
          state.status === "ready" &&
          now - state.lastUsedAt > this.config.idleTimeoutMs
        ) {
          console.log(`[DockerSandbox] Reaping idle container: ${state.containerId.substring(0, 12)}`);
          this.removeContainer(sessionId).catch(() => {});
        }
      }
    }, 30_000); // check every 30 seconds
  }

  /** Kill all containers and stop the reaper. Call on server shutdown. */
  async shutdown(): Promise<void> {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }

    const removals = Array.from(this.containers.keys()).map(sid =>
      this.removeContainer(sid).catch(() => {})
    );
    await Promise.all(removals);

    // Also clean up any orphaned ultra-sandbox containers from previous runs
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["ps", "-aq", "--filter", "label=ultra-computer=sandbox"],
        { timeout: 10_000 },
      );
      const ids = stdout.split(/\s+/).filter(Boolean);
      if (!ids.every(isValidContainerId)) throw new Error("Docker returned an invalid container ID");
      if (ids.length > 0) {
        await execFileAsync("docker", ["rm", "-f", ...ids], { timeout: 10_000 });
      }
    } catch { /* ok */ }
  }

  /** Pull the configured Docker image if not already present */
  async pullImage(): Promise<{ pulled: boolean; error?: string }> {
    // Validate image name to prevent command injection: allow only safe Docker image name chars
    if (!IMAGE_REFERENCE_RE.test(this.config.image)) {
      return { pulled: false, error: "Invalid Docker image name" };
    }
    try {
      await execFileAsync("docker", ["pull", this.config.image], { timeout: 120_000 });
      return { pulled: true };
    } catch (err: any) {
      return { pulled: false, error: err.message };
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const dockerSandbox = new DockerSandbox();

// The application entrypoint owns asynchronous signal handling so all
// resources are drained together. This synchronous exit hook is only a final
// best-effort guard for exits that bypass the normal lifecycle.
process.on("exit", () => {
  // Synchronous cleanup — best effort (async shutdown already runs on SIGTERM/SIGINT)
  try {
    const listed = spawnSync("docker", ["ps", "-aq", "--filter", "label=ultra-computer=sandbox"], {
      timeout: 5000,
      encoding: "utf8",
      shell: false,
    });
    const ids = (listed.stdout || "").split(/\s+/).filter(Boolean);
    if (listed.status === 0 && ids.length > 0 && ids.every(isValidContainerId)) {
      spawnSync("docker", ["rm", "-f", ...ids], {
        timeout: 5000,
        stdio: "ignore",
        shell: false,
      });
    }
  } catch { /* ok */ }
});
