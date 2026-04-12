/**
 * Quality Gate API Routes
 * Exposes CRUCIBLE, SENTINEL, DEBUGGER, Observability, Structured Output, and Cost Controller
 */

import type { Express } from "express";
import { validateWithCrucible, getValidationHistory, getValidationStats, type CrucibleCriteria } from "./crucibleEngine.js";
import { checkWithSentinel, getSentinelPolicy, updateSentinelPolicy, getSentinelHistory, getSentinelStats } from "./sentinelEngine.js";
import { diagnose, getDiagnosisHistory, getDiagnosisStats, type DiagnosisInput } from "./debuggerEngine.js";
import {
  startSpan, endSpan, addSpanEvent, setSpanAttributes,
  getTrace, getTraceSummary, searchTraces, getObservabilityDashboard, clearTraces
} from "./observabilityEngine.js";
import { validateStructuredOutput, extractJSON, buildFormatInstruction, type SchemaSpec } from "./structuredOutputEngine.js";
import {
  recordTokenUsage, checkBudgetBeforeStep, getBudgetStatus, getCostBreakdown,
  getCostConfig, updateCostConfig, resetCostTracking
} from "./costController.js";

export function registerQualityGateRoutes(app: Express) {
  // ═══════════════════════════════════════════════════════════════════════════
  // CRUCIBLE — Quality Validation Gate
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/crucible/validate", async (req, res) => {
    try {
      const { taskId, agentId, output, criteria, modelId } = req.body;
      if (!taskId || !agentId || output === undefined || output === null || !criteria) {
        return res.status(400).json({ error: "taskId, agentId, output, and criteria required" });
      }
      const result = await validateWithCrucible(taskId, agentId, output, criteria as CrucibleCriteria, modelId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/crucible/history", (_req, res) => {
    const limit = parseInt(_req.query.limit as string) || 50;
    res.json(getValidationHistory(limit));
  });

  app.get("/api/crucible/stats", (_req, res) => {
    res.json(getValidationStats());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SENTINEL — Safety & Guardrails Gate
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/sentinel/check", (req, res) => {
    try {
      const { taskId, agentId, content, context, policy } = req.body;
      if (!taskId || !agentId || !content) {
        return res.status(400).json({ error: "taskId, agentId, and content required" });
      }
      const result = checkWithSentinel(taskId, agentId, content, context, policy);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sentinel/policy", (_req, res) => {
    res.json(getSentinelPolicy());
  });

  app.patch("/api/sentinel/policy", (req, res) => {
    const updated = updateSentinelPolicy(req.body);
    res.json(updated);
  });

  app.get("/api/sentinel/history", (_req, res) => {
    const limit = parseInt(_req.query.limit as string) || 50;
    res.json(getSentinelHistory(limit));
  });

  app.get("/api/sentinel/stats", (_req, res) => {
    res.json(getSentinelStats());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUGGER — Automatic Failure Diagnosis
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/debugger/diagnose", (req, res) => {
    try {
      const input: DiagnosisInput = req.body;
      if (!input.taskId || !input.error || !input.context) {
        return res.status(400).json({ error: "taskId, error, and context required" });
      }
      const result = diagnose(input);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debugger/history", (_req, res) => {
    const limit = parseInt(_req.query.limit as string) || 50;
    res.json(getDiagnosisHistory(limit));
  });

  app.get("/api/debugger/stats", (_req, res) => {
    res.json(getDiagnosisStats());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVABILITY — Structured Trace Spans
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/observability/traces/start", (req, res) => {
    try {
      const { traceId, parentSpanId, operationName, serviceName, attributes } = req.body;
      if (!operationName || !serviceName) {
        return res.status(400).json({ error: "operationName and serviceName required" });
      }
      const span = startSpan({ traceId, parentSpanId, operationName, serviceName, attributes });
      res.json(span);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/observability/traces/:spanId/end", (req, res) => {
    try {
      const span = endSpan(req.params.spanId, req.body);
      if (!span) return res.status(404).json({ error: "Span not found" });
      res.json(span);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/observability/traces/:spanId/event", (req, res) => {
    const { name, attributes } = req.body;
    if (!name) return res.status(400).json({ error: "event name required" });
    addSpanEvent(req.params.spanId, name, attributes);
    res.json({ ok: true });
  });

  app.patch("/api/observability/traces/:spanId/attributes", (req, res) => {
    setSpanAttributes(req.params.spanId, req.body);
    res.json({ ok: true });
  });

  app.get("/api/observability/traces/:traceId", (req, res) => {
    const spans = getTrace(req.params.traceId);
    if (!spans) return res.status(404).json({ error: "Trace not found" });
    res.json(spans);
  });

  app.get("/api/observability/traces/:traceId/summary", (req, res) => {
    const summary = getTraceSummary(req.params.traceId);
    if (!summary) return res.status(404).json({ error: "Trace not found" });
    res.json(summary);
  });

  app.post("/api/observability/search", (req, res) => {
    const results = searchTraces(req.body);
    res.json(results);
  });

  app.get("/api/observability/dashboard", (_req, res) => {
    res.json(getObservabilityDashboard());
  });

  app.post("/api/observability/clear", (_req, res) => {
    clearTraces();
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURED OUTPUT — JSON Schema Conformance
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/structured-output/validate", (req, res) => {
    try {
      const { output, schema } = req.body;
      if (!output || !schema) {
        return res.status(400).json({ error: "output and schema required" });
      }
      const result = validateStructuredOutput(output, schema as SchemaSpec);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/structured-output/extract-json", (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "text required" });
      const result = extractJSON(text);
      if (!result) return res.json({ found: false });
      res.json({ found: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/structured-output/format-instruction", (req, res) => {
    try {
      const { schema } = req.body;
      if (!schema) return res.status(400).json({ error: "schema required" });
      const instruction = buildFormatInstruction(schema as SchemaSpec);
      res.json({ instruction });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COST CONTROLLER — Budget Caps & Token Limits
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/cost/status", (_req, res) => {
    res.json(getBudgetStatus());
  });

  app.get("/api/cost/breakdown", (req, res) => {
    const timeRange = parseInt(req.query.timeRangeMs as string) || undefined;
    res.json(getCostBreakdown(timeRange));
  });

  app.get("/api/cost/config", (_req, res) => {
    res.json(getCostConfig());
  });

  app.patch("/api/cost/config", (req, res) => {
    const updated = updateCostConfig(req.body);
    res.json(updated);
  });

  app.post("/api/cost/record", (req, res) => {
    try {
      const entry = req.body;
      if (!entry.conversationId || !entry.modelId) {
        return res.status(400).json({ error: "conversationId and modelId required" });
      }
      const result = recordTokenUsage({
        ...entry,
        timestamp: entry.timestamp || Date.now(),
        totalTokens: entry.totalTokens || (entry.inputTokens || 0) + (entry.outputTokens || 0),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cost/check-budget", (req, res) => {
    const { conversationId, estimatedTokens } = req.body;
    if (!conversationId) return res.status(400).json({ error: "conversationId required" });
    const result = checkBudgetBeforeStep(conversationId, estimatedTokens || 1000);
    res.json(result);
  });

  app.post("/api/cost/reset", (_req, res) => {
    resetCostTracking();
    res.json({ ok: true, message: "Cost tracking reset" });
  });
}
