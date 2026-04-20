/**
 * Setup Wizard — First-run detection, environment probing, and configuration.
 *
 * Checks whether this is a first run, detects the runtime environment,
 * recommends settings, and marks setup as complete.
 */

import os from "os";
import logger from "./logger.js";
const setupLogger = logger.child({ module: "setup" });
import fs from "fs";
import net from "net";
import { execSync } from "child_process";
import { storage } from "./storage.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnvironmentInfo {
  os: { platform: string; release: string; arch: string };
  runtime: { nodeVersion: string; npmVersion: string };
  hardware: {
    cpuCores: number;
    totalMemoryGB: number;
    availableMemoryGB: number;
    gpuDetected: boolean;
    gpuInfo?: string;
  };
  services: {
    redisAvailable: boolean;
    dockerAvailable: boolean;
    dockerVersion?: string;
  };
  network: { port: number; portAvailable: boolean };
  isDocker: boolean;
  isWSL: boolean;
}

export interface RecommendedSettings {
  concurrentAgents: number;      // based on RAM/CPU
  enableRedis: boolean;
  enableSandbox: boolean;
  sandboxPreset: "minimal" | "standard" | "full";
  cacheStrategy: "memory" | "redis" | "hybrid";
  suggestedModels: string[];     // based on available resources
}

// ─── First-run detection ────────────────────────────────────────────────────

const SETUP_COMPLETE_FILE = ".setup-complete";
const SETUP_COMPLETE_KEY  = "setup_complete";

/**
 * Returns true if Ultra Computer has NOT been configured yet.
 * Checks both the SQLite settings table and the on-disk sentinel file.
 */
export function isFirstRun(): boolean {
  // Check on-disk file first (works even if DB is unavailable)
  if (fs.existsSync(SETUP_COMPLETE_FILE)) return false;

  // Check database setting
  try {
    const flag = storage.getSetting(SETUP_COMPLETE_KEY);
    if (flag === "true") return false;
  } catch {
    // DB not ready yet — treat as first run
  }

  return true;
}

/**
 * Persists the setup-complete flag in both the database and the filesystem.
 */
export function markSetupComplete(): void {
  try {
    storage.setSetting(SETUP_COMPLETE_KEY, "true");
  } catch (err) {
    setupLogger.error({ err }, "Could not persist setup flag to DB");
  }

  try {
    fs.writeFileSync(SETUP_COMPLETE_FILE, new Date().toISOString(), "utf8");
  } catch (err) {
    setupLogger.error({ err }, "Could not write sentinel file");
  }
}

// ─── Environment detection helpers ──────────────────────────────────────────

function detectDockerEnvironment(): boolean {
  // Check for the Docker init file
  if (fs.existsSync("/.dockerenv")) return true;

  // Inspect cgroup v1
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    if (cgroup.includes("docker") || cgroup.includes("containerd")) return true;
  } catch {
    // Not a Linux env or /proc unavailable
  }

  // cgroup v2 (systemd style)
  try {
    const cgroup2 = fs.readFileSync("/proc/self/mountinfo", "utf8");
    if (cgroup2.includes("docker") || cgroup2.includes("kubepods")) return true;
  } catch {
    // ignore
  }

  return false;
}

function detectWSL(): boolean {
  try {
    const release = os.release().toLowerCase();
    if (release.includes("microsoft") || release.includes("wsl")) return true;

    const version = fs.readFileSync("/proc/version", "utf8").toLowerCase();
    if (version.includes("microsoft") || version.includes("wsl")) return true;
  } catch {
    // Not Linux
  }
  return false;
}

function getNpmVersion(): string {
  try {
    return execSync("npm --version", { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function checkRedisAvailable(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = (result: boolean) => {
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect",  () => cleanup(true));
    socket.once("error",    () => cleanup(false));
    socket.once("timeout",  () => cleanup(false));

    try {
      socket.connect(port, host);
    } catch {
      cleanup(false);
    }
  });
}

function checkDockerAvailable(): { available: boolean; version?: string } {
  try {
    const output = execSync("docker info --format '{{.ServerVersion}}'", {
      timeout: 4000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();

    return { available: true, version: output || undefined };
  } catch {
    return { available: false };
  }
}

function detectGPU(): { detected: boolean; info?: string } {
  // Try nvidia-smi first
  try {
    const output = execSync(
      "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader",
      { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    )
      .toString()
      .trim();
    if (output) return { detected: true, info: output.split("\n")[0] };
  } catch { /* no NVIDIA GPU */ }

  // Try rocm-smi (AMD)
  try {
    execSync("rocm-smi --showproductname", { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
    return { detected: true, info: "AMD GPU (ROCm)" };
  } catch { /* no AMD GPU */ }

  return { detected: false };
}

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

// ─── Main detection ─────────────────────────────────────────────────────────

/**
 * Probes the runtime environment.  All checks are tolerant — failures return
 * safe defaults instead of throwing.
 */
export async function detectEnvironment(): Promise<EnvironmentInfo> {
  const redisHost = process.env.REDIS_HOST || "127.0.0.1";
  const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
  const appPort   = parseInt(process.env.PORT || "5000", 10);

  const totalMemGB     = os.totalmem() / (1024 ** 3);
  const availableMemGB = os.freemem()  / (1024 ** 3);
  const gpu            = detectGPU();
  const docker         = checkDockerAvailable();

  const [redisAvailable, portAvailable] = await Promise.all([
    checkRedisAvailable(redisHost, redisPort),
    checkPortAvailable(appPort),
  ]);

  return {
    os: {
      platform: os.platform(),
      release:  os.release(),
      arch:     os.arch(),
    },
    runtime: {
      nodeVersion: process.version,
      npmVersion:  getNpmVersion(),
    },
    hardware: {
      cpuCores:         os.cpus().length,
      totalMemoryGB:    Math.round(totalMemGB   * 10) / 10,
      availableMemoryGB: Math.round(availableMemGB * 10) / 10,
      gpuDetected:      gpu.detected,
      gpuInfo:          gpu.info,
    },
    services: {
      redisAvailable,
      dockerAvailable:  docker.available,
      dockerVersion:    docker.version,
    },
    network: {
      port:          appPort,
      portAvailable,
    },
    isDocker: detectDockerEnvironment(),
    isWSL:    detectWSL(),
  };
}

// ─── Recommended settings ───────────────────────────────────────────────────

/**
 * Derives sensible defaults from the detected environment.
 * Errs on the side of conservative resource usage.
 */
export function getRecommendedSettings(env: EnvironmentInfo): RecommendedSettings {
  const { cpuCores, totalMemoryGB, gpuDetected } = env.hardware;

  // ── Concurrent agents: 1 per 2 GB of RAM, capped at CPU cores - 1 ─────
  const byRam  = Math.floor(totalMemoryGB / 2);
  const byCpu  = Math.max(1, cpuCores - 1);
  const concurrentAgents = Math.max(1, Math.min(byRam, byCpu, 10));

  // ── Cache strategy ────────────────────────────────────────────────────────
  let cacheStrategy: RecommendedSettings["cacheStrategy"] = "memory";
  if (env.services.redisAvailable && totalMemoryGB >= 8) {
    cacheStrategy = "hybrid";
  } else if (env.services.redisAvailable) {
    cacheStrategy = "redis";
  }

  // ── Sandbox preset ────────────────────────────────────────────────────────
  let sandboxPreset: RecommendedSettings["sandboxPreset"] = "minimal";
  if (env.services.dockerAvailable && totalMemoryGB >= 8) {
    sandboxPreset = totalMemoryGB >= 16 ? "full" : "standard";
  }

  // ── Suggested models ──────────────────────────────────────────────────────
  const suggestedModels: string[] = [];

  if (gpuDetected && totalMemoryGB >= 16) {
    suggestedModels.push("llama3.1:70b", "mixtral:8x7b");
  } else if (gpuDetected || totalMemoryGB >= 8) {
    suggestedModels.push("llama3.1:8b", "mistral:7b");
  } else {
    suggestedModels.push("llama3.2:3b", "phi3:mini");
  }

  // Always suggest cloud providers as fallback
  suggestedModels.push("claude-3-5-sonnet-20241022", "gpt-4o");

  return {
    concurrentAgents,
    enableRedis:   env.services.redisAvailable,
    enableSandbox: env.services.dockerAvailable,
    sandboxPreset,
    cacheStrategy,
    suggestedModels,
  };
}

/**
 * Applies recommended settings to persistent storage.
 * Individual settings can be overridden before calling this.
 */
export function applySettings(settings: RecommendedSettings): void {
  storage.setSetting("concurrent_agents",  String(settings.concurrentAgents));
  storage.setSetting("enable_redis",        String(settings.enableRedis));
  storage.setSetting("enable_sandbox",      String(settings.enableSandbox));
  storage.setSetting("sandbox_preset",      settings.sandboxPreset);
  storage.setSetting("cache_strategy",      settings.cacheStrategy);
  storage.setSetting("suggested_models",    JSON.stringify(settings.suggestedModels));
}
