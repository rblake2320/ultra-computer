export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Parse capabilities that may be plain array, JSON string, or double-encoded JSON string.
export function parseCapabilities(value: unknown): string[] {
  let v = value;
  for (let i = 0; i < 3; i++) {
    if (Array.isArray(v)) return v as string[];
    if (typeof v !== "string" || !v) return [];
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? (v as string[]) : [];
}
