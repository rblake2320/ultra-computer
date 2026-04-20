import express, { type Request, Response, NextFunction } from "express";
import logger from "./logger.js";
import { requestLoggerMiddleware } from "./requestLogger.js";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import compression from "compression";
import { requestTimeout, llmTimeout } from "./requestTimeout";
import { AppError } from "./errorCodes";
import { initKeyManager, migrateExistingKeys } from "./keyManager";

// ─── Process-level error handlers (must be first) ────────────────────────────
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection");
  process.exit(1);
});

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
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(
  express.json({
    limit: "10mb", // Prevent oversized JSON bodies (content is bounded by route-level checks)
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ─── Response compression (gzip) ─────────────────────────────────────────
app.use(compression({
  level: 6, // Balanced speed/ratio (1=fastest, 9=smallest)
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress SSE streams
    if (req.headers.accept === "text/event-stream") return false;
    return compression.filter(req, res);
  },
}));

// ─── Security headers ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Managed by the SPA
  crossOriginEmbedderPolicy: false, // Allow iframe embedding
}));

// ─── Rate limiting ────────────────────────────────────────────────────────
// General API rate limit: 500 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => !req.path.startsWith("/api"),
});
app.use(apiLimiter);

// Stricter limit on LLM-triggering endpoints: 20 per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Chat rate limit exceeded. Please wait before sending more messages." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});
app.use("/api/conversations/:id/messages", chatLimiter);

// ─── Health check (no auth, no rate limit) ────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    nodeVersion: process.version,
    memoryUsage: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

// ─── Request timeout (global: 30s for API, 2min for LLM) ─────────────────
app.use("/api", requestTimeout({ timeoutMs: 30_000 }));
// LLM streaming endpoints get a longer timeout
app.use("/api/conversations/:id/messages", llmTimeout());
app.use("/api/chat", llmTimeout());
app.use("/api/swarm", llmTimeout());

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
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info({ source }, message);
}

app.use(requestLoggerMiddleware);

(async () => {
  try {
  // ─── Initialize encryption (must run before any DB model reads) ─────────
  initKeyManager();
  const migrated = migrateExistingKeys();
  if (migrated > 0) {
    logger.info(`[keyManager] Migrated ${migrated} plaintext credential(s) to AES-256-GCM encrypted storage`);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    // Log the real error server-side for debugging
    logger.error({ err }, "Server error");

    if (res.headersSent) {
      return next(err);
    }

    // Handle structured AppError instances
    if (err instanceof AppError) {
      return res.status(err.status).json(err.toJSON());
    }

    // Handle Express/generic errors
    const status = err.status || err.statusCode || 500;
    // Return generic messages to client for 5xx errors to avoid leaking internals
    const clientMessage = status >= 500 ? "Internal Server Error" : (err.message || "Request failed");
    return res.status(status).json({
      error: {
        code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        message: clientMessage,
      },
    });
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
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }
})();
