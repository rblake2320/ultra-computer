/**
 * promptCacheSharing.ts
 *
 * Prompt cache sharing system for Ultra Computer's swarm workers.
 * Inspired by Claude Code's forkedAgent pattern, this module ensures
 * that sub-agents (swarm workers, orchestrator tasks) share the same
 * system prompt prefix and context as the parent agent, enabling
 * provider-side prompt caching to reduce input token costs by up to 90%.
 *
 * @module promptCacheSharing
 */

import type { ChatMessage } from "./modelRouter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parameters that must be identical between a parent and forked agent
 * to guarantee prompt cache hits on the provider side.
 *
 * The API cache key is typically composed of:
 *   system prompt + tools + model + messages (prefix) + thinking config
 */
export interface CacheSafeParams {
  /** System prompt — must match parent for cache hits. */
  systemPrompt: string;
  /** Model ID — must match parent. */
  modelId: string;
  /** Tool definitions — must match parent (serialized for comparison). */
  toolDefinitions: string;
  /** Context messages from the parent conversation (prefix). */
  contextMessages: ChatMessage[];
  /** Thinking/reasoning config (if applicable). */
  thinkingConfig?: { type: "enabled" | "disabled"; budgetTokens?: number };
}

/** Usage metrics tracked per forked agent run. */
export interface ForkedAgentUsage {
  /** Unique ID for this fork. */
  forkId: string;
  /** Parent conversation or swarm session ID. */
  parentId: string;
  /** Total input tokens consumed. */
  inputTokens: number;
  /** Input tokens served from cache. */
  cacheReadTokens: number;
  /** Input tokens that created new cache entries. */
  cacheCreationTokens: number;
  /** Total output tokens. */
  outputTokens: number;
  /** Estimated cost savings from cache hits ($). */
  estimatedSavings: number;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Source identifier (e.g., "swarm_worker", "orchestrator_task"). */
  querySource: string;
}

/** Configuration for a forked agent run. */
export interface ForkedAgentConfig {
  /** The parent's cache-safe params to inherit. */
  parentParams: CacheSafeParams;
  /** Additional task-specific prompt appended after the shared prefix. */
  taskPrompt: string;
  /** Maximum output tokens for this fork. */
  maxOutputTokens?: number;
  /** Source identifier for metrics. */
  querySource: string;
  /** Abort signal to cancel the fork. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Cache-Safe Params Store
// ---------------------------------------------------------------------------

/**
 * Thread-local-like storage for the most recent cache-safe params
 * from the main conversation loop. Swarm workers and background tasks
 * read from this to share the parent's prompt cache.
 */
let lastCacheSafeParams: CacheSafeParams | null = null;
const cacheSafeParamsHistory: Array<{ params: CacheSafeParams; timestamp: number }> = [];
const MAX_HISTORY = 10;

/**
 * Save the current conversation's cache-safe params.
 * Called after each main-loop turn completes.
 */
export function saveCacheSafeParams(params: CacheSafeParams): void {
  lastCacheSafeParams = params;
  cacheSafeParamsHistory.push({ params, timestamp: Date.now() });
  if (cacheSafeParamsHistory.length > MAX_HISTORY) {
    cacheSafeParamsHistory.shift();
  }
}

/**
 * Retrieve the most recent cache-safe params.
 * Returns null if no params have been saved yet.
 */
export function getLastCacheSafeParams(): CacheSafeParams | null {
  return lastCacheSafeParams;
}

/**
 * Clear saved params (e.g., on session end).
 */
export function clearCacheSafeParams(): void {
  lastCacheSafeParams = null;
  cacheSafeParamsHistory.length = 0;
}

// ---------------------------------------------------------------------------
// Usage Tracking
// ---------------------------------------------------------------------------

const usageLog: ForkedAgentUsage[] = [];
const MAX_USAGE_LOG = 500;

/** Record usage from a forked agent run. */
export function recordForkedAgentUsage(usage: ForkedAgentUsage): void {
  usageLog.push(usage);
  if (usageLog.length > MAX_USAGE_LOG) {
    usageLog.shift();
  }
}

/** Get aggregated usage statistics. */
export function getForkedAgentStats(): {
  totalForks: number;
  totalInputTokens: number;
  totalCacheReadTokens: number;
  totalOutputTokens: number;
  totalEstimatedSavings: number;
  cacheHitRate: number;
  averageDurationMs: number;
} {
  if (usageLog.length === 0) {
    return {
      totalForks: 0,
      totalInputTokens: 0,
      totalCacheReadTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedSavings: 0,
      cacheHitRate: 0,
      averageDurationMs: 0,
    };
  }

  const totals = usageLog.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      savings: acc.savings + u.estimatedSavings,
      duration: acc.duration + u.durationMs,
    }),
    { inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, savings: 0, duration: 0 }
  );

  return {
    totalForks: usageLog.length,
    totalInputTokens: totals.inputTokens,
    totalCacheReadTokens: totals.cacheReadTokens,
    totalOutputTokens: totals.outputTokens,
    totalEstimatedSavings: totals.savings,
    cacheHitRate: totals.inputTokens > 0 ? totals.cacheReadTokens / totals.inputTokens : 0,
    averageDurationMs: totals.duration / usageLog.length,
  };
}

// ---------------------------------------------------------------------------
// Forked Agent Message Builder
// ---------------------------------------------------------------------------

/**
 * Build the message array for a forked agent that shares the parent's
 * prompt cache. The parent's context messages are prepended as-is,
 * followed by the fork's task-specific prompt.
 *
 * @param config  Forked agent configuration.
 * @returns       Messages array ready to send to the model router.
 */
export function buildForkedAgentMessages(config: ForkedAgentConfig): {
  systemPrompt: string;
  messages: ChatMessage[];
  modelId: string;
} {
  const { parentParams, taskPrompt } = config;

  // Start with the parent's context messages (cache-shared prefix)
  const messages: ChatMessage[] = [
    ...parentParams.contextMessages,
    // Append the fork's task as a new user message
    {
      role: "user" as const,
      content: taskPrompt,
    },
  ];

  return {
    systemPrompt: parentParams.systemPrompt,
    messages,
    modelId: parentParams.modelId,
  };
}

/**
 * Estimate cost savings from a cache hit.
 *
 * Pricing model (approximate, varies by provider):
 *   - Normal input:  $3.00 / 1M tokens
 *   - Cached input:  $0.30 / 1M tokens (90% discount)
 *   - Cache creation: $3.75 / 1M tokens (25% premium)
 *
 * @param inputTokens       Total input tokens.
 * @param cacheReadTokens   Tokens served from cache.
 * @param cacheCreationTokens  Tokens that created new cache entries.
 * @returns Estimated savings in dollars.
 */
export function estimateCacheSavings(
  inputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number = 0
): number {
  const normalCostPer1M = 3.0;
  const cachedCostPer1M = 0.3;
  const creationCostPer1M = 3.75;

  const normalCost = (inputTokens / 1_000_000) * normalCostPer1M;
  const actualCost =
    ((inputTokens - cacheReadTokens - cacheCreationTokens) / 1_000_000) * normalCostPer1M +
    (cacheReadTokens / 1_000_000) * cachedCostPer1M +
    (cacheCreationTokens / 1_000_000) * creationCostPer1M;

  return Math.max(0, normalCost - actualCost);
}
