const SECRET_KEY_RE = /(api[_-]?key|token|secret|password|passwd|authorization|cookie|session|private[_-]?key|webhook[_-]?secret)/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:live|test|proj)-[A-Za-z0-9_-]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\btoken\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

export function isSensitiveKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

export function redactString(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value
  );
}

export function redactValue<T>(value: T): T {
  return redactValueInner(value, new WeakSet<object>());
}

function redactValueInner<T>(value: T, seen: WeakSet<object>): T {
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactValueInner(item, seen)) as T;
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) return "[Circular]" as T;
    seen.add(objectValue);
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(objectValue)) {
      out[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValueInner(inner, seen);
    }
    return out as T;
  }
  return value;
}

export function redactEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env) return undefined;
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    safe[key] = isSensitiveKey(key) ? "[REDACTED]" : redactString(value);
  }
  return safe;
}
