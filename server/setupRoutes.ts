/**
 * Setup Wizard — Express API Routes
 *
 * GET  /api/setup/status          — First-run flag + cached environment
 * GET  /api/setup/detect          — Full environment detection (slow, ~5 s)
 * POST /api/setup/configure       — Persist recommended or custom settings
 * POST /api/setup/complete        — Mark wizard as done
 * POST /api/setup/test-connection — Test a specific service
 */

import type { Express, Request, Response } from "express";
import { routesLogger } from "./logger.js";
import net from "net";
import { execSync } from "child_process";
import {
  isFirstRun,
  detectEnvironment,
  markSetupComplete,
  getRecommendedSettings,
  applySettings,
  type EnvironmentInfo,
  type RecommendedSettings,
} from "./setupWizard.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json(data);
}

function err(res: Response, message: string, status = 500) {
  res.status(status).json({ error: message });
}

// One-shot cache so repeated GET /status calls don't re-probe
let cachedEnv: EnvironmentInfo | null = null;

// ─── Test a specific service ──────────────────────────────────────────────────

interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
  version?: string;
}

async function testRedis(host: string, port: number): Promise<TestResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.once("connect", () => {
      socket.destroy();
      resolve({ success: true, latencyMs: Date.now() - start });
    });
    socket.once("error", (e) => resolve({ success: false, error: e.message }));
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ success: false, error: "Connection timed out" });
    });
    try { socket.connect(port, host); } catch (e: any) {
      resolve({ success: false, error: e.message });
    }
  });
}

function testDocker(): TestResult {
  try {
    const start = Date.now();
    const version = execSync("docker info --format '{{.ServerVersion}}'", {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return { success: true, latencyMs: Date.now() - start, version };
  } catch (e: any) {
    return { success: false, error: e.message || "Docker not available" };
  }
}

async function testModelAPI(url: string, apiKey?: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(`${url}/models`, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { success: true, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Route registration ────────────────────────────────────────────────────────

export function registerSetupRoutes(app: Express): void {

  // ── GET /api/setup/status ──────────────────────────────────────────────────
  app.get("/api/setup/status", async (_req: Request, res: Response) => {
    try {
      const firstRun = isFirstRun();

      // Reuse cached environment if available; run basic detect otherwise
      if (!cachedEnv) {
        cachedEnv = await detectEnvironment();
      }

      ok(res, { firstRun, environment: cachedEnv });
    } catch (e: any) {
      routesLogger.error({ err: e }, "/status error");
      err(res, e.message || "Failed to check setup status");
    }
  });

  // ── GET /api/setup/detect ──────────────────────────────────────────────────
  // Runs a fresh full probe — may take several seconds.
  app.get("/api/setup/detect", async (_req: Request, res: Response) => {
    try {
      const environment = await detectEnvironment();
      cachedEnv = environment;                              // update cache
      const recommended = getRecommendedSettings(environment);
      ok(res, { environment, recommended });
    } catch (e: any) {
      routesLogger.error({ err: e }, "/detect error");
      err(res, e.message || "Environment detection failed");
    }
  });

  // ── POST /api/setup/configure ──────────────────────────────────────────────
  // Accepts a full RecommendedSettings payload (or subset) and persists it.
  app.post("/api/setup/configure", (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<RecommendedSettings>;

      // Determine base settings from current environment
      const env = cachedEnv;
      if (!env) {
        return err(res, "Run /api/setup/detect first", 400);
      }

      const base = getRecommendedSettings(env);
      const merged: RecommendedSettings = {
        concurrentAgents: body.concurrentAgents  ?? base.concurrentAgents,
        enableRedis:       body.enableRedis       ?? base.enableRedis,
        enableSandbox:     body.enableSandbox     ?? base.enableSandbox,
        sandboxPreset:     body.sandboxPreset     ?? base.sandboxPreset,
        cacheStrategy:     body.cacheStrategy     ?? base.cacheStrategy,
        suggestedModels:   body.suggestedModels   ?? base.suggestedModels,
      };

      applySettings(merged);
      ok(res, { applied: merged });
    } catch (e: any) {
      routesLogger.error({ err: e }, "/configure error");
      err(res, e.message || "Failed to apply settings");
    }
  });

  // ── POST /api/setup/complete ───────────────────────────────────────────────
  app.post("/api/setup/complete", (_req: Request, res: Response) => {
    try {
      markSetupComplete();
      ok(res, { success: true, completedAt: new Date().toISOString() });
    } catch (e: any) {
      routesLogger.error({ err: e }, "/complete error");
      err(res, e.message || "Failed to mark setup complete");
    }
  });

  // ── POST /api/setup/test-connection ──────────────────────────────────────
  // Body: { service: "redis" | "docker" | "model", host?, port?, url?, apiKey? }
  app.post("/api/setup/test-connection", async (req: Request, res: Response) => {
    try {
      const { service, host, port, url, apiKey } = req.body as {
        service: string;
        host?: string;
        port?: number;
        url?: string;
        apiKey?: string;
      };

      let result: TestResult;

      switch (service) {
        case "redis": {
          const h = host || process.env.REDIS_HOST || "127.0.0.1";
          const p = port || parseInt(process.env.REDIS_PORT || "6379", 10);
          result = await testRedis(h, p);
          break;
        }

        case "docker":
          result = testDocker();
          break;

        case "model": {
          if (!url) return err(res, "url is required for model API test", 400);
          result = await testModelAPI(url, apiKey);
          break;
        }

        default:
          return err(res, `Unknown service: ${service}`, 400);
      }

      ok(res, result);
    } catch (e: any) {
      routesLogger.error({ err: e }, "/test-connection error");
      err(res, e.message || "Connection test failed");
    }
  });
}
