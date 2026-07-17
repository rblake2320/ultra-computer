import { describe, expect, it } from "vitest";
import { createStreamToken, verifyStreamToken } from "../../server/streamAuth.js";

const env = {
  ULTRA_API_KEY: "test-key-that-is-long-enough-for-token-signing",
} as NodeJS.ProcessEnv;

describe("scoped stream authentication", () => {
  it("accepts a valid token only for its exact API path", () => {
    const token = createStreamToken("/api/events/stream", 60_000, env);
    expect(verifyStreamToken(token, "/api/events/stream", env)).toBe(true);
    expect(verifyStreamToken(token, "/api/admin/stream", env)).toBe(false);
  });

  it("rejects expired, tampered, malformed, and overlong tokens", () => {
    const token = createStreamToken("/api/events/stream", 1_000, env);
    const [encoded] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { exp: number };
    expect(verifyStreamToken(token, "/api/events/stream", env, payload.exp + 1)).toBe(false);
    expect(verifyStreamToken(`${token}x`, "/api/events/stream", env)).toBe(false);
    expect(verifyStreamToken("invalid", "/api/events/stream", env)).toBe(false);
    expect(() => createStreamToken("/api/events", 120_001, env)).toThrow("TTL");
  });

  it("rejects tokens for non-API paths or paths containing query data", () => {
    expect(() => createStreamToken("/public/events", 60_000, env)).toThrow("absolute API path");
    expect(() => createStreamToken("/api/events?secret=value", 60_000, env)).toThrow("query");
  });
});
