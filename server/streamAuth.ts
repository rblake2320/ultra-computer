import crypto from "node:crypto";

interface StreamTokenPayload {
  path: string;
  exp: number;
  nonce: string;
}

const MAX_TOKEN_TTL_MS = 2 * 60_000;

function signingKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.ENCRYPTION_KEY || env.ULTRA_API_KEY;
  if (!key) throw new Error("Stream token signing requires ENCRYPTION_KEY or ULTRA_API_KEY");
  return key;
}

function signature(encodedPayload: string, env?: NodeJS.ProcessEnv): string {
  return crypto
    .createHmac("sha256", signingKey(env))
    .update(encodedPayload)
    .digest("base64url");
}

export function createStreamToken(
  path: string,
  ttlMs = 60_000,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("#")) {
    throw new TypeError("Stream token path must be an absolute API path without a query or fragment");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TOKEN_TTL_MS) {
    throw new TypeError(`Stream token TTL must be between 1 and ${MAX_TOKEN_TTL_MS} milliseconds`);
  }
  const payload: StreamTokenPayload = {
    path,
    exp: Date.now() + ttlMs,
    nonce: crypto.randomBytes(12).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, env)}`;
}

export function verifyStreamToken(
  token: string,
  requestPath: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): boolean {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return false;
  const expectedSignature = signature(encoded, env);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return false;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<StreamTokenPayload>;
    return payload.path === requestPath
      && typeof payload.exp === "number"
      && payload.exp >= now
      && payload.exp <= now + MAX_TOKEN_TTL_MS
      && typeof payload.nonce === "string"
      && payload.nonce.length >= 8;
  } catch {
    return false;
  }
}
