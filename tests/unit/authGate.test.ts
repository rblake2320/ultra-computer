import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOwnerApiKey } from "../../client/src/lib/ownerAuth.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("owner access gate", () => {
  it("grants access only for a successful app-config contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ experimental: false }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    await expect(validateOwnerApiKey("owner-key")).resolves.toBe(true);
  });

  it("rejects an invalid owner credential", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(validateOwnerApiKey("wrong-key")).resolves.toBe(false);
  });

  it("does not treat server failures as authenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(validateOwnerApiKey("owner-key")).rejects.toThrow(/HTTP 503/);
  });

  it("fails closed on a malformed success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    await expect(validateOwnerApiKey("owner-key")).rejects.toThrow(/invalid response/);
  });
});
