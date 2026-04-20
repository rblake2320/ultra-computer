import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "./storage.js";
import { eq } from "drizzle-orm";
import { settings, users, apiKeys, refreshTokens } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";

// ─── Augment Express Request ──────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: string;
      };
    }
  }
}

// ─── Public routes whitelist ──────────────────────────────────────────────────
const PUBLIC_ROUTES: Array<{ method: string; path: string } | { pathPrefix: string }> = [
  { method: "POST", path: "/api/auth/login" },
  { method: "POST", path: "/api/auth/register" },
  { method: "POST", path: "/api/auth/refresh" },
  { method: "GET",  path: "/api/health" },
  { method: "GET",  path: "/api/setup/status" },
  { method: "GET",  path: "/api/setup/detect" },
  { method: "POST", path: "/api/setup/complete" },
  { method: "POST", path: "/api/setup/configure" },
  { method: "POST", path: "/api/setup/test-connection" },
  // All non-/api/ routes (static file serving)
  { pathPrefix: "/" },
];

function isPublicRoute(method: string, path: string): boolean {
  // Non-API routes are always public (static file serving)
  if (!path.startsWith("/api/")) return true;

  for (const rule of PUBLIC_ROUTES) {
    if ("pathPrefix" in rule) {
      // Skip — handled by the non-/api/ check above
      continue;
    }
    if (rule.method === method && rule.path === path) {
      return true;
    }
  }
  return false;
}

// ─── JWT Secret management ────────────────────────────────────────────────────
let _jwtSecret: string | null = null;

export function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;

  // 1. Check process.env first
  if (process.env.JWT_SECRET) {
    _jwtSecret = process.env.JWT_SECRET;
    return _jwtSecret;
  }

  // 2. Try reading from settings table
  try {
    const row = db.select().from(settings).where(eq(settings.key, "jwt_secret")).get();
    if (row?.value) {
      _jwtSecret = row.value;
      return _jwtSecret;
    }
  } catch {
    // DB not yet ready — fall through to generate
  }

  // 3. Generate a random 64-byte hex secret and persist it
  const generated = crypto.randomBytes(64).toString("hex");
  try {
    db.insert(settings).values({ key: "jwt_secret", value: generated }).run();
  } catch {
    // Ignore duplicate key errors
  }
  _jwtSecret = generated;
  return _jwtSecret;
}

// ─── Auth enabled check ───────────────────────────────────────────────────────
export function isAuthEnabled(): boolean {
  try {
    const row = db.select().from(settings).where(eq(settings.key, "auth_enabled")).get();
    return row?.value === "true";
  } catch {
    return false;
  }
}

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, RateLimitEntry>();

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true; // allowed
  }

  if (entry.count >= 5) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

export function recordLoginSuccess(ip: string): void {
  loginAttempts.delete(ip);
}

// ─── Password hashing (crypto.scrypt) ────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), derived);
}

// ─── Token generation ─────────────────────────────────────────────────────────
export function generateTokens(userId: number): { accessToken: string; refreshToken: string } {
  const secret = getJwtSecret();

  const accessToken = jwt.sign(
    { sub: userId, type: "access" },
    secret,
    { expiresIn: "1h" }
  );

  const refreshToken = jwt.sign(
    { sub: userId, type: "refresh" },
    secret,
    { expiresIn: "7d" }
  );

  // Store hashed refresh token in DB
  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.insert(refreshTokens).values({ userId, tokenHash, expiresAt }).run();

  return { accessToken, refreshToken };
}

// ─── Token verification ───────────────────────────────────────────────────────
export function verifyAccessToken(token: string): { sub: number; type: string } | null {
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as unknown as { sub: number; type: string };
    if (payload.type !== "access") return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { sub: number; type: string } | null {
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as unknown as { sub: number; type: string };
    if (payload.type !== "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── API key generation ───────────────────────────────────────────────────────
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// ─── CSRF token generation ────────────────────────────────────────────────────
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyCsrfToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If auth is disabled, pass through everything
  if (!isAuthEnabled()) {
    next();
    return;
  }

  const method = req.method;
  const path = req.path;

  // Check whitelist
  if (isPublicRoute(method, path)) {
    next();
    return;
  }

  // 1. Bearer token in Authorization header
  const authHeader = req.headers["authorization"];
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  // 2. ?token= query param (for SSE/EventSource)
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  // 3. x-api-key header (programmatic access)
  const apiKeyHeader = req.headers["x-api-key"];
  if (!token && typeof apiKeyHeader === "string" && apiKeyHeader) {
    const keyHash = hashApiKey(apiKeyHeader);
    try {
      const key = db.select().from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .get();

      if (key) {
        // Check expiry
        if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
          res.status(401).json({ error: "API key expired" });
          return;
        }

        // Load user
        const user = db.select().from(users).where(eq(users.id, key.userId)).get();
        if (user) {
          // Update lastUsedAt
          db.update(apiKeys)
            .set({ lastUsedAt: new Date().toISOString() })
            .where(eq(apiKeys.id, key.id))
            .run();

          req.user = { id: user.id, username: user.username, role: user.role };
          next();
          return;
        }
      }
    } catch {
      // Fall through to 401
    }

    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Load user
  try {
    const user = db.select().from(users).where(eq(users.id, payload.sub)).get();
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    req.user = { id: user.id, username: user.username, role: user.role };
    next();
  } catch {
    res.status(500).json({ error: "Auth error" });
  }
}
