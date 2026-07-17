import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, connectEventSource } from "../../client/src/lib/queryClient";

function installBrowserGlobals(): void {
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
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

  it("carries the last SSE event ID into a manually renewed authenticated stream", async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    const sources: FakeEventSource[] = [];
    class FakeEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();

      constructor(readonly url: string) {
        sources.push(this);
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);

    const disconnect = connectEventSource("/api/conversations/one/stream", {
      onMessage: vi.fn(),
    });
    await vi.runAllTicks();
    expect(sources[0].url).toBe("/api/conversations/one/stream");

    sources[0].onmessage?.({ data: "{}", lastEventId: "42" } as MessageEvent<string>);
    sources[0].onerror?.();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sources[1].url).toBe("/api/conversations/one/stream?lastEventId=42");
    disconnect();
    vi.useRealTimers();
  });
});
