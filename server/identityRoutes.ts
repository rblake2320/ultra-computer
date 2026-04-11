/**
 * Identity Routes — Tamper-Proof Identity System
 *
 * Registers all API endpoints for the identity system:
 *   - Registration & profile management
 *   - Verification requests and approvals
 *   - Trust scoring and activity recording
 *   - Block list management
 *   - Moderation (suspend / ban / reactivate)
 *   - Directory search and listing
 *   - Audit log
 *   - SSE stream for identity events
 *
 * ROUTE ORDERING: Fixed-path routes (/register, /search, /directory, /stats,
 * /audit, /verifications, /stream) are registered BEFORE :cryptoId param routes
 * to prevent shadowing.
 */

import type { Express, Request, Response } from "express";
import * as identityEngine from "./identityEngine.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_VERIFICATION_METHODS = [
  "email",
  "domain",
  "government_id",
  "corporate",
  "manual",
] as const;
type VerificationMethod = (typeof VALID_VERIFICATION_METHODS)[number];

const VALID_REQUESTED_TIERS = ["verified", "premium", "enterprise"] as const;
type RequestedTier = (typeof VALID_REQUESTED_TIERS)[number];

const VALID_ACTIVITIES = [
  "session_completed",
  "alert_triggered",
  "report_received",
  "report_resolved",
  "community_contribution",
] as const;
type ActivityType = (typeof VALID_ACTIVITIES)[number];

const CRYPTO_ID_REGEX = /^[0-9a-f]{64}$/i;
const CONTENT_MAX_LEN = 10_000;
const REASON_MAX_LEN = 1_000;

// ─── Validation Helpers ───────────────────────────────────────────────────────

function requireString(
  value: unknown,
  field: string,
  maxLen = 200
): string | null {
  if (typeof value !== "string") return `${field} must be a string`;
  if (value.trim().length === 0) return `${field} is required`;
  if (value.length > maxLen)
    return `${field} must be at most ${maxLen} characters`;
  return null;
}

function optionalString(
  value: unknown,
  field: string,
  maxLen = 200
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return `${field} must be a string`;
  if (value.length > maxLen)
    return `${field} must be at most ${maxLen} characters`;
  return null;
}

function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): string | null {
  if (!allowed.includes(value as T)) {
    return `${field} must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

function validateCryptoId(value: unknown, field = "cryptoId"): string | null {
  if (typeof value !== "string") return `${field} must be a string`;
  if (!CRYPTO_ID_REGEX.test(value))
    return `${field} must be a 64-character hex string`;
  return null;
}

function validateDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return "displayName must be a string";
  if (value.trim().length < 2)
    return "displayName must be at least 2 characters";
  if (value.length > 50) return "displayName must be at most 50 characters";
  return null;
}

// ─── SSE Client Registry ──────────────────────────────────────────────────────

interface SseClient {
  id: string;
  send: (event: object) => void;
}

const sseClients = new Map<string, SseClient>();
let sseClientCounter = 0;

function broadcastSseEvent(event: object): void {
  for (const client of sseClients.values()) {
    client.send(event);
  }
}

// Wire identityEngine EventEmitter events → SSE broadcast
function initSseBridge(): void {
  try {
    const emitter = (identityEngine as any).identityEngine ?? identityEngine;
    if (typeof emitter?.on !== "function") return;

    const events = [
      "identity:registered",
      "identity:updated",
      "identity:verified",
      "identity:suspended",
      "identity:banned",
      "identity:reactivated",
      "identity:blocked",
      "identity:unblocked",
      "verification:requested",
      "verification:approved",
      "verification:rejected",
      "trust:updated",
      "activity:recorded",
    ] as const;

    for (const eventName of events) {
      emitter.on(eventName, (data: any) => {
        broadcastSseEvent({ type: eventName, ...data, ts: Date.now() });
      });
    }
  } catch {
    // identityEngine may not expose an EventEmitter in all environments;
    // SSE still works for events pushed via broadcastSseEvent from routes.
  }
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerIdentityRoutes(app: Express): void {
  // Wire SSE bridge once at startup
  initSseBridge();

  // ═══════════════════════════════════════════════════════════════════════════
  // FIXED-PATH ROUTES (must come before :cryptoId param routes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/identity/register
   * Register a new tamper-proof identity.
   * Body: { displayName, bio?, organizationName?, website? }
   */
  app.post("/api/identity/register", (req: Request, res: Response) => {
    const { displayName, bio, organizationName, website } = req.body ?? {};

    const nameErr = validateDisplayName(displayName);
    if (nameErr) return res.status(400).json({ error: nameErr });

    if (bio !== undefined) {
      const bioErr = optionalString(bio, "bio", CONTENT_MAX_LEN);
      if (bioErr) return res.status(400).json({ error: bioErr });
    }
    if (organizationName !== undefined) {
      const orgErr = optionalString(organizationName, "organizationName", 200);
      if (orgErr) return res.status(400).json({ error: orgErr });
    }
    if (website !== undefined) {
      const webErr = optionalString(website, "website", 500);
      if (webErr) return res.status(400).json({ error: webErr });
    }

    try {
      const options: Record<string, any> = {};
      if (bio !== undefined) options.bio = bio;
      if (organizationName !== undefined)
        options.organizationName = organizationName;
      if (website !== undefined) options.website = website;

      const identity = identityEngine.identityEngine.registerIdentity(
        displayName,
        Object.keys(options).length ? options : undefined
      );
      res.status(201).json(identity);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to register identity" });
    }
  });

  /**
   * GET /api/identity/verifications
   * List verification requests with optional filters.
   * Query: ?status=pending&cryptoId=xxx
   */
  app.get("/api/identity/verifications", (req: Request, res: Response) => {
    try {
      const { status, cryptoId } = req.query as Record<
        string,
        string | undefined
      >;

      const filters: Record<string, any> = {};
      if (status) filters.status = status;
      if (cryptoId) {
        const idErr = validateCryptoId(cryptoId);
        if (idErr) return res.status(400).json({ error: idErr });
        filters.cryptoId = cryptoId;
      }

      const requests = identityEngine.identityEngine.getVerificationRequests(
        Object.keys(filters).length ? filters : undefined
      );
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch verification requests" });
    }
  });

  /**
   * POST /api/identity/verifications/:id/approve
   * Approve a verification request.
   * Body: { reviewerId }
   */
  app.post(
    "/api/identity/verifications/:id/approve",
    (req: Request, res: Response) => {
      const { id } = req.params;
      const { reviewerId } = req.body ?? {};

      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "id is required" });
      }

      const reviewerErr = requireString(reviewerId, "reviewerId");
      if (reviewerErr) return res.status(400).json({ error: reviewerErr });

      try {
        const identity = identityEngine.identityEngine.approveVerification(
          id,
          reviewerId
        );
        res.json(identity);
      } catch (err: any) {
        const status = err.message?.includes("not found") ? 404 : 500;
        res.status(status).json({ error: err.message ?? "Failed to approve verification" });
      }
    }
  );

  /**
   * POST /api/identity/verifications/:id/reject
   * Reject a verification request.
   * Body: { reviewerId, reason }
   */
  app.post(
    "/api/identity/verifications/:id/reject",
    (req: Request, res: Response) => {
      const { id } = req.params;
      const { reviewerId, reason } = req.body ?? {};

      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "id is required" });
      }

      const reviewerErr = requireString(reviewerId, "reviewerId");
      if (reviewerErr) return res.status(400).json({ error: reviewerErr });

      const reasonErr = requireString(reason, "reason", REASON_MAX_LEN);
      if (reasonErr) return res.status(400).json({ error: reasonErr });

      try {
        const verificationRequest =
          identityEngine.identityEngine.rejectVerification(
            id,
            reviewerId,
            reason
          );
        res.json(verificationRequest);
      } catch (err: any) {
        const status = err.message?.includes("not found") ? 404 : 500;
        res.status(status).json({ error: err.message ?? "Failed to reject verification" });
      }
    }
  );

  /**
   * GET /api/identity/search
   * Search identities by query with optional filters.
   * Query: ?q=searchterm&tier=verified&minTrust=50
   */
  app.get("/api/identity/search", (req: Request, res: Response) => {
    const { q, tier, minTrust } = req.query as Record<
      string,
      string | undefined
    >;

    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.status(400).json({ error: "q (search query) is required" });
    }
    if (q.length > 200) {
      return res.status(400).json({ error: "q must be at most 200 characters" });
    }

    const filters: Record<string, any> = {};
    if (tier) filters.tier = tier;
    if (minTrust !== undefined) {
      const minTrustNum = Number(minTrust);
      if (isNaN(minTrustNum) || minTrustNum < 0 || minTrustNum > 100) {
        return res.status(400).json({ error: "minTrust must be a number between 0 and 100" });
      }
      filters.minTrust = minTrustNum;
    }

    try {
      const results = identityEngine.identityEngine.searchIdentities(
        q,
        Object.keys(filters).length ? filters : undefined
      );
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Search failed" });
    }
  });

  /**
   * GET /api/identity/directory
   * List all identities (paginated).
   * Query: ?tier=verified&status=active&sortBy=trustScore&limit=50&offset=0
   */
  app.get("/api/identity/directory", (req: Request, res: Response) => {
    const { tier, status, sortBy, limit, offset } = req.query as Record<
      string,
      string | undefined
    >;

    const options: Record<string, any> = {};
    if (tier) options.tier = tier;
    if (status) options.status = status;
    if (sortBy) options.sortBy = sortBy;

    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
        return res.status(400).json({ error: "limit must be a number between 1 and 500" });
      }
      options.limit = limitNum;
    }
    if (offset !== undefined) {
      const offsetNum = Number(offset);
      if (isNaN(offsetNum) || offsetNum < 0) {
        return res.status(400).json({ error: "offset must be a non-negative number" });
      }
      options.offset = offsetNum;
    }

    try {
      const identities = identityEngine.identityEngine.listIdentities(
        Object.keys(options).length ? options : undefined
      );
      res.json(identities);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to list identities" });
    }
  });

  /**
   * GET /api/identity/stats
   * Get aggregate identity system statistics.
   */
  app.get("/api/identity/stats", (_req: Request, res: Response) => {
    try {
      const stats = identityEngine.identityEngine.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch stats" });
    }
  });

  /**
   * GET /api/identity/audit
   * Get the audit log, optionally filtered by cryptoId.
   * Query: ?cryptoId=xxx
   */
  app.get("/api/identity/audit", (req: Request, res: Response) => {
    const { cryptoId } = req.query as Record<string, string | undefined>;

    if (cryptoId !== undefined) {
      const idErr = validateCryptoId(cryptoId);
      if (idErr) return res.status(400).json({ error: idErr });
    }

    try {
      const log = identityEngine.identityEngine.getAuditLog(
        cryptoId ?? undefined
      );
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch audit log" });
    }
  });

  /**
   * GET /api/identity/stream
   * SSE stream for all identity events.
   * Sends a keep-alive ping every 15 seconds.
   */
  app.get("/api/identity/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const clientId = `sse-identity-${++sseClientCounter}-${Date.now()}`;

    const sendEvent = (event: object): void => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    };

    const client: SseClient = { id: clientId, send: sendEvent };
    sseClients.set(clientId, client);

    // Send an initial connection acknowledgement
    sendEvent({ type: "connected", clientId, ts: Date.now() });

    // Keep-alive ping every 15 seconds
    const pingInterval = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(pingInterval);
      }
    }, 15_000);

    req.on("close", () => {
      clearInterval(pingInterval);
      sseClients.delete(clientId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // :cryptoId PARAM ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/identity/:cryptoId
   * Get the public view of an identity.
   * Query: ?viewerId=xxx (optional)
   */
  app.get("/api/identity/:cryptoId", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { viewerId } = req.query as Record<string, string | undefined>;

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    if (viewerId !== undefined) {
      const viewerErr = validateCryptoId(viewerId, "viewerId");
      if (viewerErr) return res.status(400).json({ error: viewerErr });
    }

    try {
      const view = identityEngine.identityEngine.getPublicView(
        cryptoId,
        viewerId ?? undefined
      );
      if (!view) return res.status(404).json({ error: "Identity not found" });
      res.json(view);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch identity" });
    }
  });

  /**
   * GET /api/identity/:cryptoId/full
   * Get the full identity object (self only; auth-gated in production).
   */
  app.get("/api/identity/:cryptoId/full", (req: Request, res: Response) => {
    const { cryptoId } = req.params;

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    try {
      const identity = identityEngine.identityEngine.getIdentity(cryptoId);
      if (!identity)
        return res.status(404).json({ error: "Identity not found" });
      res.json(identity);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch identity" });
    }
  });

  /**
   * PATCH /api/identity/:cryptoId/profile
   * Update the display profile.
   * Body: { displayName?, displayAvatar?, bio?, organizationName?, website? }
   */
  app.patch("/api/identity/:cryptoId/profile", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { displayName, displayAvatar, bio, organizationName, website } =
      req.body ?? {};

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    // At least one field required
    const hasUpdate =
      displayName !== undefined ||
      displayAvatar !== undefined ||
      bio !== undefined ||
      organizationName !== undefined ||
      website !== undefined;
    if (!hasUpdate) {
      return res.status(400).json({ error: "At least one profile field is required" });
    }

    if (displayName !== undefined) {
      const nameErr = validateDisplayName(displayName);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }
    if (displayAvatar !== undefined) {
      const avatarErr = optionalString(displayAvatar, "displayAvatar", 500);
      if (avatarErr) return res.status(400).json({ error: avatarErr });
    }
    if (bio !== undefined) {
      const bioErr = optionalString(bio, "bio", CONTENT_MAX_LEN);
      if (bioErr) return res.status(400).json({ error: bioErr });
    }
    if (organizationName !== undefined) {
      const orgErr = optionalString(organizationName, "organizationName", 200);
      if (orgErr) return res.status(400).json({ error: orgErr });
    }
    if (website !== undefined) {
      const webErr = optionalString(website, "website", 500);
      if (webErr) return res.status(400).json({ error: webErr });
    }

    try {
      const updates: Record<string, any> = {};
      if (displayName !== undefined) updates.displayName = displayName;
      if (displayAvatar !== undefined) updates.displayAvatar = displayAvatar;
      if (bio !== undefined) updates.bio = bio;
      if (organizationName !== undefined)
        updates.organizationName = organizationName;
      if (website !== undefined) updates.website = website;

      const identity = identityEngine.identityEngine.updateProfile(
        cryptoId,
        updates
      );
      res.json(identity);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to update profile" });
    }
  });

  /**
   * PATCH /api/identity/:cryptoId/community
   * Update the community profile.
   * Body: { title?, company?, location?, skills?, badges? }
   */
  app.patch(
    "/api/identity/:cryptoId/community",
    (req: Request, res: Response) => {
      const { cryptoId } = req.params;
      const { title, company, location, skills, badges } = req.body ?? {};

      const idErr = validateCryptoId(cryptoId);
      if (idErr) return res.status(400).json({ error: idErr });

      const hasUpdate =
        title !== undefined ||
        company !== undefined ||
        location !== undefined ||
        skills !== undefined ||
        badges !== undefined;
      if (!hasUpdate) {
        return res.status(400).json({ error: "At least one community profile field is required" });
      }

      if (title !== undefined) {
        const err = optionalString(title, "title", 200);
        if (err) return res.status(400).json({ error: err });
      }
      if (company !== undefined) {
        const err = optionalString(company, "company", 200);
        if (err) return res.status(400).json({ error: err });
      }
      if (location !== undefined) {
        const err = optionalString(location, "location", 200);
        if (err) return res.status(400).json({ error: err });
      }
      if (skills !== undefined && !Array.isArray(skills)) {
        return res.status(400).json({ error: "skills must be an array" });
      }
      if (badges !== undefined && !Array.isArray(badges)) {
        return res.status(400).json({ error: "badges must be an array" });
      }

      try {
        const communityProfile: Record<string, any> = {};
        if (title !== undefined) communityProfile.title = title;
        if (company !== undefined) communityProfile.company = company;
        if (location !== undefined) communityProfile.location = location;
        if (skills !== undefined) communityProfile.skills = skills;
        if (badges !== undefined) communityProfile.badges = badges;

        const identity =
          identityEngine.identityEngine.updateCommunityProfile(
            cryptoId,
            communityProfile
          );
        res.json(identity);
      } catch (err: any) {
        const status = err.message?.includes("not found") ? 404 : 500;
        res.status(status).json({ error: err.message ?? "Failed to update community profile" });
      }
    }
  );

  /**
   * POST /api/identity/:cryptoId/verify
   * Request verification for an identity.
   * Body: { method, evidence?, requestedTier }
   */
  app.post("/api/identity/:cryptoId/verify", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { method, evidence, requestedTier } = req.body ?? {};

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    const methodErr = requireEnum(method, "method", VALID_VERIFICATION_METHODS);
    if (methodErr) return res.status(400).json({ error: methodErr });

    const tierErr = requireEnum(
      requestedTier,
      "requestedTier",
      VALID_REQUESTED_TIERS
    );
    if (tierErr) return res.status(400).json({ error: tierErr });

    if (evidence !== undefined) {
      const evidenceErr = optionalString(evidence, "evidence", CONTENT_MAX_LEN);
      if (evidenceErr) return res.status(400).json({ error: evidenceErr });
    }

    try {
      const verificationRequest =
        identityEngine.identityEngine.requestVerification(
          cryptoId,
          method as VerificationMethod,
          evidence ?? null,
          requestedTier as RequestedTier
        );
      res.status(201).json(verificationRequest);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to request verification" });
    }
  });

  /**
   * GET /api/identity/:cryptoId/trust
   * Get trust score and trust factors for an identity.
   */
  app.get("/api/identity/:cryptoId/trust", (req: Request, res: Response) => {
    const { cryptoId } = req.params;

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    try {
      const identity = identityEngine.identityEngine.getIdentity(cryptoId);
      if (!identity)
        return res.status(404).json({ error: "Identity not found" });

      const trustScore =
        identityEngine.identityEngine.recalculateTrust(cryptoId);
      res.json({
        trustScore,
        trustFactors: identity.trustFactors ?? null,
      });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to fetch trust score" });
    }
  });

  /**
   * POST /api/identity/:cryptoId/activity
   * Record an activity for an identity (affects trust score).
   * Body: { activity }
   */
  app.post(
    "/api/identity/:cryptoId/activity",
    (req: Request, res: Response) => {
      const { cryptoId } = req.params;
      const { activity } = req.body ?? {};

      const idErr = validateCryptoId(cryptoId);
      if (idErr) return res.status(400).json({ error: idErr });

      const activityErr = requireEnum(activity, "activity", VALID_ACTIVITIES);
      if (activityErr) return res.status(400).json({ error: activityErr });

      try {
        identityEngine.identityEngine.recordActivity(
          cryptoId,
          activity as ActivityType
        );
        const trustScore =
          identityEngine.identityEngine.recalculateTrust(cryptoId);
        res.json({ trustScore });
      } catch (err: any) {
        const status = err.message?.includes("not found") ? 404 : 500;
        res.status(status).json({ error: err.message ?? "Failed to record activity" });
      }
    }
  );

  /**
   * POST /api/identity/:cryptoId/block
   * Block another identity.
   * Body: { blockedId, reason? }
   */
  app.post("/api/identity/:cryptoId/block", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { blockedId, reason } = req.body ?? {};

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    const blockedIdErr = validateCryptoId(blockedId, "blockedId");
    if (blockedIdErr) return res.status(400).json({ error: blockedIdErr });

    if (cryptoId === blockedId) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }

    if (reason !== undefined) {
      const reasonErr = optionalString(reason, "reason", REASON_MAX_LEN);
      if (reasonErr) return res.status(400).json({ error: reasonErr });
    }

    try {
      const blockRecord = identityEngine.identityEngine.blockIdentity(
        cryptoId,
        blockedId,
        reason ?? undefined
      );
      res.status(201).json(blockRecord);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to block identity" });
    }
  });

  /**
   * POST /api/identity/:cryptoId/unblock
   * Unblock a previously blocked identity.
   * Body: { blockedId }
   */
  app.post("/api/identity/:cryptoId/unblock", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { blockedId } = req.body ?? {};

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    const blockedIdErr = validateCryptoId(blockedId, "blockedId");
    if (blockedIdErr) return res.status(400).json({ error: blockedIdErr });

    try {
      identityEngine.identityEngine.unblockIdentity(cryptoId, blockedId);
      res.json({ ok: true });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to unblock identity" });
    }
  });

  /**
   * DELETE /api/identity/:cryptoId/blocks/:blockId
   * Unblock a previously blocked identity by block record ID.
   * This is the RESTful DELETE equivalent of POST .../unblock.
   */
  app.delete("/api/identity/:cryptoId/blocks/:blockId", (req: Request, res: Response) => {
    const { cryptoId, blockId } = req.params;

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    if (!blockId || typeof blockId !== "string" || blockId.trim().length === 0) {
      return res.status(400).json({ error: "blockId is required" });
    }

    try {
      // blockId here is the blocked identity's cryptoId (the ID of who is blocked)
      identityEngine.identityEngine.unblockIdentity(cryptoId, blockId);
      res.json({ ok: true });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to unblock identity" });
    }
  });

  /**
   * GET /api/identity/:cryptoId/blocks
   * Get the block list for an identity.
   */
  app.get("/api/identity/:cryptoId/blocks", (req: Request, res: Response) => {
    const { cryptoId } = req.params;

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    try {
      const blockList =
        identityEngine.identityEngine.getBlockList(cryptoId);
      res.json(blockList);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to fetch block list" });
    }
  });

  /**
   * GET /api/identity/:cryptoId/blocked-by/:targetId
   * Check whether :cryptoId has blocked :targetId (or vice versa).
   */
  app.get(
    "/api/identity/:cryptoId/blocked-by/:targetId",
    (req: Request, res: Response) => {
      const { cryptoId, targetId } = req.params;

      const idErr = validateCryptoId(cryptoId);
      if (idErr) return res.status(400).json({ error: idErr });

      const targetErr = validateCryptoId(targetId, "targetId");
      if (targetErr) return res.status(400).json({ error: targetErr });

      try {
        const blocked = identityEngine.identityEngine.isBlocked(
          cryptoId,
          targetId
        );
        res.json({ blocked });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? "Failed to check block status" });
      }
    }
  );

  /**
   * POST /api/identity/:cryptoId/suspend
   * Suspend an identity (moderation action).
   * Body: { reason, performedBy }
   */
  app.post("/api/identity/:cryptoId/suspend", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { reason, performedBy } = req.body ?? {};

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    const reasonErr = requireString(reason, "reason", REASON_MAX_LEN);
    if (reasonErr) return res.status(400).json({ error: reasonErr });

    const performedByErr = requireString(performedBy, "performedBy");
    if (performedByErr) return res.status(400).json({ error: performedByErr });

    try {
      const identity = identityEngine.identityEngine.suspendIdentity(
        cryptoId,
        reason,
        performedBy
      );
      res.json(identity);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to suspend identity" });
    }
  });

  /**
   * POST /api/identity/:cryptoId/ban
   * Permanently ban an identity (moderation action).
   * Body: { reason, performedBy }
   */
  app.post("/api/identity/:cryptoId/ban", (req: Request, res: Response) => {
    const { cryptoId } = req.params;
    const { reason, performedBy } = req.body ?? {};

    const idErr = validateCryptoId(cryptoId);
    if (idErr) return res.status(400).json({ error: idErr });

    const reasonErr = requireString(reason, "reason", REASON_MAX_LEN);
    if (reasonErr) return res.status(400).json({ error: reasonErr });

    const performedByErr = requireString(performedBy, "performedBy");
    if (performedByErr) return res.status(400).json({ error: performedByErr });

    try {
      const identity = identityEngine.identityEngine.banIdentity(
        cryptoId,
        reason,
        performedBy
      );
      res.json(identity);
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: err.message ?? "Failed to ban identity" });
    }
  });

  /**
   * POST /api/identity/:cryptoId/reactivate
   * Reactivate a suspended or banned identity.
   * Body: { performedBy }
   */
  app.post(
    "/api/identity/:cryptoId/reactivate",
    (req: Request, res: Response) => {
      const { cryptoId } = req.params;
      const { performedBy } = req.body ?? {};

      const idErr = validateCryptoId(cryptoId);
      if (idErr) return res.status(400).json({ error: idErr });

      const performedByErr = requireString(performedBy, "performedBy");
      if (performedByErr) return res.status(400).json({ error: performedByErr });

      try {
        const identity = identityEngine.identityEngine.reactivateIdentity(
          cryptoId,
          performedBy
        );
        res.json(identity);
      } catch (err: any) {
        const status = err.message?.includes("not found") ? 404 : 500;
        res.status(status).json({ error: err.message ?? "Failed to reactivate identity" });
      }
    }
  );
}
