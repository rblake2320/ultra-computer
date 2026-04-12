/**
 * Cost Controller — Budget Caps, Per-Step Limits, Auto-Fallback
 * 
 * Capabilities:
 * 1. Budget caps — hard limits per conversation, per hour, per day
 * 2. Per-step token limits — prevent any single step from consuming too much
 * 3. Auto-fallback — switch to cheaper model when budget is running low
 * 4. Cost tracking — real-time usage tracking with breakdown by model
 * 5. Alerts — warn when approaching budget limits
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CostConfig {
  enabled: boolean;
  // Budget caps
  maxTokensPerConversation: number;   // max tokens in a single conversation
  maxTokensPerHour: number;           // max tokens per hour across all conversations
  maxTokensPerDay: number;            // max tokens per day
  maxTokensPerStep: number;           // max tokens for a single agent step
  // Cost thresholds
  warningThresholdPercent: number;    // warn at N% of budget (e.g., 80)
  fallbackThresholdPercent: number;   // auto-fallback to cheaper model at N% (e.g., 90)
  // Fallback config
  fallbackModelTier: "fast" | "medium";  // which tier to fall back to
  blockOnExhausted: boolean;          // hard block when budget exhausted vs best-effort
}

export interface CostEntry {
  conversationId: string;
  modelId: string;
  operation: string;     // "chat" | "tool" | "synthesis" | "validation"
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: number;
}

export interface BudgetStatus {
  conversationTokens: Record<string, number>;
  hourlyTokens: number;
  dailyTokens: number;
  hourlyBudgetRemaining: number;
  dailyBudgetRemaining: number;
  alerts: CostAlert[];
  shouldFallback: boolean;
  isBlocked: boolean;
}

export interface CostAlert {
  level: "warning" | "critical" | "blocked";
  scope: "conversation" | "hourly" | "daily" | "step";
  message: string;
  timestamp: number;
}

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CostConfig = {
  enabled: true,
  maxTokensPerConversation: 500_000,   // ~500K tokens per conversation
  maxTokensPerHour: 1_000_000,         // ~1M tokens per hour
  maxTokensPerDay: 10_000_000,         // ~10M tokens per day
  maxTokensPerStep: 50_000,            // ~50K tokens per step
  warningThresholdPercent: 80,
  fallbackThresholdPercent: 90,
  fallbackModelTier: "fast",
  blockOnExhausted: false,
};

let config: CostConfig = { ...DEFAULT_CONFIG };

// ─── Tracking ─────────────────────────────────────────────────────────────────

const entries: CostEntry[] = [];
const conversationTotals = new Map<string, number>();
const alerts: CostAlert[] = [];

// ─── Core Functions ───────────────────────────────────────────────────────────

export function recordTokenUsage(entry: CostEntry): { allowed: boolean; alert?: CostAlert } {
  if (!config.enabled) return { allowed: true };

  entries.push(entry);
  if (entries.length > 10_000) entries.splice(0, 2_000);

  // Update conversation total
  const convTotal = (conversationTotals.get(entry.conversationId) || 0) + entry.totalTokens;
  conversationTotals.set(entry.conversationId, convTotal);

  // Check per-step limit
  if (entry.totalTokens > config.maxTokensPerStep) {
    const alert: CostAlert = {
      level: "warning",
      scope: "step",
      message: `Single step used ${entry.totalTokens} tokens (limit: ${config.maxTokensPerStep})`,
      timestamp: Date.now(),
    };
    alerts.push(alert);
    return { allowed: true, alert }; // warn but allow
  }

  // Check conversation budget
  if (convTotal > config.maxTokensPerConversation) {
    const alert: CostAlert = {
      level: config.blockOnExhausted ? "blocked" : "critical",
      scope: "conversation",
      message: `Conversation budget exhausted: ${convTotal}/${config.maxTokensPerConversation} tokens`,
      timestamp: Date.now(),
    };
    alerts.push(alert);
    return { allowed: !config.blockOnExhausted, alert };
  }

  // Check hourly budget
  const hourlyUsage = getHourlyUsage();
  if (hourlyUsage > config.maxTokensPerHour) {
    const alert: CostAlert = {
      level: config.blockOnExhausted ? "blocked" : "critical",
      scope: "hourly",
      message: `Hourly budget exhausted: ${hourlyUsage}/${config.maxTokensPerHour} tokens`,
      timestamp: Date.now(),
    };
    alerts.push(alert);
    return { allowed: !config.blockOnExhausted, alert };
  }

  // Check daily budget
  const dailyUsage = getDailyUsage();
  if (dailyUsage > config.maxTokensPerDay) {
    const alert: CostAlert = {
      level: config.blockOnExhausted ? "blocked" : "critical",
      scope: "daily",
      message: `Daily budget exhausted: ${dailyUsage}/${config.maxTokensPerDay} tokens`,
      timestamp: Date.now(),
    };
    alerts.push(alert);
    return { allowed: !config.blockOnExhausted, alert };
  }

  // Warning threshold checks
  const hourlyPercent = (hourlyUsage / config.maxTokensPerHour) * 100;
  const dailyPercent = (dailyUsage / config.maxTokensPerDay) * 100;

  if (hourlyPercent >= config.warningThresholdPercent && hourlyPercent < config.fallbackThresholdPercent) {
    const alert: CostAlert = {
      level: "warning",
      scope: "hourly",
      message: `Hourly budget at ${Math.round(hourlyPercent)}%`,
      timestamp: Date.now(),
    };
    alerts.push(alert);
  }

  if (dailyPercent >= config.warningThresholdPercent && dailyPercent < config.fallbackThresholdPercent) {
    const alert: CostAlert = {
      level: "warning",
      scope: "daily",
      message: `Daily budget at ${Math.round(dailyPercent)}%`,
      timestamp: Date.now(),
    };
    alerts.push(alert);
  }

  return { allowed: true };
}

export function checkBudgetBeforeStep(conversationId: string, estimatedTokens: number): {
  allowed: boolean;
  shouldFallback: boolean;
  reason?: string;
} {
  if (!config.enabled) return { allowed: true, shouldFallback: false };

  const convTotal = conversationTotals.get(conversationId) || 0;
  const hourlyUsage = getHourlyUsage();
  const dailyUsage = getDailyUsage();

  // Hard block
  if (config.blockOnExhausted) {
    if (convTotal + estimatedTokens > config.maxTokensPerConversation) {
      return { allowed: false, shouldFallback: false, reason: "Conversation budget exhausted" };
    }
    if (hourlyUsage + estimatedTokens > config.maxTokensPerHour) {
      return { allowed: false, shouldFallback: false, reason: "Hourly budget exhausted" };
    }
    if (dailyUsage + estimatedTokens > config.maxTokensPerDay) {
      return { allowed: false, shouldFallback: false, reason: "Daily budget exhausted" };
    }
  }

  // Fallback threshold
  const hourlyPercent = ((hourlyUsage + estimatedTokens) / config.maxTokensPerHour) * 100;
  const dailyPercent = ((dailyUsage + estimatedTokens) / config.maxTokensPerDay) * 100;
  const convPercent = ((convTotal + estimatedTokens) / config.maxTokensPerConversation) * 100;

  const shouldFallback = Math.max(hourlyPercent, dailyPercent, convPercent) >= config.fallbackThresholdPercent;

  return { allowed: true, shouldFallback };
}

// ─── Usage Queries ────────────────────────────────────────────────────────────

function getHourlyUsage(): number {
  const oneHourAgo = Date.now() - 3_600_000;
  return entries
    .filter(e => e.timestamp >= oneHourAgo)
    .reduce((sum, e) => sum + e.totalTokens, 0);
}

function getDailyUsage(): number {
  const oneDayAgo = Date.now() - 86_400_000;
  return entries
    .filter(e => e.timestamp >= oneDayAgo)
    .reduce((sum, e) => sum + e.totalTokens, 0);
}

export function getBudgetStatus(): BudgetStatus {
  const hourlyUsage = getHourlyUsage();
  const dailyUsage = getDailyUsage();

  const hourlyPercent = (hourlyUsage / config.maxTokensPerHour) * 100;
  const dailyPercent = (dailyUsage / config.maxTokensPerDay) * 100;
  const shouldFallback = Math.max(hourlyPercent, dailyPercent) >= config.fallbackThresholdPercent;
  const isBlocked = config.blockOnExhausted && (hourlyUsage >= config.maxTokensPerHour || dailyUsage >= config.maxTokensPerDay);

  const convTokens: Record<string, number> = {};
  for (const [id, total] of conversationTotals) {
    convTokens[id] = total;
  }

  return {
    conversationTokens: convTokens,
    hourlyTokens: hourlyUsage,
    dailyTokens: dailyUsage,
    hourlyBudgetRemaining: Math.max(0, config.maxTokensPerHour - hourlyUsage),
    dailyBudgetRemaining: Math.max(0, config.maxTokensPerDay - dailyUsage),
    alerts: alerts.slice(-20),
    shouldFallback,
    isBlocked,
  };
}

export function getCostBreakdown(timeRangeMs?: number): {
  byModel: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; calls: number }>;
  byOperation: Record<string, { totalTokens: number; calls: number }>;
  byConversation: Record<string, { totalTokens: number; calls: number }>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCalls: number;
  timeRangeMs: number;
} {
  const range = timeRangeMs || 86_400_000; // default: 24h
  const cutoff = Date.now() - range;
  const filtered = entries.filter(e => e.timestamp >= cutoff);

  const byModel: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; calls: number }> = {};
  const byOperation: Record<string, { totalTokens: number; calls: number }> = {};
  const byConversation: Record<string, { totalTokens: number; calls: number }> = {};

  let totalInput = 0, totalOutput = 0, totalTokens = 0;

  for (const e of filtered) {
    // By model
    if (!byModel[e.modelId]) byModel[e.modelId] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };
    byModel[e.modelId].inputTokens += e.inputTokens;
    byModel[e.modelId].outputTokens += e.outputTokens;
    byModel[e.modelId].totalTokens += e.totalTokens;
    byModel[e.modelId].calls++;

    // By operation
    if (!byOperation[e.operation]) byOperation[e.operation] = { totalTokens: 0, calls: 0 };
    byOperation[e.operation].totalTokens += e.totalTokens;
    byOperation[e.operation].calls++;

    // By conversation
    if (!byConversation[e.conversationId]) byConversation[e.conversationId] = { totalTokens: 0, calls: 0 };
    byConversation[e.conversationId].totalTokens += e.totalTokens;
    byConversation[e.conversationId].calls++;

    totalInput += e.inputTokens;
    totalOutput += e.outputTokens;
    totalTokens += e.totalTokens;
  }

  return {
    byModel,
    byOperation,
    byConversation,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens,
    totalCalls: filtered.length,
    timeRangeMs: range,
  };
}

// ─── Config Management ────────────────────────────────────────────────────────

export function getCostConfig(): CostConfig {
  return { ...config };
}

export function updateCostConfig(update: Partial<CostConfig>): CostConfig {
  config = { ...config, ...update };
  return { ...config };
}

export function resetCostTracking(): void {
  entries.length = 0;
  conversationTotals.clear();
  alerts.length = 0;
}
