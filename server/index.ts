import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { initWatchdog } from "./processWatchdog";

// NOTE: Process-level error handlers (uncaughtException, unhandledRejection,
// SIGTERM, SIGINT) are managed exclusively by processWatchdog.ts to avoid
// duplicate/conflicting handlers. The watchdog is initialised after the HTTP
// server is created — see the bottom of this file.

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

// Rate limit on code execution / CLI endpoints: 30 per minute per IP
const executionLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Execution rate limit exceeded. Please wait before running more commands." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});
app.use("/api/protocols/cli/execute", executionLimiter);
app.use("/api/protocols/cli/script", executionLimiter);
app.use("/api/protocols/cli/pipeline", executionLimiter);
app.use("/api/protocols/code/interpret", executionLimiter);

// Rate limit on swarm creation: 10 per minute per IP
const swarmLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Swarm creation rate limit exceeded." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});
app.use("/api/swarm/sessions", swarmLimiter);

// NOTE: The /api/health endpoint is registered in routes.ts with comprehensive
// system status data (model count, sandbox status, watchdog health, etc.).
// Removed the duplicate simple health check that was here to avoid Express
// routing ambiguity where the first-registered handler always wins.

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
      // Initialise the process watchdog (heartbeat, graceful shutdown,
      // uncaughtException/unhandledRejection handlers, event-loop lag detection).
      // Must be called AFTER listen() so the server is ready to drain.
      initWatchdog(httpServer);
    },
  );
  } catch (err) {
    console.error("[fatal] Failed to start server:", err);
    process.exit(1);
  }
})();
