/**
 * Self-Learning Engine — Layer 9
 *
 * Persists execution outcomes, detects patterns, derives actionable rules,
 * and surfaces recommendations so every future decision benefits from
 * everything the agent has already done.
 *
 * Storage (file-based, no external deps):
 *   /home/user/workspace/ultra-computer/data/learning/execution-log.json
 *   /home/user/workspace/ultra-computer/data/learning/rules.json
 */

import fs from "fs";
import { autonomyLogger } from "./logger.js";
import path from "path";
import crypto from "crypto";

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data/learning");
const EXECUTION_LOG_PATH = path.join(DATA_DIR, "execution-log.json");
const RULES_PATH = path.join(DATA_DIR, "rules.json");

// ─── Core Types ───────────────────────────────────────────────────────────────

export interface ExecutionEntry {
  id: string;
  timestamp: number;
  conversationId: string;
  // Task info
  taskType: string; // 'research' | 'code' | 'write' | 'analyze' | 'browse' | etc.
  taskDescription: string;
  skillsUsed: string[];
  modelUsed: string;
  // Outcome
  outcome: "success" | "partial" | "failure" | "timeout" | "user_correction";
  errorType?: string;
  errorMessage?: string;
  durationMs: number;
  retryCount: number;
  // Context signals
  inputTokenEstimate: number;
  outputTokenEstimate: number;
  toolCallCount: number;
  // User feedback (if any)
  userFeedback?: "positive" | "negative" | "correction";
  userCorrectionText?: string;
}

export interface LearningRule {
  id: string;
  type:
    | "model_preference"
    | "skill_routing"
    | "retry_strategy"
    | "avoid_pattern"
    | "optimization";
  condition: string;
  action: string;
  confidence: number; // 0–1
  evidenceCount: number;
  createdAt: number;
  lastValidatedAt: number;
}

// ─── Report Types ─────────────────────────────────────────────────────────────

export interface ModelStats {
  model: string;
  totalRuns: number;
  successRate: number; // 0–1
  avgDurationMs: number;
  failureTypes: Record<string, number>;
  bestTaskTypes: string[];
  worstTaskTypes: string[];
}

export interface ModelPerformanceReport {
  generatedAt: number;
  models: ModelStats[];
  rankedBySuccessRate: string[];
}

export interface SkillStats {
  skill: string;
  totalUses: number;
  successRate: number;
  avgQualityScore: number; // derived from outcome + feedback
  commonFailureModes: string[];
  taskTypeDistribution: Record<string, number>;
}

export interface SkillEffectivenessReport {
  generatedAt: number;
  skills: SkillStats[];
  rankedBySuccessRate: string[];
}

export interface FailureCluster {
  pattern: string;
  errorType: string;
  taskType: string;
  model: string;
  peakHour: number; // 0–23
  count: number;
  exampleMessages: string[];
}

export interface FailurePatternReport {
  generatedAt: number;
  topPatterns: FailureCluster[];
  totalFailures: number;
  failureRate: number;
}

export interface TaskInsight {
  taskType: string;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  bestModel: string;
  bestSkills: string[];
  commonPitfalls: string[];
  p50DurationMs: number;
  p95DurationMs: number;
}

export interface Recommendation {
  model: string;
  skills: string[];
  confidence: number;
  reasoning: string;
}

export interface LearningStats {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  topModel: string;
  topSkill: string;
  rulesCount: number;
  lastAnalysisAt: number | null;
}

export interface AnalysisResult {
  modelReport: ModelPerformanceReport;
  skillReport: SkillEffectivenessReport;
  failureReport: FailurePatternReport;
  newRules: LearningRule[];
}

// ─── File Helpers ─────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Clean up orphaned .tmp file on failure
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// ─── Execution Log ────────────────────────────────────────────────────────────

function loadLog(): ExecutionEntry[] {
  return readJson<ExecutionEntry[]>(EXECUTION_LOG_PATH, []);
}

function saveLog(entries: ExecutionEntry[]): void {
  writeJson(EXECUTION_LOG_PATH, entries);
}

function loadRules(): LearningRule[] {
  return readJson<LearningRule[]>(RULES_PATH, []);
}

function saveRules(rules: LearningRule[]): void {
  writeJson(RULES_PATH, rules);
}

// ─── Public API: Core Functions ───────────────────────────────────────────────

/**
 * Append a new execution entry to the log. Returns the persisted entry
 * (with generated id and timestamp).
 */
export function logExecution(
  entry: Omit<ExecutionEntry, "id" | "timestamp">
): ExecutionEntry {
  ensureDir();
  const full: ExecutionEntry = {
    ...entry,
    skillsUsed: Array.isArray(entry.skillsUsed) ? entry.skillsUsed : [],
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const log = loadLog();
  log.push(full);
  saveLog(log);
  return full;
}

/**
 * Attach user feedback to an already-logged execution.
 */
export function recordUserFeedback(
  executionId: string,
  feedback: "positive" | "negative" | "correction",
  correctionText?: string
): void {
  const log = loadLog();
  const idx = log.findIndex((e) => e.id === executionId);
  if (idx === -1) return;
  log[idx].userFeedback = feedback;
  if (correctionText) log[idx].userCorrectionText = correctionText;
  // Downgrade outcome if user corrected
  if (feedback === "correction" || feedback === "negative") {
    if (log[idx].outcome === "success") log[idx].outcome = "user_correction";
  }
  saveLog(log);
}

/**
 * Query the execution history with optional filters.
 */
export function getExecutionHistory(
  opts: {
    taskType?: string;
    model?: string;
    outcome?: ExecutionEntry["outcome"];
    limit?: number;
    offset?: number;
  } = {}
): ExecutionEntry[] {
  let entries = loadLog();

  if (opts.taskType) {
    entries = entries.filter((e) => e.taskType === opts.taskType);
  }
  if (opts.model) {
    entries = entries.filter((e) => e.modelUsed === opts.model);
  }
  if (opts.outcome) {
    entries = entries.filter((e) => e.outcome === opts.outcome);
  }

  // Newest-first
  entries = entries.slice().sort((a, b) => b.timestamp - a.timestamp);

  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? entries.length;
  return entries.slice(offset, offset + limit);
}

/**
 * Remove entries older than `keepDays` days (default 30). Returns counts.
 */
export function compactLog(keepDays = 30): { removed: number; remaining: number } {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const log = loadLog();
  const before = log.length;
  const filtered = log.filter((e) => e.timestamp >= cutoff);
  saveLog(filtered);
  return { removed: before - filtered.length, remaining: filtered.length };
}

/**
 * High-level stats snapshot.
 */
export function getLearningStats(): LearningStats {
  const log = loadLog();
  const rules = loadRules();

  const total = log.length;
  const successes = log.filter(
    (e) => e.outcome === "success" || e.outcome === "partial"
  ).length;
  const successRate = total > 0 ? successes / total : 0;
  const avgDuration =
    total > 0 ? log.reduce((s, e) => s + e.durationMs, 0) / total : 0;

  // Top model by success rate (min 3 runs)
  const modelMap: Record<string, { ok: number; total: number }> = {};
  for (const e of log) {
    if (!modelMap[e.modelUsed]) modelMap[e.modelUsed] = { ok: 0, total: 0 };
    modelMap[e.modelUsed].total++;
    if (e.outcome === "success") modelMap[e.modelUsed].ok++;
  }
  const topModel = Object.entries(modelMap)
    .filter(([, v]) => v.total >= 3)
    .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total)[0]?.[0] ?? "";

  // Top skill by success rate (min 3 uses)
  const skillMap: Record<string, { ok: number; total: number }> = {};
  for (const e of log) {
    for (const sk of (e.skillsUsed || [])) {
      if (!skillMap[sk]) skillMap[sk] = { ok: 0, total: 0 };
      skillMap[sk].total++;
      if (e.outcome === "success") skillMap[sk].ok++;
    }
  }
  const topSkill = Object.entries(skillMap)
    .filter(([, v]) => v.total >= 3)
    .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total)[0]?.[0] ?? "";

  // lastAnalysisAt: max createdAt across rules
  const lastAnalysisAt =
    rules.length > 0
      ? rules.reduce((max, r) => Math.max(max, r.lastValidatedAt), 0)
      : null;

  return {
    totalExecutions: total,
    successRate,
    avgDuration,
    topModel,
    topSkill,
    rulesCount: rules.length,
    lastAnalysisAt,
  };
}

// ─── Pattern Analysis Engine ──────────────────────────────────────────────────

function isSuccess(outcome: ExecutionEntry["outcome"]): boolean {
  return outcome === "success";
}

function qualityScore(e: ExecutionEntry): number {
  // 0–1 score: outcome + user feedback
  let score = 0;
  switch (e.outcome) {
    case "success":
      score = 1.0;
      break;
    case "partial":
      score = 0.5;
      break;
    case "user_correction":
      score = 0.3;
      break;
    case "failure":
      score = 0.1;
      break;
    case "timeout":
      score = 0.0;
      break;
  }
  if (e.userFeedback === "positive") score = Math.min(1, score + 0.1);
  if (e.userFeedback === "negative") score = Math.max(0, score - 0.2);
  if (e.userFeedback === "correction") score = Math.max(0, score - 0.15);
  return score;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

/**
 * For each model: success rate, avg duration, failure types, best/worst task types.
 */
export function analyzeModelPerformance(): ModelPerformanceReport {
  const log = loadLog();

  // Group by model
  const byModel: Record<string, ExecutionEntry[]> = {};
  for (const e of log) {
    (byModel[e.modelUsed] ??= []).push(e);
  }

  const models: ModelStats[] = Object.entries(byModel).map(([model, entries]) => {
    const total = entries.length;
    const successes = entries.filter((e) => isSuccess(e.outcome)).length;
    const successRate = successes / total;
    const avgDurationMs =
      entries.reduce((s, e) => s + e.durationMs, 0) / total;

    // Failure types
    const failureTypes: Record<string, number> = {};
    for (const e of entries.filter((e) => !isSuccess(e.outcome))) {
      const t = e.errorType ?? e.outcome;
      failureTypes[t] = (failureTypes[t] ?? 0) + 1;
    }

    // Task-type success rates
    const taskSR: Record<string, { ok: number; total: number }> = {};
    for (const e of entries) {
      (taskSR[e.taskType] ??= { ok: 0, total: 0 }).total++;
      if (isSuccess(e.outcome)) taskSR[e.taskType].ok++;
    }
    const taskRanked = Object.entries(taskSR)
      .filter(([, v]) => v.total >= 2)
      .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total);

    const bestTaskTypes = taskRanked.slice(0, 3).map(([t]) => t);
    const worstTaskTypes = taskRanked
      .slice(-3)
      .reverse()
      .map(([t]) => t);

    return {
      model,
      totalRuns: total,
      successRate,
      avgDurationMs,
      failureTypes,
      bestTaskTypes,
      worstTaskTypes,
    };
  });

  const rankedBySuccessRate = models
    .slice()
    .sort((a, b) => b.successRate - a.successRate)
    .map((m) => m.model);

  return { generatedAt: Date.now(), models, rankedBySuccessRate };
}

/**
 * For each skill: success rate, avg quality score, common failure modes.
 */
export function analyzeSkillEffectiveness(): SkillEffectivenessReport {
  const log = loadLog();

  const bySkill: Record<string, ExecutionEntry[]> = {};
  for (const e of log) {
    for (const sk of (e.skillsUsed || [])) {
      (bySkill[sk] ??= []).push(e);
    }
  }

  const skills: SkillStats[] = Object.entries(bySkill).map(([skill, entries]) => {
    const total = entries.length;
    const successes = entries.filter((e) => isSuccess(e.outcome)).length;
    const successRate = successes / total;
    const avgQualityScore =
      entries.reduce((s, e) => s + qualityScore(e), 0) / total;

    // Failure modes: error types on non-success runs
    const fmCount: Record<string, number> = {};
    for (const e of entries.filter((e) => !isSuccess(e.outcome))) {
      const t = e.errorType ?? e.outcome;
      fmCount[t] = (fmCount[t] ?? 0) + 1;
    }
    const commonFailureModes = Object.entries(fmCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t]) => t);

    const taskDist: Record<string, number> = {};
    for (const e of entries) {
      taskDist[e.taskType] = (taskDist[e.taskType] ?? 0) + 1;
    }

    return {
      skill,
      totalUses: total,
      successRate,
      avgQualityScore,
      commonFailureModes,
      taskTypeDistribution: taskDist,
    };
  });

  const rankedBySuccessRate = skills
    .slice()
    .sort((a, b) => b.successRate - a.successRate)
    .map((s) => s.skill);

  return { generatedAt: Date.now(), skills, rankedBySuccessRate };
}

/**
 * Cluster failures and return top 5 recurring patterns.
 */
export function analyzeFailurePatterns(): FailurePatternReport {
  const log = loadLog();
  const failures = log.filter((e) => !isSuccess(e.outcome));
  const total = log.length;

  // Cluster key: errorType + taskType + model
  const clusters: Record<
    string,
    { entries: ExecutionEntry[]; errorType: string; taskType: string; model: string }
  > = {};

  for (const e of failures) {
    const key = `${e.errorType ?? e.outcome}||${e.taskType}||${e.modelUsed}`;
    if (!clusters[key]) {
      clusters[key] = {
        entries: [],
        errorType: e.errorType ?? e.outcome,
        taskType: e.taskType,
        model: e.modelUsed,
      };
    }
    clusters[key].entries.push(e);
  }

  const topPatterns: FailureCluster[] = Object.entries(clusters)
    .map(([, c]) => {
      // Peak hour
      const hourCount: Record<number, number> = {};
      for (const e of c.entries) {
        const h = new Date(e.timestamp).getHours();
        hourCount[h] = (hourCount[h] ?? 0) + 1;
      }
      const peakHour = Number(
        Object.entries(hourCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 0
      );

      const exampleMessages = c.entries
        .slice(0, 3)
        .map((e) => e.errorMessage ?? e.taskDescription)
        .filter(Boolean) as string[];

      const pattern = `${c.errorType} on "${c.taskType}" tasks using ${c.model}`;

      return {
        pattern,
        errorType: c.errorType,
        taskType: c.taskType,
        model: c.model,
        peakHour,
        count: c.entries.length,
        exampleMessages,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    generatedAt: Date.now(),
    topPatterns,
    totalFailures: failures.length,
    failureRate: total > 0 ? failures.length / total : 0,
  };
}

/**
 * Insights for a specific task type.
 */
export function getTaskTypeInsights(taskType: string): TaskInsight {
  const log = loadLog().filter((e) => e.taskType === taskType);

  const total = log.length;
  const successes = log.filter((e) => isSuccess(e.outcome)).length;
  const successRate = total > 0 ? successes / total : 0;
  const avgDurationMs =
    total > 0 ? log.reduce((s, e) => s + e.durationMs, 0) / total : 0;

  // Percentiles
  const sorted = log.map((e) => e.durationMs).sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);

  // Best model
  const modelSR: Record<string, { ok: number; total: number }> = {};
  for (const e of log) {
    (modelSR[e.modelUsed] ??= { ok: 0, total: 0 }).total++;
    if (isSuccess(e.outcome)) modelSR[e.modelUsed].ok++;
  }
  const bestModel =
    Object.entries(modelSR)
      .filter(([, v]) => v.total >= 2)
      .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total)[0]?.[0] ?? "";

  // Best skills
  const skillSR: Record<string, { ok: number; total: number }> = {};
  for (const e of log) {
    for (const sk of (e.skillsUsed || [])) {
      (skillSR[sk] ??= { ok: 0, total: 0 }).total++;
      if (isSuccess(e.outcome)) skillSR[sk].ok++;
    }
  }
  const bestSkills = Object.entries(skillSR)
    .filter(([, v]) => v.total >= 2)
    .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total)
    .slice(0, 3)
    .map(([sk]) => sk);

  // Common pitfalls: error types + negative feedback
  const pitfallCount: Record<string, number> = {};
  for (const e of log.filter((e) => !isSuccess(e.outcome))) {
    const t = e.errorType ?? e.outcome;
    pitfallCount[t] = (pitfallCount[t] ?? 0) + 1;
  }
  const commonPitfalls = Object.entries(pitfallCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([t]) => t);

  return {
    taskType,
    totalRuns: total,
    successRate,
    avgDurationMs,
    bestModel,
    bestSkills,
    commonPitfalls,
    p50DurationMs: p50,
    p95DurationMs: p95,
  };
}

/**
 * Given a new task type and available model list, recommend the best setup.
 */
export function getRecommendation(
  taskType: string,
  availableModels: string[]
): Recommendation {
  const log = loadLog().filter((e) => e.taskType === taskType);
  const rules = loadRules().filter((r) => r.type === "model_preference");

  if (log.length === 0) {
    // No history — just return first available
    return {
      model: availableModels[0] ?? "",
      skills: [],
      confidence: 0.1,
      reasoning: "No historical data for this task type. Using default model.",
    };
  }

  // Compute success rates per model (intersection with availableModels)
  const modelSR: Record<string, { ok: number; total: number }> = {};
  for (const e of log) {
    if (!availableModels.includes(e.modelUsed)) continue;
    (modelSR[e.modelUsed] ??= { ok: 0, total: 0 }).total++;
    if (isSuccess(e.outcome)) modelSR[e.modelUsed].ok++;
  }

  const ranked = Object.entries(modelSR)
    .filter(([, v]) => v.total >= 2)
    .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total);

  let model = ranked[0]?.[0] ?? availableModels[0] ?? "";
  const modelStats = modelSR[model];

  // Check if a rule overrides
  const relevantRule = rules.find(
    (r) =>
      r.condition.toLowerCase().includes(taskType.toLowerCase()) &&
      r.confidence > 0.7
  );
  if (relevantRule) {
    // Parse model name from action string heuristically: "prefer <model>"
    const match = relevantRule.action.match(/prefer\s+(\S+)/i);
    if (match && availableModels.includes(match[1])) {
      model = match[1];
    }
  }

  // Best skills
  const skillSR: Record<string, { ok: number; total: number }> = {};
  for (const e of log) {
    for (const sk of (e.skillsUsed || [])) {
      (skillSR[sk] ??= { ok: 0, total: 0 }).total++;
      if (isSuccess(e.outcome)) skillSR[sk].ok++;
    }
  }
  const bestSkills = Object.entries(skillSR)
    .filter(([, v]) => v.total >= 2)
    .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total)
    .slice(0, 3)
    .map(([sk]) => sk);

  // Confidence: based on sample size and success consistency
  const evidenceCount = log.length;
  const confidence = Math.min(
    0.99,
    0.3 + 0.1 * Math.log10(Math.max(1, evidenceCount)) +
      (modelStats ? modelStats.ok / modelStats.total : 0) * 0.4
  );

  const srPct = modelStats
    ? `${((modelStats.ok / modelStats.total) * 100).toFixed(0)}% success rate`
    : "no per-model data";

  const reasoning =
    `Based on ${evidenceCount} historical "${taskType}" executions, ` +
    `model "${model}" has ${srPct}. ` +
    (bestSkills.length > 0
      ? `Top skills: ${bestSkills.join(", ")}.`
      : "No skill preference found.");

  return { model, skills: bestSkills, confidence, reasoning };
}

// ─── Learning Rules Engine ────────────────────────────────────────────────────

const MIN_EVIDENCE = 5; // minimum data points to emit a rule
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Derive actionable learning rules from the current execution log.
 * Merges with existing rules (updates evidence counts / timestamps).
 */
export function deriveLearningRules(): LearningRule[] {
  const log = loadLog();
  const existingRules = loadRules();
  const now = Date.now();
  const newRules: LearningRule[] = [];

  // ── 1. Model preference rules (per task type) ────────────────────────────
  const taskModelMatrix: Record<
    string,
    Record<string, { ok: number; total: number }>
  > = {};
  for (const e of log) {
    (taskModelMatrix[e.taskType] ??= {})[e.modelUsed] ??= { ok: 0, total: 0 };
    taskModelMatrix[e.taskType][e.modelUsed].total++;
    if (isSuccess(e.outcome))
      taskModelMatrix[e.taskType][e.modelUsed].ok++;
  }

  for (const [taskType, models] of Object.entries(taskModelMatrix)) {
    const ranked = Object.entries(models)
      .filter(([, v]) => v.total >= MIN_EVIDENCE)
      .sort(([, a], [, b]) => b.ok / b.total - a.ok / a.total);

    if (ranked.length < 2) continue;

    const [bestModel, bestStats] = ranked[0];
    const [worstModel, worstStats] = ranked[ranked.length - 1];
    const bestSR = bestStats.ok / bestStats.total;
    const worstSR = worstStats.ok / worstStats.total;

    if (bestSR - worstSR < 0.1) continue; // not meaningful enough

    const evidenceCount =
      bestStats.total + worstStats.total;
    const confidence = Math.min(
      0.99,
      CONFIDENCE_THRESHOLD + 0.15 * (bestSR - worstSR) + 0.01 * evidenceCount
    );

    const ruleId = `model_pref_${taskType}_${bestModel}`;
    newRules.push({
      id: ruleId,
      type: "model_preference",
      condition: `Task type is "${taskType}"`,
      action: `prefer ${bestModel} — ${(bestSR * 100).toFixed(0)}% success vs ${(worstSR * 100).toFixed(0)}% for ${worstModel}`,
      confidence,
      evidenceCount,
      createdAt: now,
      lastValidatedAt: now,
    });
  }

  // ── 2. Skill routing rules ───────────────────────────────────────────────
  const taskSkillMatrix: Record<
    string,
    Record<string, { ok: number; total: number }>
  > = {};
  for (const e of log) {
    for (const sk of (e.skillsUsed || [])) {
      (taskSkillMatrix[e.taskType] ??= {})[sk] ??= { ok: 0, total: 0 };
      taskSkillMatrix[e.taskType][sk].total++;
      if (isSuccess(e.outcome)) taskSkillMatrix[e.taskType][sk].ok++;
    }
  }

  for (const [taskType, skills] of Object.entries(taskSkillMatrix)) {
    for (const [skill, stats] of Object.entries(skills)) {
      if (stats.total < MIN_EVIDENCE) continue;
      const sr = stats.ok / stats.total;
      if (sr >= 0.8) {
        const ruleId = `skill_route_${taskType}_${skill}`;
        newRules.push({
          id: ruleId,
          type: "skill_routing",
          condition: `Task type is "${taskType}"`,
          action: `include skill "${skill}" (${(sr * 100).toFixed(0)}% success rate over ${stats.total} uses)`,
          confidence: Math.min(0.95, 0.6 + 0.05 * stats.total),
          evidenceCount: stats.total,
          createdAt: now,
          lastValidatedAt: now,
        });
      } else if (sr <= 0.4) {
        const ruleId = `avoid_skill_${taskType}_${skill}`;
        newRules.push({
          id: ruleId,
          type: "avoid_pattern",
          condition: `Task type is "${taskType}"`,
          action: `avoid skill "${skill}" (only ${(sr * 100).toFixed(0)}% success rate over ${stats.total} uses)`,
          confidence: Math.min(0.9, 0.55 + 0.04 * stats.total),
          evidenceCount: stats.total,
          createdAt: now,
          lastValidatedAt: now,
        });
      }
    }
  }

  // ── 3. Retry strategy rules ──────────────────────────────────────────────
  const retryGroups: Record<string, ExecutionEntry[]> = {};
  for (const e of log.filter((e) => e.retryCount > 0)) {
    (retryGroups[e.taskType] ??= []).push(e);
  }

  for (const [taskType, entries] of Object.entries(retryGroups)) {
    if (entries.length < MIN_EVIDENCE) continue;
    const retriedAndSucceeded = entries.filter((e) => isSuccess(e.outcome)).length;
    const retrySuccessRate = retriedAndSucceeded / entries.length;
    if (retrySuccessRate > 0.6) {
      const ruleId = `retry_${taskType}`;
      newRules.push({
        id: ruleId,
        type: "retry_strategy",
        condition: `Task type is "${taskType}" and initial attempt fails`,
        action: `retry up to ${Math.ceil(entries.reduce((s, e) => s + e.retryCount, 0) / entries.length)} times — retry succeeds ${(retrySuccessRate * 100).toFixed(0)}% of the time`,
        confidence: Math.min(0.9, 0.5 + 0.1 * retrySuccessRate),
        evidenceCount: entries.length,
        createdAt: now,
        lastValidatedAt: now,
      });
    }
  }

  // ── 4. Avoid-pattern: large input → failure ──────────────────────────────
  // Find skills that fail disproportionately at high token counts
  const skillTokenFailure: Record<
    string,
    { highFail: number; highTotal: number; lowFail: number; lowTotal: number }
  > = {};
  const TOKEN_THRESHOLD = 5000;

  for (const e of log) {
    for (const sk of (e.skillsUsed || [])) {
      skillTokenFailure[sk] ??= {
        highFail: 0, highTotal: 0, lowFail: 0, lowTotal: 0,
      };
      const bucket = e.inputTokenEstimate > TOKEN_THRESHOLD ? "high" : "low";
      skillTokenFailure[sk][`${bucket}Total`]++;
      if (!isSuccess(e.outcome)) skillTokenFailure[sk][`${bucket}Fail`]++;
    }
  }

  for (const [skill, s] of Object.entries(skillTokenFailure)) {
    if (s.highTotal < MIN_EVIDENCE) continue;
    const highFailRate = s.highFail / s.highTotal;
    const lowFailRate = s.lowTotal > 0 ? s.lowFail / s.lowTotal : 0;
    if (highFailRate - lowFailRate > 0.2) {
      const ruleId = `avoid_high_token_${skill}`;
      newRules.push({
        id: ruleId,
        type: "avoid_pattern",
        condition: `Skill "${skill}" is requested with input > ${TOKEN_THRESHOLD} tokens`,
        action: `add context compaction before invoking "${skill}" — fails ${(highFailRate * 100).toFixed(0)}% at high token counts vs ${(lowFailRate * 100).toFixed(0)}% otherwise`,
        confidence: Math.min(0.9, 0.55 + 0.05 * s.highTotal),
        evidenceCount: s.highTotal,
        createdAt: now,
        lastValidatedAt: now,
      });
    }
  }

  // ── 5. Optimization: consistently fast task+model combos ─────────────────
  const durationMatrix: Record<string, number[]> = {};
  for (const e of log.filter((e) => isSuccess(e.outcome))) {
    const key = `${e.taskType}||${e.modelUsed}`;
    (durationMatrix[key] ??= []).push(e.durationMs);
  }

  const globalAvg =
    log.length > 0
      ? log.reduce((s, e) => s + e.durationMs, 0) / log.length
      : 1;

  for (const [key, durations] of Object.entries(durationMatrix)) {
    if (durations.length < MIN_EVIDENCE) continue;
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    if (avg < globalAvg * 0.6) {
      const [taskType, model] = key.split("||");
      const ruleId = `fast_combo_${taskType}_${model}`;
      newRules.push({
        id: ruleId,
        type: "optimization",
        condition: `Task type is "${taskType}" and latency is a priority`,
        action: `use model "${model}" — avg ${(avg / 1000).toFixed(1)}s (${(((globalAvg - avg) / globalAvg) * 100).toFixed(0)}% faster than average)`,
        confidence: Math.min(0.85, 0.5 + 0.04 * durations.length),
        evidenceCount: durations.length,
        createdAt: now,
        lastValidatedAt: now,
      });
    }
  }

  // ── Merge with existing rules ────────────────────────────────────────────
  const mergedMap: Record<string, LearningRule> = {};
  for (const r of existingRules) {
    mergedMap[r.id] = r;
  }
  for (const r of newRules) {
    if (mergedMap[r.id]) {
      // Update evidence + re-validate; preserve original createdAt
      mergedMap[r.id] = {
        ...r,
        createdAt: mergedMap[r.id].createdAt,
        lastValidatedAt: now,
      };
    } else {
      mergedMap[r.id] = r;
    }
  }

  const finalRules = Object.values(mergedMap);
  saveRules(finalRules);
  return finalRules;
}

// ─── Full Analysis Pass ───────────────────────────────────────────────────────

/**
 * Run all analyses in one shot. Returns the composite report and
 * persists updated rules.
 */
export function runAnalysis(): AnalysisResult {
  const modelReport = analyzeModelPerformance();
  const skillReport = analyzeSkillEffectiveness();
  const failureReport = analyzeFailurePatterns();
  const newRules = deriveLearningRules();

  return { modelReport, skillReport, failureReport, newRules };
}

// ─── Auto-Analysis Loop ───────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Start a background analysis loop. Runs `runAnalysis()` immediately and
 * then every `intervalMs` milliseconds (default 6 h).
 * Returns the interval handle so callers can clear it if needed.
 */
export function startLearningLoop(
  intervalMs: number = DEFAULT_INTERVAL_MS
): NodeJS.Timeout {
  // Run once at startup
  try {
    runAnalysis();
  } catch (err) {
    autonomyLogger.error({ err }, "SelfLearning: initial analysis failed");
  }

  const handle = setInterval(() => {
    try {
      const result = runAnalysis();
      autonomyLogger.info({ newRules: result.newRules.length, failureRate: (result.failureReport.failureRate * 100).toFixed(1) }, "SelfLearning: analysis complete");
    } catch (err) {
      autonomyLogger.error({ err }, "SelfLearning: scheduled analysis failed");
    }
  }, intervalMs);

  // Do not keep process alive solely because of this timer
  if (handle.unref) handle.unref();

  return handle;
}
