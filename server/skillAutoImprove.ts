/**
 * Skill Auto-Improvement System — Self-improvement layer
 * Analyzes skill performance over time and generates (or auto-applies) improvement suggestions.
 *
 * Data persisted to:
 *   /home/user/workspace/ultra-computer/data/learning/skill-performance.json
 *   /home/user/workspace/ultra-computer/data/learning/improvement-suggestions.json
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage.js";

// ─── Data directory ────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(
  "/home/user/workspace/ultra-computer/data/learning"
);
const PERF_FILE = path.join(DATA_DIR, "skill-performance.json");
const SUGGESTIONS_FILE = path.join(DATA_DIR, "improvement-suggestions.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SkillPerformanceRecord {
  skillId: string;
  skillName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  avgOutputQuality: number; // 0–100, derived from user feedback + completion rate
  // Failure analysis
  commonFailureModes: Array<{
    mode: string; // e.g. 'timeout', 'context_overflow', 'hallucination', 'wrong_tool'
    count: number;
    lastOccurred: number;
    suggestedFix: string;
  }>;
  // Improvement history
  improvements: Array<{
    id: string;
    type:
      | "trigger_keyword_added"
      | "content_refined"
      | "description_updated"
      | "activation_condition_fixed"
      | "auto_disabled";
    description: string;
    appliedAt: number;
    impact: "positive" | "neutral" | "negative" | "unknown";
  }>;
  lastAnalyzedAt: number;
  updatedAt: number;
}

export interface ImprovementSuggestion {
  id: string;
  skillId: string;
  skillName: string;
  type:
    | "add_trigger_keywords"
    | "refine_instructions"
    | "add_error_handling"
    | "optimize_context"
    | "split_skill"
    | "merge_skills"
    | "disable_skill";
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  reasoning: string;
  proposedChange?: string;
  confidence: number; // 0–1
  autoApplicable: boolean;
  status: "pending" | "applied" | "rejected" | "deferred";
  createdAt: number;
}

// Internal: per-execution stats used to compute running averages
interface ExecutionSample {
  durationMs: number;
  success: boolean;
  outputQuality: number;
  failureMode?: string;
  timestamp: number;
}

// In-memory execution buffer so we don't write to disk on every call
// (flushed to JSON on `analyzeSkillPerformance` / `analyzeAllSkills`)
const executionBuffer = new Map<string, ExecutionSample[]>();

// ─── JSON helpers ──────────────────────────────────────────────────────────────

function readPerformanceRecords(): SkillPerformanceRecord[] {
  ensureDataDir();
  try {
    if (!fs.existsSync(PERF_FILE)) return [];
    const raw = fs.readFileSync(PERF_FILE, "utf-8");
    return JSON.parse(raw) as SkillPerformanceRecord[];
  } catch {
    return [];
  }
}

function writePerformanceRecords(records: SkillPerformanceRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(PERF_FILE, JSON.stringify(records, null, 2), "utf-8");
}

function readSuggestions(): ImprovementSuggestion[] {
  ensureDataDir();
  try {
    if (!fs.existsSync(SUGGESTIONS_FILE)) return [];
    const raw = fs.readFileSync(SUGGESTIONS_FILE, "utf-8");
    return JSON.parse(raw) as ImprovementSuggestion[];
  } catch {
    return [];
  }
}

function writeSuggestions(suggestions: ImprovementSuggestion[]): void {
  ensureDataDir();
  fs.writeFileSync(
    SUGGESTIONS_FILE,
    JSON.stringify(suggestions, null, 2),
    "utf-8"
  );
}

function generateId(): string {
  return crypto.randomUUID();
}

// ─── Suggested fix lookup for known failure modes ──────────────────────────────

const FAILURE_FIX_MAP: Record<string, string> = {
  timeout:
    "Break the skill into smaller sub-tasks or increase timeout budget for long-running operations.",
  context_overflow:
    "Trim skill instructions, remove redundant examples, or split into two focused skills.",
  hallucination:
    "Add explicit grounding instructions, require citations, and add validation steps.",
  wrong_tool:
    "Clarify the skill's scope in the description and add negative-trigger keywords to prevent false activation.",
  rate_limit:
    "Add retry logic with exponential back-off or spread calls across multiple providers.",
  auth_error:
    "Ensure credential rotation is handled; add a pre-flight connector-check step.",
  parse_error:
    "Harden output parsing with fallback formats and include format examples in skill instructions.",
  unknown:
    "Review execution logs for root cause and add defensive error-handling steps.",
};

function suggestedFixFor(mode: string): string {
  return FAILURE_FIX_MAP[mode] ?? FAILURE_FIX_MAP["unknown"];
}

// ─── Quality score derivation ─────────────────────────────────────────────────
//
// avgOutputQuality = (successRate * 60) + (userPositiveFeedbackRate * 30) + (speedScore * 10)
// speedScore = 100 if avg < 5 s, 50 if avg < 15 s, 0 otherwise

function deriveQualityScore(
  successRate: number,
  positiveFeedbackRate: number,
  avgDurationMs: number
): number {
  const speedScore =
    avgDurationMs < 5_000 ? 100 : avgDurationMs < 15_000 ? 50 : 0;
  return successRate * 60 + positiveFeedbackRate * 30 + speedScore * 10;
}

// ─── Flush buffered executions into a performance record ───────────────────────

function flushBuffer(
  skillId: string,
  existing: SkillPerformanceRecord | undefined
): SkillPerformanceRecord | null {
  const samples = executionBuffer.get(skillId);
  if (!samples || samples.length === 0) return existing ?? null;

  const base: SkillPerformanceRecord = existing ?? {
    skillId,
    skillName: skillId,
    totalExecutions: 0,
    successCount: 0,
    failureCount: 0,
    avgDurationMs: 0,
    avgOutputQuality: 0,
    commonFailureModes: [],
    improvements: [],
    lastAnalyzedAt: 0,
    updatedAt: Date.now(),
  };

  // Merge samples into running stats
  const prevTotal = base.totalExecutions;
  const newTotal = prevTotal + samples.length;
  const newSuccesses =
    base.successCount + samples.filter((s) => s.success).length;
  const newFailures =
    base.failureCount + samples.filter((s) => !s.success).length;

  // Running average for duration
  const totalDurationFromSamples = samples.reduce(
    (acc, s) => acc + s.durationMs,
    0
  );
  const newAvgDuration =
    prevTotal === 0
      ? totalDurationFromSamples / samples.length
      : (base.avgDurationMs * prevTotal + totalDurationFromSamples) / newTotal;

  // Running average for quality (use provided quality; default to inferred if missing)
  const totalQualityFromSamples = samples.reduce(
    (acc, s) => acc + s.outputQuality,
    0
  );
  const avgSampleQuality = totalQualityFromSamples / samples.length;
  const newAvgQuality =
    prevTotal === 0
      ? avgSampleQuality
      : (base.avgOutputQuality * prevTotal + totalQualityFromSamples) /
        newTotal;

  // Merge failure modes
  const failureModeMap = new Map<
    string,
    { count: number; lastOccurred: number }
  >();
  for (const fm of base.commonFailureModes) {
    failureModeMap.set(fm.mode, {
      count: fm.count,
      lastOccurred: fm.lastOccurred,
    });
  }
  for (const s of samples) {
    if (!s.success && s.failureMode) {
      const existing = failureModeMap.get(s.failureMode) ?? {
        count: 0,
        lastOccurred: 0,
      };
      failureModeMap.set(s.failureMode, {
        count: existing.count + 1,
        lastOccurred: Math.max(existing.lastOccurred, s.timestamp),
      });
    }
  }

  const commonFailureModes = Array.from(failureModeMap.entries())
    .map(([mode, { count, lastOccurred }]) => ({
      mode,
      count,
      lastOccurred,
      suggestedFix: suggestedFixFor(mode),
    }))
    .sort((a, b) => b.count - a.count);

  const updated: SkillPerformanceRecord = {
    ...base,
    totalExecutions: newTotal,
    successCount: newSuccesses,
    failureCount: newFailures,
    avgDurationMs: Math.round(newAvgDuration),
    avgOutputQuality: Math.min(100, Math.max(0, Math.round(newAvgQuality))),
    commonFailureModes,
    updatedAt: Date.now(),
  };

  executionBuffer.delete(skillId);
  return updated;
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Record a single skill execution.
 * outputQuality is optional; if omitted it is inferred from success + duration.
 * failureMode is one of: 'timeout', 'context_overflow', 'hallucination', 'wrong_tool',
 *   'rate_limit', 'auth_error', 'parse_error', or any freeform string.
 */
export function recordSkillExecution(
  skillId: string,
  skillName: string,
  success: boolean,
  durationMs: number,
  outputQuality?: number,
  failureMode?: string
): void {
  // Infer quality when not provided
  const speedScore =
    durationMs < 5_000 ? 100 : durationMs < 15_000 ? 50 : 0;
  const inferredQuality = success
    ? deriveQualityScore(1, 0, durationMs)
    : speedScore * 0.1; // low quality on failure

  const sample: ExecutionSample = {
    durationMs,
    success,
    outputQuality: outputQuality ?? inferredQuality,
    failureMode: !success ? (failureMode ?? "unknown") : undefined,
    timestamp: Date.now(),
  };

  if (!executionBuffer.has(skillId)) {
    executionBuffer.set(skillId, []);
  }
  executionBuffer.get(skillId)!.push(sample);

  // Eagerly update the skillName in any existing record so it stays current
  const records = readPerformanceRecords();
  const recIdx = records.findIndex((r) => r.skillId === skillId);
  if (recIdx !== -1 && records[recIdx].skillName !== skillName) {
    records[recIdx].skillName = skillName;
    writePerformanceRecords(records);
  }
}

/**
 * Flush buffered executions for a skill and return the updated performance record.
 */
export function analyzeSkillPerformance(skillId: string): SkillPerformanceRecord {
  const records = readPerformanceRecords();
  const existingIdx = records.findIndex((r) => r.skillId === skillId);
  const existing = existingIdx !== -1 ? records[existingIdx] : undefined;

  const updated = flushBuffer(skillId, existing) ?? {
    skillId,
    skillName: skillId,
    totalExecutions: 0,
    successCount: 0,
    failureCount: 0,
    avgDurationMs: 0,
    avgOutputQuality: 0,
    commonFailureModes: [],
    improvements: [],
    lastAnalyzedAt: Date.now(),
    updatedAt: Date.now(),
  };

  updated.lastAnalyzedAt = Date.now();

  if (existingIdx !== -1) {
    records[existingIdx] = updated;
  } else {
    records.push(updated);
  }

  writePerformanceRecords(records);
  return updated;
}

/**
 * Flush all buffered executions and return all performance records.
 */
export function analyzeAllSkills(): SkillPerformanceRecord[] {
  const records = readPerformanceRecords();
  const recordMap = new Map<string, SkillPerformanceRecord>(
    records.map((r) => [r.skillId, r])
  );

  // Also pull skill IDs that only exist in the buffer
  const allIds = new Set<string>([
    ...recordMap.keys(),
    ...executionBuffer.keys(),
  ]);

  for (const skillId of allIds) {
    const existing = recordMap.get(skillId);
    const updated = flushBuffer(skillId, existing);
    if (updated) {
      updated.lastAnalyzedAt = Date.now();
      recordMap.set(skillId, updated);
    }
  }

  const result = Array.from(recordMap.values());
  writePerformanceRecords(result);
  return result;
}

// ─── Co-activation tracking ────────────────────────────────────────────────────

// Tracks which skill pairs were activated together (skillId → Set of co-skillIds)
const coActivationLog = new Map<string, Map<string, number>>();

/**
 * Call this whenever multiple skills activate in the same session.
 * Used internally by generateImprovements to detect merge candidates.
 */
export function recordCoActivation(skillIds: string[]): void {
  for (let i = 0; i < skillIds.length; i++) {
    for (let j = 0; j < skillIds.length; j++) {
      if (i === j) continue;
      const a = skillIds[i];
      const b = skillIds[j];
      if (!coActivationLog.has(a)) coActivationLog.set(a, new Map());
      const inner = coActivationLog.get(a)!;
      inner.set(b, (inner.get(b) ?? 0) + 1);
    }
  }
}

// ─── Improvement generation ────────────────────────────────────────────────────

function buildSuggestion(
  partial: Omit<ImprovementSuggestion, "id" | "status" | "createdAt">
): ImprovementSuggestion {
  return {
    ...partial,
    id: generateId(),
    status: "pending",
    createdAt: Date.now(),
  };
}

/**
 * Analyze all skills and generate improvement suggestions based on patterns.
 * New suggestions are appended to the suggestions store (de-duplicated by type+skillId).
 */
export function generateImprovements(): ImprovementSuggestion[] {
  const allRecords = analyzeAllSkills();
  const existingSuggestions = readSuggestions();

  // De-duplicate helper: don't add a pending suggestion of the same type for the same skill
  const pendingKey = (skillId: string, type: string) => `${skillId}::${type}`;
  const pendingSet = new Set(
    existingSuggestions
      .filter((s) => s.status === "pending")
      .map((s) => pendingKey(s.skillId, s.type))
  );

  const newSuggestions: ImprovementSuggestion[] = [];

  function maybeAdd(s: ImprovementSuggestion): void {
    const key = pendingKey(s.skillId, s.type);
    if (!pendingSet.has(key)) {
      pendingSet.add(key);
      newSuggestions.push(s);
    }
  }

  // Fetch live skill list so we can inspect trigger keywords
  let liveSkills: Array<{ id: string; triggerKeywords: string; name: string; enabled: boolean }> = [];
  try {
    liveSkills = storage.getSkills() as typeof liveSkills;
  } catch {
    // storage unavailable — proceed without keyword checks
  }
  const liveSkillMap = new Map(liveSkills.map((s) => [s.id, s]));

  for (const rec of allRecords) {
    const successRate =
      rec.totalExecutions > 0 ? rec.successCount / rec.totalExecutions : 1;

    // ── Rule 1: Low success rate ────────────────────────────────────────────
    if (rec.totalExecutions > 10 && successRate < 0.5) {
      if (successRate < 0.25) {
        maybeAdd(
          buildSuggestion({
            skillId: rec.skillId,
            skillName: rec.skillName,
            type: "disable_skill",
            priority: "critical",
            title: `Disable "${rec.skillName}" — critically low success rate`,
            description: `Success rate is ${Math.round(successRate * 100)}% over ${rec.totalExecutions} executions.`,
            reasoning:
              "A skill with <25% success is causing more harm than good and should be disabled pending a rewrite.",
            confidence: 0.9,
            autoApplicable: false,
            proposedChange: "Set skill.enabled = false until skill content is rewritten.",
          })
        );
      } else {
        maybeAdd(
          buildSuggestion({
            skillId: rec.skillId,
            skillName: rec.skillName,
            type: "refine_instructions",
            priority: "high",
            title: `Refine instructions for "${rec.skillName}"`,
            description: `Success rate is ${Math.round(successRate * 100)}% over ${rec.totalExecutions} executions.`,
            reasoning:
              "Skill success rate is below 50% with sufficient sample size — instructions likely need clarification or restructuring.",
            confidence: 0.8,
            autoApplicable: false,
            proposedChange:
              "Review the skill's ## Steps section, add explicit fallback instructions, and clarify tool usage.",
          })
        );
      }
    }

    // ── Rule 2: context_overflow failure mode ───────────────────────────────
    const overflowMode = rec.commonFailureModes.find(
      (fm) => fm.mode === "context_overflow"
    );
    if (overflowMode && overflowMode.count >= 2) {
      maybeAdd(
        buildSuggestion({
          skillId: rec.skillId,
          skillName: rec.skillName,
          type: "optimize_context",
          priority: overflowMode.count >= 5 ? "high" : "medium",
          title: `Optimize context for "${rec.skillName}"`,
          description: `Context overflow detected in ${overflowMode.count} executions.`,
          reasoning:
            "Repeated context overflow suggests the skill's instructions are too verbose or it loads too many examples.",
          confidence: 0.85,
          autoApplicable: true,
          proposedChange:
            "Trim skill content: remove duplicate examples, shorten explanations, and move reference material to a separate appendix skill.",
        })
      );
    }

    // ── Rule 3: No trigger keywords ─────────────────────────────────────────
    const liveSkill = liveSkillMap.get(rec.skillId);
    if (liveSkill) {
      let keywords: string[] = [];
      try {
        keywords = JSON.parse(liveSkill.triggerKeywords || "[]");
      } catch {
        keywords = [];
      }
      if (keywords.length === 0) {
        maybeAdd(
          buildSuggestion({
            skillId: rec.skillId,
            skillName: rec.skillName,
            type: "add_trigger_keywords",
            priority: "medium",
            title: `Add trigger keywords to "${rec.skillName}"`,
            description:
              "This skill has no trigger keywords, reducing auto-activation accuracy.",
            reasoning:
              "Skills without trigger keywords rely solely on description matching, leading to missed activations.",
            confidence: 0.75,
            autoApplicable: true,
            proposedChange: deriveKeywordsFromName(rec.skillName),
          })
        );
      }
    }

    // ── Rule 4: High success + slow duration ────────────────────────────────
    if (
      successRate > 0.8 &&
      rec.avgDurationMs > 30_000 &&
      rec.totalExecutions >= 5
    ) {
      maybeAdd(
        buildSuggestion({
          skillId: rec.skillId,
          skillName: rec.skillName,
          type: "optimize_context",
          priority: "low",
          title: `Speed-optimize "${rec.skillName}"`,
          description: `Average duration is ${(rec.avgDurationMs / 1000).toFixed(1)} s despite >80% success rate.`,
          reasoning:
            "The skill works correctly but is slow, likely due to verbose prompts or unnecessary sequential steps.",
          confidence: 0.7,
          autoApplicable: false,
          proposedChange:
            "Parallelise independent steps, reduce prompt verbosity, and cache repeated lookups.",
        })
      );
    }

    // ── Rule 5: Co-activation → merge suggestion ────────────────────────────
    const coMap = coActivationLog.get(rec.skillId);
    if (coMap) {
      for (const [partnerId, coCount] of coMap.entries()) {
        if (coCount >= 5) {
          const partnerRec = allRecords.find((r) => r.skillId === partnerId);
          const partnerName = partnerRec?.skillName ?? partnerId;
          // Only generate once (for the lexicographically smaller id)
          if (rec.skillId < partnerId) {
            maybeAdd(
              buildSuggestion({
                skillId: rec.skillId,
                skillName: rec.skillName,
                type: "merge_skills",
                priority: "low",
                title: `Merge "${rec.skillName}" and "${partnerName}"`,
                description: `These two skills co-activated ${coCount} times — they may address the same use-case.`,
                reasoning:
                  "Frequent co-activation indicates significant topic overlap; merging reduces redundancy and context overhead.",
                confidence: Math.min(0.5 + coCount * 0.05, 0.9),
                autoApplicable: false,
                proposedChange: `Combine content of "${rec.skillName}" and "${partnerName}" into a single unified skill.`,
              })
            );
          }
        }
      }
    }
  }

  const allSuggestions = [...existingSuggestions, ...newSuggestions];
  writeSuggestions(allSuggestions);
  return newSuggestions;
}

/**
 * Derive a sensible set of trigger keywords from a skill name as a JSON string.
 */
function deriveKeywordsFromName(skillName: string): string {
  const words = skillName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  // Remove stopwords
  const stopwords = new Set(["the", "and", "for", "with", "that", "this", "are"]);
  const filtered = words.filter((w) => !stopwords.has(w));
  return `Add trigger keywords: ${JSON.stringify(filtered)}`;
}

// ─── Query suggestions ─────────────────────────────────────────────────────────

export function getImprovementSuggestions(
  opts: {
    skillId?: string;
    status?: ImprovementSuggestion["status"];
    priority?: ImprovementSuggestion["priority"];
  } = {}
): ImprovementSuggestion[] {
  let suggestions = readSuggestions();

  if (opts.skillId !== undefined) {
    suggestions = suggestions.filter((s) => s.skillId === opts.skillId);
  }
  if (opts.status !== undefined) {
    suggestions = suggestions.filter((s) => s.status === opts.status);
  }
  if (opts.priority !== undefined) {
    suggestions = suggestions.filter((s) => s.priority === opts.priority);
  }

  return suggestions;
}

// ─── Apply / reject improvements ──────────────────────────────────────────────

/**
 * Apply an auto-applicable improvement suggestion.
 * Currently handles:
 *   - add_trigger_keywords: parses the proposedChange and updates the skill in storage
 *   - optimize_context: marks the suggestion applied (content edits require human review)
 */
export function applyImprovement(
  suggestionId: string
): { applied: boolean; reason: string } {
  const suggestions = readSuggestions();
  const idx = suggestions.findIndex((s) => s.id === suggestionId);

  if (idx === -1) {
    return { applied: false, reason: "Suggestion not found." };
  }

  const suggestion = suggestions[idx];

  if (suggestion.status !== "pending") {
    return {
      applied: false,
      reason: `Suggestion is already ${suggestion.status}.`,
    };
  }

  if (!suggestion.autoApplicable) {
    return {
      applied: false,
      reason: "This suggestion requires human review before it can be applied.",
    };
  }

  let applied = false;
  let reason = "";

  if (suggestion.type === "add_trigger_keywords") {
    applied = applyAddTriggerKeywords(suggestion);
    reason = applied
      ? "Trigger keywords extracted and added to the skill."
      : "Could not update skill — it may have been deleted or storage is unavailable.";
  } else if (suggestion.type === "optimize_context") {
    // Auto-mark as applied; actual content trimming is delegated to the next skill rewrite
    applied = true;
    reason =
      "Flagged for context optimisation; the skill will be trimmed on next update.";
  } else {
    return {
      applied: false,
      reason: `Auto-application is not implemented for type "${suggestion.type}".`,
    };
  }

  if (applied) {
    suggestions[idx] = { ...suggestion, status: "applied" };
    writeSuggestions(suggestions);

    // Record the improvement in the performance record
    recordImprovementHistory(suggestion.skillId, {
      id: suggestionId,
      type: mapSuggestionTypeToHistoryType(suggestion.type),
      description: suggestion.title,
      appliedAt: Date.now(),
      impact: "unknown",
    });
  }

  return { applied, reason };
}

function applyAddTriggerKeywords(suggestion: ImprovementSuggestion): boolean {
  try {
    const skill = storage.getSkill(suggestion.skillId);
    if (!skill) return false;

    // Extract keywords array from proposedChange string: 'Add trigger keywords: ["a","b",...]'
    let newKeywords: string[] = [];
    const match = suggestion.proposedChange?.match(/\[.*\]/);
    if (match) {
      newKeywords = JSON.parse(match[0]);
    }
    if (newKeywords.length === 0) return false;

    let existing: string[] = [];
    try {
      existing = JSON.parse(skill.triggerKeywords || "[]");
    } catch {
      existing = [];
    }

    const merged = Array.from(new Set([...existing, ...newKeywords]));
    storage.updateSkill(suggestion.skillId, {
      triggerKeywords: JSON.stringify(merged),
    });
    return true;
  } catch {
    return false;
  }
}

function mapSuggestionTypeToHistoryType(
  type: ImprovementSuggestion["type"]
): SkillPerformanceRecord["improvements"][number]["type"] {
  switch (type) {
    case "add_trigger_keywords":
      return "trigger_keyword_added";
    case "refine_instructions":
      return "content_refined";
    case "disable_skill":
      return "auto_disabled";
    case "optimize_context":
      return "content_refined";
    default:
      return "activation_condition_fixed";
  }
}

function recordImprovementHistory(
  skillId: string,
  entry: SkillPerformanceRecord["improvements"][number]
): void {
  const records = readPerformanceRecords();
  const idx = records.findIndex((r) => r.skillId === skillId);
  if (idx !== -1) {
    records[idx].improvements.push(entry);
    records[idx].updatedAt = Date.now();
    writePerformanceRecords(records);
  }
}

/**
 * Reject a suggestion (optionally recording the reason in its title).
 */
export function rejectImprovement(suggestionId: string, reason?: string): void {
  const suggestions = readSuggestions();
  const idx = suggestions.findIndex((s) => s.id === suggestionId);
  if (idx === -1) return;

  suggestions[idx] = {
    ...suggestions[idx],
    status: "rejected",
    ...(reason
      ? { reasoning: suggestions[idx].reasoning + ` [Rejected: ${reason}]` }
      : {}),
  };
  writeSuggestions(suggestions);
}

// ─── Health summary ────────────────────────────────────────────────────────────

/**
 * Return a health dashboard across all tracked skills.
 *
 * Healthy    — success rate ≥ 80%
 * Degraded   — 50% ≤ success rate < 80%
 * Failing    — success rate < 50% (with ≥ 5 executions)
 */
export function getSkillHealth(): {
  totalSkills: number;
  healthyCount: number;
  degradedCount: number;
  failingCount: number;
  topPerformers: string[];
  needsAttention: string[];
} {
  const records = analyzeAllSkills();

  let healthyCount = 0;
  let degradedCount = 0;
  let failingCount = 0;

  const scored = records.map((r) => {
    const successRate =
      r.totalExecutions > 0 ? r.successCount / r.totalExecutions : 1;
    return { name: r.skillName, successRate, quality: r.avgOutputQuality };
  });

  for (const s of scored) {
    if (s.successRate >= 0.8) healthyCount++;
    else if (s.successRate >= 0.5) degradedCount++;
    else failingCount++;
  }

  const topPerformers = scored
    .filter((s) => s.successRate >= 0.8)
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 5)
    .map((s) => s.name);

  const needsAttention = scored
    .filter((s) => s.successRate < 0.8)
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 5)
    .map((s) => s.name);

  return {
    totalSkills: records.length,
    healthyCount,
    degradedCount,
    failingCount,
    topPerformers,
    needsAttention,
  };
}

// ─── Auto-improve loop ─────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1_000; // 12 hours

/**
 * Start a recurring loop that:
 *   1. Generates improvement suggestions for all skills
 *   2. Auto-applies low-risk suggestions where confidence > 0.8:
 *      add_trigger_keywords, optimize_context
 *
 * Returns the timer handle so it can be cleared if needed.
 */
export function startAutoImproveLoop(
  intervalMs: number = DEFAULT_INTERVAL_MS
): NodeJS.Timeout {
  const runCycle = (): void => {
    try {
      console.log("[SkillAutoImprove] Running auto-improve cycle…");
      const newSuggestions = generateImprovements();
      console.log(
        `[SkillAutoImprove] Generated ${newSuggestions.length} new suggestions.`
      );

      // Auto-apply safe, high-confidence suggestions
      const autoApplyTypes: ImprovementSuggestion["type"][] = [
        "add_trigger_keywords",
        "optimize_context",
      ];

      const pending = getImprovementSuggestions({ status: "pending" }).filter(
        (s) =>
          s.autoApplicable &&
          s.confidence > 0.8 &&
          autoApplyTypes.includes(s.type)
      );

      let appliedCount = 0;
      for (const suggestion of pending) {
        const result = applyImprovement(suggestion.id);
        if (result.applied) appliedCount++;
      }

      if (appliedCount > 0) {
        console.log(
          `[SkillAutoImprove] Auto-applied ${appliedCount} improvement(s).`
        );
      }

      // Log health summary
      const health = getSkillHealth();
      console.log(
        `[SkillAutoImprove] Health — total: ${health.totalSkills}, ` +
          `healthy: ${health.healthyCount}, degraded: ${health.degradedCount}, ` +
          `failing: ${health.failingCount}`
      );
    } catch (err) {
      console.error("[SkillAutoImprove] Error in auto-improve cycle:", err);
    }
  };

  // Run once immediately, then on the interval
  runCycle();
  return setInterval(runCycle, intervalMs);
}
