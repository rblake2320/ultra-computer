/**
 * Telemetry Engine — Privacy-Aware Data Collection & Platform Learning
 *
 * Controls what execution data is collected based on user privacy preferences.
 * Provides:
 *  1. Privacy-aware logging middleware (wraps selfLearning.logExecution)
 *  2. Anonymization pipeline (hash PII, strip text, keep only stats)
 *  3. Aggregate analytics computation (cross-user learning without individual data)
 *  4. Data export (user can download all their data)
 *  5. Data purge (user can delete all their data)
 *  6. Retention enforcement (auto-purge old data)
 */

import crypto from "crypto";
import { db } from "./storage.js";
import {
  telemetrySettings,
  aggregateAnalytics,
  type TelemetrySetting,
  type InsertTelemetrySetting,
} from "../shared/schema.js";
import { eq } from "drizzle-orm";
import {
  logExecution,
  getExecutionHistory,
  type ExecutionEntry,
} from "./selfLearning.js";
import * as fs from "fs";
import * as path from "path";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_USER_ID = "default";
const HASH_SALT = "ultra-computer-telemetry-v1";

export type ConsentLevel = "full" | "anonymized" | "aggregate" | "none";
export type UserTier = "free" | "pro" | "enterprise";

// Which consent levels are available per tier
const TIER_ALLOWED_CONSENT: Record<UserTier, ConsentLevel[]> = {
  free: ["full", "anonymized"], // Free users must share at least anonymized data
  pro: ["full", "anonymized", "aggregate", "none"], // Pro can fully opt out
  enterprise: ["full", "anonymized", "aggregate", "none"],
};

// ─── Settings Management ────────────────────────────────────────────────────

export function getTelemetrySettings(
  userId: string = DEFAULT_USER_ID
): TelemetrySetting {
  const existing = db
    .select()
    .from(telemetrySettings)
    .where(eq(telemetrySettings.userId, userId))
    .get();

  if (existing) return existing;

  // Create default settings
  const defaults: InsertTelemetrySetting = {
    userId,
    consentLevel: "full",
    logTaskDescriptions: true,
    logModelUsage: true,
    logToolCalls: true,
    logTokenCounts: true,
    logErrorDetails: true,
    logUserFeedback: true,
    retentionDays: 90,
    shareAnonymizedForPlatformLearning: true,
    tier: "free",
  };

  return db.insert(telemetrySettings).values(defaults).returning().get();
}

export function updateTelemetrySettings(
  userId: string = DEFAULT_USER_ID,
  updates: Partial<
    Omit<InsertTelemetrySetting, "userId" | "createdAt" | "updatedAt">
  >
): TelemetrySetting {
  const current = getTelemetrySettings(userId);
  const tier = (updates.tier || current.tier) as UserTier;

  // Validate consent level against tier
  if (updates.consentLevel) {
    const allowed = TIER_ALLOWED_CONSENT[tier] || TIER_ALLOWED_CONSENT.free;
    if (!allowed.includes(updates.consentLevel as ConsentLevel)) {
      throw new Error(
        `Consent level "${updates.consentLevel}" not available on "${tier}" tier. ` +
          `Available: ${allowed.join(", ")}. Upgrade to Pro for full opt-out.`
      );
    }
  }

  return db
    .update(telemetrySettings)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(telemetrySettings.userId, userId))
    .returning()
    .get();
}

// ─── Anonymization ──────────────────────────────────────────────────────────

function hashText(text: string): string {
  return crypto
    .createHash("sha256")
    .update(HASH_SALT + text)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Strip/hash PII from an execution entry based on consent level.
 */
function anonymizeEntry(
  entry: Omit<ExecutionEntry, "id" | "timestamp">,
  settings: TelemetrySetting
): Omit<ExecutionEntry, "id" | "timestamp"> {
  const level = settings.consentLevel as ConsentLevel;
  const result = { ...entry };

  if (level === "anonymized" || level === "aggregate") {
    // Hash the conversation ID so it's not traceable to a user
    if (result.conversationId) {
      result.conversationId = hashText(result.conversationId);
    }
  }

  // Task description handling
  if (!settings.logTaskDescriptions || level === "aggregate") {
    result.taskDescription = `[redacted:${hashText(entry.taskDescription || "")}]`;
  } else if (level === "anonymized") {
    // Keep task type but anonymize the description
    result.taskDescription = `[anonymized:${entry.taskType}]`;
  }

  // Model usage
  if (!settings.logModelUsage) {
    result.modelUsed = "[redacted]";
  }

  // Tool calls
  if (!settings.logToolCalls) {
    result.toolCallCount = 0;
    result.skillsUsed = [];
  }

  // Token counts
  if (!settings.logTokenCounts || level === "aggregate") {
    result.inputTokenEstimate = 0;
    result.outputTokenEstimate = 0;
  }

  // Error details
  if (!settings.logErrorDetails) {
    result.errorType = result.errorType ? "[redacted]" : undefined;
    result.errorMessage = undefined;
  }

  // User feedback
  if (!settings.logUserFeedback) {
    result.userFeedback = undefined;
    result.userCorrectionText = undefined;
  } else if (level === "anonymized" || level === "aggregate") {
    // Keep the rating, strip the text
    result.userCorrectionText = undefined;
  }

  return result;
}

// ─── Privacy-Aware Logging (wraps selfLearning.logExecution) ────────────────

/**
 * Log an execution entry respecting user privacy settings.
 * Call this instead of selfLearning.logExecution directly.
 */
export function logExecutionWithPrivacy(
  entry: Omit<ExecutionEntry, "id" | "timestamp">,
  userId: string = DEFAULT_USER_ID
): ExecutionEntry | null {
  const settings = getTelemetrySettings(userId);
  const level = settings.consentLevel as ConsentLevel;

  // Fully opted out — collect nothing
  if (level === "none") {
    return null;
  }

  // Aggregate only — don't log individual entries, just update aggregates
  if (level === "aggregate") {
    updateAggregateFromEntry(entry);
    return null;
  }

  // Anonymize if needed
  const processedEntry =
    level === "anonymized" ? anonymizeEntry(entry, settings) : entry;

  // Apply granular controls even in "full" mode
  const finalEntry = level === "full"
    ? applyGranularControls(processedEntry, settings)
    : processedEntry;

  // Log to the execution log
  const logged = logExecution(finalEntry);

  // Also update aggregates (always, for platform learning)
  if (settings.shareAnonymizedForPlatformLearning) {
    updateAggregateFromEntry(entry);
  }

  return logged;
}

function applyGranularControls(
  entry: Omit<ExecutionEntry, "id" | "timestamp">,
  settings: TelemetrySetting
): Omit<ExecutionEntry, "id" | "timestamp"> {
  const result = { ...entry };

  if (!settings.logTaskDescriptions) {
    result.taskDescription = `[opted-out:${entry.taskType}]`;
  }
  if (!settings.logModelUsage) {
    result.modelUsed = "[opted-out]";
  }
  if (!settings.logToolCalls) {
    result.toolCallCount = 0;
    result.skillsUsed = [];
  }
  if (!settings.logTokenCounts) {
    result.inputTokenEstimate = 0;
    result.outputTokenEstimate = 0;
  }
  if (!settings.logErrorDetails) {
    result.errorType = result.errorType ? "[opted-out]" : undefined;
    result.errorMessage = undefined;
  }
  if (!settings.logUserFeedback) {
    result.userFeedback = undefined;
    result.userCorrectionText = undefined;
  }

  return result;
}

// ─── Aggregate Analytics ────────────────────────────────────────────────────

function updateAggregateFromEntry(
  entry: Omit<ExecutionEntry, "id" | "timestamp">
): void {
  const now = Date.now();
  const hourStart = now - (now % (60 * 60 * 1000)); // Round down to hour
  const hourEnd = hourStart + 60 * 60 * 1000;
  const periodId = `hourly-${hourStart}`;

  let agg = db
    .select()
    .from(aggregateAnalytics)
    .where(eq(aggregateAnalytics.id, periodId))
    .get();

  if (!agg) {
    // Create new period
    agg = db
      .insert(aggregateAnalytics)
      .values({
        id: periodId,
        period: "hourly",
        periodStart: hourStart,
        periodEnd: hourEnd,
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        partialCount: 0,
        modelUsageDistribution: "{}",
        taskTypeDistribution: "{}",
        errorDistribution: "{}",
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRetries: 0,
        totalFallbacks: 0,
        positiveRatings: 0,
        negativeRatings: 0,
      })
      .returning()
      .get();
  }

  // Update counts
  const modelDist = JSON.parse(agg.modelUsageDistribution || "{}");
  const taskDist = JSON.parse(agg.taskTypeDistribution || "{}");
  const errorDist = JSON.parse(agg.errorDistribution || "{}");

  // Anonymize model ID in aggregates (just use provider prefix)
  const modelKey = entry.modelUsed === "swarm" ? "swarm" : hashText(entry.modelUsed).slice(0, 8);
  modelDist[modelKey] = (modelDist[modelKey] || 0) + 1;
  taskDist[entry.taskType] = (taskDist[entry.taskType] || 0) + 1;

  if (entry.errorType) {
    errorDist[entry.errorType] = (errorDist[entry.errorType] || 0) + 1;
  }

  const updates: Record<string, any> = {
    totalExecutions: (agg.totalExecutions ?? 0) + 1,
    modelUsageDistribution: JSON.stringify(modelDist),
    taskTypeDistribution: JSON.stringify(taskDist),
    errorDistribution: JSON.stringify(errorDist),
    totalInputTokens: (agg.totalInputTokens ?? 0) + (entry.inputTokenEstimate || 0),
    totalOutputTokens: (agg.totalOutputTokens ?? 0) + (entry.outputTokenEstimate || 0),
    totalRetries: (agg.totalRetries ?? 0) + (entry.retryCount || 0),
  };

  // Outcome counts
  if (entry.outcome === "success") updates.successCount = (agg.successCount ?? 0) + 1;
  else if (entry.outcome === "failure" || entry.outcome === "timeout") updates.failureCount = (agg.failureCount ?? 0) + 1;
  else if (entry.outcome === "partial") updates.partialCount = (agg.partialCount ?? 0) + 1;

  // Feedback
  if (entry.userFeedback === "positive") updates.positiveRatings = (agg.positiveRatings ?? 0) + 1;
  else if (entry.userFeedback === "negative" || entry.userFeedback === "correction") updates.negativeRatings = (agg.negativeRatings ?? 0) + 1;

  db.update(aggregateAnalytics)
    .set(updates)
    .where(eq(aggregateAnalytics.id, periodId))
    .run();
}

/**
 * Get aggregate analytics for a time range, rolled up by period.
 */
export function getAggregateAnalytics(
  period: "hourly" | "daily" | "weekly" = "daily",
  limit: number = 30
): any[] {
  return db
    .select()
    .from(aggregateAnalytics)
    .where(eq(aggregateAnalytics.period, period))
    .limit(limit)
    .all()
    .map((a) => ({
      ...a,
      modelUsageDistribution: JSON.parse(a.modelUsageDistribution || "{}"),
      taskTypeDistribution: JSON.parse(a.taskTypeDistribution || "{}"),
      errorDistribution: JSON.parse(a.errorDistribution || "{}"),
    }));
}

/**
 * Roll up hourly aggregates into daily/weekly summaries.
 */
export function rollUpAggregates(): { daily: number; weekly: number } {
  const hourlyRecords = db
    .select()
    .from(aggregateAnalytics)
    .where(eq(aggregateAnalytics.period, "hourly"))
    .all();

  let dailyCount = 0;
  let weeklyCount = 0;

  // Group by day
  const byDay = new Map<string, typeof hourlyRecords>();
  for (const h of hourlyRecords) {
    const dayStart = h.periodStart - (h.periodStart % (24 * 60 * 60 * 1000));
    const key = `daily-${dayStart}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(h);
  }

  for (const [dayId, records] of byDay) {
    const dayStart = records[0].periodStart - (records[0].periodStart % (24 * 60 * 60 * 1000));
    const existing = db.select().from(aggregateAnalytics).where(eq(aggregateAnalytics.id, dayId)).get();
    if (existing) continue; // Already rolled up

    const merged = mergeAggregates(records, "daily", dayStart, dayStart + 24 * 60 * 60 * 1000);
    db.insert(aggregateAnalytics).values({ ...merged, id: dayId }).run();
    dailyCount++;
  }

  return { daily: dailyCount, weekly: weeklyCount };
}

function mergeAggregates(
  records: any[],
  period: string,
  periodStart: number,
  periodEnd: number
): any {
  const merged: any = {
    period,
    periodStart,
    periodEnd,
    totalExecutions: 0,
    successCount: 0,
    failureCount: 0,
    partialCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRetries: 0,
    totalFallbacks: 0,
    positiveRatings: 0,
    negativeRatings: 0,
  };

  const modelDist: Record<string, number> = {};
  const taskDist: Record<string, number> = {};
  const errorDist: Record<string, number> = {};

  for (const r of records) {
    merged.totalExecutions += r.totalExecutions || 0;
    merged.successCount += r.successCount || 0;
    merged.failureCount += r.failureCount || 0;
    merged.partialCount += r.partialCount || 0;
    merged.totalInputTokens += r.totalInputTokens || 0;
    merged.totalOutputTokens += r.totalOutputTokens || 0;
    merged.totalRetries += r.totalRetries || 0;
    merged.totalFallbacks += r.totalFallbacks || 0;
    merged.positiveRatings += r.positiveRatings || 0;
    merged.negativeRatings += r.negativeRatings || 0;

    const md = typeof r.modelUsageDistribution === "string" ? JSON.parse(r.modelUsageDistribution) : r.modelUsageDistribution;
    for (const [k, v] of Object.entries(md)) modelDist[k] = (modelDist[k] || 0) + (v as number);
    const td = typeof r.taskTypeDistribution === "string" ? JSON.parse(r.taskTypeDistribution) : r.taskTypeDistribution;
    for (const [k, v] of Object.entries(td)) taskDist[k] = (taskDist[k] || 0) + (v as number);
    const ed = typeof r.errorDistribution === "string" ? JSON.parse(r.errorDistribution) : r.errorDistribution;
    for (const [k, v] of Object.entries(ed)) errorDist[k] = (errorDist[k] || 0) + (v as number);
  }

  merged.modelUsageDistribution = JSON.stringify(modelDist);
  merged.taskTypeDistribution = JSON.stringify(taskDist);
  merged.errorDistribution = JSON.stringify(errorDist);

  return merged;
}

// ─── Data Export & Purge (GDPR-style) ────────────────────────────────────────

/**
 * Export all user data as a JSON package.
 */
export function exportUserData(userId: string = DEFAULT_USER_ID): {
  settings: TelemetrySetting;
  executionHistory: ExecutionEntry[];
  aggregates: any[];
  exportedAt: string;
} {
  const settings = getTelemetrySettings(userId);
  const history = getExecutionHistory({});
  const aggregates = getAggregateAnalytics("hourly", 1000);

  return {
    settings,
    executionHistory: history,
    aggregates,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Purge all individual execution data for a user.
 * Aggregate (anonymized) data is retained for platform learning.
 */
export function purgeUserData(userId: string = DEFAULT_USER_ID): {
  entriesPurged: number;
  aggregatesRetained: number;
} {
  // Clear execution log file
  const logPath = path.join(process.cwd(), "data", "learning", "execution-log.json");
  let entriesPurged = 0;

  try {
    if (fs.existsSync(logPath)) {
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      entriesPurged = Array.isArray(log) ? log.length : 0;
      fs.writeFileSync(logPath, "[]", "utf-8");
    }
  } catch {
    // File may not exist
  }

  // Clear learning rules
  const rulesPath = path.join(process.cwd(), "data", "learning", "rules.json");
  try {
    if (fs.existsSync(rulesPath)) {
      fs.writeFileSync(rulesPath, "[]", "utf-8");
    }
  } catch {
    // Fine
  }

  const aggregatesRetained = db.select().from(aggregateAnalytics).all().length;

  return { entriesPurged, aggregatesRetained };
}

/**
 * Enforce retention policy — delete entries older than retentionDays.
 */
export function enforceRetention(userId: string = DEFAULT_USER_ID): {
  purgedCount: number;
} {
  const settings = getTelemetrySettings(userId);
  if (settings.retentionDays === 0) return { purgedCount: 0 }; // 0 = keep forever

  const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;
  const logPath = path.join(process.cwd(), "data", "learning", "execution-log.json");

  let purgedCount = 0;
  try {
    if (fs.existsSync(logPath)) {
      const log: ExecutionEntry[] = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      const before = log.length;
      const filtered = log.filter((e) => e.timestamp >= cutoff);
      purgedCount = before - filtered.length;
      if (purgedCount > 0) {
        fs.writeFileSync(logPath, JSON.stringify(filtered, null, 2), "utf-8");
      }
    }
  } catch {
    // Fine
  }

  return { purgedCount };
}

// ─── Platform Learning Summary ──────────────────────────────────────────────

/**
 * Generate a platform-level learning summary from aggregate data.
 * This is what powers cross-user insights without exposing individual data.
 */
export function getPlatformLearningSummary(): {
  totalDataPoints: number;
  overallSuccessRate: number;
  topModels: { model: string; usage: number }[];
  topTaskTypes: { type: string; count: number }[];
  commonErrors: { error: string; count: number }[];
  tokenEconomy: { totalInput: number; totalOutput: number; ratio: number };
  userSatisfaction: { positive: number; negative: number; score: number };
  retryRate: number;
  fallbackRate: number;
} {
  const allAggs = db.select().from(aggregateAnalytics).all();

  let totalExec = 0;
  let totalSuccess = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalRetries = 0;
  let totalFallbacks = 0;
  let totalPositive = 0;
  let totalNegative = 0;

  const modelUsage: Record<string, number> = {};
  const taskCounts: Record<string, number> = {};
  const errorCounts: Record<string, number> = {};

  for (const a of allAggs) {
    totalExec += a.totalExecutions || 0;
    totalSuccess += a.successCount || 0;
    totalInput += a.totalInputTokens || 0;
    totalOutput += a.totalOutputTokens || 0;
    totalRetries += a.totalRetries || 0;
    totalFallbacks += a.totalFallbacks || 0;
    totalPositive += a.positiveRatings || 0;
    totalNegative += a.negativeRatings || 0;

    const md = JSON.parse(a.modelUsageDistribution || "{}");
    for (const [k, v] of Object.entries(md)) modelUsage[k] = (modelUsage[k] || 0) + (v as number);
    const td = JSON.parse(a.taskTypeDistribution || "{}");
    for (const [k, v] of Object.entries(td)) taskCounts[k] = (taskCounts[k] || 0) + (v as number);
    const ed = JSON.parse(a.errorDistribution || "{}");
    for (const [k, v] of Object.entries(ed)) errorCounts[k] = (errorCounts[k] || 0) + (v as number);
  }

  const topModels = Object.entries(modelUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([model, usage]) => ({ model, usage }));

  const topTaskTypes = Object.entries(taskCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const commonErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([error, count]) => ({ error, count }));

  const satisfactionTotal = totalPositive + totalNegative;

  return {
    totalDataPoints: totalExec,
    overallSuccessRate: totalExec > 0 ? totalSuccess / totalExec : 0,
    topModels,
    topTaskTypes,
    commonErrors,
    tokenEconomy: {
      totalInput,
      totalOutput,
      ratio: totalInput > 0 ? totalOutput / totalInput : 0,
    },
    userSatisfaction: {
      positive: totalPositive,
      negative: totalNegative,
      score: satisfactionTotal > 0 ? totalPositive / satisfactionTotal : 0,
    },
    retryRate: totalExec > 0 ? totalRetries / totalExec : 0,
    fallbackRate: totalExec > 0 ? totalFallbacks / totalExec : 0,
  };
}
