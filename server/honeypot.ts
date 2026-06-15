/**
 * Honeypot middleware — attacker detection layer.
 *
 * Registers fake high-value routes that no legitimate client would ever call.
 * Any hit is instant proof of active probing. Logs attacker details and returns
 * a plausible-looking 403 (not 404, to make the attacker think they found something).
 *
 * Also tracks repeated auth failures per IP as a secondary trip-wire.
 *
 * Usage: call registerHoneypot(app) before all real routes so canary paths
 * are matched first. Call trackAuthFailure(ip) from authMiddleware on each 401.
 */

import type { Express, Request, Response } from "express";

// ─── Auth failure trip-wire ───────────────────────────────────────────────────

const _authFailures = new Map<string, { count: number; firstSeen: number }>();
const AUTH_FAILURE_WINDOW_MS = 60_000;
const AUTH_FAILURE_THRESHOLD = 10;

export function trackAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = _authFailures.get(ip);
  if (!entry || now - entry.firstSeen > AUTH_FAILURE_WINDOW_MS) {
    _authFailures.set(ip, { count: 1, firstSeen: now });
    return;
  }
  entry.count++;
  if (entry.count === AUTH_FAILURE_THRESHOLD) {
    console.warn(`[honeypot] AUTH TRIP-WIRE: ${AUTH_FAILURE_THRESHOLD} auth failures from ${ip} in ${AUTH_FAILURE_WINDOW_MS / 1000}s — possible brute-force`);
  }
}

// ─── Canary logging ───────────────────────────────────────────────────────────

function logCanaryHit(req: Request, canaryName: string): void {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const ua = req.headers["user-agent"] ?? "none";
  const referer = req.headers["referer"] ?? "";
  console.warn(
    `[honeypot] CANARY HIT: "${canaryName}" — IP=${ip} UA="${ua}" referer="${referer}" ` +
    `method=${req.method} body-size=${req.headers["content-length"] ?? 0}`
  );
}

// ─── Canary route response ────────────────────────────────────────────────────

function canaryResponse(res: Response): void {
  res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
}

// ─── Registration ─────────────────────────────────────────────────────────────

const CANARY_PATHS: Array<{ pattern: string | RegExp; name: string }> = [
  { pattern: "/api/admin",            name: "admin-panel" },
  { pattern: "/api/admin/users",      name: "admin-users" },
  { pattern: "/api/debug",            name: "debug-endpoint" },
  { pattern: "/api/debug/env",        name: "debug-env-dump" },
  { pattern: "/api/config",           name: "config-endpoint" },
  { pattern: "/api/config/keys",      name: "config-keys" },
  { pattern: "/api/internal",         name: "internal-api" },
  { pattern: "/api/system",           name: "system-endpoint" },
  { pattern: "/api/v0",               name: "v0-probe" },
  { pattern: "/api/metrics",          name: "metrics" },
  { pattern: "/actuator",             name: "spring-actuator" },
  { pattern: "/actuator/env",         name: "spring-actuator-env" },
  { pattern: "/.env",                 name: "dotenv-file" },
  { pattern: "/phpinfo.php",          name: "php-info" },
  { pattern: "/wp-login.php",         name: "wordpress-login" },
  { pattern: "/wp-admin",             name: "wordpress-admin" },
  { pattern: /^\/api\/.*\/exec$/,     name: "exec-probe" },
  { pattern: /^\/api\/.*\/shell$/,    name: "shell-probe" },
  { pattern: /^\/api\/.*\/eval$/,     name: "eval-probe" },
];

export function registerHoneypot(app: Express): void {
  for (const { pattern, name } of CANARY_PATHS) {
    app.all(pattern, (req: Request, res: Response) => {
      logCanaryHit(req, name);
      canaryResponse(res);
    });
  }
}
