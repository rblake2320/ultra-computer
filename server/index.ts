import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createAuthMiddleware } from "./authMiddleware";

// ─── Process-level error handlers (must be first) ────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] Unhandled promise rejection:", reason);
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
  const allowedOrigin = process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === "production" ? "http://localhost:5000" : "*");
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
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

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Do not log response bodies — they may contain sensitive data (API keys, tokens, etc.)
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Log the real error server-side for debugging
    console.error("[server] Error:", err);

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
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
  } catch (err) {
    console.error("[fatal] Failed to start server:", err);
    process.exit(1);
  }
})();
