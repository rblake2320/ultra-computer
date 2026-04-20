/**
 * processWatchdog.ts
 *
 * Production-quality process watchdog and health monitoring system.
 *
 * Responsibilities:
 *  - Heartbeat loop: checks server health every 30 s, detects event-loop hangs
 *  - Auto-restart: handles uncaughtException / unhandledRejection → graceful
 *    shutdown → process.exit(1) (pm2 / systemd restarts the process)
 *  - Health probe data: getHealthStatus() used by the /api/health route
 *  - Event-loop lag detection via the setTimeout(0) trick
 *  - Graceful shutdown on SIGTERM / SIGINT (10 s drain)
 *  - Crash counter persisted in /home/user/workspace/ultra-computer/data/watchdog-state.json
 *  - Human-readable process uptime
 */

import http from "http";
import { autonomyLogger } from "./logger.js";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HEARTBEAT_INTERVAL_MS = 30_000;   // 30 s
const RESTART_DELAY_MS = 2_000;          // 2 s grace before exit(1)
const DRAIN_TIMEOUT_MS = 10_000;         // 10 s drain on graceful shutdown
const LAG_DEGRADED_MS = 2_000;           // > 2 s → degraded
const LAG_UNHEALTHY_MS = 5_000;          // > 5 s → unhealthy

// ---------------------------------------------------------------------------
// Watchdog state file (crash counter + misc state)
// ---------------------------------------------------------------------------
// Use process.cwd() as base since we build to CJS (import.meta.url not available)
const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.resolve(
  PROJECT_ROOT,
  "data/watchdog-state.json"
);

interface WatchdogState {
  restartCount: number;
  lastRestartAt: string | null;
}

function readState(): WatchdogState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw) as WatchdogState;
  } catch {
    return { restartCount: 0, lastRestartAt: null };
  }
}

function writeState(state: WatchdogState): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    autonomyLogger.error({ err }, "Failed to write state file");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type HealthStatusCode = "healthy" | "degraded" | "unhealthy";

export interface HealthStatus {
  status: HealthStatusCode;
  uptime: number;           // seconds
  uptimeMs: number;         // milliseconds
  uptimeHuman: string;      // e.g. "2d 3h 14m 05s"
  pid: number;              // process ID
  memoryUsage: {
    rss: number;            // bytes
    heapUsed: number;       // bytes
    heapTotal: number;      // bytes
    external: number;       // bytes
  };
  eventLoopLag: number;     // ms (last measured)
  eventLoopLagMs: number;   // alias for eventLoopLag
  lastHeartbeat: string | null;  // ISO timestamp
  restartCount: number;
  activeConnections: number;
}

// ---------------------------------------------------------------------------
// Internal mutable state
// ---------------------------------------------------------------------------
let _server: http.Server | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _lagMeasureTimer: ReturnType<typeof setTimeout> | null = null;

const _startTime = Date.now();
let _lastHeartbeat: string | null = null;
let _eventLoopLag = 0;       // ms, updated continuously
let _activeConnections = 0;
let _restartCount = 0;
let _isShuttingDown = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable duration from seconds */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${String(s).padStart(2, "0")}s`);
  return parts.join(" ");
}

function deriveStatus(lag: number): HealthStatusCode {
  if (lag > LAG_UNHEALTHY_MS) return "unhealthy";
  if (lag > LAG_DEGRADED_MS) return "degraded";
  return "healthy";
}

/** Continuously measures event-loop lag using the setTimeout(0) trick */
function scheduleLagMeasure(): void {
  const before = Date.now();
  _lagMeasureTimer = setTimeout(() => {
    _eventLoopLag = Date.now() - before;
    scheduleLagMeasure(); // chain next measurement
  }, 0);
  // Unref so it does not prevent clean exit
  if (_lagMeasureTimer.unref) _lagMeasureTimer.unref();
}

/** Track open connections for drain logic and health reporting */
function trackConnections(server: http.Server): void {
  server.on("connection", (socket) => {
    _activeConnections++;
    socket.once("close", () => {
      _activeConnections = Math.max(0, _activeConnections - 1);
    });
  });
}

// ---------------------------------------------------------------------------
// Heartbeat loop
// ---------------------------------------------------------------------------
function runHeartbeat(): void {
  const status = deriveStatus(_eventLoopLag);
  const uptimeSec = (Date.now() - _startTime) / 1000;
  const mem = process.memoryUsage();
  _lastHeartbeat = new Date().toISOString();

  const logLine =
    `[watchdog] heartbeat ` +
    `status=${status} ` +
    `uptime=${formatUptime(uptimeSec)} ` +
    `lag=${_eventLoopLag}ms ` +
    `rss=${(mem.rss / 1024 / 1024).toFixed(1)}MB ` +
    `heap=${(mem.heapUsed / 1024 / 1024).toFixed(1)}/${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB ` +
    `conns=${_activeConnections}`;

  const heartbeatData = { status, uptime: formatUptime(uptimeSec), lagMs: _eventLoopLag, rssMB: (mem.rss / 1024 / 1024).toFixed(1), heapMB: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}/${(mem.heapTotal / 1024 / 1024).toFixed(1)}`, conns: _activeConnections };
  if (status === "unhealthy") {
    autonomyLogger.error(heartbeatData, "Heartbeat: event-loop lag exceeds threshold — process may be hung");
  } else if (status === "degraded") {
    autonomyLogger.warn(heartbeatData, "Heartbeat: degraded");
  } else {
    autonomyLogger.info(heartbeatData, "Heartbeat");
  }
}

// ---------------------------------------------------------------------------
// Crash counter initialisation
// ---------------------------------------------------------------------------
function incrementRestartCount(): void {
  const state = readState();
  state.restartCount += 1;
  state.lastRestartAt = new Date().toISOString();
  writeState(state);
  _restartCount = state.restartCount;
}

function loadRestartCount(): void {
  const state = readState();
  _restartCount = state.restartCount;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/** Close HTTP server and wait up to `timeoutMs` for in-flight requests to finish */
async function drainServer(timeoutMs: number): Promise<void> {
  if (!_server) return;
  return new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };

    // Stop accepting new connections
    _server!.close(finish);

    // Force-close after timeout
    setTimeout(() => {
      if (!done) {
        autonomyLogger.warn({ timeoutMs }, "Drain timeout exceeded — forcing close");
        finish();
      }
    }, timeoutMs);
  });
}

export async function shutdownGracefully(): Promise<void> {
  if (_isShuttingDown) return;
  _isShuttingDown = true;

  autonomyLogger.info("Graceful shutdown initiated");

  // Stop heartbeat timer
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  // Stop lag measurement timer
  if (_lagMeasureTimer) {
    clearTimeout(_lagMeasureTimer);
    _lagMeasureTimer = null;
  }

  // Drain HTTP server (stop new connections, wait for in-flight)
  await drainServer(DRAIN_TIMEOUT_MS);

  autonomyLogger.info("All connections drained. Exiting cleanly.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Auto-restart helpers (for fatal errors)
// ---------------------------------------------------------------------------
async function handleFatalError(
  type: "uncaughtException" | "unhandledRejection",
  err: unknown
): Promise<void> {
  if (_isShuttingDown) return; // Avoid double-shutdown
  _isShuttingDown = true;

  autonomyLogger.error({ err, type }, "Fatal error detected — initiating restart sequence");

  // Stop timers
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  if (_lagMeasureTimer) clearTimeout(_lagMeasureTimer);

  // Increment crash counter
  try {
    const state = readState();
    state.restartCount += 1;
    state.lastRestartAt = new Date().toISOString();
    writeState(state);
    _restartCount = state.restartCount;
  } catch (_) {
    // best-effort — don't let state write block exit
  }

  // Attempt graceful server close
  try {
    await Promise.race([
      drainServer(RESTART_DELAY_MS),
      new Promise<void>((resolve) => setTimeout(resolve, RESTART_DELAY_MS)),
    ]);
  } catch (_) {
    // ignore
  }

  autonomyLogger.error({ gracePeriodMs: RESTART_DELAY_MS }, "Exiting with code 1. Expecting process manager (pm2/systemd) to restart.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the watchdog. Call once during server startup, passing the
 * http.Server instance created by express / http.createServer().
 */
export function initWatchdog(server: http.Server): void {
  if (_heartbeatTimer) {
    autonomyLogger.warn("initWatchdog called more than once — ignoring");
    return;
  }

  _server = server;

  // On first boot, load existing restart count (do NOT increment — that only happens on crash paths)
  loadRestartCount();

  // Track open connections
  trackConnections(server);

  // Begin continuous lag measurement
  scheduleLagMeasure();

  // Begin heartbeat loop
  _heartbeatTimer = setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);
  // Unref so it does not keep the process alive if everything else has exited
  if (_heartbeatTimer.unref) _heartbeatTimer.unref();

  // Run immediately so we have a baseline in the logs at startup
  runHeartbeat();

  // -------------------------------------------------------------------
  // Signal handlers
  // -------------------------------------------------------------------
  const onSignal = (signal: string) => {
    autonomyLogger.info({ signal }, "Received signal — shutting down gracefully");
    shutdownGracefully().catch((err) => {
      autonomyLogger.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    });
  };

  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("SIGINT", () => onSignal("SIGINT"));

  // -------------------------------------------------------------------
  // Fatal error handlers
  // -------------------------------------------------------------------
  process.on("uncaughtException", (err: Error) => {
    handleFatalError("uncaughtException", err).catch(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason: unknown) => {
    handleFatalError("unhandledRejection", reason).catch(() => process.exit(1));
  });

  autonomyLogger.info({ restartCount: _restartCount, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS }, "Watchdog initialised");
}

/**
 * Returns the current health status snapshot.
 * Suitable for exposing at a /health or /api/health HTTP endpoint.
 */
export function getHealthStatus(): HealthStatus {
  const uptimeSec = (Date.now() - _startTime) / 1000;
  const mem = process.memoryUsage();
  const status = deriveStatus(_eventLoopLag);

  return {
    status,
    uptime: uptimeSec,
    uptimeMs: Math.round(uptimeSec * 1000),
    uptimeHuman: formatUptime(uptimeSec),
    pid: process.pid,
    memoryUsage: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    eventLoopLag: _eventLoopLag,
    eventLoopLagMs: _eventLoopLag,
    lastHeartbeat: _lastHeartbeat,
    restartCount: _restartCount,
    activeConnections: _activeConnections,
  };
}
