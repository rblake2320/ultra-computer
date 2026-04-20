import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "./storage.js";
import { eq, and } from "drizzle-orm";
import { users, apiKeys, refreshTokens, settings } from "@shared/schema";
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  verifyRefreshToken,
  generateApiKey,
  hashApiKey,
  checkLoginRateLimit,
  recordLoginSuccess,
  isAuthEnabled,
} from "./auth.js";

export function registerAuthRoutes(app: Express) {
  // ─── POST /api/auth/register ────────────────────────────────────────────────
  // Create account. Only works if no users exist yet (first-run) OR if
  // the caller is authenticated as admin.
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }
    if (typeof username !== "string" || username.length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters" });
      return;
    }
    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const userCount = db.select().from(users).all().length;

    // If users already exist and requester is not an authenticated admin
    if (userCount > 0) {
      if (!req.user || req.user.role !== "admin") {
        res.status(403).json({ error: "Only admins can create additional accounts" });
        return;
      }
    }

    // Check for duplicate username
    const existing = db.select().from(users).where(eq(users.username, username)).get();
    if (existing) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }

    const passwordHash = hashPassword(password);
    const role = userCount === 0 ? "admin" : "user";

    const created = db.insert(users)
      .values({ username, passwordHash, role })
      .returning()
      .get();

    res.status(201).json({
      user: {
        id: created.id,
        username: created.username,
        role: created.role,
        createdAt: created.createdAt,
      },
    });
  });

  // ─── POST /api/auth/login ───────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    if (!checkLoginRateLimit(ip)) {
      res.status(429).json({ error: "Too many login attempts. Try again in a minute." });
      return;
    }

    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    recordLoginSuccess(ip);

    // Update last login
    db.update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id))
      .run();

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });

  // ─── POST /api/auth/refresh ─────────────────────────────────────────────────
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Check token exists in DB (not revoked)
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const stored = db.select().from(refreshTokens)
      .where(and(
        eq(refreshTokens.tokenHash, tokenHash),
        eq(refreshTokens.userId, payload.sub)
      ))
      .get();

    if (!stored) {
      res.status(401).json({ error: "Refresh token has been revoked" });
      return;
    }

    // Check expiry
    if (new Date(stored.expiresAt) < new Date()) {
      db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id)).run();
      res.status(401).json({ error: "Refresh token has expired" });
      return;
    }

    // Rotate: delete old token, issue new pair
    db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id)).run();
    const tokens = generateTokens(payload.sub);

    res.json(tokens);
  });

  // ─── POST /api/auth/logout ──────────────────────────────────────────────────
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).run();
    }

    res.json({ ok: true });
  });

  // ─── GET /api/auth/me ───────────────────────────────────────────────────────
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.user) {
      // If auth is disabled, return a synthetic "anonymous" user
      if (!isAuthEnabled()) {
        res.json({ id: 0, username: "anonymous", role: "admin", authEnabled: false });
        return;
      }
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.id)).get();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      authEnabled: isAuthEnabled(),
    });
  });

  // ─── POST /api/auth/change-password ────────────────────────────────────────
  app.post("/api/auth/change-password", (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }

    const user = db.select().from(users).where(eq(users.id, req.user.id)).get();
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = hashPassword(newPassword);
    db.update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, req.user.id))
      .run();

    // Revoke all refresh tokens for this user (force re-login everywhere)
    db.delete(refreshTokens).where(eq(refreshTokens.userId, req.user.id)).run();

    res.json({ ok: true });
  });

  // ─── POST /api/auth/api-keys ────────────────────────────────────────────────
  app.post("/api/auth/api-keys", (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { name, expiresAt } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const keyPrefix = key.slice(0, 8);

    const created = db.insert(apiKeys)
      .values({
        userId: req.user.id,
        name,
        keyHash,
        keyPrefix,
        expiresAt: expiresAt || null,
      })
      .returning()
      .get();

    // Return the plaintext key ONLY on creation — never stored
    res.status(201).json({
      id: created.id,
      name: created.name,
      key, // plaintext — shown only once
      keyPrefix: created.keyPrefix,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    });
  });

  // ─── GET /api/auth/api-keys ─────────────────────────────────────────────────
  app.get("/api/auth/api-keys", (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const keys = db.select().from(apiKeys)
      .where(eq(apiKeys.userId, req.user.id))
      .all();

    res.json(keys.map(k => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix + "...",
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    })));
  });

  // ─── DELETE /api/auth/api-keys/:id ─────────────────────────────────────────
  app.delete("/api/auth/api-keys/:id", (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid key ID" });
      return;
    }

    const key = db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, req.user.id)))
      .get();

    if (!key) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
    res.json({ ok: true });
  });

  // ─── GET /api/auth/setup-status ────────────────────────────────────────────
  // Returns whether any users exist (for first-run detection on client)
  app.get("/api/auth/setup-status", (_req: Request, res: Response) => {
    const userCount = db.select().from(users).all().length;
    const authEnabled = isAuthEnabled();
    res.json({ hasUsers: userCount > 0, authEnabled });
  });
}
