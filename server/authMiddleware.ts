/**
 * API Key Authentication Middleware
 *
 * Reads ULTRA_API_KEY from the environment. If set, requires every /api/*
 * request to supply a matching key via:
 *   - Authorization: Bearer <key>
 *   - X-API-Key: <key>
 *
 * Exempted routes (no auth required even when key is set):
 *   GET  /api/health
 *   POST /api/messaging/webhook/slack
 *   POST /api/messaging/webhook/github
 *
 * If ULTRA_API_KEY is NOT set the middleware logs a startup warning and
 * passes all traffic through (dev/open mode).
 */

import type { Request, Response, NextFunction } from "express";

// Routes that must remain publicly accessible regardless of auth config.
const EXEMPT_ROUTES: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/api/health" },
  { method: "POST", path: "/api/messaging/webhook/slack" },
  { method: "POST", path: "/api/messaging/webhook/github" },
];

function isExempt(req: Request): boolean {
  return EXEMPT_ROUTES.some(
    (r) =>
      r.method === req.method &&
      req.path === r.path
  );
}

/**
 * Call once at startup to log auth mode and return the ready middleware.
 */
export function createAuthMiddleware() {
  const apiKey = process.env.ULTRA_API_KEY;

  if (!apiKey) {
    console.warn(
      "[auth] WARNING: ULTRA_API_KEY is not set — API is open to all traffic. " +
        "Set this variable in production to restrict access."
    );
    // Pass-through: no authentication enforced.
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  console.log("[auth] API key authentication enabled (ULTRA_API_KEY is set).");

  return (req: Request, res: Response, next: NextFunction) => {
    // Only guard /api/* routes.
    if (!req.path.startsWith("/api/")) return next();

    // Allow exempt routes.
    if (isExempt(req)) return next();

    // Extract key from Authorization header or X-API-Key header.
    const authHeader = req.headers["authorization"];
    const xApiKey = req.headers["x-api-key"];

    let suppliedKey: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      suppliedKey = authHeader.slice("Bearer ".length).trim();
    } else if (typeof xApiKey === "string") {
      suppliedKey = xApiKey.trim();
    }

    if (!suppliedKey || suppliedKey !== apiKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  };
}
