import { describe, it, expect, beforeAll } from "vitest";

// Set a test encryption key before importing encryption module
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64); // 32 bytes of zeros for testing
});

describe("encryption", () => {
  it("encrypt produces enc: prefix", async () => {
    const { encrypt } = await import("../../server/encryption.js");
    const result = encrypt("test-api-key-12345");
    expect(result.startsWith("enc:")).toBe(true);
  });

  it("decrypt reverses encrypt", async () => {
    const { encrypt, decrypt } = await import("../../server/encryption.js");
    const original = "sk-test-api-key-abc123";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("encrypt is non-deterministic (different IV each time)", async () => {
    const { encrypt, decrypt } = await import("../../server/encryption.js");
    const a = encrypt("same-key");
    const b = encrypt("same-key");
    expect(a).not.toBe(b); // Different IVs produce different ciphertexts
    expect(decrypt(a)).toBe(decrypt(b)); // But both decrypt to same plaintext
  });

  it("decrypt passes through plaintext values (migration compat)", async () => {
    const { decrypt } = await import("../../server/encryption.js");
    const plaintext = "legacy-api-key";
    expect(decrypt(plaintext)).toBe(plaintext);
  });

  it("encrypt does not double-encrypt enc: values", async () => {
    const { encrypt } = await import("../../server/encryption.js");
    const original = "test-key";
    const encrypted = encrypt(original);
    const doubleEncrypted = encrypt(encrypted);
    expect(doubleEncrypted).toBe(encrypted); // Should be unchanged
  });

  it("encrypt returns plaintext unchanged if empty string", async () => {
    const { encrypt } = await import("../../server/encryption.js");
    expect(encrypt("")).toBe("");
  });
});
