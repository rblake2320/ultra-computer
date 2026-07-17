import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../client/src/lib/queryClient";

function installBrowserGlobals(): void {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  });
}

describe("apiRequest response contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns parsed JSON rather than the raw Response", async () => {
    installBrowserGlobals();
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, oauthUrl: "https://example.test/authorize" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    const result = await apiRequest<{ ok: boolean; oauthUrl: string }>(
      "POST",
      "/api/connectors/example/connect",
      { client_id: "id" },
    );

    expect(result).toEqual({ ok: true, oauthUrl: "https://example.test/authorize" });
    expect(result).not.toBeInstanceOf(Response);
  });

  it("throws the server error before callers can inspect response status", async () => {
    installBrowserGlobals();
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "Connector credentials were rejected" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(apiRequest("POST", "/api/connectors/example/connect", {}))
      .rejects.toThrow("Connector credentials were rejected");
  });
});
