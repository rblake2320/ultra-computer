import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticatedFetch } from "../../client/src/lib/queryClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser API authentication", () => {
  it("adds the session owner key to multipart requests without setting a JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: vi.fn().mockReturnValue("owner-session-key"),
      },
    });

    const formData = new FormData();
    formData.append("files", new Blob(["proof"]), "proof.txt");

    await authenticatedFetch("/api/sandbox/files/upload", {
      method: "POST",
      body: formData,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("/api/sandbox/files/upload");
    expect(init.body).toBe(formData);
    expect(headers.get("Authorization")).toBe("Bearer owner-session-key");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("does not add an authorization header when no owner key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(""),
      },
    });

    await authenticatedFetch("/api/health");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });
});
