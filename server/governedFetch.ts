/**
 * governedFetch.ts
 * Shared outbound HTTP client that routes egress through the policy plane.
 *
 * All external-facing fetch() calls that should be policy-governed can use
 * this helper instead of raw fetch(). It evaluates network policy, resolves
 * and validates every destination, revalidates redirects, enforces deadlines
 * and response budgets, writes audit records, and throws on deny.
 *
 * Usage:
 *   import { governedFetch } from "./governedFetch.js";
 *   const response = await governedFetch(url, options, sessionId, domain, action);
 *
 * Local HTTP services are denied unless their exact hostname is present in
 * ULTRA_LOCAL_EGRESS_ALLOWLIST. Production plain HTTP additionally requires
 * ULTRA_ALLOW_INSECURE_HTTP=true.
 */

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import {
  evaluatePolicy,
  isExplicitLocalNetworkTargetAllowed,
  writePolicyAudit,
  type PolicyDomain,
} from "./policyEngine.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

interface ResolvedTarget {
  address: string;
  hostname: string;
}

export interface GovernedFetchLimits {
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

export class NetworkSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkSecurityError";
  }
}

export class PolicyDeniedError extends Error {
  constructor(
    public readonly domain: PolicyDomain,
    public readonly action: string,
    public readonly reason: string,
  ) {
    super(`Policy denied: ${domain}:${action} — ${reason}`);
    this.name = "PolicyDeniedError";
  }
}

/**
 * Performs a fetch() that is governed by the policy engine.
 *
 * @param url      - The outbound URL to fetch.
 * @param options  - Standard RequestInit options for fetch().
 * @param sessionId - Session or workflow ID for audit correlation.
 * @param domain   - Policy domain (typically "network").
 * @param action   - Policy action (e.g., "webhook_send", "provider_call").
 * @returns        The fetch Response.
 * @throws PolicyDeniedError if the policy engine denies the request.
 */
export async function governedFetch(
  url: string,
  options: RequestInit,
  sessionId: string,
  domain: PolicyDomain,
  action: string,
  limits: GovernedFetchLimits = {},
): Promise<Response> {
  const timeoutMs = boundedInteger(limits.timeoutMs, envInteger("OUTBOUND_HTTP_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS, 1, 300_000);
  const maxRedirects = boundedInteger(limits.maxRedirects, envInteger("OUTBOUND_HTTP_MAX_REDIRECTS"), DEFAULT_MAX_REDIRECTS, 0, 10);
  const maxResponseBytes = boundedInteger(
    limits.maxResponseBytes,
    envInteger("OUTBOUND_HTTP_MAX_RESPONSE_BYTES"),
    DEFAULT_MAX_RESPONSE_BYTES,
    1,
    100 * 1024 * 1024,
  );

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let currentUrl = parseUrl(url, domain, action);
  let currentOptions: RequestInit = { ...options, redirect: "manual", signal };

  for (let redirectCount = 0; ; redirectCount += 1) {
    let resolvedTarget: ResolvedTarget;
    try {
      resolvedTarget = await validateTarget(currentUrl);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      writePolicyAudit({
        domain,
        action,
        url: currentUrl.toString(),
        method: (currentOptions.method ?? "GET").toUpperCase(),
        sessionId,
        metadata: { redirectCount, securityValidation: "denied" },
      }, {
        allowed: false,
        reason,
        domain,
        action,
      });
      throw error;
    }
    enforcePolicy(currentUrl, currentOptions, sessionId, domain, action, redirectCount);

    let response: Response;
    try {
      response = await requestPinnedTarget(
        currentUrl,
        currentOptions,
        resolvedTarget,
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        const reason = options.signal?.aborted
          ? "Outbound request was cancelled by the caller"
          : `Outbound request exceeded ${timeoutMs}ms`;
        throw new NetworkSecurityError(reason);
      }
      throw error;
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return boundResponseBody(response, maxResponseBytes);
    }

    const location = response.headers.get("location");
    if (!location) {
      return boundResponseBody(response, maxResponseBytes);
    }
    if (redirectCount >= maxRedirects) {
      await response.body?.cancel();
      throw new NetworkSecurityError(`Outbound request exceeded ${maxRedirects} redirects`);
    }

    const nextUrl = parseUrl(new URL(location, currentUrl).toString(), domain, action);
    await response.body?.cancel();
    currentOptions = redirectOptions(currentOptions, response.status, currentUrl, nextUrl);
    currentUrl = nextUrl;
  }
}

function parseUrl(rawUrl: string, domain: PolicyDomain, action: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new PolicyDeniedError(domain, action, `Invalid URL: ${rawUrl}`);
  }
}

function envInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundedInteger(
  explicit: number | undefined,
  fromEnvironment: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = explicit ?? fromEnvironment ?? fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function insecureHttpAllowed(): boolean {
  return process.env.NODE_ENV !== "production"
    || process.env.ULTRA_ALLOW_INSECURE_HTTP === "true";
}

async function validateTarget(url: URL): Promise<ResolvedTarget> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new NetworkSecurityError(`Outbound protocol '${url.protocol}' is not allowed`);
  }
  if (url.username || url.password) {
    throw new NetworkSecurityError("Outbound URLs must not contain embedded credentials");
  }
  if (url.protocol === "http:" && !insecureHttpAllowed()) {
    throw new NetworkSecurityError(
      "Plain HTTP egress is disabled in production; use HTTPS or explicitly set ULTRA_ALLOW_INSECURE_HTTP=true",
    );
  }

  const hostname = normalizeHostname(url.hostname);
  let addresses: string[];
  try {
    addresses = net.isIP(hostname)
      ? [hostname]
      : (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
  } catch {
    throw new NetworkSecurityError(`Outbound host '${hostname}' could not be resolved`);
  }

  if (addresses.length === 0) {
    throw new NetworkSecurityError(`Outbound host '${hostname}' did not resolve to an address`);
  }
  if (!isExplicitLocalNetworkTargetAllowed(hostname)) {
    const unsafeAddress = addresses.find(isNonPublicAddress);
    if (unsafeAddress) {
      throw new NetworkSecurityError(
        `Outbound host '${hostname}' resolves to blocked non-public address ${unsafeAddress}`,
      );
    }
  }
  return { address: addresses[0], hostname };
}

/**
 * Connect to the address that passed validation instead of resolving the
 * hostname again inside the HTTP client. This closes the DNS-rebinding window
 * between policy validation and the network connection while retaining the
 * original Host header and TLS server name.
 */
async function requestPinnedTarget(
  url: URL,
  options: RequestInit,
  target: ResolvedTarget,
  signal: AbortSignal,
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("host", url.host);
  const body = await materializeRequestBody(options, headers);
  if (body && !headers.has("content-length")) {
    headers.set("content-length", String(body.byteLength));
  }

  const requestOptions: https.RequestOptions = {
    protocol: url.protocol,
    hostname: target.address,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: options.method ?? "GET",
    headers: Object.fromEntries(headers.entries()),
    signal,
  };
  if (url.protocol === "https:" && net.isIP(target.hostname) === 0) {
    requestOptions.servername = target.hostname;
  }

  const transport = url.protocol === "https:" ? https : http;
  return new Promise<Response>((resolve, reject) => {
    const request = transport.request(requestOptions, (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(name, item);
        } else if (value !== undefined) {
          responseHeaders.set(name, value);
        }
      }
      const bodyStream = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      resolve(new Response(bodyStream, {
        status: incoming.statusCode ?? 500,
        statusText: incoming.statusMessage,
        headers: responseHeaders,
      }));
    });
    request.once("error", reject);
    request.end(body);
  });
}

async function materializeRequestBody(
  options: RequestInit,
  headers: Headers,
): Promise<Buffer | undefined> {
  if (options.body === undefined || options.body === null) return undefined;

  const normalized = new Request("http://outbound.invalid/", {
    method: options.method ?? "POST",
    headers,
    body: options.body,
  });
  normalized.headers.forEach((value, name) => headers.set(name, value));
  return Buffer.from(await normalized.arrayBuffer());
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isNonPublicAddress(address: string): boolean {
  const normalized = normalizeHostname(address).toLowerCase();
  const family = net.isIP(normalized);
  if (family === 4) {
    const [a, b, c] = normalized.split(".").map(Number);
    return (
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224
    );
  }
  if (family === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("ff")) return true;
    const mappedAddress = ipv4FromMappedIpv6(normalized);
    if (mappedAddress) return isNonPublicAddress(mappedAddress);
  }
  return family === 0;
}

function ipv4FromMappedIpv6(address: string): string | null {
  if (!address.startsWith("::ffff:")) return null;
  const suffix = address.slice("::ffff:".length);
  if (net.isIP(suffix) === 4) return suffix;

  const words = suffix.split(":");
  if (words.length !== 2) return null;
  const high = Number.parseInt(words[0], 16);
  const low = Number.parseInt(words[1], 16);
  if (
    !Number.isInteger(high)
    || !Number.isInteger(low)
    || high < 0
    || high > 0xffff
    || low < 0
    || low > 0xffff
  ) {
    return null;
  }
  return [
    high >>> 8,
    high & 0xff,
    low >>> 8,
    low & 0xff,
  ].join(".");
}

function enforcePolicy(
  url: URL,
  options: RequestInit,
  sessionId: string,
  domain: PolicyDomain,
  action: string,
  redirectCount: number,
): void {
  const context = {
    domain,
    action,
    url: url.toString(),
    method: (options.method ?? "GET").toUpperCase(),
    sessionId,
    metadata: {
      host: url.hostname,
      protocol: url.protocol,
      redirectCount,
    },
  };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  if (!decision.allowed) {
    throw new PolicyDeniedError(domain, action, decision.reason);
  }
}

function redirectOptions(
  options: RequestInit,
  status: number,
  previousUrl: URL,
  nextUrl: URL,
): RequestInit {
  const next = { ...options };
  const method = (next.method ?? "GET").toUpperCase();
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    next.method = "GET";
    delete next.body;
    const headers = new Headers(next.headers);
    headers.delete("content-length");
    headers.delete("content-type");
    next.headers = headers;
  }

  if (previousUrl.origin !== nextUrl.origin) {
    const headers = new Headers(next.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete("proxy-authorization");
    next.headers = headers;
  }
  return next;
}

function boundResponseBody(response: Response, maxBytes: number): Response {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    void response.body?.cancel();
    throw new NetworkSecurityError(
      `Outbound response declared ${declaredLength} bytes, exceeding the ${maxBytes}-byte limit`,
    );
  }
  if (!response.body) return response;

  let received = 0;
  const boundedStream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        controller.error(new NetworkSecurityError(
          `Outbound response exceeded the ${maxBytes}-byte limit`,
        ));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  return new Response(boundedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
