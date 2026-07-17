import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createAuthMiddleware } from "./authMiddleware";
import { createSecurityHeaders } from "./securityHeaders.js";
import { createYogaMiddleware } from "./graphql/yoga.js";
import {
  isGrpcServerRunning,
  startGrpcServer,
  shutdownGrpcServer,
} from "./grpc/server.js";
import { createGrpcWebBridge } from "./grpcWebBridge.js";
import { sqlite, db } from "./storage.js";
import { sql } from "drizzle-orm";
import { logger, httpLogger } from "./logger.js";
import { registerHoneypot } from "./honeypot.js";
import { assertProductionEnvironment } from "./productionConfig.js";
import { taskQueue } from "./taskQueue.js";
import { cacheEngine } from "./cacheEngine.js";
import { dockerSandbox } from "./tools.js";
import { shutdownBrowser } from "./browserTool.js";
import { stopWatchdog } from "./processWatchdog.js";
import { buildRuntimeHealth, type RuntimeCheckState } from "./runtimeHealth.js";
import { shutdownRuntime } from "./lifecycle.js";

assertProductionEnvironment();
const app = express();
const httpServer = createServer(app);

let shutdownPromise: Promise<void> | null = null;
function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    logger.info(`[shutdown] Received ${reason}, starting graceful shutdown`);
    stopWatchdog();

    const result = await shutdownRuntime({
      server: httpServer,
      drainTimeoutMs: 10_000,
      tasks: [
        { name: "gRPC", close: shutdownGrpcServer },
        { name: "task queue", close: () => taskQueue.shutdown() },
        { name: "browser", close: shutdownBrowser },
        { name: "Docker sandbox", close: () => dockerSandbox.shutdown() },
        { name: "cache", close: () => cacheEngine.shutdown() },
        { name: "SQLite", close: () => sqlite.close() },
      ],
    });

    for (const failure of result.failures) {
      logger.error(
        { err: failure.error, resource: failure.name },
        "[shutdown] Resource close failed",
      );
    }
    if (!result.drained) {
      logger.error("[shutdown] HTTP drain deadline exceeded");
    }

    const failed = !result.drained || result.failures.length > 0;
    logger.info("[shutdown] Shutdown complete");
    process.exit(failed ? 1 : exitCode);
  })();
  return shutdownPromise;
}

process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
process.once("SIGINT", () => void shutdown("SIGINT", 0));
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[uncaughtException]");
  void shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[unhandledRejection]");
  void shutdown("unhandledRejection", 1);
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Trust proxy: set to the number of reverse-proxy hops in front of this server.
// Required for req.ip to reflect the real client IP for rate limiting and honeypot tracking.
// In production behind nginx/Cloudflare/load-balancer set TRUST_PROXY=1 (or the hop count).
// Defaults to false (direct connection — no proxy) which is safe and correct for local dev.
const trustProxy = process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) || true : false;
app.set("trust proxy", trustProxy);

// CORS — use explicit ALLOWED_ORIGIN env var or wildcard; never derive from request host
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowedOrigin = process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === "production" ? "http://localhost:5000" : "*");
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── Path Traversal Protection ──────────────────────────────────────────────
// Defense-in-depth: block requests containing path traversal sequences at the
// middleware layer before any routing occurs. This prevents directory traversal
// attacks even if downstream handlers have bugs.
app.use((req: Request, res: Response, next: NextFunction) => {
  const rawUrl = req.originalUrl || req.url || "";
  // Decode URL-encoded sequences before checking
  let decoded = rawUrl;
  try { decoded = decodeURIComponent(rawUrl); } catch { /* keep raw */ }
  // Double-decode for %252e%252e style double-encoding attacks
  let doubleDecoded = decoded;
  try { doubleDecoded = decodeURIComponent(decoded); } catch { /* keep single-decoded */ }
  const traversalPatterns: RegExp[] = [
    /\.\.\//, /\.\.%2f/i, /\.\.%5c/i, /%2e%2e/i, /%252e%252e/i,
    /\.\.\\/,  // Windows-style backslash traversal
    /\x00/,    // Null byte injection
  ];
  const hasTraversal = traversalPatterns.some(
    p => p.test(rawUrl) || p.test(decoded) || p.test(doubleDecoded)
  );
  if (hasTraversal) {
    res.status(400).json({ error: "Path traversal detected" });
    return;
  }
  next();
});

// ─── Rate limiting before authentication ─────────────────────────────────
// Authentication work is itself bounded so invalid keys cannot be used as an
// unmetered CPU/logging or credential-guessing path.
const normalizeIp = (req: Request): string => {
  const raw = req.ip || req.socket?.remoteAddress || "unknown";
  return ipKeyGenerator(raw);
};
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) =>
    !req.path.startsWith("/api")
    || req.path === "/api/health"
    || req.path.startsWith("/api/messaging/webhook/"),
  keyGenerator: normalizeIp,
});
app.use(apiLimiter);

// ─── API Key Authentication ───────────────────────────────────────────────
app.use(createAuthMiddleware());

app.use(
  express.json({
    limit: "10mb", // Prevent oversized JSON bodies (content is bounded by route-level checks)
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({
  extended: false,
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  },
}));

// ─── Security headers ─────────────────────────────────────────────────────
app.use(createSecurityHeaders());

// ─── GraphQL (graphql-yoga) ───────────────────────────────────────────────
// Mounted before rate limiting so yoga's own streaming/WebSocket handling
// is not subject to the express-rate-limit middleware (yoga handles its own
// limits internally). Auth is already enforced by createAuthMiddleware() above.
const yoga = createYogaMiddleware();
app.use("/api/graphql", yoga);

// ─── gRPC-Web bridge ─────────────────────────────────────────────────────────
// Exposes gRPC service implementations over plain HTTP/JSON for browser clients.
// Auth is already enforced by createAuthMiddleware() above.
app.use("/api/grpc", createGrpcWebBridge());

// ─── Stricter rate limit on LLM-triggering endpoints ──────────────────────
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Chat rate limit exceeded. Please wait before sending more messages." },
  // Only message creation triggers LLM work. History reads must not consume the
  // paid-operation budget or break UI refresh/polling.
  skip: (req) => req.method !== "POST",
  validate: { xForwardedForHeader: false, ip: false, trustProxy: false, default: false },
  keyGenerator: normalizeIp,
});
app.use("/api/conversations/:id/messages", chatLimiter);

// ─── Health check (no auth, no rate limit) ────────────────────────────────
app.get("/api/health", (_req, res) => {
  const start = Date.now();
  let databaseState: RuntimeCheckState = "ready";

  // Check SQLite — run a trivial synchronous query
  try {
    db.run(sql`SELECT 1`);
  } catch {
    databaseState = "unavailable";
  }

  const requireQueue =
    process.env.REQUIRE_TASK_QUEUE === "1" ||
    (process.env.NODE_ENV === "production" &&
      process.env.REQUIRE_TASK_QUEUE !== "0");
  const temporalState: RuntimeCheckState =
    process.env.RUN_TEMPORAL_WORKER === "1" ||
    process.env.TEMPORAL_ADDRESS ? "external" :
    "disabled";
  const health = buildRuntimeHealth({
    database: { state: databaseState, required: true },
    grpc: {
      state: isGrpcServerRunning() ? "ready" : "unavailable",
      required: process.env.DISABLE_GRPC !== "1",
    },
    taskQueue: {
      state: taskQueue.isAvailable() ? "ready" : "unavailable",
      required: requireQueue,
    },
    temporalWorker: { state: temporalState, required: false },
  });

  res.status(health.status === "ok" ? 200 : 503).json({
    status: health.status,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks: health.checks,
    latencyMs: Date.now() - start,
  });
});

// Strip __PORT_5000__ prefix only in non-production (dev/test only)
// In production, the build process handles this substitution at bundle time.
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    if (req.path.startsWith('/__PORT_5000__')) {
      req.url = req.url.replace('/__PORT_5000__', '');
    }
    next();
  });
}

export function log(message: string, source = "express") {
  logger.info({ module: source }, message);
}

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      // Do not log response bodies — they may contain sensitive data (API keys, tokens, etc.)
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      httpLogger[level]({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        ip: req.ip,
      });
    }
  });
  next();
});

(async () => {
  try {
  // Honeypot: register canary routes before real routes — any hit is an attacker probe
  registerHoneypot(app);

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Log the real error server-side for debugging
    logger.error({ err }, "[server] Error");

    if (res.headersSent) {
      return next(err);
    }

    // Return generic messages to client for 5xx errors to avoid leaking internals
    const clientMessage = status >= 500 ? "Internal Server Error" : (err.message || "Request failed");
    return res.status(status).json({ message: clientMessage });
  });

  // Catch-all for unmatched /api/* routes — return 404 JSON instead of falling
  // through to the SPA catch-all which would return HTML
  app.all("/api/{*path}", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // Start gRPC server on a separate port (default 5001)
  const grpcPort = parseInt(process.env.GRPC_PORT || "5001", 10);
  if (process.env.DISABLE_GRPC !== "1") {
    try {
      await startGrpcServer(grpcPort);
    } catch (err) {
      logger.error({ err }, "[gRPC] Failed to start");
      if (process.env.NODE_ENV === "production") throw err;
    }
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(
      {
        port,
        host: process.env.HOST || "0.0.0.0",
        reusePort: process.platform !== "win32",
      },
      () => {
        httpServer.off("error", reject);
        logger.info(`serving on port ${port}`);
        resolve();
      },
    );
  });

  } catch (err) {
    logger.error({ err }, "[fatal] Failed to start server");
    await shutdown("startup failure", 1);
  }
})();
