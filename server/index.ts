import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createAuthMiddleware } from "./authMiddleware";
import { createYogaMiddleware } from "./graphql/yoga.js";
import { startGrpcServer, shutdownGrpcServer } from "./grpc/server.js";
import { createGrpcWebBridge } from "./grpcWebBridge.js";
import { sqlite, db } from "./storage.js";
import { sql } from "drizzle-orm";
import { logger, httpLogger } from "./logger.js";
import { registerHoneypot } from "./honeypot.js";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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
app.use(helmet({
  contentSecurityPolicy: false, // Managed by the SPA
  crossOriginEmbedderPolicy: false, // Allow iframe embedding
}));

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

// ─── Rate limiting ────────────────────────────────────────────────────────
// General API rate limit: 500 requests per minute per IP
const normalizeIp = (req: Request): string => {
  const raw = req.ip || req.socket?.remoteAddress || "unknown";
  // Normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4)
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
};
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  // Skip health check and webhook endpoints from rate limiting
  skip: (req) => !req.path.startsWith("/api") || req.path === "/api/health" || req.path.startsWith("/api/messaging/webhook/"),
  keyGenerator: normalizeIp,
});
app.use(apiLimiter);

// Stricter limit on LLM-triggering endpoints: 20 per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Chat rate limit exceeded. Please wait before sending more messages." },
  keyGenerator: normalizeIp,
});
app.use("/api/conversations/:id/messages", chatLimiter);

// ─── Health check (no auth, no rate limit) ────────────────────────────────
app.get("/api/health", (_req, res) => {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Check SQLite — run a trivial synchronous query
  try {
    db.run(sql`SELECT 1`);
    checks.database = { ok: true };
  } catch (e: any) {
    checks.database = { ok: false, detail: e.message };
  }

  // gRPC port liveness (passive check — just report configured port)
  checks.grpc = { ok: true, detail: `port ${process.env.GRPC_PORT || 5001}` };

  const allOk = Object.values(checks).every((c) => c.ok);

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { ok: v.ok }])),
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

  if (process.env.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!process.env.ULTRA_API_KEY) missing.push("ULTRA_API_KEY");
    if (!process.env.SLACK_SIGNING_SECRET) missing.push("SLACK_SIGNING_SECRET");
    if (!process.env.GITHUB_WEBHOOK_SECRET) missing.push("GITHUB_WEBHOOK_SECRET");
    if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
    if (missing.length > 0) {
      console.error(`[FATAL] Production mode requires: ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: process.platform !== "win32",
    },
    () => {
      logger.info(`serving on port ${port}`);
    },
  );

  // Start gRPC server on a separate port (default 5001)
  const grpcPort = parseInt(process.env.GRPC_PORT || "5001", 10);
  startGrpcServer(grpcPort).catch((err) => {
    logger.error({ err }, "[gRPC] Failed to start");
  });

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`[shutdown] Received ${signal}, starting graceful shutdown...`);

    // 1. Stop accepting new HTTP connections
    httpServer.close((err) => {
      if (err) logger.error({ err }, "[shutdown] HTTP server close error");
      else logger.info("[shutdown] HTTP server closed");
    });

    // 2. Shut down gRPC server
    try {
      await shutdownGrpcServer();
      logger.info("[shutdown] gRPC server closed");
    } catch (e) {
      logger.error({ err: e }, "[shutdown] gRPC shutdown error");
    }

    // 3. Close SQLite connection
    try {
      sqlite.close();
      logger.info("[shutdown] SQLite closed");
    } catch (e) {
      logger.error({ err: e }, "[shutdown] SQLite close error");
    }

    // 4. Force-exit after 10 seconds if something hangs
    setTimeout(() => {
      logger.error("[shutdown] Forced exit after timeout");
      process.exit(1);
    }, 10_000).unref();

    logger.info("[shutdown] Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "[uncaughtException]");
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "[unhandledRejection]");
  });

  } catch (err) {
    logger.error({ err }, "[fatal] Failed to start server");
    process.exit(1);
  }
})();
