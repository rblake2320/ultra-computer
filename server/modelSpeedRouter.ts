/**
 * Model Speed / Cost Router
 *
 * Analyses a task's complexity and routes it to the optimal model based on
 * latency, cost, and capability requirements. Inspired by NemoClaw's
 * policy-based governance — every routing decision is recorded with an
 * explicit reason string so the orchestrator can audit choices.
 */

import type { Model } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingDecision {
  modelId: string;
  reason: string;
  estimatedLatencyMs: number;
  costTier: "low" | "medium" | "high";
}

export interface TaskComplexity {
  tokenEstimate: number;
  requiresReasoning: boolean;
  requiresCode: boolean;
  requiresCreativity: boolean;
  isTimeSensitive: boolean;
}

// ─── Complexity Analysis ──────────────────────────────────────────────────────

const REASONING_KEYWORDS = [
  "analyze",
  "analyse",
  "compare",
  "evaluate",
  "reason",
  "think",
  "assess",
  "weigh",
  "contrast",
  "explain why",
  "pros and cons",
  "trade-off",
  "tradeoff",
];

const CODE_KEYWORDS = [
  "code",
  "script",
  "function",
  "implement",
  "debug",
  "fix",
  "refactor",
  "class",
  "algorithm",
  "api",
  "endpoint",
  "typescript",
  "javascript",
  "python",
  "sql",
  "regex",
];

const CREATIVITY_KEYWORDS = [
  "write",
  "draft",
  "create",
  "design",
  "brainstorm",
  "compose",
  "generate",
  "ideate",
  "imagine",
  "narrative",
  "story",
  "poem",
  "blog",
  "essay",
];

const TIME_SENSITIVE_KEYWORDS = [
  "quick",
  "fast",
  "brief",
  "tl;dr",
  "tldr",
  "short",
  "asap",
  "hurry",
  "instantly",
  "rapidly",
];

/**
 * Derives task complexity signals from the task description and type.
 * Deliberately cheap: pure string analysis, no LLM or DB calls.
 */
export function analyzeTaskComplexity(
  taskDescription: string,
  taskType: string
): TaskComplexity {
  const lower = taskDescription.toLowerCase();

  // Rough token estimate: characters ÷ 4 ≈ tokens, then ×3 for expected output.
  const tokenEstimate = Math.ceil(taskDescription.length / 4) * 3;

  const containsAny = (keywords: string[]): boolean =>
    keywords.some((kw) => lower.includes(kw));

  return {
    tokenEstimate,
    requiresReasoning: containsAny(REASONING_KEYWORDS),
    requiresCode: containsAny(CODE_KEYWORDS),
    requiresCreativity: containsAny(CREATIVITY_KEYWORDS),
    isTimeSensitive:
      taskType === "speed" || containsAny(TIME_SENSITIVE_KEYWORDS),
  };
}

// ─── Model Cost Tier ──────────────────────────────────────────────────────────

/**
 * Maps a model's speed tier to a billing cost tier.
 * Fast models are cheap; powerful models are expensive.
 */
export function getModelCostTier(model: Model): "low" | "medium" | "high" {
  switch (model.speedTier) {
    case "fast":
      return "low";
    case "medium":
      return "medium";
    case "powerful":
      return "high";
    default:
      return "medium";
  }
}

// ─── Latency Estimation ───────────────────────────────────────────────────────

/**
 * Returns a rough latency estimate in milliseconds based on speed tier and
 * expected token count. These are order-of-magnitude heuristics — actual
 * latency depends on the provider, network, and server load.
 *
 * Assumptions (tokens × ms/token):
 *   fast     → 2 ms / token
 *   medium   → 5 ms / token
 *   powerful → 10 ms / token
 */
export function estimateLatency(model: Model, tokenCount: number): number {
  switch (model.speedTier) {
    case "fast":
      return tokenCount * 2;
    case "medium":
      return tokenCount * 5;
    case "powerful":
      return tokenCount * 10;
    default:
      return tokenCount * 5;
  }
}

// ─── Capability Check ─────────────────────────────────────────────────────────

/**
 * Returns true if the model's declared capabilities include `capability`.
 * The `capabilities` column is stored as a JSON string array.
 */
function modelHasCapability(model: Model, capability: string): boolean {
  try {
    const caps: string[] = JSON.parse(model.capabilities ?? "[]");
    return caps.some((c) => c.toLowerCase() === capability.toLowerCase());
  } catch {
    return false;
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

interface ScoredModel {
  model: Model;
  score: number;
  reasons: string[];
}

function scoreModel(model: Model, complexity: TaskComplexity): ScoredModel {
  let score = 0;
  const reasons: string[] = [];

  // Base tier preferences
  if (complexity.isTimeSensitive) {
    if (model.speedTier === "fast") {
      score += 30;
      reasons.push("fast tier preferred for time-sensitive task");
    } else if (model.speedTier === "medium") {
      score += 10;
    } else {
      // powerful — deprioritize for speed-critical tasks
      score -= 10;
    }
  }

  if (complexity.requiresReasoning) {
    if (model.speedTier === "powerful") {
      score += 25;
      reasons.push("powerful tier preferred for reasoning task");
    } else if (model.speedTier === "medium") {
      score += 10;
    }
  }

  if (complexity.requiresCode) {
    if (modelHasCapability(model, "code")) {
      score += 20;
      reasons.push("model has code capability");
    }
    if (model.speedTier === "powerful") {
      score += 10;
      reasons.push("powerful tier preferred for code task");
    }
  }

  if (complexity.requiresCreativity) {
    if (model.speedTier === "medium" || model.speedTier === "powerful") {
      score += 10;
      reasons.push("medium/powerful tier preferred for creative task");
    }
  }

  // Prefer enabled defaults as a tiebreaker
  if (model.isDefault) {
    score += 5;
    reasons.push("model is the default");
  }

  // Prefer orchestrator for complex multi-signal tasks
  const complexSignals =
    (complexity.requiresReasoning ? 1 : 0) +
    (complexity.requiresCode ? 1 : 0) +
    (complexity.requiresCreativity ? 1 : 0);
  if (complexSignals >= 2 && model.isOrchestrator) {
    score += 8;
    reasons.push("orchestrator model preferred for multi-faceted task");
  }

  return { model, score, reasons };
}

// ─── Optimal Model Router ─────────────────────────────────────────────────────

/**
 * Given a task complexity profile and a list of enabled models, returns a
 * routing decision for the best model to use.
 *
 * Scoring is additive — each positive signal adds to the model's score.
 * The highest-scored model wins. In the event of a tie, the first model
 * encountered in the list is preferred (caller controls ordering).
 */
export function routeToOptimalModel(
  complexity: TaskComplexity,
  availableModels: Model[]
): RoutingDecision {
  const enabledModels = availableModels.filter((m) => m.enabled);

  if (enabledModels.length === 0) {
    throw new Error(
      "[ModelSpeedRouter] No enabled models available for routing."
    );
  }

  const scored: ScoredModel[] = enabledModels.map((m) =>
    scoreModel(m, complexity)
  );

  // Sort descending by score; stable sort preserves original order on tie.
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const costTier = getModelCostTier(best.model);
  const latency = estimateLatency(best.model, complexity.tokenEstimate);

  // Build a human-readable reason string.
  const reasonParts: string[] = [];

  if (complexity.isTimeSensitive) reasonParts.push("time-sensitive");
  if (complexity.requiresReasoning) reasonParts.push("reasoning");
  if (complexity.requiresCode) reasonParts.push("code");
  if (complexity.requiresCreativity) reasonParts.push("creativity");

  const signalSummary =
    reasonParts.length > 0
      ? `Task signals: [${reasonParts.join(", ")}]. `
      : "No special signals. ";

  const modelReasons =
    best.reasons.length > 0
      ? `Selected because: ${best.reasons.join("; ")}.`
      : `Selected as best available model (score ${best.score}).`;

  const reason = `${signalSummary}${modelReasons}`;

  return {
    modelId: best.model.id,
    reason,
    estimatedLatencyMs: latency,
    costTier,
  };
}
