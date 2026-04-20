/**
 * Error Recovery — Retry + Model Fallback
 *
 * Wraps LLM calls with intelligent retry logic and graceful model fallback.
 * Uses exponential backoff, error classification, and same-tier preference
 * when falling back to an alternative model.
 */

import { storage } from "./storage.js";
import logger from "./logger.js";
const recoveryLogger = logger.child({ module: "errorRecovery" });
import type { Model } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts before giving up or falling back. */
  maxRetries: number;
  /** Initial backoff delay in milliseconds. */
  backoffMs: number;
  /** Multiplier applied to backoffMs after each failed attempt. */
  backoffMultiplier: number;
  /** Whether to try a fallback model when all retries on the primary fail. */
  fallbackToNextModel: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  fallbackToNextModel: true,
};

export type ErrorClass =
  | "transient"
  | "auth"
  | "rate_limit"
  | "model_error"
  | "unknown";

// ─── Error Classification ─────────────────────────────────────────────────────

/**
 * Classifies an error into one of five categories so retry / fallback
 * decisions can be made without inspecting raw error messages at the call site.
 */
export function classifyError(error: Error): ErrorClass {
  const msg = (error.message ?? "").toLowerCase();
  const stack = (error.stack ?? "").toLowerCase();
  const combined = `${msg} ${stack}`;

  // Auth errors — do not retry, fallback immediately.
  if (
    combined.includes("401") ||
    combined.includes("403") ||
    combined.includes("unauthorized") ||
    combined.includes("invalid api key") ||
    combined.includes("authentication") ||
    combined.includes("forbidden")
  ) {
    return "auth";
  }

  // Rate-limit errors — wait longer before retry.
  if (
    combined.includes("429") ||
    combined.includes("rate limit") ||
    combined.includes("rate_limit") ||
    combined.includes("quota") ||
    combined.includes("too many requests")
  ) {
    return "rate_limit";
  }

  // Model-specific errors — the model itself is the problem; fallback immediately.
  if (
    combined.includes("model not found") ||
    combined.includes("does not exist") ||
    combined.includes("model_not_found") ||
    combined.includes("no such model") ||
    combined.includes("invalid model") ||
    combined.includes("model is currently overloaded") ||
    combined.includes("decommissioned")
  ) {
    return "model_error";
  }

  // Transient network/infra errors — safe to retry.
  if (
    combined.includes("timeout") ||
    combined.includes("timed out") ||
    combined.includes("econnreset") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("network") ||
    combined.includes("socket") ||
    combined.includes("epipe") ||
    combined.includes("503") ||
    combined.includes("502") ||
    combined.includes("504")
  ) {
    return "transient";
  }

  return "unknown";
}

// ─── Fallback Model Selection ─────────────────────────────────────────────────

/**
 * Returns the best available fallback model when `failedModelId` is unusable.
 *
 * Strategy:
 * 1. Determine the speed tier of the failed model.
 * 2. Prefer another enabled model in the same tier.
 * 3. If none available, return any other enabled model.
 * 4. Return null if no alternative exists.
 */
export function getFallbackModel(failedModelId: string): string | null {
  let allModels: Model[];
  try {
    allModels = storage.getModels();
  } catch (err: any) {
    recoveryLogger.error({ err }, "getFallbackModel: could not read models from storage");
    return null;
  }

  const enabledModels = allModels.filter(
    (m) => m.enabled && m.id !== failedModelId
  );

  if (enabledModels.length === 0) {
    return null;
  }

  // Find the speed tier of the failed model (may not be in storage if already deleted).
  const failedModel = allModels.find((m) => m.id === failedModelId);
  const targetTier = failedModel?.speedTier ?? "medium";

  // Prefer same tier.
  const sameTier = enabledModels.filter((m) => m.speedTier === targetTier);
  if (sameTier.length > 0) {
    return sameTier[0].id;
  }

  // Fall back to any available model.
  return enabledModels[0].id;
}

// ─── Retry + Fallback Wrapper ─────────────────────────────────────────────────

/**
 * Executes `fn(modelId)` with retry and optional model-fallback logic.
 *
 * Returns the successful result along with metadata about how many attempts
 * were needed and whether a fallback model was used.
 *
 * Throws the last error if all strategies are exhausted.
 */
export async function withRetryAndFallback<T>(
  fn: (modelId: string) => Promise<T>,
  modelId: string,
  config?: Partial<RetryConfig>
): Promise<{ result: T; usedModelId: string; attempts: number; fellBack: boolean }> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  let attempts = 0;
  let lastError: Error = new Error("No attempts made");
  let currentDelay = cfg.backoffMs;

  // ── Phase 1: Retry loop on primary model ─────────────────────────────────
  for (let i = 0; i < cfg.maxRetries; i++) {
    attempts++;

    try {
      const result = await fn(modelId);
      return { result, usedModelId: modelId, attempts, fellBack: false };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errClass = classifyError(lastError);

      recoveryLogger.warn({ modelId, attempt: attempts, errClass, message: lastError.message }, "Attempt failed");

      // Auth and model errors won't resolve with retries — skip straight to fallback.
      if (errClass === "auth" || errClass === "model_error") {
        recoveryLogger.warn({ errClass }, "Non-retryable error class — skipping remaining retries on primary model");
        break;
      }

      // Rate-limit: wait 3× longer.
      const baseWaitMs =
        errClass === "rate_limit" ? currentDelay * 3 : currentDelay;
      // Add jitter: multiply by a random factor in [0.75, 1.25]
      const waitMs = Math.round(baseWaitMs * (0.75 + Math.random() * 0.5));

      // Don't sleep after the last iteration.
      if (i < cfg.maxRetries - 1) {
        await sleep(waitMs);
      }

      currentDelay = Math.round(currentDelay * cfg.backoffMultiplier);
    }
  }

  // ── Phase 2: Fallback to another model ───────────────────────────────────
  if (cfg.fallbackToNextModel) {
    const fallbackModelId = getFallbackModel(modelId);

    if (fallbackModelId) {
      recoveryLogger.info({ from: modelId, to: fallbackModelId }, "Falling back to another model");
      attempts++;

      try {
        const result = await fn(fallbackModelId);
        recoveryLogger.info({ modelId: fallbackModelId, attempts }, "Fallback succeeded");
        return {
          result,
          usedModelId: fallbackModelId,
          attempts,
          fellBack: true,
        };
      } catch (err: any) {
        const fallbackErr = err instanceof Error ? err : new Error(String(err));
        recoveryLogger.error({ err: fallbackErr, modelId: fallbackModelId }, "Fallback model also failed");
        lastError = fallbackErr;
      }
    } else {
      recoveryLogger.warn("No fallback model available — all models exhausted");
    }
  }

  // Everything failed — surface the last error.
  throw lastError;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
