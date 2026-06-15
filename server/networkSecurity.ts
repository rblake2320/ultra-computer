/**
 * Shared network security utilities — used by all HTTP/browser tools
 * to block SSRF, protocol abuse, and DNS rebinding attack vectors.
 */

/**
 * Returns true when the hostname resolves to a private, loopback, or
 * link-local address that must not be reachable from agent tools.
 *
 * Note: this is a best-effort string check. It cannot defend against
 * DNS rebinding (a controlled domain that resolves to a private IP after
 * a legitimate first lookup). For production deployments, pair this with
 * network-level egress filtering.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^127\./.test(h) ||             // 127.0.0.0/8 — loopback
    /^10\./.test(h) ||              // 10.0.0.0/8 — private
    /^192\.168\./.test(h) ||        // 192.168.0.0/16 — private
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || // 172.16.0.0/12 — private
    h === "::1" ||
    h === "[::1]" ||
    /^fc00:/i.test(h) ||            // IPv6 ULA
    /^fe80:/i.test(h) ||            // IPv6 link-local
    /^169\.254\./.test(h)           // 169.254.0.0/16 — link-local (IMDS)
  );
}

/** Validate that a URL string is safe to fetch — scheme + SSRF checks. */
export function validateFetchUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `URL scheme '${parsed.protocol}' is not allowed. Only http: and https: are permitted.` };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, error: "Fetching private/internal network addresses is not allowed" };
  }

  return { ok: true, url: parsed };
}
