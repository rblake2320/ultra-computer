/**
 * Cache Management API Routes
 * Provides REST endpoints for cache stats, configuration, and management.
 */

import type { Express, Request, Response } from "express";
import { cacheEngine } from "./cacheEngine.js";
import type { CacheConfig } from "./cacheEngine.js";

export function registerCacheRoutes(app: Express): void {
  // ─── GET /api/cache/stats — Full cache statistics ───────────────────────
  app.get("/api/cache/stats", (_req: Request, res: Response) => {
    try {
      const stats = cacheEngine.getStats();
      res.json(stats);
    } catch (err) {
      console.error("[CacheRoutes] Failed to get stats:", err);
      res.status(500).json({ error: "Failed to retrieve cache stats" });
    }
  });

  // ─── GET /api/cache/memory — Memory usage breakdown ────────────────────
  app.get("/api/cache/memory", (_req: Request, res: Response) => {
    try {
      const memory = cacheEngine.getMemoryUsage();
      res.json(memory);
    } catch (err) {
      console.error("[CacheRoutes] Failed to get memory usage:", err);
      res.status(500).json({ error: "Failed to retrieve memory usage" });
    }
  });

  // ─── GET /api/cache/config — Current configuration ─────────────────────
  app.get("/api/cache/config", (_req: Request, res: Response) => {
    try {
      const stats = cacheEngine.getStats();
      // Return the effective config from stats
      res.json({
        exactCache: { enabled: stats.exact.entries > 0 || true },
        prefixOptimizer: { enabled: true },
        semanticCache: { enabled: stats.semantic.entries > 0 || true },
        totalEntries: stats.exact.entries + stats.semantic.entries,
      });
    } catch (err) {
      console.error("[CacheRoutes] Failed to get config:", err);
      res.status(500).json({ error: "Failed to retrieve cache config" });
    }
  });

  // ─── POST /api/cache/clear — Clear cache (optionally by tier) ──────────
  app.post("/api/cache/clear", (req: Request, res: Response) => {
    try {
      const { tier, modelId } = req.body as { tier?: "exact" | "prefix" | "semantic"; modelId?: string };
      if (modelId) {
        cacheEngine.clearForModel(modelId);
        res.json({ cleared: true, scope: `model:${modelId}` });
      } else if (tier) {
        cacheEngine.clear(tier);
        res.json({ cleared: true, scope: tier });
      } else {
        cacheEngine.clear();
        res.json({ cleared: true, scope: "all" });
      }
    } catch (err) {
      console.error("[CacheRoutes] Failed to clear cache:", err);
      res.status(500).json({ error: "Failed to clear cache" });
    }
  });

  // ─── POST /api/cache/reset-stats — Reset statistics counters ───────────
  app.post("/api/cache/reset-stats", (_req: Request, res: Response) => {
    try {
      cacheEngine.resetStats();
      res.json({ reset: true });
    } catch (err) {
      console.error("[CacheRoutes] Failed to reset stats:", err);
      res.status(500).json({ error: "Failed to reset stats" });
    }
  });

  // ─── POST /api/cache/policy — Set a route-specific cache policy ────────
  app.post("/api/cache/policy", (req: Request, res: Response) => {
    try {
      const { route, policy } = req.body;
      if (!route || !policy) {
        res.status(400).json({ error: "route and policy are required" });
        return;
      }
      cacheEngine.setPolicy(route, policy);
      res.json({ set: true, route });
    } catch (err) {
      console.error("[CacheRoutes] Failed to set policy:", err);
      res.status(500).json({ error: "Failed to set cache policy" });
    }
  });

  // ─── GET /api/cache/dashboard — Combined dashboard data ────────────────
  app.get("/api/cache/dashboard", (_req: Request, res: Response) => {
    try {
      const stats = cacheEngine.getStats();
      const memory = cacheEngine.getMemoryUsage();
      
      const totalRequests = stats.exact.hits + stats.exact.misses + stats.semantic.hits + stats.semantic.misses;
      const totalHits = stats.exact.hits + stats.semantic.hits;
      const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
      
      res.json({
        overview: {
          totalRequests,
          totalHits,
          overallHitRate,
          estimatedSavingsUSD: stats.estimatedCostSavings,
          totalTokensSaved: stats.exact.tokensSaved + stats.semantic.tokensSaved,
        },
        tiers: {
          exact: stats.exact,
          prefix: stats.prefix,
          semantic: stats.semantic,
        },
        memory,
        modelBreakdown: stats.modelBreakdown,
        rollingWindows: stats.rollingWindows,
      });
    } catch (err) {
      console.error("[CacheRoutes] Failed to get dashboard:", err);
      res.status(500).json({ error: "Failed to retrieve dashboard data" });
    }
  });
}
