import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256-bit

/**
 * Get or derive the encryption key.
 * Uses ENCRYPTION_KEY env var (hex-encoded 32 bytes).
 * In dev mode without ENCRYPTION_KEY, uses a deterministic dev key with a warning.
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (keyHex) {
    const key = Buffer.from(keyHex, "hex");
    if (key.length !== KEY_LENGTH) {
      throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
    }
    return key;
  }
  // Dev mode: derive a fixed key from a constant — NOT secure, but prevents crashing without the env var
  if (process.env.NODE_ENV !== "production") {
    console.warn("[encryption] WARNING: ENCRYPTION_KEY not set — using insecure dev key. Set ENCRYPTION_KEY in production.");
    return Buffer.from("ultra-computer-dev-key-not-secure".padEnd(KEY_LENGTH, "0").slice(0, KEY_LENGTH));
  }
  throw new Error("[encryption] ENCRYPTION_KEY is required in production mode");
}

/**
 * Encrypt a plaintext string. Returns a base64-encoded string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  // Don't double-encrypt already-encrypted values
  if (plaintext.startsWith("enc:")) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: enc:<base64(iv + authTag + ciphertext)>
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:" + combined.toString("base64");
}

/**
 * Decrypt a value encrypted with encrypt(). Returns plaintext.
 * Passes through unencrypted values (for migration compatibility).
 */
export function decrypt(value: string): string {
  if (!value) return value;
  if (!value.startsWith("enc:")) {
    // Legacy plaintext value — return as-is (migration compatibility)
    return value;
  }

  const key = getEncryptionKey();
  const combined = Buffer.from(value.slice(4), "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}
