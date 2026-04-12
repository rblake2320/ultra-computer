/**
 * Lightweight API response cache middleware for Express.
 * Caches GET responses in memory with TTL expiration.
 * Ideal for read-heavy endpoints that don't change frequently.
 */
import type { Request, Response, NextFunction } from "express";

interface CacheEntry {
  body: any;
  contentType: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

/**
 * Express middleware that caches GET responses for `ttlMs` milliseconds.
 * Usage: app.get("/api/voices", apiCache(30000), handler);
 */
export function apiCache(ttlMs: number = 10_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();

    const key = req.originalUrl || req.url;
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttlMs) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Content-Type", cached.contentType);
      res.json(cached.body);
      return;
    }

    // Monkey-patch res.json to intercept the response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Evict oldest if at capacity
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }

      cache.set(key, {
        body,
        contentType: res.getHeader("Content-Type") as string || "application/json",
        timestamp: Date.now(),
      });

      res.setHeader("X-Cache", "MISS");
      return originalJson(body);
    };

    next();
  };
}

/** Invalidate all cached entries (call after mutations) */
export function invalidateApiCache(): void {
  cache.clear();
}

/** Invalidate entries matching a prefix */
export function invalidateApiCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
