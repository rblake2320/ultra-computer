import crypto from "crypto";

/**
 * Shared API key verification used by REST middleware, GraphQL context, and gRPC interceptor.
 * Returns true if ULTRA_API_KEY is unset (open/dev mode) or if the supplied key matches.
 */
export function verifyApiKey(suppliedKey: string): boolean {
  const apiKey = process.env.ULTRA_API_KEY;
  if (!apiKey) return true; // open mode — no key configured
  if (!suppliedKey) return false;
  try {
    const keyBuf = Buffer.from(apiKey, "utf-8");
    const suppliedBuf = Buffer.from(suppliedKey, "utf-8");
    if (keyBuf.length !== suppliedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, suppliedBuf);
  } catch {
    return false;
  }
}

/**
 * Extract Bearer token from Authorization header or X-API-Key header.
 */
export function extractApiKey(authHeader?: string, xApiKey?: string): string {
  if (xApiKey) return xApiKey;
  if (!authHeader) return "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return authHeader.trim();
}
