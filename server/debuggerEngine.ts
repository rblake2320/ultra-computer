/**
 * DEBUGGER — Automatic Failure Diagnosis Engine
 * When an agent fails, DEBUGGER analyzes the failure and suggests fixes.
 * 
 * Capabilities:
 * 1. Error classification — categorize by type (auth, timeout, rate-limit, logic, etc.)
 * 2. Root cause analysis — trace failure back through the execution chain
 * 3. Fix suggestions — actionable remediation steps
 * 4. Pattern matching — compare against known failure patterns from self-learning
 * 5. Auto-retry with modifications — can suggest modified parameters for retry
 */

import { analyzeFailurePatterns, getExecutionHistory, type ExecutionEntry } from "./selfLearning.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosisInput {
  taskId: string;
  error: string;
  errorType?: string;
  stackTrace?: string;
  context: {
    agentId?: string;
    modelId?: string;
    taskType?: string;
    input?: string;
    conversationId?: string;
    attemptNumber?: number;
    latencyMs?: number;
    tokensUsed?: number;
  };
}

export interface Diagnosis {
  errorCategory: ErrorCategory;
  severity: "critical" | "high" | "medium" | "low";
  rootCause: string;
  explanation: string;
  fixes: Fix[];
  relatedPatterns: PatternMatch[];
  retryable: boolean;
  retryConfig?: RetryConfig;
  diagnosedAt: number;
  latencyMs: number;
}

export type ErrorCategory = 
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "model_error"
  | "context_overflow"
  | "invalid_input"
  | "tool_failure"
  | "network"
  | "resource_exhausted"
  | "logic_error"
  | "format_error"
  | "permission"
  | "unknown";

export interface Fix {
  action: string;
  description: string;
  priority: "immediate" | "recommended" | "optional";
  automated: boolean;
  parameters?: Record<string, any>;
}

export interface PatternMatch {
  patternId: string;
  similarity: number;
  description: string;
  historicalFix?: string;
}

export interface RetryConfig {
  recommended: boolean;
  delay: number;
  maxRetries: number;
  modifiedParams?: Record<string, any>;
  useAlternateModel?: string;
}

// ─── Error Classification Rules ───────────────────────────────────────────────

const CLASSIFICATION_RULES: Array<{
  category: ErrorCategory;
  patterns: RegExp[];
  severity: Diagnosis["severity"];
  retryable: boolean;
}> = [
  {
    category: "authentication",
    patterns: [/auth/i, /unauthorized/i, /401/i, /invalid.*key/i, /forbidden/i, /403/i, /api.?key/i, /credential/i, /token.*expired/i],
    severity: "critical",
    retryable: false,
  },
  {
    category: "rate_limit",
    patterns: [/rate.?limit/i, /429/i, /too many requests/i, /quota.*exceeded/i, /throttl/i],
    severity: "medium",
    retryable: true,
  },
  {
    category: "timeout",
    patterns: [/timeout/i, /timed?.?out/i, /ETIMEDOUT/i, /ESOCKETTIMEDOUT/i, /deadline.*exceeded/i],
    severity: "medium",
    retryable: true,
  },
  {
    category: "context_overflow",
    patterns: [/context.*length/i, /token.*limit/i, /maximum.*context/i, /too.*long/i, /max.*tokens/i, /context.*window/i],
    severity: "high",
    retryable: false,
  },
  {
    category: "model_error",
    patterns: [/model.*not.*found/i, /invalid.*model/i, /model.*unavailable/i, /500/i, /internal.*server/i, /overloaded/i],
    severity: "high",
    retryable: true,
  },
  {
    category: "network",
    patterns: [/ECONNREFUSED/i, /ENOTFOUND/i, /ECONNRESET/i, /network/i, /DNS/i, /fetch.*failed/i, /socket.*hang/i],
    severity: "medium",
    retryable: true,
  },
  {
    category: "invalid_input",
    patterns: [/invalid.*input/i, /bad.*request/i, /400/i, /validation.*failed/i, /missing.*required/i, /malformed/i],
    severity: "medium",
    retryable: false,
  },
  {
    category: "tool_failure",
    patterns: [/tool.*failed/i, /tool.*error/i, /execution.*error/i, /command.*failed/i, /sandbox/i],
    severity: "medium",
    retryable: true,
  },
  {
    category: "resource_exhausted",
    patterns: [/out of memory/i, /OOM/i, /disk.*full/i, /no.*space/i, /resource.*exhausted/i],
    severity: "critical",
    retryable: false,
  },
  {
    category: "format_error",
    patterns: [/JSON.*parse/i, /unexpected.*token/i, /syntax.*error/i, /invalid.*JSON/i, /parse.*error/i],
    severity: "low",
    retryable: true,
  },
  {
    category: "permission",
    patterns: [/permission.*denied/i, /EACCES/i, /not.*allowed/i, /insufficient.*permission/i],
    severity: "high",
    retryable: false,
  },
];

// ─── History ──────────────────────────────────────────────────────────────────

const diagnosisHistory: Array<{
  input: DiagnosisInput;
  diagnosis: Diagnosis;
  timestamp: number;
}> = [];

// ─── Core Diagnosis ───────────────────────────────────────────────────────────

export function diagnose(input: DiagnosisInput): Diagnosis {
  const start = Date.now();

  // 1. Classify error
  const classification = classifyError(input.error, input.stackTrace);

  // 2. Determine root cause
  const rootCause = analyzeRootCause(input, classification.category);

  // 3. Generate fix suggestions
  const fixes = generateFixes(input, classification.category);

  // 4. Match against historical patterns
  const relatedPatterns = matchHistoricalPatterns(input);

  // 5. Determine retry config
  const retryConfig = buildRetryConfig(input, classification);

  // 6. Build explanation
  const explanation = buildExplanation(input, classification.category, rootCause);

  const diagnosis: Diagnosis = {
    errorCategory: classification.category,
    severity: classification.severity,
    rootCause,
    explanation,
    fixes,
    relatedPatterns,
    retryable: classification.retryable,
    retryConfig: classification.retryable ? retryConfig : undefined,
    diagnosedAt: Date.now(),
    latencyMs: Date.now() - start,
  };

  diagnosisHistory.push({ input, diagnosis, timestamp: Date.now() });
  if (diagnosisHistory.length > 500) diagnosisHistory.splice(0, 100);

  return diagnosis;
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyError(error: string, stackTrace?: string): { category: ErrorCategory; severity: Diagnosis["severity"]; retryable: boolean } {
  const combined = `${error} ${stackTrace || ""}`;

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return { category: rule.category, severity: rule.severity, retryable: rule.retryable };
      }
    }
  }

  return { category: "unknown", severity: "medium", retryable: false };
}

// ─── Root Cause Analysis ──────────────────────────────────────────────────────

function analyzeRootCause(input: DiagnosisInput, category: ErrorCategory): string {
  switch (category) {
    case "authentication":
      if (input.context.modelId) {
        return `Authentication failed for model "${input.context.modelId}". The API key may be invalid, expired, or missing.`;
      }
      return "Authentication failure. Credentials are invalid or expired.";

    case "rate_limit":
      return `Rate limit exceeded${input.context.modelId ? ` for model "${input.context.modelId}"` : ""}. Too many requests in a short period.`;

    case "timeout":
      return `Request timed out after ${input.context.latencyMs ? `${input.context.latencyMs}ms` : "the deadline"}. ${
        input.context.taskType === "coding" ? "Code execution may be too complex." : "The model or service is responding slowly."
      }`;

    case "context_overflow":
      return `Context window exceeded${input.context.tokensUsed ? ` (${input.context.tokensUsed} tokens used)` : ""}. The input + history is too large for the model's context window.`;

    case "model_error":
      return `Model "${input.context.modelId || "unknown"}" returned an error. The model may be temporarily unavailable or overloaded.`;

    case "network":
      return "Network connectivity issue. The target service may be down or unreachable from this environment.";

    case "invalid_input":
      return "The input to the agent or tool was malformed. Check parameter types, required fields, and value constraints.";

    case "tool_failure":
      return `Tool execution failed during task "${input.taskId}". The tool may have encountered an unexpected state or invalid arguments.`;

    case "resource_exhausted":
      return "System resources (memory, disk, or compute) are exhausted. The task may be too resource-intensive for the current environment.";

    case "format_error":
      return "Failed to parse the model's output. The response was not in the expected format (likely malformed JSON or unexpected structure).";

    case "permission":
      return "Permission denied. The operation requires elevated access or the resource is restricted.";

    default:
      return `Unknown error in task "${input.taskId}": ${input.error.slice(0, 200)}`;
  }
}

// ─── Fix Generation ───────────────────────────────────────────────────────────

function generateFixes(input: DiagnosisInput, category: ErrorCategory): Fix[] {
  const fixes: Fix[] = [];

  switch (category) {
    case "authentication":
      fixes.push(
        { action: "verify_api_key", description: "Verify the API key is valid and not expired", priority: "immediate", automated: false },
        { action: "rotate_key", description: "Generate a new API key from the provider dashboard", priority: "recommended", automated: false },
        { action: "fallback_model", description: "Switch to a different model with valid credentials", priority: "recommended", automated: true, parameters: { reason: "auth_failure" } },
      );
      break;

    case "rate_limit":
      fixes.push(
        { action: "backoff_retry", description: "Wait and retry with exponential backoff", priority: "immediate", automated: true, parameters: { delayMs: 3000, multiplier: 3 } },
        { action: "reduce_concurrency", description: "Reduce parallel requests to this model", priority: "recommended", automated: true },
        { action: "fallback_model", description: "Route to a less-loaded model", priority: "optional", automated: true },
      );
      break;

    case "timeout":
      fixes.push(
        { action: "increase_timeout", description: "Increase the request timeout", priority: "immediate", automated: true, parameters: { timeoutMs: 60000 } },
        { action: "reduce_input", description: "Reduce input size or simplify the task", priority: "recommended", automated: true },
        { action: "use_faster_model", description: "Switch to a faster model (may trade quality)", priority: "optional", automated: true },
      );
      break;

    case "context_overflow":
      fixes.push(
        { action: "compact_context", description: "Run context compaction to reduce history size", priority: "immediate", automated: true },
        { action: "truncate_input", description: "Truncate the oldest messages in the conversation", priority: "recommended", automated: true },
        { action: "use_larger_model", description: "Switch to a model with a larger context window", priority: "optional", automated: true },
      );
      break;

    case "model_error":
      fixes.push(
        { action: "retry", description: "Retry the same request (may be transient)", priority: "immediate", automated: true },
        { action: "fallback_model", description: "Fall back to an alternate model", priority: "recommended", automated: true },
        { action: "check_status", description: "Check the model provider's status page", priority: "optional", automated: false },
      );
      break;

    case "network":
      fixes.push(
        { action: "retry", description: "Retry after a short delay (may be transient)", priority: "immediate", automated: true, parameters: { delayMs: 2000 } },
        { action: "check_connectivity", description: "Verify network connectivity to the service", priority: "recommended", automated: false },
      );
      break;

    case "format_error":
      fixes.push(
        { action: "retry_with_structured", description: "Retry with explicit JSON format instructions in the prompt", priority: "immediate", automated: true },
        { action: "add_format_guard", description: "Add output format validation and retry logic", priority: "recommended", automated: true },
      );
      break;

    case "tool_failure":
      fixes.push(
        { action: "retry_tool", description: "Retry the tool execution", priority: "immediate", automated: true },
        { action: "skip_tool", description: "Skip this tool and continue with available results", priority: "recommended", automated: true },
        { action: "manual_fallback", description: "Use LLM to accomplish the task without the tool", priority: "optional", automated: true },
      );
      break;

    default:
      fixes.push(
        { action: "retry", description: "Retry the task", priority: "recommended", automated: true },
        { action: "escalate", description: "Escalate to a human operator", priority: "optional", automated: false },
      );
  }

  return fixes;
}

// ─── Pattern Matching ─────────────────────────────────────────────────────────

function matchHistoricalPatterns(input: DiagnosisInput): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const failurePatterns = analyzeFailurePatterns();

  if (!failurePatterns?.topPatterns) return patterns;

  for (const fp of failurePatterns.topPatterns) {
    // Simple similarity: check if error message matches known pattern
    const similarity = calculateSimilarity(input.error.toLowerCase(), (fp.pattern || "").toLowerCase());
    if (similarity > 0.3) {
      patterns.push({
        patternId: `${fp.errorType}-${fp.taskType}`,
        similarity: Math.round(similarity * 100) / 100,
        description: `${fp.errorType} in ${fp.taskType} (${fp.count} occurrences)`,
        historicalFix: fp.exampleMessages?.[0],
      });
    }
  }

  // Also check recent execution history for similar failures
  const history = getExecutionHistory(50);
  const recentFailures = history.filter((e: ExecutionEntry) => !e.success && e.taskType === input.context.taskType);
  if (recentFailures.length > 0) {
    patterns.push({
      patternId: "recent-similar-failures",
      similarity: 0.5,
      description: `${recentFailures.length} similar failures in recent history for task type "${input.context.taskType}"`,
    });
  }

  return patterns.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = new Set([...aWords].filter(w => bWords.has(w)));
  const union = new Set([...aWords, ...bWords]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ─── Retry Config ─────────────────────────────────────────────────────────────

function buildRetryConfig(input: DiagnosisInput, classification: { category: ErrorCategory; retryable: boolean }): RetryConfig {
  if (!classification.retryable) {
    return { recommended: false, delay: 0, maxRetries: 0 };
  }

  switch (classification.category) {
    case "rate_limit":
      return {
        recommended: true,
        delay: 3000 + Math.random() * 2000,
        maxRetries: 3,
        modifiedParams: { reducedConcurrency: true },
      };
    case "timeout":
      return {
        recommended: true,
        delay: 1000,
        maxRetries: 2,
        modifiedParams: { timeout: 60000 },
      };
    case "model_error":
      return {
        recommended: true,
        delay: 2000,
        maxRetries: 2,
        useAlternateModel: undefined, // orchestrator should pick
      };
    case "network":
      return { recommended: true, delay: 2000, maxRetries: 3 };
    case "format_error":
      return {
        recommended: true,
        delay: 500,
        maxRetries: 2,
        modifiedParams: { addFormatInstruction: true },
      };
    case "tool_failure":
      return { recommended: true, delay: 1000, maxRetries: 1 };
    default:
      return { recommended: true, delay: 1000, maxRetries: 1 };
  }
}

// ─── Explanation Builder ──────────────────────────────────────────────────────

function buildExplanation(input: DiagnosisInput, category: ErrorCategory, rootCause: string): string {
  const parts = [
    `**Error Category:** ${category}`,
    `**Root Cause:** ${rootCause}`,
  ];

  if (input.context.agentId) parts.push(`**Agent:** ${input.context.agentId}`);
  if (input.context.modelId) parts.push(`**Model:** ${input.context.modelId}`);
  if (input.context.attemptNumber && input.context.attemptNumber > 1) {
    parts.push(`**Attempt:** ${input.context.attemptNumber} (previous attempts also failed)`);
  }

  return parts.join("\n");
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export function getDiagnosisHistory(limit: number = 50) {
  return diagnosisHistory.slice(-limit);
}

export function getDiagnosisStats() {
  if (diagnosisHistory.length === 0) {
    return { total: 0, byCategory: {}, bySeverity: {}, avgLatencyMs: 0, retryableRate: 0 };
  }

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let retryable = 0;

  for (const h of diagnosisHistory) {
    byCategory[h.diagnosis.errorCategory] = (byCategory[h.diagnosis.errorCategory] || 0) + 1;
    bySeverity[h.diagnosis.severity] = (bySeverity[h.diagnosis.severity] || 0) + 1;
    if (h.diagnosis.retryable) retryable++;
  }

  const avgLatency = diagnosisHistory.reduce((s, h) => s + h.diagnosis.latencyMs, 0) / diagnosisHistory.length;

  return {
    total: diagnosisHistory.length,
    byCategory,
    bySeverity,
    avgLatencyMs: Math.round(avgLatency),
    retryableRate: Math.round((retryable / diagnosisHistory.length) * 100),
  };
}
