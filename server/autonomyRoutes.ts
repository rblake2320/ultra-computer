/**
 * Autonomy Routes — Self-Heal, Self-Learn, Long-Running
 *
 * Exposes API endpoints for:
 *   - Process health / watchdog status
 *   - Task checkpointing (CRUD + stats)
 *   - Cron scheduler (CRUD + stats)
 *   - Circuit breaker monitoring
 *   - Self-learning analytics + feedback
 *   - Skill auto-improvement suggestions
 *   - Memory-derived skill proposals
 */

import type { Express } from "express";
import { getHealthStatus } from "./processWatchdog.js";
import {
  createCheckpoint, updateCheckpoint, advanceStep, recordError as recordCheckpointError,
  getCheckpoint, getAllCheckpoints, getResumableTasks, heartbeatTask,
  completeTask, failTask, abandonStaleTasks, deleteCheckpoint, getCheckpointStats,
} from "./taskCheckpointing.js";
import {
  createCronJob, updateCronJob, deleteCronJob, getCronJob,
  getAllCronJobs, getEnabledJobs, toggleJob, getCronStats,
} from "./cronScheduler.js";
import { registry as circuitRegistry } from "./circuitBreaker.js";
import {
  logExecution, recordUserFeedback, getLearningStats,
  runAnalysis, getExecutionHistory, compactLog,
  analyzeModelPerformance, analyzeSkillEffectiveness, analyzeFailurePatterns,
  getTaskTypeInsights, getRecommendation,
} from "./selfLearning.js";
import {
  recordSkillExecution, analyzeAllSkills as analyzeAllSkillPerf,
  generateImprovements, getImprovementSuggestions,
  applyImprovement, rejectImprovement, getSkillHealth,
} from "./skillAutoImprove.js";
import {
  generateSkillProposals, getSkillProposals,
  promoteSkillProposal, rejectSkillProposal,
  type SkillProposalStatus,
} from "./skillProposalEngine.js";

export function registerAutonomyRoutes(app: Express) {

  const rejectUnsupportedCronExecution = (taskType: unknown, res: any): boolean => {
    if (taskType === undefined || taskType === "health_check") return false;
    res.status(501).json({
      error: `Cron task type "${String(taskType)}" is not implemented. Only health_check jobs execute in this release.`,
      supportedTaskTypes: ["health_check"],
    });
    return true;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & WATCHDOG
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/health", (_req, res) => {
    try {
      res.json(getHealthStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Health check failed" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK CHECKPOINTING
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/checkpoints", (req, res) => {
    try {
      const status = req.query.status as "running" | "paused" | "completed" | "failed" | "abandoned" | undefined;
      res.json(getAllCheckpoints(status));
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to list checkpoints" }); }
  });

  app.get("/api/autonomy/checkpoints/stats", (_req, res) => {
    try {
      res.json(getCheckpointStats());
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get checkpoint stats" }); }
  });

  app.get("/api/autonomy/checkpoints/resumable", (_req, res) => {
    try {
      res.json(getResumableTasks());
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get resumable tasks" }); }
  });

  app.get("/api/autonomy/checkpoints/:id", (req, res) => {
    try {
      const cp = getCheckpoint(req.params.id);
      if (!cp) return res.status(404).json({ error: "Checkpoint not found" });
      res.json(cp);
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get checkpoint" }); }
  });

  app.post("/api/autonomy/checkpoints", (req, res) => {
    const { taskId, conversationId, taskTitle, totalSteps } = req.body;
    if (!taskId || !taskTitle) return res.status(400).json({ error: "taskId and taskTitle required" });
    const cp = createCheckpoint({ taskId, conversationId: conversationId || "", taskTitle, totalSteps: totalSteps || 1 });
    res.json(cp);
  });

  app.patch("/api/autonomy/checkpoints/:id", (req, res) => {
    try {
      const body = req.body ?? {};
      if (typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Request body must be an object" });
      }
      const cp = updateCheckpoint(req.params.id, body);
      res.json(cp);
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to update checkpoint" }); }
  });

  app.post("/api/autonomy/checkpoints/:id/advance", (req, res) => {
    const { stepId, result } = req.body;
    if (!stepId) return res.status(400).json({ error: "stepId required" });
    const cp = advanceStep(req.params.id, stepId, result || "");
    res.json(cp);
  });

  app.post("/api/autonomy/checkpoints/:id/heartbeat", (req, res) => {
    heartbeatTask(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/autonomy/checkpoints/:id/complete", (req, res) => {
    completeTask(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/autonomy/checkpoints/:id/fail", (req, res) => {
    failTask(req.params.id, req.body.reason || "Unknown failure");
    res.json({ ok: true });
  });

  app.post("/api/autonomy/checkpoints/abandon-stale", (req, res) => {
    try {
      const rawMs = (req.body ?? {}).maxStaleMs;
      // Fix parseInt("0") || undefined issue: use ternary check instead of || operator
      const parsed = parseInt(rawMs);
      // Upper bound: cap at 24 hours (86400000 ms) to prevent absurdly large values.
      const maxStaleMs = !isNaN(parsed) && parsed > 0 && parsed <= 86_400_000 ? parsed : undefined;
      const abandoned = abandonStaleTasks(maxStaleMs);
      res.json({ abandoned: abandoned.length, tasks: abandoned });
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to abandon stale tasks" }); }
  });

  app.delete("/api/autonomy/checkpoints/:id", (req, res) => {
    deleteCheckpoint(req.params.id);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRON SCHEDULER
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/cron", (_req, res) => {
    try { res.json(getAllCronJobs()); } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to list cron jobs" }); }
  });

  app.get("/api/autonomy/cron/stats", (_req, res) => {
    try { res.json(getCronStats()); } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get cron stats" }); }
  });

  app.get("/api/autonomy/cron/enabled", (_req, res) => {
    try { res.json(getEnabledJobs()); } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get enabled jobs" }); }
  });

  app.get("/api/autonomy/cron/:id", (req, res) => {
    try {
      const job = getCronJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Cron job not found" });
      res.json(job);
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get cron job" }); }
  });

  app.post("/api/autonomy/cron", (req, res) => {
    try {
      if (rejectUnsupportedCronExecution(req.body?.taskType, res)) return;
      const job = createCronJob(req.body);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/autonomy/cron/:id", (req, res) => {
    try {
      if (rejectUnsupportedCronExecution(req.body?.taskType, res)) return;
      const job = updateCronJob(req.params.id, req.body);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/autonomy/cron/:id/toggle", (req, res) => {
    const enabled = req.body.enabled !== undefined ? Boolean(req.body.enabled) : undefined;
    if (enabled === undefined) return res.status(400).json({ error: "enabled field required" });
    const existing = getCronJob(req.params.id);
    if (!existing) return res.status(404).json({ error: "Cron job not found" });
    if (enabled && rejectUnsupportedCronExecution(existing.taskType, res)) return;
    const job = toggleJob(req.params.id, enabled);
    res.json(job);
  });

  app.delete("/api/autonomy/cron/:id", (req, res) => {
    deleteCronJob(req.params.id);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKERS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/circuits", (_req, res) => {
    const stats = circuitRegistry.getRegistryStats();
    res.json(stats);
  });

  app.post("/api/autonomy/circuits/:name/reset", (req, res) => {
    const breaker = circuitRegistry.getAllBreakers().get(req.params.name);
    if (!breaker) return res.status(404).json({ error: "Circuit breaker not found" });
    breaker.reset();
    res.json({ ok: true, state: breaker.getState() });
  });

  app.post("/api/autonomy/circuits/reset-all", (_req, res) => {
    circuitRegistry.resetAll();
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-LEARNING
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/learning/stats", (_req, res) => {
    try { res.json(getLearningStats()); } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to get learning stats" }); }
  });

  app.get("/api/autonomy/learning/history", (req, res) => {
    const opts: any = {};
    if (req.query.taskType) opts.taskType = req.query.taskType;
    if (req.query.model) opts.model = req.query.model;
    if (req.query.outcome) opts.outcome = req.query.outcome;
    opts.limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    opts.offset = parseInt(req.query.offset as string) || 0;
    res.json(getExecutionHistory(opts));
  });

  app.post("/api/autonomy/learning/log", (req, res) => {
    try {
      const body = req.body ?? {};
      if (typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Request body must be an object" });
      }
      // Validate required fields
      if (!body.taskType || typeof body.taskType !== "string") {
        return res.status(400).json({ error: "taskType (string) is required" });
      }
      const entry = logExecution(body);
      res.json(entry);
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to log execution" }); }
  });

  app.post("/api/autonomy/learning/feedback", (req, res) => {
    const { executionId, feedback, correctionText } = req.body;
    if (!executionId || !feedback) return res.status(400).json({ error: "executionId and feedback required" });
    recordUserFeedback(executionId, feedback, correctionText);
    res.json({ ok: true });
  });

  app.post("/api/autonomy/learning/analyze", (_req, res) => {
    const result = runAnalysis();
    res.json(result);
  });

  app.get("/api/autonomy/learning/models", (_req, res) => {
    res.json(analyzeModelPerformance());
  });

  app.get("/api/autonomy/learning/skills", (_req, res) => {
    try { res.json(analyzeSkillEffectiveness()); }
    catch (err: any) { res.status(500).json({ error: err.message ?? "Analysis failed" }); }
  });

  app.get("/api/autonomy/learning/failures", (_req, res) => {
    res.json(analyzeFailurePatterns());
  });

  app.get("/api/autonomy/learning/insights/:taskType", (req, res) => {
    res.json(getTaskTypeInsights(req.params.taskType));
  });

  app.post("/api/autonomy/learning/recommend", (req, res) => {
    const { taskType, availableModels } = req.body;
    if (!taskType) return res.status(400).json({ error: "taskType required" });
    res.json(getRecommendation(taskType, availableModels || []));
  });

  app.post("/api/autonomy/learning/compact", (req, res) => {
    const keepDays = parseInt(req.body.keepDays) || 30;
    res.json(compactLog(keepDays));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL AUTO-IMPROVEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/skills/health", (_req, res) => {
    res.json(getSkillHealth());
  });

  app.get("/api/autonomy/skills/performance", (_req, res) => {
    res.json(analyzeAllSkillPerf());
  });

  app.post("/api/autonomy/skills/record-execution", (req, res) => {
    const { skillId, skillName, success, durationMs, outputQuality, failureMode } = req.body;
    if (!skillId || !skillName) return res.status(400).json({ error: "skillId and skillName required" });
    recordSkillExecution(skillId, skillName, Boolean(success), durationMs || 0, outputQuality, failureMode);
    res.json({ ok: true });
  });

  app.get("/api/autonomy/skills/improvements", (req, res) => {
    const opts: any = {};
    if (req.query.skillId) opts.skillId = req.query.skillId;
    if (req.query.status) opts.status = req.query.status;
    if (req.query.priority) opts.priority = req.query.priority;
    res.json(getImprovementSuggestions(opts));
  });

  app.post("/api/autonomy/skills/improvements/generate", (_req, res) => {
    res.json(generateImprovements());
  });

  app.post("/api/autonomy/skills/improvements/:id/apply", (req, res) => {
    const result = applyImprovement(req.params.id);
    res.json(result);
  });

  app.post("/api/autonomy/skills/improvements/:id/reject", (req, res) => {
    try {
      const reason = (req.body ?? {}).reason;
      if (reason !== undefined && typeof reason !== "string") {
        return res.status(400).json({ error: "reason must be a string" });
      }
      rejectImprovement(req.params.id, typeof reason === "string" ? reason : undefined);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to reject improvement" }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY-DERIVED SKILL PROPOSALS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/skills/proposals", (req, res) => {
    const status = req.query.status as SkillProposalStatus | undefined;
    if (status && !["pending", "promoted", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be pending, promoted, or rejected" });
    }
    res.json(getSkillProposals(status));
  });

  app.post("/api/autonomy/skills/proposals/generate", (req, res) => {
    const body = req.body ?? {};
    if (typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Request body must be an object" });
    }

    const minImportance = body.minImportance === undefined ? undefined : Number(body.minImportance);
    if (minImportance !== undefined && (Number.isNaN(minImportance) || minImportance < 0 || minImportance > 1)) {
      return res.status(400).json({ error: "minImportance must be between 0 and 1" });
    }

    const limit = body.limit === undefined ? undefined : Number(body.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      return res.status(400).json({ error: "limit must be an integer between 1 and 50" });
    }

    res.json(generateSkillProposals({ minImportance, limit }));
  });

  app.post("/api/autonomy/skills/proposals/:id/promote", (req, res) => {
    const result = promoteSkillProposal(req.params.id);
    if (!result.promoted && result.reason === "Proposal not found.") {
      return res.status(404).json(result);
    }
    res.json(result);
  });

  app.post("/api/autonomy/skills/proposals/:id/reject", (req, res) => {
    const reason = (req.body ?? {}).reason;
    if (reason !== undefined && typeof reason !== "string") {
      return res.status(400).json({ error: "reason must be a string" });
    }
    const result = rejectSkillProposal(req.params.id, reason);
    if (!result.rejected && result.reason === "Proposal not found.") {
      return res.status(404).json(result);
    }
    res.json(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBINED AUTONOMY DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/autonomy/dashboard", (_req, res) => {
    try {
      const health = getHealthStatus();
      const checkpointStats = getCheckpointStats();
      const cronStats = getCronStats();
      const circuitStats = circuitRegistry.getRegistryStats();
      const learningStats = getLearningStats();
      const skillHealth = getSkillHealth();
      const resumable = getResumableTasks();

      res.json({
        health,
        checkpoints: { ...checkpointStats, resumable: resumable.length },
        cron: cronStats,
        circuits: circuitStats,
        learning: learningStats,
        skillHealth,
      });
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed to fetch autonomy dashboard" }); }
  });
}
