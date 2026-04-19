/**
 * tokenBudget.ts
 *
 * Token budgeting and diminishing returns tracker for Ultra Computer.
 * Inspired by Claude Code's token budget system, this module tracks
 * token consumption per conversation, per agent, and per swarm session,
 * detecting when additional turns yield diminishing returns and
 * recommending early termination to save costs.
 *
 * Features:
 *   - Per-conversation and per-agent token budgets
 *   - Real-time consumption tracking with rolling windows
 *   - Diminishing returns detection (progress-per-token ratio)
 *   - Budget alerts and automatic throttling
 *   - Cost estimation across providers
 *
 * @module tokenBudget
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Token usage for a single turn. */
export interface TurnUsage {
  turnId: string;
  conversationId: string;
  agentId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  modelId: string;
  timestamp: string;
  /** Estimated "progress" made in this turn (0.0-1.0). */
  progressEstimate: number;
  /** Cost in USD for this turn. */
  costUsd: number;
}

/** Budget configuration for a conversation or agent. */
export interface TokenBudgetConfig {
  /** Maximum total tokens (input + output) for the session. */
  maxTotalTokens: number;
  /** Maximum cost in USD. */
  maxCostUsd: number;
  /** Minimum progress-per-token ratio before triggering diminishing returns. */
  minProgressPerToken: number;
  /** Number of consecutive low-progress turns before recommending stop. */
  lowProgressTurnsThreshold: number;
  /** Warning threshold (percentage of budget consumed). */
  warningThresholdPct: number;
}

/** Current budget status. */
export interface BudgetStatus {
  /** Total tokens consumed so far. */
  totalTokens: number;
  /** Total input tokens. */
  inputTokens: number;
  /** Total output tokens. */
  outputTokens: number;
  /** Total cost in USD. */
  totalCostUsd: number;
  /** Percentage of token budget consumed. */
  tokenBudgetPct: number;
  /** Percentage of cost budget consumed. */
  costBudgetPct: number;
  /** Whether the budget is exceeded. */
  budgetExceeded: boolean;
  /** Whether diminishing returns have been detected. */
  diminishingReturns: boolean;
  /** Number of consecutive low-progress turns. */
  consecutiveLowProgressTurns: number;
  /** Average progress per 1000 tokens over the last 5 turns. */
  recentProgressPer1kTokens: number;
  /** Recommendation. */
  recommendation: "continue" | "warn" | "throttle" | "stop";
  /** Human-readable status message. */
  message: string;
}

/** Model pricing (per 1M tokens). */
interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M: number;
}

// ---------------------------------------------------------------------------
// Model Pricing Database
// ---------------------------------------------------------------------------

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4.1-mini": { inputPer1M: 0.40, outputPer1M: 1.60, cachedInputPer1M: 0.10 },
  "gpt-4.1-nano": { inputPer1M: 0.10, outputPer1M: 0.40, cachedInputPer1M: 0.025 },
  "gpt-4.1": { inputPer1M: 2.00, outputPer1M: 8.00, cachedInputPer1M: 0.50 },
  "gpt-4o": { inputPer1M: 2.50, outputPer1M: 10.00, cachedInputPer1M: 1.25 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.60, cachedInputPer1M: 0.075 },
  "claude-sonnet-4-20250514": { inputPer1M: 3.00, outputPer1M: 15.00, cachedInputPer1M: 0.30 },
  "claude-opus-4-20250514": { inputPer1M: 15.00, outputPer1M: 75.00, cachedInputPer1M: 1.50 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.60, cachedInputPer1M: 0.0375 },
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10.00, cachedInputPer1M: 0.3125 },
  // Default fallback
  default: { inputPer1M: 3.00, outputPer1M: 10.00, cachedInputPer1M: 0.30 },
};

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_BUDGET: TokenBudgetConfig = {
  maxTotalTokens: 2_000_000, // 2M tokens per session
  maxCostUsd: 10.0,
  minProgressPerToken: 0.00001, // Minimum progress per token
  lowProgressTurnsThreshold: 3,
  warningThresholdPct: 80,
};

// ---------------------------------------------------------------------------
// Token Budget Engine
// ---------------------------------------------------------------------------

export class TokenBudgetEngine {
  private budgets: Map<string, TokenBudgetConfig> = new Map(); // sessionId -> config
  private usage: Map<string, TurnUsage[]> = new Map(); // sessionId -> turns
  private globalUsage: TurnUsage[] = [];
  private maxGlobalUsage = 5000;

  /** Set a budget for a conversation or agent session. */
  setBudget(sessionId: string, config: Partial<TokenBudgetConfig> = {}): void {
    this.budgets.set(sessionId, { ...DEFAULT_BUDGET, ...config });
  }

  /** Get the budget config for a session (or default). */
  getBudget(sessionId: string): TokenBudgetConfig {
    return this.budgets.get(sessionId) || { ...DEFAULT_BUDGET };
  }

  /** Record token usage for a turn. */
  recordUsage(usage: TurnUsage): void {
    const sessionId = usage.conversationId;

    if (!this.usage.has(sessionId)) {
      this.usage.set(sessionId, []);
    }
    this.usage.get(sessionId)!.push(usage);

    this.globalUsage.push(usage);
    if (this.globalUsage.length > this.maxGlobalUsage) {
      this.globalUsage.shift();
    }
  }

  /**
   * Calculate the cost of a turn based on model pricing.
   */
  calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number = 0,
    cacheCreationTokens: number = 0
  ): number {
    const pricing = this.getPricing(modelId);

    const normalInputTokens = inputTokens - cacheReadTokens - cacheCreationTokens;
    const cost =
      (normalInputTokens / 1_000_000) * pricing.inputPer1M +
      (cacheReadTokens / 1_000_000) * pricing.cachedInputPer1M +
      (cacheCreationTokens / 1_000_000) * (pricing.inputPer1M * 1.25) +
      (outputTokens / 1_000_000) * pricing.outputPer1M;

    return Math.max(0, cost);
  }

  /**
   * Get the current budget status for a session.
   * This is the primary API for checking whether to continue.
   */
  getStatus(sessionId: string): BudgetStatus {
    const budget = this.getBudget(sessionId);
    const turns = this.usage.get(sessionId) || [];

    // Aggregate totals
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCostUsd = 0;

    for (const turn of turns) {
      inputTokens += turn.inputTokens;
      outputTokens += turn.outputTokens;
      totalCostUsd += turn.costUsd;
    }

    const totalTokens = inputTokens + outputTokens;
    const tokenBudgetPct = (totalTokens / budget.maxTotalTokens) * 100;
    const costBudgetPct = (totalCostUsd / budget.maxCostUsd) * 100;
    const budgetExceeded = tokenBudgetPct >= 100 || costBudgetPct >= 100;

    // Diminishing returns detection
    const recentTurns = turns.slice(-5);
    let recentProgressPer1kTokens = 0;
    let consecutiveLowProgressTurns = 0;

    if (recentTurns.length > 0) {
      const recentTotalTokens = recentTurns.reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0);
      const recentTotalProgress = recentTurns.reduce((sum, t) => sum + t.progressEstimate, 0);
      recentProgressPer1kTokens = recentTotalTokens > 0 ? (recentTotalProgress / recentTotalTokens) * 1000 : 0;

      // Count consecutive low-progress turns from the end
      for (let i = turns.length - 1; i >= 0; i--) {
        const turnTokens = turns[i].inputTokens + turns[i].outputTokens;
        const progressPerToken = turnTokens > 0 ? turns[i].progressEstimate / turnTokens : 0;
        if (progressPerToken < budget.minProgressPerToken) {
          consecutiveLowProgressTurns++;
        } else {
          break;
        }
      }
    }

    const diminishingReturns = consecutiveLowProgressTurns >= budget.lowProgressTurnsThreshold;

    // Determine recommendation
    let recommendation: BudgetStatus["recommendation"] = "continue";
    let message = "Budget healthy — continue processing.";

    if (budgetExceeded) {
      recommendation = "stop";
      message = `Budget exceeded: ${tokenBudgetPct.toFixed(1)}% tokens, ${costBudgetPct.toFixed(1)}% cost. Recommend stopping.`;
    } else if (diminishingReturns) {
      recommendation = "stop";
      message = `Diminishing returns detected: ${consecutiveLowProgressTurns} consecutive low-progress turns. Recommend stopping.`;
    } else if (tokenBudgetPct >= budget.warningThresholdPct || costBudgetPct >= budget.warningThresholdPct) {
      recommendation = "warn";
      message = `Budget warning: ${tokenBudgetPct.toFixed(1)}% tokens, ${costBudgetPct.toFixed(1)}% cost consumed.`;
    } else if (consecutiveLowProgressTurns >= 2) {
      recommendation = "throttle";
      message = `Progress slowing: ${consecutiveLowProgressTurns} low-progress turns. Consider reducing scope.`;
    }

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      totalCostUsd,
      tokenBudgetPct,
      costBudgetPct,
      budgetExceeded,
      diminishingReturns,
      consecutiveLowProgressTurns,
      recentProgressPer1kTokens,
      recommendation,
      message,
    };
  }

  /**
   * Get aggregated statistics across all sessions.
   */
  getGlobalStats(): {
    totalSessions: number;
    totalTurns: number;
    totalTokens: number;
    totalCostUsd: number;
    averageCostPerSession: number;
    topModelsByUsage: Array<{ modelId: string; tokens: number; cost: number }>;
  } {
    const modelStats = new Map<string, { tokens: number; cost: number }>();

    let totalTokens = 0;
    let totalCost = 0;

    for (const turn of this.globalUsage) {
      const tokens = turn.inputTokens + turn.outputTokens;
      totalTokens += tokens;
      totalCost += turn.costUsd;

      const existing = modelStats.get(turn.modelId) || { tokens: 0, cost: 0 };
      existing.tokens += tokens;
      existing.cost += turn.costUsd;
      modelStats.set(turn.modelId, existing);
    }

    const topModels = Array.from(modelStats.entries())
      .map(([modelId, stats]) => ({ modelId, ...stats }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    return {
      totalSessions: this.usage.size,
      totalTurns: this.globalUsage.length,
      totalTokens,
      totalCostUsd: totalCost,
      averageCostPerSession: this.usage.size > 0 ? totalCost / this.usage.size : 0,
      topModelsByUsage: topModels,
    };
  }

  /** Clear usage data for a session. */
  clearSession(sessionId: string): void {
    this.usage.delete(sessionId);
    this.budgets.delete(sessionId);
  }

  /** Get pricing for a model. */
  private getPricing(modelId: string): ModelPricing {
    // Try exact match first, then partial match, then default
    if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];

    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (modelId.includes(key) || key.includes(modelId)) return pricing;
    }

    return MODEL_PRICING["default"];
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const tokenBudgetEngine = new TokenBudgetEngine();
