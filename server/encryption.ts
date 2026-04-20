import crypto from "crypto";

// Real AES-256-GCM encryption for API keys stored at rest.
// Key derivation uses PBKDF2 with a fixed per-installation salt.
// Each encrypted value gets a random IV so identical plaintexts
// produce different ciphertext — safe for DB storage.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = "ultra-computer-encryption-v1"; // fixed salt — key changes per installation secret

let derivedKey: Buffer | null = null;

/**
 * Derive a 32-byte AES key from the master secret using PBKDF2-SHA512.
 * Must be called once at startup before encrypt/decrypt can be used.
 */
export function initEncryption(masterSecret: string): void {
  derivedKey = crypto.pbkdf2Sync(masterSecret, SALT, 100000, 32, "sha512");
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a base64 blob prefixed with "enc:" so it can be distinguished
 * from legacy plaintext values in the database.
 *
 * Wire format (inside the base64): [16-byte IV | 16-byte auth tag | ciphertext]
 */
export function encrypt(plaintext: string): string {
  if (!derivedKey) throw new Error("Encryption not initialized — call initEncryption() first");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:" + combined.toString("base64");
}

/**
 * Decrypt a value that was produced by encrypt().
 * If the value lacks the "enc:" prefix it is returned as-is — this provides
 * backward compatibility with any plaintext values left in the database
 * before this feature was deployed.
 */
export function decrypt(encryptedText: string): string {
  if (!derivedKey) throw new Error("Encryption not initialized — call initEncryption() first");

  // Legacy plaintext — return unchanged for backward compatibility
  if (!encryptedText.startsWith("enc:")) {
    return encryptedText;
  }

  const combined = Buffer.from(encryptedText.slice(4), "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Returns true if a stored value was encrypted by this module.
 * Useful for deciding whether to encrypt-before-store or skip-if-already-encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith("enc:");
}
