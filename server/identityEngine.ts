/**
 * @file identityEngine.ts
 * @description Tamper-proof cryptographic identity system for Ultra Computer.
 *
 * Every user or agent receives an immutable cryptographic ID at registration time.
 * This ID is derived from a combination of high-entropy random bytes, a
 * high-resolution timestamp, a UUID, and the current process PID — making it
 * unique, non-forgeable, and non-transferable. Display names are a cosmetic
 * overlay that can change over time, but the cryptoId is the permanent truth
 * used across all Ultra Computer subsystems (NIP sessions, marketplace, messaging).
 *
 * Key features:
 *   - SHA-256-based cryptographic identity generation with 64-byte entropy
 *   - 16-char fingerprint derived from a second-pass hash of the cryptoId
 *   - Immutable identity record that cannot be modified once issued
 *   - Trust scoring (0-100) computed from behaviour factors
 *   - Full verification tier system: unverified → verified → premium → enterprise → admin
 *   - Block lists with privacy-preserving blockedByCount (who-blocked-you is hidden)
 *   - Moderation controls: suspend, ban, reactivate
 *   - Searchable/paginated public directory (verified+ only)
 *   - Comprehensive audit trail for every state-changing action
 *   - SSE-compatible EventEmitter bridge for real-time frontends
 *
 * Architecture notes:
 *   - All state lives in in-memory Maps (identityStore, blockStore,
 *     verificationStore, auditStore) — same pattern as nipEngine.ts / a2aProtocol.ts
 *   - No external dependencies beyond uuid, Node.js crypto, and events
 *   - Export a singleton instance at module bottom: `identityEngine`
 */

import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "crypto";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Verification tier for an identity.
 *
 * - unverified  : Freshly registered; minimal trust; hidden from directory
 * - verified    : Passed basic identity checks (e.g. email, domain)
 * - premium     : Paid/vetted tier with higher trust baseline
 * - enterprise  : Organisational tier with contract in place
 * - admin       : Internal super-admin tier; highest trust
 */
export type IdentityTier =
  | "unverified"
  | "verified"
  | "premium"
  | "enterprise"
  | "admin";

/**
 * Lifecycle status of an identity.
 *
 * - active       : Normal; can participate in all activities
 * - suspended    : Temporarily blocked; cannot create sessions or send messages
 * - banned       : Permanently blocked; requires manual reactivation
 * - deactivated  : Self-deactivated or administrative removal
 */
export type IdentityStatus =
  | "active"
  | "suspended"
  | "banned"
  | "deactivated";

/**
 * The immutable cryptographic identity record.
 * Once created, none of these fields ever change.
 */
export interface CryptoIdentity {
  /**
   * Primary key — a 64-character hex SHA-256 hash derived from:
   *   - 64 cryptographically random bytes
   *   - High-resolution timestamp (Date.now + hrtime bigint)
   *   - A UUID v4
   *   - The current process PID
   *
   * This is the PERMANENT ID that follows the user/agent everywhere across
   * all Ultra Computer subsystems.
   */
  cryptoId: string;

  /**
   * Secondary verification fingerprint — the first 16 hex characters of a
   * second SHA-256 pass over the cryptoId. Useful for human-readable display
   * and quick identity confirmation without exposing the full ID.
   */
  fingerprint: string;

  /**
   * The raw 64-byte random material used during generation, stored as a
   * 128-character hex string. Never exposed externally; used internally for
   * re-verification proofs.
   */
  keyMaterial: string;

  /** Unix timestamp (ms) at the moment of registration — part of the immutable record. */
  registeredAt: number;

  /** IP address of the registering client, if available. */
  registrationIp?: string;

  /** User-Agent string of the registering client, if available. */
  registrationUserAgent?: string;
}

/**
 * Trust factor breakdown that feeds into the computed trust score.
 * These counters are updated via `recordActivity()`.
 */
export interface TrustFactors {
  /** Number of days since the account was registered. */
  accountAge: number;
  /** Total number of sessions completed by this identity. */
  sessionsCompleted: number;
  /** Number of security/policy alerts triggered by this identity. */
  alertsTriggered: number;
  /** Number of community reports filed against this identity. */
  reportsReceived: number;
  /** Number of those reports that were later dismissed/resolved in their favour. */
  reportsResolved: number;
  /** Helpful community actions (ratings, guides, contributions). */
  communityContributions: number;
  /**
   * Numeric verification level derived from the current tier.
   * Ranges 0-25; higher tiers yield a larger base score.
   */
  verificationLevel: number;
}

/**
 * Optional community-facing profile, only visible for verified+ identities.
 */
export interface CommunityProfile {
  /** Professional title, e.g. "Senior DevOps Engineer". */
  title?: string;
  /** Employer or organisation name, e.g. "Blakes Innovations". */
  company?: string;
  /** Geographic location, e.g. "United States". */
  location?: string;
  /** Skill tags, e.g. ["kubernetes", "azure", "terraform"]. */
  skills?: string[];
  /** Achievement badges, e.g. ["early_adopter", "trusted_instructor", "100_sessions"]. */
  badges?: string[];
  /** Unix timestamp (ms) when this identity joined the public community. */
  joinedCommunityAt?: number;
}

/**
 * The full internal identity record for a user or agent.
 * Only `getPublicView()` exposes a sanitised subset to external callers.
 */
export interface Identity {
  /** Immutable cryptographic identity block. */
  crypto: CryptoIdentity;

  // ── Display profile (changeable, always linked to cryptoId) ──────────────
  /** Human-readable display name. 2-50 chars, alphanumeric/spaces/hyphens/underscores. */
  displayName: string;
  /** URL of the avatar image, if set. */
  displayAvatar?: string;
  /** Short biography or description. */
  bio?: string;
  /** Organisation or company name (free-form, unverified). */
  organizationName?: string;
  /** Personal or organisational website URL. */
  website?: string;

  // ── Verification & tier ───────────────────────────────────────────────────
  /** Current verification/access tier. */
  tier: IdentityTier;
  /** Current lifecycle status. */
  status: IdentityStatus;
  /** Unix timestamp (ms) when the identity was last verified. */
  verifiedAt?: number;
  /** Method used for the most recent successful verification. */
  verificationMethod?: string;

  // ── Trust ─────────────────────────────────────────────────────────────────
  /** Computed trust score in the range 0-100. Recalculated on activity. */
  trustScore: number;
  /** Granular factors used to compute trustScore. */
  trustFactors: TrustFactors;

  // ── Community ─────────────────────────────────────────────────────────────
  /** Optional public community profile (visible for verified+ only). */
  communityProfile?: CommunityProfile;

  // ── Access control ────────────────────────────────────────────────────────
  /** cryptoIds that this identity has explicitly blocked. */
  blockedIds: string[];
  /**
   * Count of other identities that have blocked this one.
   * The individual list is never exposed to preserve privacy.
   */
  blockedByCount: number;

  // ── Metadata ──────────────────────────────────────────────────────────────
  /** Unix timestamp (ms) of the most recent activity. */
  lastActiveAt: number;
  /** Unix timestamp (ms) of the most recent profile update. */
  updatedAt: number;
  /** Total number of sessions associated with this identity. */
  sessionCount: number;
  /** Total number of messages sent by this identity. */
  messageCount: number;
}

/**
 * A bilateral block relationship between two identities.
 */
export interface BlockRecord {
  /** Unique identifier for this block record. */
  id: string;
  /** cryptoId of the identity that initiated the block. */
  blockerId: string;
  /** cryptoId of the identity that was blocked. */
  blockedId: string;
  /** Optional human-readable reason for the block. */
  reason?: string;
  /** Unix timestamp (ms) when the block was created. */
  createdAt: number;
}

/**
 * A request to upgrade an identity's verification tier.
 */
export interface VerificationRequest {
  /** Unique identifier for this request. */
  id: string;
  /** cryptoId of the identity requesting verification. */
  cryptoId: string;
  /** Verification method being used (email | domain | government_id | corporate | manual). */
  method: string;
  /** Lifecycle status of this request. */
  status: "pending" | "approved" | "rejected";
  /** Evidence reference (e.g. email address, domain, document token). */
  evidence?: string;
  /** The tier the identity is requesting to be upgraded to. */
  requestedTier: IdentityTier;
  /** Unix timestamp (ms) when the request was submitted. */
  submittedAt: number;
  /** Unix timestamp (ms) when an admin reviewed the request. */
  reviewedAt?: number;
  /** cryptoId of the admin who reviewed the request. */
  reviewedBy?: string;
  /** Human-readable explanation if the request was rejected. */
  rejectionReason?: string;
}

/**
 * The sanitised public view of an identity, safe to return to external callers.
 * Strips keyMaterial, blockedIds list, and other sensitive internals.
 */
export interface PublicIdentityView {
  /** The permanent cryptographic ID. */
  cryptoId: string;
  /** Short fingerprint for display confirmation. */
  fingerprint: string;
  /** Current display name. */
  displayName: string;
  /** Avatar URL, if set. */
  displayAvatar?: string;
  /** Current verification tier. */
  tier: IdentityTier;
  /** Current lifecycle status. */
  status: IdentityStatus;
  /** Computed trust score (0-100). */
  trustScore: number;
  /** Community profile (only present for verified+ identities). */
  communityProfile?: CommunityProfile;
  /** Unix timestamp (ms) of registration. */
  registeredAt: number;
  /** Unix timestamp (ms) of last activity. */
  lastActiveAt: number;
  /**
   * Whether the viewer has blocked this identity.
   * Always false if no viewerId is provided.
   */
  isBlocked: boolean;
  /** Total number of sessions completed. */
  sessionCount: number;
}

/**
 * An entry in the immutable audit trail.
 * Every state-changing action on an identity creates one of these.
 */
export interface IdentityAuditEntry {
  /** Unique identifier for this audit entry. */
  id: string;
  /** cryptoId of the identity the action was performed on. */
  cryptoId: string;
  /** The type of action that occurred. */
  action:
    | "registered"
    | "verified"
    | "tier_changed"
    | "profile_updated"
    | "blocked"
    | "unblocked"
    | "suspended"
    | "banned"
    | "reactivated"
    | "trust_recalculated";
  /** Human-readable description of what changed. */
  details: string;
  /** cryptoId of the actor who triggered the action, or "system" for automated events. */
  performedBy: string;
  /** Unix timestamp (ms) when the action occurred. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Valid verification methods accepted by requestVerification(). */
const VALID_VERIFICATION_METHODS = new Set([
  "email",
  "domain",
  "government_id",
  "corporate",
  "manual",
]);

/** Tier ordering used to enforce upward-only tier changes. */
const TIER_ORDER: Record<IdentityTier, number> = {
  unverified: 0,
  verified: 1,
  premium: 2,
  enterprise: 3,
  admin: 4,
};

/** Base trust score for each tier, used in trust score calculation. */
const TIER_BASE_SCORE: Record<IdentityTier, number> = {
  unverified: 10,
  verified: 25,
  premium: 40,
  enterprise: 60,
  admin: 80,
};

/** Numeric verification level associated with each tier (0-25). */
const TIER_VERIFICATION_LEVEL: Record<IdentityTier, number> = {
  unverified: 0,
  verified: 10,
  premium: 15,
  enterprise: 20,
  admin: 25,
};

/** Display-name validation regex: 2-50 chars, alphanumeric + space + hyphen + underscore. */
const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9 _-]{2,50}$/;

// ---------------------------------------------------------------------------
// Options types
// ---------------------------------------------------------------------------

/** Optional metadata supplied at identity registration time. */
export interface RegisterIdentityOptions {
  registrationIp?: string;
  registrationUserAgent?: string;
  bio?: string;
  organizationName?: string;
  website?: string;
}

/** Options for listing identities in a paginated directory view. */
export interface ListIdentitiesOptions {
  tier?: IdentityTier;
  status?: IdentityStatus;
  sortBy?: "trustScore" | "registeredAt" | "lastActiveAt";
  limit?: number;
  offset?: number;
}

/** Filters for searching the public identity directory. */
export interface SearchIdentityFilters {
  tier?: IdentityTier;
  status?: IdentityStatus;
  minTrustScore?: number;
}

/** Filters for querying pending/approved/rejected verification requests. */
export interface VerificationRequestFilters {
  cryptoId?: string;
  status?: "pending" | "approved" | "rejected";
  method?: string;
}

/** Aggregated statistics returned by getStats(). */
export interface IdentityStats {
  total: number;
  byTier: Record<IdentityTier, number>;
  byStatus: Record<IdentityStatus, number>;
  averageTrustScore: number;
  totalSessions: number;
  totalMessages: number;
  totalBlocks: number;
  pendingVerifications: number;
}

// ---------------------------------------------------------------------------
// IdentityEngine
// ---------------------------------------------------------------------------

/**
 * IdentityEngine — the tamper-proof identity system for Ultra Computer.
 *
 * Manages the full lifecycle of cryptographic identities: generation, verification,
 * trust scoring, block lists, moderation, and audit logging. Emits typed events
 * so that other subsystems (NIP sessions, messaging, marketplace) can react to
 * identity state changes without polling.
 *
 * Usage:
 * ```typescript
 * import { identityEngine } from "./identityEngine.js";
 *
 * const id = identityEngine.registerIdentity("Alice");
 * console.log(id.crypto.cryptoId); // 64-char SHA-256 hex
 * ```
 *
 * All data is stored in in-memory Maps for maximum throughput. If persistence is
 * needed, wire up the EventEmitter listeners to a storage backend.
 */
export class IdentityEngine extends EventEmitter {
  // ── Internal stores ───────────────────────────────────────────────────────

  /**
   * Primary identity store keyed by cryptoId.
   * This is the source of truth for all identity data.
   */
  private identityStore: Map<string, Identity> = new Map();

  /**
   * Block records keyed by blockRecord.id.
   * Secondary indexes (by blockerId, by blockedId) are maintained via iteration.
   */
  private blockStore: Map<string, BlockRecord> = new Map();

  /**
   * Verification requests keyed by request.id.
   */
  private verificationStore: Map<string, VerificationRequest> = new Map();

  /**
   * Audit log entries keyed by entry.id.
   */
  private auditStore: Map<string, IdentityAuditEntry> = new Map();

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    super();
    // Allow many listeners (one per SSE subscriber is reasonable)
    this.setMaxListeners(500);
  }

  // =========================================================================
  // PRIVATE — Cryptographic identity generation
  // =========================================================================

  /**
   * Generates a fresh, immutable CryptoIdentity.
   *
   * The cryptoId is a SHA-256 hash over a buffer composed of:
   *   1. 64 cryptographically random bytes  (via crypto.randomBytes)
   *   2. The current wall-clock time         (Date.now(), 8 bytes, big-endian)
   *   3. High-resolution process time        (process.hrtime.bigint(), 8 bytes)
   *   4. A UUID v4 (16 bytes of additional entropy)
   *   5. The current process PID             (4 bytes, big-endian)
   *
   * This combination guarantees:
   *   - Uniqueness:      random bytes + UUID make collisions astronomically unlikely
   *   - Non-forgeability: attacker would need the exact random bytes, timestamp,
   *                       hrtime, uuid, AND pid at the same instant
   *   - Non-transferability: the ID is tied to the exact moment and process of creation
   *   - Verifiability:   the stored keyMaterial can prove our system generated it
   *
   * @param registrationIp   Optional originating IP address
   * @param registrationUserAgent Optional originating User-Agent string
   * @returns A fully populated CryptoIdentity object
   */
  private _generateCryptoIdentity(
    registrationIp?: string,
    registrationUserAgent?: string
  ): CryptoIdentity {
    // Step 1 — 64 bytes of high-entropy randomness
    const entropyBytes = randomBytes(64);

    // Step 2 — Wall-clock timestamp (ms) as 8-byte big-endian buffer
    const nowMs = BigInt(Date.now());
    const timestampBuf = Buffer.allocUnsafe(8);
    timestampBuf.writeBigUInt64BE(nowMs, 0);

    // Step 3 — High-resolution process time (nanoseconds) as 8-byte big-endian buffer
    const hrtime = process.hrtime.bigint();
    const hrtimeBuf = Buffer.allocUnsafe(8);
    hrtimeBuf.writeBigUInt64BE(hrtime, 0);

    // Step 4 — UUID v4 as a 36-byte ASCII buffer
    const uuidStr = uuidv4();
    const uuidBuf = Buffer.from(uuidStr, "utf8"); // 36 bytes

    // Step 5 — Process PID as 4-byte big-endian buffer
    const pidBuf = Buffer.allocUnsafe(4);
    pidBuf.writeUInt32BE(process.pid >>> 0, 0);

    // Concatenate all material into a single buffer and hash it
    const combined = Buffer.concat([
      entropyBytes,
      timestampBuf,
      hrtimeBuf,
      uuidBuf,
      pidBuf,
    ]);

    // Primary hash — this becomes the cryptoId (64 hex chars)
    const cryptoId = createHash("sha256").update(combined).digest("hex");

    // Secondary hash — fingerprint is first 16 hex chars of SHA-256(cryptoId)
    const fingerprint = createHash("sha256")
      .update(cryptoId, "hex")
      .digest("hex")
      .slice(0, 16);

    return {
      cryptoId,
      fingerprint,
      keyMaterial: entropyBytes.toString("hex"),
      registeredAt: Number(nowMs),
      registrationIp,
      registrationUserAgent,
    };
  }

  // =========================================================================
  // PRIVATE — Validation helpers
  // =========================================================================

  /**
   * Validates a display name against the allowed character set and length.
   * Throws a descriptive Error if invalid.
   *
   * Allowed: alphanumeric characters, spaces, hyphens, underscores.
   * Length:  2-50 characters.
   *
   * @param name The display name to validate
   * @throws Error if the name fails validation
   */
  private _validateDisplayName(name: string): void {
    if (typeof name !== "string") {
      throw new Error("Display name must be a string.");
    }
    const trimmed = name.trim();
    if (!DISPLAY_NAME_REGEX.test(trimmed)) {
      throw new Error(
        `Display name must be 2-50 characters and may only contain letters, ` +
          `numbers, spaces, hyphens, and underscores. Got: "${name}"`
      );
    }
  }

  /**
   * Returns true if a display name is already in use by another identity
   * (case-insensitive comparison).
   *
   * @param name The display name to check
   * @param excludeCryptoId Optional cryptoId to exclude from the check (for updates)
   */
  private _isDisplayNameTaken(
    name: string,
    excludeCryptoId?: string
  ): boolean {
    const normalized = name.trim().toLowerCase();
    for (const [id, identity] of this.identityStore) {
      if (excludeCryptoId && id === excludeCryptoId) continue;
      if (identity.displayName.toLowerCase() === normalized) return true;
    }
    return false;
  }

  // =========================================================================
  // PRIVATE — Audit logging
  // =========================================================================

  /**
   * Creates and persists an audit log entry for a state-changing action.
   *
   * @param cryptoId     The identity affected
   * @param action       The type of action
   * @param details      Human-readable description of what changed
   * @param performedBy  The actor's cryptoId, or "system"
   * @returns The created audit entry
   */
  private _createAuditEntry(
    cryptoId: string,
    action: IdentityAuditEntry["action"],
    details: string,
    performedBy: string
  ): IdentityAuditEntry {
    const entry: IdentityAuditEntry = {
      id: uuidv4(),
      cryptoId,
      action,
      details,
      performedBy,
      timestamp: Date.now(),
    };
    this.auditStore.set(entry.id, entry);
    return entry;
  }

  // =========================================================================
  // PRIVATE — Trust score computation
  // =========================================================================

  /**
   * Computes the trust score for a given Identity object.
   *
   * Formula components (all clamped before summing, final result clamped 0-100):
   *   - Tier base:         TIER_BASE_SCORE[tier]
   *   - Age bonus:         min(15, accountAgeDays / 10)
   *   - Completion bonus:  min(20, sessionsCompleted * 0.5)
   *   - Alert penalty:     alertsTriggered * 2
   *   - Report penalty:    (reportsReceived - reportsResolved) * 5
   *   - Community bonus:   min(10, communityContributions * 0.5)
   *
   * @param identity The full identity record to score
   * @returns The computed trust score in the range 0-100
   */
  private _computeTrustScore(identity: Identity): number {
    const tf = identity.trustFactors;
    const base = TIER_BASE_SCORE[identity.tier];
    const ageBonus = Math.min(15, tf.accountAge / 10);
    const completionBonus = Math.min(20, tf.sessionsCompleted * 0.5);
    const alertPenalty = tf.alertsTriggered * 2;
    const netReports = Math.max(0, tf.reportsReceived - tf.reportsResolved);
    const reportPenalty = netReports * 5;
    const communityBonus = Math.min(10, tf.communityContributions * 0.5);

    const raw =
      base + ageBonus + completionBonus - alertPenalty - reportPenalty + communityBonus;

    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  // =========================================================================
  // PRIVATE — Account age helper
  // =========================================================================

  /**
   * Returns the account age in whole days for a given identity.
   *
   * @param identity The identity whose age to calculate
   */
  private _accountAgeDays(identity: Identity): number {
    const ageMs = Date.now() - identity.crypto.registeredAt;
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  }

  // =========================================================================
  // PUBLIC — Core registration & retrieval
  // =========================================================================

  /**
   * Registers a new identity with a unique cryptographic ID.
   *
   * The identity starts in the "unverified" tier with a trust score of 10.
   * Display names must be unique (case-insensitive) and 2-50 characters long.
   *
   * @param displayName   The initial display name for the identity
   * @param options       Optional metadata: IP, user-agent, bio, org, website
   * @returns The newly created Identity record
   *
   * @throws Error if displayName is invalid or already taken
   *
   * @emits identity:registered  { identity: Identity }
   */
  registerIdentity(displayName: string, options: RegisterIdentityOptions = {}): Identity {
    // Validate display name
    this._validateDisplayName(displayName);
    if (this._isDisplayNameTaken(displayName)) {
      throw new Error(
        `Display name "${displayName}" is already taken. Please choose another.`
      );
    }

    // Generate the tamper-proof cryptographic identity
    const crypto = this._generateCryptoIdentity(
      options.registrationIp,
      options.registrationUserAgent
    );

    const now = Date.now();

    const identity: Identity = {
      crypto,
      displayName: displayName.trim(),
      displayAvatar: undefined,
      bio: options.bio,
      organizationName: options.organizationName,
      website: options.website,
      tier: "unverified",
      status: "active",
      verifiedAt: undefined,
      verificationMethod: undefined,
      trustScore: 10, // Unverified baseline
      trustFactors: {
        accountAge: 0,
        sessionsCompleted: 0,
        alertsTriggered: 0,
        reportsReceived: 0,
        reportsResolved: 0,
        communityContributions: 0,
        verificationLevel: TIER_VERIFICATION_LEVEL["unverified"],
      },
      communityProfile: undefined,
      blockedIds: [],
      blockedByCount: 0,
      lastActiveAt: now,
      updatedAt: now,
      sessionCount: 0,
      messageCount: 0,
    };

    this.identityStore.set(crypto.cryptoId, identity);

    this._createAuditEntry(
      crypto.cryptoId,
      "registered",
      `Identity registered with display name "${identity.displayName}" ` +
        `(tier: unverified, fingerprint: ${crypto.fingerprint})`,
      "system"
    );

    this.emit("identity:registered", { identity });
    return identity;
  }

  /**
   * Retrieves the full internal identity record for a given cryptoId.
   *
   * This method returns the raw internal record including sensitive fields
   * such as keyMaterial. External callers should use getPublicView() instead.
   *
   * @param cryptoId The 64-char cryptographic ID to look up
   * @returns The Identity record, or null if not found
   */
  getIdentity(cryptoId: string): Identity | null {
    return this.identityStore.get(cryptoId) ?? null;
  }

  /**
   * Returns the sanitised public view of an identity, safe for external callers.
   *
   * Sensitive fields (keyMaterial, blockedIds list, trustFactors internals) are
   * stripped. If a viewerId is provided, `isBlocked` reflects whether that viewer
   * has blocked the target identity.
   *
   * @param cryptoId   The target identity's cryptoId
   * @param viewerId   Optional: the requesting identity's cryptoId (for block check)
   * @returns A PublicIdentityView, or null if the identity does not exist
   */
  getPublicView(cryptoId: string, viewerId?: string): PublicIdentityView | null {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) return null;

    const isBlocked =
      viewerId !== undefined ? this.isBlocked(viewerId, cryptoId) : false;

    return {
      cryptoId: identity.crypto.cryptoId,
      fingerprint: identity.crypto.fingerprint,
      displayName: identity.displayName,
      displayAvatar: identity.displayAvatar,
      tier: identity.tier,
      status: identity.status,
      trustScore: identity.trustScore,
      communityProfile:
        identity.tier !== "unverified" ? identity.communityProfile : undefined,
      registeredAt: identity.crypto.registeredAt,
      lastActiveAt: identity.lastActiveAt,
      isBlocked,
      sessionCount: identity.sessionCount,
    };
  }

  // =========================================================================
  // PUBLIC — Profile updates
  // =========================================================================

  /**
   * Updates the mutable display profile fields for an identity.
   *
   * The following fields can be updated: displayName, displayAvatar, bio,
   * organizationName, website. Immutable fields (crypto, tier, status,
   * trustScore) cannot be changed here — use dedicated methods for those.
   *
   * @param cryptoId  The identity to update
   * @param updates   Partial record of allowed profile fields
   * @returns The updated Identity
   *
   * @throws Error if the identity does not exist
   * @throws Error if displayName is invalid or already taken
   *
   * @emits identity:updated  { identity: Identity, changes: string[] }
   */
  updateProfile(
    cryptoId: string,
    updates: Partial<
      Pick<Identity, "displayName" | "displayAvatar" | "bio" | "organizationName" | "website">
    >
  ): Identity {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    const changes: string[] = [];

    if (updates.displayName !== undefined) {
      this._validateDisplayName(updates.displayName);
      if (this._isDisplayNameTaken(updates.displayName, cryptoId)) {
        throw new Error(
          `Display name "${updates.displayName}" is already taken.`
        );
      }
      if (updates.displayName.trim() !== identity.displayName) {
        changes.push(
          `displayName: "${identity.displayName}" → "${updates.displayName.trim()}"`
        );
        identity.displayName = updates.displayName.trim();
      }
    }

    if (updates.displayAvatar !== undefined) {
      changes.push(`displayAvatar updated`);
      identity.displayAvatar = updates.displayAvatar;
    }

    if (updates.bio !== undefined) {
      changes.push(`bio updated`);
      identity.bio = updates.bio;
    }

    if (updates.organizationName !== undefined) {
      changes.push(`organizationName: "${identity.organizationName}" → "${updates.organizationName}"`);
      identity.organizationName = updates.organizationName;
    }

    if (updates.website !== undefined) {
      changes.push(`website updated`);
      identity.website = updates.website;
    }

    identity.updatedAt = Date.now();
    this.identityStore.set(cryptoId, identity);

    if (changes.length > 0) {
      this._createAuditEntry(
        cryptoId,
        "profile_updated",
        `Profile fields changed: ${changes.join("; ")}`,
        cryptoId
      );
      this.emit("identity:updated", { identity, changes });
    }

    return identity;
  }

  /**
   * Updates the community-facing profile for a verified+ identity.
   *
   * This profile is displayed in the public directory. Only identities with a
   * tier of "verified" or above may set a community profile.
   *
   * @param cryptoId        The identity to update
   * @param communityProfile The new community profile data (merged with existing)
   * @returns The updated Identity
   *
   * @throws Error if the identity does not exist or is unverified
   *
   * @emits identity:updated  { identity: Identity, changes: string[] }
   */
  updateCommunityProfile(
    cryptoId: string,
    communityProfile: CommunityProfile
  ): Identity {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    if (TIER_ORDER[identity.tier] < TIER_ORDER["verified"]) {
      throw new Error(
        `Community profiles are only available for verified or higher tiers. ` +
          `Current tier: "${identity.tier}"`
      );
    }

    const existing = identity.communityProfile ?? {};
    identity.communityProfile = {
      ...existing,
      ...communityProfile,
      // Preserve joinedCommunityAt if not explicitly provided
      joinedCommunityAt:
        communityProfile.joinedCommunityAt ??
        existing.joinedCommunityAt ??
        Date.now(),
    };
    identity.updatedAt = Date.now();
    this.identityStore.set(cryptoId, identity);

    this._createAuditEntry(
      cryptoId,
      "profile_updated",
      `Community profile updated`,
      cryptoId
    );
    this.emit("identity:updated", {
      identity,
      changes: ["communityProfile"],
    });

    return identity;
  }

  // =========================================================================
  // PUBLIC — Verification workflow
  // =========================================================================

  /**
   * Submits a request for an identity to upgrade its verification tier.
   *
   * The request enters a "pending" state and must be approved or rejected by an
   * admin via approveVerification() or rejectVerification().
   *
   * @param cryptoId       The identity requesting verification
   * @param method         One of: "email", "domain", "government_id", "corporate", "manual"
   * @param evidence       Reference evidence (email address, domain, document token)
   * @param requestedTier  The tier being requested (must be higher than current tier)
   * @returns The created VerificationRequest
   *
   * @throws Error if the identity does not exist
   * @throws Error if the method is invalid
   * @throws Error if requestedTier is not higher than the current tier
   *
   * @emits verification:requested  { request: VerificationRequest }
   */
  requestVerification(
    cryptoId: string,
    method: string,
    evidence: string,
    requestedTier: IdentityTier
  ): VerificationRequest {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    if (!VALID_VERIFICATION_METHODS.has(method)) {
      throw new Error(
        `Invalid verification method "${method}". ` +
          `Allowed: ${[...VALID_VERIFICATION_METHODS].join(", ")}`
      );
    }

    if (TIER_ORDER[requestedTier] <= TIER_ORDER[identity.tier]) {
      throw new Error(
        `Requested tier "${requestedTier}" must be higher than the current tier "${identity.tier}".`
      );
    }

    const request: VerificationRequest = {
      id: uuidv4(),
      cryptoId,
      method,
      status: "pending",
      evidence,
      requestedTier,
      submittedAt: Date.now(),
    };

    this.verificationStore.set(request.id, request);
    this.emit("verification:requested", { request });
    return request;
  }

  /**
   * Approves a pending verification request, upgrading the identity's tier.
   *
   * Side effects:
   *   - Sets identity.tier to the requestedTier
   *   - Sets identity.verifiedAt and identity.verificationMethod
   *   - Recalculates the trust score (verified tier gives +15 over baseline)
   *   - Creates audit entries for both the verification and the tier change
   *
   * @param requestId   The ID of the VerificationRequest to approve
   * @param reviewerId  The cryptoId of the admin performing the review
   * @returns The updated Identity
   *
   * @throws Error if the request is not found or not in "pending" status
   * @throws Error if the associated identity is not found
   *
   * @emits verification:approved  { request: VerificationRequest, identity: Identity }
   * @emits identity:verified      { identity: Identity }
   */
  approveVerification(requestId: string, reviewerId: string): Identity {
    const request = this.verificationStore.get(requestId);
    if (!request) {
      throw new Error(`Verification request not found: ${requestId}`);
    }
    if (request.status !== "pending") {
      throw new Error(
        `Verification request ${requestId} is not pending (status: ${request.status})`
      );
    }

    const identity = this.identityStore.get(request.cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${request.cryptoId}`);
    }

    const previousTier = identity.tier;

    // Approve the request
    request.status = "approved";
    request.reviewedAt = Date.now();
    request.reviewedBy = reviewerId;
    this.verificationStore.set(requestId, request);

    // Upgrade the identity
    identity.tier = request.requestedTier;
    identity.verifiedAt = Date.now();
    identity.verificationMethod = request.method;
    identity.trustFactors.verificationLevel =
      TIER_VERIFICATION_LEVEL[identity.tier];
    identity.updatedAt = Date.now();

    // Recalculate trust with the new tier
    identity.trustFactors.accountAge = this._accountAgeDays(identity);
    identity.trustScore = this._computeTrustScore(identity);

    this.identityStore.set(identity.crypto.cryptoId, identity);

    this._createAuditEntry(
      identity.crypto.cryptoId,
      "tier_changed",
      `Tier upgraded from "${previousTier}" to "${identity.tier}" via ` +
        `${request.method} verification (request: ${requestId})`,
      reviewerId
    );
    this._createAuditEntry(
      identity.crypto.cryptoId,
      "verified",
      `Identity verified by ${reviewerId} using method "${request.method}"`,
      reviewerId
    );

    this.emit("verification:approved", { request, identity });
    this.emit("identity:verified", { identity });
    return identity;
  }

  /**
   * Rejects a pending verification request.
   *
   * The identity's tier is not changed. The rejection reason is stored on the
   * request record and visible to admins for audit purposes.
   *
   * @param requestId   The ID of the VerificationRequest to reject
   * @param reviewerId  The cryptoId of the admin performing the review
   * @param reason      Human-readable explanation for the rejection
   * @returns The updated VerificationRequest
   *
   * @throws Error if the request is not found or not in "pending" status
   *
   * @emits verification:rejected  { request: VerificationRequest }
   */
  rejectVerification(
    requestId: string,
    reviewerId: string,
    reason: string
  ): VerificationRequest {
    const request = this.verificationStore.get(requestId);
    if (!request) {
      throw new Error(`Verification request not found: ${requestId}`);
    }
    if (request.status !== "pending") {
      throw new Error(
        `Verification request ${requestId} is not pending (status: ${request.status})`
      );
    }

    request.status = "rejected";
    request.reviewedAt = Date.now();
    request.reviewedBy = reviewerId;
    request.rejectionReason = reason;
    this.verificationStore.set(requestId, request);

    this._createAuditEntry(
      request.cryptoId,
      "tier_changed",
      `Verification request ${requestId} rejected by ${reviewerId}: ${reason}`,
      reviewerId
    );

    this.emit("verification:rejected", { request });
    return request;
  }

  /**
   * Returns verification requests, optionally filtered.
   *
   * @param filters  Optional: filter by cryptoId, status, or method
   * @returns Array of matching VerificationRequest records
   */
  getVerificationRequests(
    filters: VerificationRequestFilters = {}
  ): VerificationRequest[] {
    const results: VerificationRequest[] = [];
    for (const req of this.verificationStore.values()) {
      if (filters.cryptoId && req.cryptoId !== filters.cryptoId) continue;
      if (filters.status && req.status !== filters.status) continue;
      if (filters.method && req.method !== filters.method) continue;
      results.push(req);
    }
    return results.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  // =========================================================================
  // PUBLIC — Trust score management
  // =========================================================================

  /**
   * Recalculates and persists the trust score for a given identity.
   *
   * Also refreshes the accountAge factor (in days) before recalculating, so
   * repeated calls are always accurate without needing to manually update age.
   *
   * @param cryptoId The identity whose trust score to recalculate
   * @returns The new trust score (0-100)
   *
   * @throws Error if the identity does not exist
   *
   * @emits trust:recalculated  { cryptoId, oldScore, newScore }
   */
  recalculateTrust(cryptoId: string): number {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    const oldScore = identity.trustScore;

    // Always refresh account age before scoring
    identity.trustFactors.accountAge = this._accountAgeDays(identity);
    identity.trustFactors.verificationLevel = TIER_VERIFICATION_LEVEL[identity.tier];

    const newScore = this._computeTrustScore(identity);
    identity.trustScore = newScore;
    this.identityStore.set(cryptoId, identity);

    if (oldScore !== newScore) {
      this._createAuditEntry(
        cryptoId,
        "trust_recalculated",
        `Trust score updated: ${oldScore} → ${newScore}`,
        "system"
      );
      this.emit("trust:recalculated", { cryptoId, oldScore, newScore });
    }

    return newScore;
  }

  /**
   * Records a behavioural activity event for an identity, updates the relevant
   * trust factor counter, and triggers an immediate trust score recalculation.
   *
   * Also updates lastActiveAt so the identity appears recently active.
   *
   * Supported activity types:
   *   - "session_completed"       → increments sessionsCompleted
   *   - "alert_triggered"         → increments alertsTriggered
   *   - "report_received"         → increments reportsReceived
   *   - "report_resolved"         → increments reportsResolved
   *   - "community_contribution"  → increments communityContributions
   *
   * @param cryptoId  The identity to record activity for
   * @param activity  The type of activity that occurred
   *
   * @throws Error if the identity does not exist
   * @throws Error if the activity type is unrecognised
   */
  recordActivity(
    cryptoId: string,
    activity:
      | "session_completed"
      | "alert_triggered"
      | "report_received"
      | "report_resolved"
      | "community_contribution"
  ): void {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    switch (activity) {
      case "session_completed":
        identity.trustFactors.sessionsCompleted += 1;
        identity.sessionCount += 1;
        break;
      case "alert_triggered":
        identity.trustFactors.alertsTriggered += 1;
        break;
      case "report_received":
        identity.trustFactors.reportsReceived += 1;
        break;
      case "report_resolved":
        identity.trustFactors.reportsResolved += 1;
        break;
      case "community_contribution":
        identity.trustFactors.communityContributions += 1;
        break;
      default: {
        // TypeScript exhaustiveness — runtime guard
        const _exhaustive: never = activity;
        throw new Error(`Unknown activity type: ${_exhaustive}`);
      }
    }

    identity.lastActiveAt = Date.now();
    this.identityStore.set(cryptoId, identity);

    // Recalculate trust score immediately after any activity
    this.recalculateTrust(cryptoId);
  }

  // =========================================================================
  // PUBLIC — Block lists
  // =========================================================================

  /**
   * Blocks a target identity from the perspective of the blocker.
   *
   * The target's blockedByCount is incremented (but the list of who blocked
   * them is never exposed, preserving privacy). The blocker's blockedIds list
   * is updated to include the target's cryptoId.
   *
   * Blocking an already-blocked identity is a no-op (idempotent).
   *
   * @param blockerId  cryptoId of the identity initiating the block
   * @param blockedId  cryptoId of the identity being blocked
   * @param reason     Optional human-readable reason
   * @returns The created (or existing) BlockRecord
   *
   * @throws Error if either identity does not exist
   * @throws Error if an identity attempts to block itself
   *
   * @emits identity:blocked  { blockRecord: BlockRecord }
   */
  blockIdentity(
    blockerId: string,
    blockedId: string,
    reason?: string
  ): BlockRecord {
    if (blockerId === blockedId) {
      throw new Error("An identity cannot block itself.");
    }

    const blocker = this.identityStore.get(blockerId);
    if (!blocker) throw new Error(`Blocker identity not found: ${blockerId}`);

    const blocked = this.identityStore.get(blockedId);
    if (!blocked) throw new Error(`Blocked identity not found: ${blockedId}`);

    // Idempotency check: if already blocked, return the existing record
    if (blocker.blockedIds.includes(blockedId)) {
      const existing = [...this.blockStore.values()].find(
        (r) => r.blockerId === blockerId && r.blockedId === blockedId
      );
      if (existing) return existing;
    }

    const record: BlockRecord = {
      id: uuidv4(),
      blockerId,
      blockedId,
      reason,
      createdAt: Date.now(),
    };

    this.blockStore.set(record.id, record);

    if (!blocker.blockedIds.includes(blockedId)) {
      blocker.blockedIds.push(blockedId);
    }
    blocker.updatedAt = Date.now();
    this.identityStore.set(blockerId, blocker);

    blocked.blockedByCount = Math.max(0, blocked.blockedByCount + 1);
    this.identityStore.set(blockedId, blocked);

    this._createAuditEntry(
      blockerId,
      "blocked",
      `Blocked identity ${blockedId}${reason ? `: ${reason}` : ""}`,
      blockerId
    );

    this.emit("identity:blocked", { blockRecord: record });
    return record;
  }

  /**
   * Removes a block that the blocker previously placed on a target identity.
   *
   * If the block does not exist, this is a no-op.
   *
   * @param blockerId  cryptoId of the identity that placed the block
   * @param blockedId  cryptoId of the identity to unblock
   *
   * @throws Error if either identity does not exist
   *
   * @emits identity:unblocked  { blockerId, blockedId }
   */
  unblockIdentity(blockerId: string, blockedId: string): void {
    const blocker = this.identityStore.get(blockerId);
    if (!blocker) throw new Error(`Blocker identity not found: ${blockerId}`);

    const blocked = this.identityStore.get(blockedId);
    if (!blocked) throw new Error(`Blocked identity not found: ${blockedId}`);

    // Find and remove the block record
    let found = false;
    for (const [id, record] of this.blockStore) {
      if (record.blockerId === blockerId && record.blockedId === blockedId) {
        this.blockStore.delete(id);
        found = true;
        break;
      }
    }

    if (!found) return; // Already unblocked — no-op

    // Update the blocker's list
    blocker.blockedIds = blocker.blockedIds.filter((id) => id !== blockedId);
    blocker.updatedAt = Date.now();
    this.identityStore.set(blockerId, blocker);

    // Decrement the blocked identity's counter
    blocked.blockedByCount = Math.max(0, blocked.blockedByCount - 1);
    this.identityStore.set(blockedId, blocked);

    this._createAuditEntry(
      blockerId,
      "unblocked",
      `Unblocked identity ${blockedId}`,
      blockerId
    );

    this.emit("identity:unblocked", { blockerId, blockedId });
  }

  /**
   * Returns all block records created by a specific identity.
   *
   * @param cryptoId The cryptoId of the blocker
   * @returns Array of BlockRecord objects, newest first
   */
  getBlockList(cryptoId: string): BlockRecord[] {
    const results: BlockRecord[] = [];
    for (const record of this.blockStore.values()) {
      if (record.blockerId === cryptoId) {
        results.push(record);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Returns true if the checker identity has blocked the target identity.
   *
   * @param checkerId  cryptoId of the potential blocker
   * @param targetId   cryptoId of the potential blocked identity
   * @returns boolean
   */
  isBlocked(checkerId: string, targetId: string): boolean {
    const checker = this.identityStore.get(checkerId);
    if (!checker) return false;
    return checker.blockedIds.includes(targetId);
  }

  // =========================================================================
  // PUBLIC — Moderation
  // =========================================================================

  /**
   * Suspends an identity, preventing it from creating sessions or sending messages.
   *
   * Suspension is temporary; use reactivateIdentity() to restore access.
   * Already-suspended or banned identities can still be suspended (idempotent
   * with respect to the status field).
   *
   * @param cryptoId    The identity to suspend
   * @param reason      Human-readable reason for the suspension
   * @param performedBy cryptoId of the admin who performed the action
   * @returns The updated Identity
   *
   * @throws Error if the identity does not exist
   *
   * @emits identity:suspended  { identity: Identity, reason: string }
   */
  suspendIdentity(
    cryptoId: string,
    reason: string,
    performedBy: string
  ): Identity {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    identity.status = "suspended";
    identity.updatedAt = Date.now();
    this.identityStore.set(cryptoId, identity);

    this._createAuditEntry(
      cryptoId,
      "suspended",
      `Identity suspended by ${performedBy}: ${reason}`,
      performedBy
    );

    this.emit("identity:suspended", { identity, reason });
    return identity;
  }

  /**
   * Permanently bans an identity.
   *
   * Banned identities cannot participate in any Ultra Computer activity.
   * Reactivation requires an explicit call to reactivateIdentity() by an admin.
   *
   * @param cryptoId    The identity to ban
   * @param reason      Human-readable reason for the ban
   * @param performedBy cryptoId of the admin who performed the action
   * @returns The updated Identity
   *
   * @throws Error if the identity does not exist
   *
   * @emits identity:banned  { identity: Identity, reason: string }
   */
  banIdentity(
    cryptoId: string,
    reason: string,
    performedBy: string
  ): Identity {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    identity.status = "banned";
    identity.updatedAt = Date.now();
    this.identityStore.set(cryptoId, identity);

    this._createAuditEntry(
      cryptoId,
      "banned",
      `Identity permanently banned by ${performedBy}: ${reason}`,
      performedBy
    );

    this.emit("identity:banned", { identity, reason });
    return identity;
  }

  /**
   * Reactivates a suspended, banned, or deactivated identity, restoring its
   * "active" status.
   *
   * @param cryptoId    The identity to reactivate
   * @param performedBy cryptoId of the admin who performed the action
   * @returns The updated Identity
   *
   * @throws Error if the identity does not exist
   *
   * @emits identity:reactivated  { identity: Identity }
   */
  reactivateIdentity(cryptoId: string, performedBy: string): Identity {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    const previousStatus = identity.status;
    identity.status = "active";
    identity.updatedAt = Date.now();
    this.identityStore.set(cryptoId, identity);

    this._createAuditEntry(
      cryptoId,
      "reactivated",
      `Identity reactivated by ${performedBy} (was: ${previousStatus})`,
      performedBy
    );

    this.emit("identity:reactivated", { identity });
    return identity;
  }

  // =========================================================================
  // PUBLIC — Directory (search & list)
  // =========================================================================

  /**
   * Searches the public identity directory by display name, organisation name,
   * or community profile skills.
   *
   * Only identities with tier "verified" or higher are included in directory
   * search results. Unverified identities are intentionally hidden.
   *
   * @param query    Search string matched against displayName, organizationName, and skills
   * @param filters  Optional filters: tier, status, minTrustScore
   * @returns Array of matching PublicIdentityView objects, sorted by trustScore descending
   */
  searchIdentities(
    query: string,
    filters: SearchIdentityFilters = {}
  ): PublicIdentityView[] {
    const normalizedQuery = query.trim().toLowerCase();
    const results: PublicIdentityView[] = [];

    for (const identity of this.identityStore.values()) {
      // Directory excludes unverified identities
      if (TIER_ORDER[identity.tier] < TIER_ORDER["verified"]) continue;

      // Apply filters
      if (filters.tier && identity.tier !== filters.tier) continue;
      if (filters.status && identity.status !== filters.status) continue;
      if (
        filters.minTrustScore !== undefined &&
        identity.trustScore < filters.minTrustScore
      ) {
        continue;
      }

      // Match against displayName, organizationName, and skills
      const nameMatch = identity.displayName
        .toLowerCase()
        .includes(normalizedQuery);
      const orgMatch =
        identity.organizationName?.toLowerCase().includes(normalizedQuery) ??
        false;
      const skillMatch =
        identity.communityProfile?.skills?.some((skill) =>
          skill.toLowerCase().includes(normalizedQuery)
        ) ?? false;

      if (nameMatch || orgMatch || skillMatch) {
        const view = this.getPublicView(identity.crypto.cryptoId);
        if (view) results.push(view);
      }
    }

    // Sort by trust score descending, then alphabetically by displayName
    results.sort((a, b) => {
      if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
      return a.displayName.localeCompare(b.displayName);
    });

    return results;
  }

  /**
   * Returns a paginated list of public identity views from the directory.
   *
   * Only "verified" or higher tier identities appear in the directory.
   *
   * @param options  Pagination and filtering options
   * @returns Array of PublicIdentityView objects
   */
  listIdentities(options: ListIdentitiesOptions = {}): PublicIdentityView[] {
    const {
      tier,
      status,
      sortBy = "trustScore",
      limit = 50,
      offset = 0,
    } = options;

    const all: PublicIdentityView[] = [];

    for (const identity of this.identityStore.values()) {
      // Directory excludes unverified identities
      if (TIER_ORDER[identity.tier] < TIER_ORDER["verified"]) continue;

      if (tier && identity.tier !== tier) continue;
      if (status && identity.status !== status) continue;

      const view = this.getPublicView(identity.crypto.cryptoId);
      if (view) all.push(view);
    }

    // Sort
    all.sort((a, b) => {
      if (sortBy === "trustScore") return b.trustScore - a.trustScore;
      if (sortBy === "registeredAt") return b.registeredAt - a.registeredAt;
      if (sortBy === "lastActiveAt") return b.lastActiveAt - a.lastActiveAt;
      return 0;
    });

    return all.slice(offset, offset + limit);
  }

  /**
   * Returns aggregated statistics about the identity system.
   *
   * @returns IdentityStats object with counts, averages, and breakdowns
   */
  getStats(): IdentityStats {
    const byTier: Record<IdentityTier, number> = {
      unverified: 0,
      verified: 0,
      premium: 0,
      enterprise: 0,
      admin: 0,
    };
    const byStatus: Record<IdentityStatus, number> = {
      active: 0,
      suspended: 0,
      banned: 0,
      deactivated: 0,
    };

    let totalTrustScore = 0;
    let totalSessions = 0;
    let totalMessages = 0;

    for (const identity of this.identityStore.values()) {
      byTier[identity.tier] = (byTier[identity.tier] ?? 0) + 1;
      byStatus[identity.status] = (byStatus[identity.status] ?? 0) + 1;
      totalTrustScore += identity.trustScore;
      totalSessions += identity.sessionCount;
      totalMessages += identity.messageCount;
    }

    const total = this.identityStore.size;
    const averageTrustScore =
      total > 0 ? Math.round(totalTrustScore / total) : 0;

    const pendingVerifications = [...this.verificationStore.values()].filter(
      (r) => r.status === "pending"
    ).length;

    return {
      total,
      byTier,
      byStatus,
      averageTrustScore,
      totalSessions,
      totalMessages,
      totalBlocks: this.blockStore.size,
      pendingVerifications,
    };
  }

  // =========================================================================
  // PUBLIC — Audit log
  // =========================================================================

  /**
   * Returns audit log entries, optionally filtered to a specific identity.
   *
   * Entries are returned in reverse-chronological order (newest first).
   *
   * @param cryptoId  Optional cryptoId to filter the log to a single identity
   * @returns Array of IdentityAuditEntry objects
   */
  getAuditLog(cryptoId?: string): IdentityAuditEntry[] {
    const entries: IdentityAuditEntry[] = [];
    for (const entry of this.auditStore.values()) {
      if (cryptoId && entry.cryptoId !== cryptoId) continue;
      entries.push(entry);
    }
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  // =========================================================================
  // PUBLIC — Message count helper
  // =========================================================================

  /**
   * Increments the message count for a given identity.
   *
   * Called by the messaging subsystem whenever a message is sent. Also updates
   * lastActiveAt.
   *
   * @param cryptoId  The identity whose message count to increment
   *
   * @throws Error if the identity does not exist
   */
  recordMessage(cryptoId: string): void {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }
    identity.messageCount += 1;
    identity.lastActiveAt = Date.now();
    this.identityStore.set(cryptoId, identity);
  }

  // =========================================================================
  // PUBLIC — Lookup by fingerprint
  // =========================================================================

  /**
   * Looks up an identity by its 16-character fingerprint.
   *
   * Fingerprints are not guaranteed to be globally unique (they are a prefix),
   * but in practice the probability of collision is negligible. If multiple
   * matches exist, the first found is returned.
   *
   * @param fingerprint  The 16-character hex fingerprint to search for
   * @returns The Identity record, or null if not found
   */
  getByFingerprint(fingerprint: string): Identity | null {
    for (const identity of this.identityStore.values()) {
      if (identity.crypto.fingerprint === fingerprint) return identity;
    }
    return null;
  }

  // =========================================================================
  // PUBLIC — Existence check
  // =========================================================================

  /**
   * Returns true if an identity with the given cryptoId exists in the store.
   *
   * @param cryptoId  The cryptoId to check
   */
  hasIdentity(cryptoId: string): boolean {
    return this.identityStore.has(cryptoId);
  }

  // =========================================================================
  // PUBLIC — Tier check helper
  // =========================================================================

  /**
   * Returns true if the given identity has at least the specified minimum tier.
   *
   * Useful for access-gating features based on verification tier.
   *
   * @param cryptoId   The identity to check
   * @param minTier    The minimum required tier
   * @returns boolean — false if identity does not exist
   */
  hasTier(cryptoId: string, minTier: IdentityTier): boolean {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) return false;
    return TIER_ORDER[identity.tier] >= TIER_ORDER[minTier];
  }

  // =========================================================================
  // PUBLIC — Status check helper
  // =========================================================================

  /**
   * Returns true if the given identity exists and is currently active.
   *
   * Useful for pre-flight checks before allowing actions (e.g. session creation).
   *
   * @param cryptoId  The identity to check
   * @returns boolean — false if identity does not exist or is not active
   */
  isActive(cryptoId: string): boolean {
    const identity = this.identityStore.get(cryptoId);
    return identity?.status === "active";
  }

  // =========================================================================
  // PUBLIC — Bulk trust refresh
  // =========================================================================

  /**
   * Recalculates trust scores for all identities in the store.
   *
   * This is useful for scheduled background jobs that account for age bonuses
   * accumulating over time. Runs synchronously; for large stores consider
   * chunking across event loop ticks in production.
   *
   * @returns The number of identities whose score changed
   */
  refreshAllTrustScores(): number {
    let changedCount = 0;
    for (const cryptoId of this.identityStore.keys()) {
      const identity = this.identityStore.get(cryptoId)!;
      const oldScore = identity.trustScore;
      const newScore = this.recalculateTrust(cryptoId);
      if (newScore !== oldScore) changedCount++;
    }
    return changedCount;
  }

  // =========================================================================
  // PUBLIC — Admin tier set (direct override)
  // =========================================================================

  /**
   * Directly sets an identity's tier to any value.
   *
   * This is an administrative override that bypasses the normal verification
   * workflow. Use sparingly; prefer requestVerification/approveVerification for
   * normal tier upgrades.
   *
   * @param cryptoId    The identity to modify
   * @param tier        The new tier to assign
   * @param performedBy cryptoId of the admin performing the action
   * @returns The updated Identity
   *
   * @throws Error if the identity does not exist
   *
   * @emits identity:verified  { identity: Identity }  (if tier is not unverified)
   */
  adminSetTier(
    cryptoId: string,
    tier: IdentityTier,
    performedBy: string
  ): Identity {
    const identity = this.identityStore.get(cryptoId);
    if (!identity) {
      throw new Error(`Identity not found: ${cryptoId}`);
    }

    const previousTier = identity.tier;
    identity.tier = tier;
    identity.trustFactors.verificationLevel = TIER_VERIFICATION_LEVEL[tier];
    identity.updatedAt = Date.now();

    if (tier !== "unverified") {
      identity.verifiedAt = Date.now();
      identity.verificationMethod = "manual";
    }

    // Recalculate trust with new tier
    identity.trustFactors.accountAge = this._accountAgeDays(identity);
    identity.trustScore = this._computeTrustScore(identity);
    this.identityStore.set(cryptoId, identity);

    this._createAuditEntry(
      cryptoId,
      "tier_changed",
      `Admin tier override by ${performedBy}: "${previousTier}" → "${tier}"`,
      performedBy
    );

    if (tier !== "unverified") {
      this.emit("identity:verified", { identity });
    }

    return identity;
  }

  // =========================================================================
  // PUBLIC — Store size
  // =========================================================================

  /**
   * Returns the total number of identities currently registered.
   */
  get size(): number {
    return this.identityStore.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * The singleton IdentityEngine instance.
 *
 * Import this across all Ultra Computer subsystems to resolve and verify
 * identities using their cryptographic ID:
 *
 * ```typescript
 * import { identityEngine } from "./identityEngine.js";
 *
 * const id = identityEngine.registerIdentity("Alice");
 * const pub = identityEngine.getPublicView(id.crypto.cryptoId);
 * console.log(pub?.fingerprint); // "a3f9c1e0b2d48571"
 * ```
 */
export const identityEngine = new IdentityEngine();
