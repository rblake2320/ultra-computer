/**
 * requestTimeout.ts
 *
 * Express middleware that enforces a per-request timeout.
 * Returns a 504 Gateway Timeout if the route handler doesn't respond in time.
 *
 * The timeout does NOT kill the handler's async work — it only sends the response.
 * Handlers that hold expensive resources should check `res.headersSent` before doing
 * more work after an async operation.
 */

import { type Request, type Response, type NextFunction } from "express";
import { routesLogger } from "./logger.js";

export interface TimeoutOptions {
  /** Timeout in milliseconds (default: 30000 = 30s) */
  timeoutMs?: number;
  /** Custom message sent on timeout */
  message?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;  // 30 seconds
const LONG_TIMEOUT_MS = 120_000;    // 2 minutes (for LLM/voice streaming)

/**
 * General-purpose request timeout middleware.
 * Apply globally or per-route.
 *
 * @example
 *   // Global: 30s timeout for all /api routes
 *   app.use("/api", requestTimeout());
 *
 *   // Per-route: 2 minutes for LLM chat
 *   app.post("/api/chat", requestTimeout({ timeoutMs: 120_000 }), handler);
 */
export function requestTimeout(options: TimeoutOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const message = options.message ?? "Request timed out";

  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        routesLogger.warn({ method: req.method, path: req.path, timeoutMs }, "Request timeout exceeded");
        res.status(504).json({
          error: {
            code: "REQUEST_TIMEOUT",
            message,
            timeoutMs,
          },
        });
      }
    }, timeoutMs);

    // Clean up the timer when the response finishes (success or error)
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));

    next();
  };
}

/**
 * Pre-configured timeout for LLM / streaming endpoints (2 minutes).
 */
export function llmTimeout() {
  return requestTimeout({
    timeoutMs: LONG_TIMEOUT_MS,
    message: "LLM request timed out (120s limit)",
  });
}

/**
 * Pre-configured timeout for voice/audio endpoints (60 seconds).
 */
export function voiceTimeout() {
  return requestTimeout({
    timeoutMs: 60_000,
    message: "Voice processing timed out (60s limit)",
  });
}

export { DEFAULT_TIMEOUT_MS, LONG_TIMEOUT_MS };
