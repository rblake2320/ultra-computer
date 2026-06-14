/**
 * Redis-backed persistence layer for CacheEngine exact entries.
 *
 * Survives app restarts. Degrades gracefully when Redis is unavailable —
 * the caller gets null and falls through to an in-memory miss.
 *
 * Connection is lazy: the module exports fire-and-forget helpers that only
 * attempt Redis writes when the client is in a "ready" state.
 */

import IORedis from "ioredis";

const KEY_PREFIX = "uc:cache:";
const WARM_LIMIT = 200;      // max entries restored at startup
const SCAN_BATCH = 50;       // SCAN COUNT hint per iteration
const CONNECT_TIMEOUT = 4_000;

let _client: IORedis | null = null;
let _ready = false;

function client(): IORedis | null {
  if (_client) return _ready ? _client : null;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const c = new IORedis(url, {
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    c.on("ready", () => { _ready = true; });
    c.on("error", () => { _ready = false; });
    c.on("close", () => { _ready = false; });
    _client = c;
    c.connect().catch(() => { _ready = false; });
    return null; // not ready on first synchronous call
  } catch {
    return null;
  }
}

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PersistedEntry {
  response: {
    content: string;
    tokensIn: number;
    tokensOut: number;
    modelId: string;
  };
  createdAt: number;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget. Never throws.
 * Opt-in: set REDIS_CACHE_PERSIST=true to enable. Off by default because
 * conversational LLM responses almost never repeat exactly (SHA-256 match),
 * so writes without this flag are overhead with near-zero hit rate.
 */
export function persistEntry(key: string, entry: PersistedEntry, ttlMs: number): void {
  if (!process.env.REDIS_CACHE_PERSIST) return;
  const c = client() ?? _client;
  if (!c || !_ready) return;
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1_000));
  c.set(KEY_PREFIX + key, JSON.stringify(entry), "EX", ttlSec).catch((err: Error) => {
    if (process.env.DEBUG_CACHE) console.warn("[redisCacheSync] set failed:", err.message);
  });
}

// ─── Startup Warm ─────────────────────────────────────────────────────────────

/**
 * SCAN Redis for persisted exact-cache entries and call `onEntry` for each.
 * Returns the number of entries loaded. Intended to run once at startup.
 * No-op when REDIS_CACHE_PERSIST is not set (nothing was persisted).
 */
export async function warmEntries(
  onEntry: (key: string, entry: PersistedEntry, ttlRemainingMs: number) => void,
): Promise<number> {
  if (!process.env.REDIS_CACHE_PERSIST) return 0;
  const c = client() ?? _client;
  if (!c) {
    // Give the lazy connection a moment to become ready then retry once
    await new Promise(r => setTimeout(r, 500));
    if (!_ready || !_client) return 0;
  }
  if (!_ready) return 0;

  const redis = _client!;
  let loaded = 0;
  let cursor = "0";

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor, "MATCH", KEY_PREFIX + "*", "COUNT", SCAN_BATCH,
      );
      cursor = nextCursor;
      for (const fullKey of keys) {
        if (loaded >= WARM_LIMIT) break;
        try {
          const [raw, ttlSec] = await Promise.all([
            redis.get(fullKey),
            redis.ttl(fullKey),
          ]);
          if (raw && ttlSec > 0) {
            const entry = JSON.parse(raw) as PersistedEntry;
            onEntry(fullKey.slice(KEY_PREFIX.length), entry, ttlSec * 1_000);
            loaded++;
          }
        } catch { /* skip corrupt entries */ }
      }
    } while (cursor !== "0" && loaded < WARM_LIMIT);
  } catch (err: any) {
    console.warn("[redisCacheSync] SCAN failed:", err.message);
  }

  return loaded;
}
