/**
 * Cache Management API Routes
 * Provides REST endpoints for cache stats, configuration, and management.
 */

import type { Express, Request, Response } from "express";
import { cacheLogger } from "./logger.js";
import { cacheEngine } from "./cacheEngine.js";
import type { CacheConfig } from "./cacheEngine.js";

export function registerCacheRoutes(app: Express): void {
  // ─── GET /api/cache/stats — Full cache statistics ───────────────────────
  app.get("/api/cache/stats", (_req: Request, res: Response) => {
    try {
      const stats = cacheEngine.getStats();
      res.json(stats);
    } catch (err) {
      cacheLogger.error({ err }, "Failed to get stats");
      res.status(500).json({ error: "Failed to retrieve cache stats" });
    }
  });

  // ─── GET /api/cache/memory — Memory usage breakdown ────────────────────
  app.get("/api/cache/memory", (_req: Request, res: Response) => {
    try {
      const memory = cacheEngine.getMemoryUsage();
      res.json(memory);
    } catch (err) {
      cacheLogger.error({ err }, "Failed to get memory usage");
      res.status(500).json({ error: "Failed to retrieve memory usage" });
    }
  });

  // ─── GET /api/cache/config — Current configuration ─────────────────────
  app.get("/api/cache/config", (_req: Request, res: Response) => {
    try {
      const stats = cacheEngine.getStats();
      // Return the effective config from stats
      res.json({
        exactCache: { enabled: stats.exact.entries > 0 },
        prefixOptimizer: { enabled: stats.prefix.entries > 0 },
        semanticCache: { enabled: stats.semantic.entries > 0 },
        totalEntries: stats.exact.entries + stats.semantic.entries,
      });
    } catch (err) {
      cacheLogger.error({ err }, "Failed to get config");
      res.status(500).json({ error: "Failed to retrieve cache config" });
    }
  });

  // ─── POST /api/cache/clear — Clear cache (optionally by tier) ──────────
  app.post("/api/cache/clear", (req: Request, res: Response) => {
    try {
      const { tier, modelId } = req.body as { tier?: string; modelId?: string };
      // Validate tier against allowed values
      const ALLOWED_TIERS = ["exact", "prefix", "semantic"] as const;
      if (tier !== undefined && !ALLOWED_TIERS.includes(tier as typeof ALLOWED_TIERS[number])) {
        return res.status(400).json({ error: `tier must be one of: ${ALLOWED_TIERS.join(", ")}` });
      }
      if (modelId) {
        cacheEngine.clearForModel(modelId);
        res.json({ cleared: true, scope: `model:${modelId}` });
      } else if (tier) {
        cacheEngine.clear(tier as "exact" | "prefix" | "semantic");
        res.json({ cleared: true, scope: tier });
      } else {
        cacheEngine.clear();
        res.json({ cleared: true, scope: "all" });
      }
    } catch (err) {
      cacheLogger.error({ err }, "Failed to clear cache");
      res.status(500).json({ error: "Failed to clear cache" });
    }
  });

  // ─── POST /api/cache/reset-stats — Reset statistics counters ───────────
  app.post("/api/cache/reset-stats", (_req: Request, res: Response) => {
    try {
      cacheEngine.resetStats();
      res.json({ reset: true });
    } catch (err) {
      cacheLogger.error({ err }, "Failed to reset stats");
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
      cacheLogger.error({ err }, "Failed to set policy");
      res.status(500).json({ error: "Failed to set cache policy" });
    }
  });

  // ─── GET /api/cache/dashboard — Combined dashboard data ────────────────
  app.get("/api/cache/dashboard", (_req: Request, res: Response) => {
    try {
      const stats = cacheEngine.getStats();
      const memory = cacheEngine.getMemoryUsage();
      
      // Use totalHits and overallHitRate directly from stats (correctly computed)
      const totalRequests = stats.totalHits + stats.totalMisses;


      
      res.json({
        overview: {
          totalRequests,
          totalHits: stats.totalHits,
          overallHitRate: stats.overallHitRate,
          estimatedSavingsUSD: stats.estimatedCostSavings,
          totalTokensSaved: (stats.exact.estimatedBytesSaved || 0) + (stats.semantic.estimatedBytesSaved || 0),
        },
        tiers: {
          exact: stats.exact,
          prefix: stats.prefix,
          semantic: stats.semantic,
        },
        memory,
        modelBreakdown: stats.perModel ?? {},
        rollingWindows: stats.rollingWindow ?? {},
      });
    } catch (err) {
      cacheLogger.error({ err }, "Failed to get dashboard");
      res.status(500).json({ error: "Failed to retrieve dashboard data" });
    }
  });
}
