import { governedFetch, NetworkSecurityError } from "../governedFetch.js";

const MAX_PROVIDER_REQUEST_BYTES = 25 * 1024 * 1024;

/**
 * Fetch implementation for provider SDKs. It preserves the SDK's exact
 * request while routing DNS, TLS, redirects, policy audit, timeout and response
 * bounds through the same egress boundary used by first-party HTTP calls.
 */
export function createGovernedProviderFetch(sessionId: string): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const method = request.method.toUpperCase();
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (method !== "GET" && method !== "HEAD" && request.body) {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_PROVIDER_REQUEST_BYTES) {
        throw new NetworkSecurityError(
          `Provider request exceeded the ${MAX_PROVIDER_REQUEST_BYTES}-byte limit`,
        );
      }
      body = new Uint8Array(bytes);
    }

    return governedFetch(request.url, {
      method,
      headers: request.headers,
      body,
      signal: request.signal,
    }, sessionId, "network", "network:ai_provider", {
      timeoutMs: 120_000,
      maxResponseBytes: 25 * 1024 * 1024,
    });
  };
}
