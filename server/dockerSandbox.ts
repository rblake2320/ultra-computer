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
 * - Graceful fallback to host-process execution if Docker is unavailable
 * 
 * Container lifecycle:
 * 1. On first bash call, a warm container is created (or reused from pool)
 * 2. Commands execute via `docker exec` inside the running container
 * 3. Container stays alive for the session (reused across tool calls)
 * 4. Idle containers are reaped after IDLE_TIMEOUT_MS
 * 5. All containers are force-killed on server shutdown
 */

import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

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
  /** Whether Docker sandbox is enabled (vs host fallback) */
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

export class DockerSandbox {
  private config: DockerSandboxConfig;
  private containers = new Map<string, ContainerState>();
  private dockerAvailable: boolean | null = null;
  private reaperInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<DockerSandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Docker availability detection ───────────────────────────────────────

  async isDockerAvailable(): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable;

    try {
      const { stdout } = await execAsync("docker info --format '{{.ServerVersion}}'", {
        timeout: 5000,
      });
      this.dockerAvailable = !!stdout.trim();
      if (this.dockerAvailable) {
        console.log(`[DockerSandbox] Docker detected: v${stdout.trim()}`);
        this.startReaper();
      }
    } catch {
      this.dockerAvailable = false;
      console.log("[DockerSandbox] Docker not available — using host fallback");
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
    this.config = { ...this.config, ...partial };
    // Reset detection if image changed
    if (partial.image) this.dockerAvailable = null;
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
   */
  async getContainer(sessionId: string, sandboxDir: string): Promise<ContainerState> {
    // Reuse existing container for this session
    const existing = this.containers.get(sessionId);
    if (existing && existing.status === "ready") {
      existing.lastUsedAt = Date.now();
      return existing;
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

    // Create new container
    return await this.createContainer(sessionId, sandboxDir);
  }

  private async createContainer(sessionId: string, sandboxDir: string): Promise<ContainerState> {
    const label = `ultra-sandbox-${sessionId.substring(0, 8)}`;

    // Ensure sandbox dir exists
    if (!fs.existsSync(sandboxDir)) fs.mkdirSync(sandboxDir, { recursive: true });

    const state: ContainerState = {
      containerId: "",
      sessionId,
      sandboxDir,
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
        // Security: drop all capabilities, add back only what's needed
        "--cap-drop=ALL",
        "--cap-add=CHOWN",
        "--cap-add=DAC_OVERRIDE",
        "--cap-add=FOWNER",
        "--cap-add=SETGID",
        "--cap-add=SETUID",
        // No new privileges
        "--security-opt=no-new-privileges:true",
        // PID limit to prevent fork bombs
        "--pids-limit=256",
        // Bind-mount sandbox directory
        "-v", `${path.resolve(sandboxDir)}:/workspace:rw`,
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

      const { stdout } = await execAsync(`docker ${args.join(" ")}`, {
        timeout: 30_000,
      });

      state.containerId = stdout.trim();
      state.status = "ready";

      // Install basic tools if using bare ubuntu image
      if (this.config.image.startsWith("ubuntu")) {
        await this.execInContainer(state, "apt-get update -qq && apt-get install -y -qq python3 curl jq bc 2>/dev/null || true", 60_000)
          .catch(() => {}); // best effort
      }

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
      const escapedCmd = command.replace(/'/g, "'\\''");
      const fullCmd = `docker exec ${container.containerId} /bin/sh -c '${escapedCmd}'`;

      const child = exec(fullCmd, {
        maxBuffer: 1024 * 1024, // 1MB
        timeout: timeoutMs,
        env: process.env,
      }, (error, stdout, stderr) => {
        if (error && (error as any).killed) {
          resolve({
            stdout: stdout || "",
            stderr: stderr || "",
            exitCode: -1,
            timedOut: true,
          });
        } else {
          resolve({
            stdout: stdout || "",
            stderr: stderr || "",
            exitCode: error ? (error as any).code || 1 : 0,
            timedOut: false,
          });
        }
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
      await execAsync(`docker rm -f ${state.containerId}`, { timeout: 10_000 });
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
      await execAsync('docker rm -f $(docker ps -aq --filter "label=ultra-computer=sandbox") 2>/dev/null || true', {
        timeout: 10_000,
      });
    } catch { /* ok */ }
  }

  /** Pull the configured Docker image if not already present */
  async pullImage(): Promise<{ pulled: boolean; error?: string }> {
    // Validate image name to prevent command injection: allow only safe Docker image name chars
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-/:@]*$/.test(this.config.image)) {
      return { pulled: false, error: "Invalid Docker image name" };
    }
    try {
      await execAsync(`docker pull ${this.config.image}`, { timeout: 120_000 });
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

// Cleanup on process exit
process.on("SIGTERM", () => dockerSandbox.shutdown());
process.on("SIGINT", () => dockerSandbox.shutdown());
process.on("exit", () => {
  // Synchronous cleanup — best effort
  try {
    execSync('docker rm -f $(docker ps -aq --filter "label=ultra-computer=sandbox") 2>/dev/null || true', {
      timeout: 5000,
      stdio: "ignore",
    });
  } catch { /* ok */ }
});
