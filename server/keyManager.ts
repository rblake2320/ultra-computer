/**
 * Key Manager
 * ═══════════════════════════════════════════════════════════════════════════
 * Wraps the low-level encryption module and integrates with the storage layer.
 *
 * On startup:
 *   1. Reads the master secret from ENCRYPTION_SECRET or JWT_SECRET env var.
 *   2. Falls back to a per-installation secret stored in the settings table.
 *   3. Generates and persists a new secret if neither exists.
 *   4. Migrates any plaintext API keys in the models table to encrypted form.
 *   5. Migrates key-like fields inside connector config JSON blobs.
 *
 * At runtime:
 *   - encryptApiKey()  — call before INSERT/UPDATE to the models table
 *   - decryptApiKey()  — call when passing a key to an LLM provider
 */

import { encrypt, decrypt, initEncryption, isEncrypted } from "./encryption.js";
import logger from "./logger.js";
const keyLogger = logger.child({ module: "keyManager" });
import { db } from "./storage.js";
import { settings, models, connectors } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// ─── Startup Init ─────────────────────────────────────────────────────────────

/**
 * Initialize the encryption subsystem.
 * Call this once, before any other keyManager functions.
 */
export function initKeyManager(): void {
  // Priority 1: explicit encryption secret env var
  let masterSecret: string | undefined =
    process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;

  // Priority 2: persisted installation secret in settings table
  if (!masterSecret) {
    try {
      const row = db.select().from(settings).where(eq(settings.key, "encryption_secret")).get();
      if (row) masterSecret = row.value;
    } catch {
      // settings table may not exist yet during first run — handled below
    }
  }

  // Priority 3: generate a new random secret and store it
  if (!masterSecret) {
    masterSecret = crypto.randomBytes(64).toString("hex");
    try {
      db.insert(settings).values({ key: "encryption_secret", value: masterSecret }).run();
    } catch {
      // If insert fails (race on first boot), try update
      try {
        db.update(settings)
          .set({ value: masterSecret })
          .where(eq(settings.key, "encryption_secret"))
          .run();
      } catch {
        // If both fail, we still proceed with the in-memory secret for this run.
        // The next boot will generate another key — any keys encrypted with the
        // in-memory key will decrypt as legacy plaintext (backward compat path).
        keyLogger.warn("Could not persist encryption secret — keys encrypted this session may not decrypt after restart");
      }
    }
  }

  initEncryption(masterSecret);
  keyLogger.info("AES-256-GCM encryption initialized");
}

// ─── Per-Key Helpers ──────────────────────────────────────────────────────────

/**
 * Encrypt an API key before writing it to the database.
 * Idempotent — if the value is already encrypted it is returned unchanged.
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey || isEncrypted(plainKey)) return plainKey;
  return encrypt(plainKey);
}

/**
 * Decrypt an API key read from the database before handing it to a provider.
 * If the stored value is legacy plaintext (no "enc:" prefix), it is returned
 * as-is so existing installations keep working without any manual migration.
 */
export function decryptApiKey(storedKey: string): string {
  if (!storedKey) return storedKey;
  return decrypt(storedKey);
}

// ─── Migration ────────────────────────────────────────────────────────────────

/** Field name patterns that indicate a sensitive credential value. */
const SENSITIVE_FIELD_PATTERN = /key|token|secret|password|credential|auth/i;

/**
 * Scan the models and connectors tables for plaintext credentials and encrypt them.
 * Safe to call multiple times — already-encrypted values are skipped.
 * Returns the total number of records updated.
 */
export function migrateExistingKeys(): number {
  let migrated = 0;

  // ── Models table ──────────────────────────────────────────────────────────
  try {
    const allModels = db.select().from(models).all();
    for (const model of allModels) {
      if (model.apiKey && !isEncrypted(model.apiKey)) {
        const encrypted = encrypt(model.apiKey);
        db.update(models)
          .set({ apiKey: encrypted })
          .where(eq(models.id, model.id))
          .run();
        migrated++;
      }
    }
  } catch (err) {
    keyLogger.error({ err }, "Error migrating model API keys");
  }

  // ── Connectors table (JSON config blobs) ──────────────────────────────────
  try {
    const allConnectors = db.select().from(connectors).all();
    for (const conn of allConnectors) {
      if (!conn.config) continue;
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(conn.config);
      } catch {
        continue; // malformed JSON — skip
      }

      let changed = false;
      for (const [key, value] of Object.entries(config)) {
        if (
          typeof value === "string" &&
          value.length > 0 &&
          SENSITIVE_FIELD_PATTERN.test(key) &&
          !isEncrypted(value)
        ) {
          config[key] = encrypt(value);
          changed = true;
        }
      }

      if (changed) {
        db.update(connectors)
          .set({ config: JSON.stringify(config) })
          .where(eq(connectors.id, conn.id))
          .run();
        migrated++;
      }
    }
  } catch (err) {
    keyLogger.error({ err }, "Error migrating connector config keys");
  }

  return migrated;
}
