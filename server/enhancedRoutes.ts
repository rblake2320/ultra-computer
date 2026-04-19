/**
 * enhancedRoutes.ts
 *
 * API routes for all 8 Claude Code-inspired features ported to Ultra Computer.
 * Registers under /api/v2/ namespace to keep backward compatibility.
 *
 * Features wired:
 *   1. AST-based Bash Security (/api/v2/bash-security/*)
 *   2. DreamTask Background Memory Consolidation (/api/v2/dream/*)
 *   3. Prompt Cache Sharing (/api/v2/prompt-cache/*)
 *   4. File History & Undo/Redo (/api/v2/file-history/*)
 *   5. Token Budgeting (/api/v2/token-budget/*)
 *   6. Notebook Edit Tool (/api/v2/notebook/*)
 *   7. LSP Integration (/api/v2/lsp/*)
 *   8. Away Summary (/api/v2/away/*)
 *
 * @module enhancedRoutes
 */

import type { Express } from "express";
import { analyzeBashCommand, isReadOnlyCommand, isDestructiveCommand } from "./bashSecurity.js";
import { dreamTaskEngine } from "./dreamTask.js";
import { saveCacheSafeParams, getLastCacheSafeParams, clearCacheSafeParams, buildForkedAgentMessages, getForkedAgentStats, estimateCacheSavings } from "./promptCacheSharing.js";
import { fileHistoryEngine } from "./fileHistory.js";
import { tokenBudgetEngine } from "./tokenBudget.js";
import * as notebookFns from "./notebookTool.js";
import { lspService } from "./lspService.js";
import { awaySummaryEngine } from "./awaySummary.js";

export function registerEnhancedRoutes(app: Express): void {

  // =========================================================================
  // 1. AST-based Bash Security
  // =========================================================================

  /** Analyze a command for security risks without executing it. */
  app.post("/api/v2/bash-security/analyze", (req, res) => {
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "command (string) is required" });
    }
    const result = analyzeBashCommand(command);
    res.json(result);
  });

  /** Classify a command's risk level (quick check). */
  app.post("/api/v2/bash-security/classify", (req, res) => {
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "command (string) is required" });
    }
    const result = analyzeBashCommand(command);
    res.json({
      command,
      risk: result.risk,
      allowed: result.allowed,
      isReadOnly: isReadOnlyCommand(command),
      isDestructive: isDestructiveCommand(command),
      reason: result.reason,
    });
  });

  // =========================================================================
  // 2. DreamTask Background Memory Consolidation
  // =========================================================================

  /** Trigger a dream cycle manually. */
  app.post("/api/v2/dream/trigger", async (_req, res) => {
    try {
      const result = await dreamTaskEngine.runDreamCycle();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Dream cycle failed", details: String(err) });
    }
  });

  /** Get dream task status. */
  app.get("/api/v2/dream/status", (_req, res) => {
    const status = dreamTaskEngine.getState();
    res.json(status);
  });

  /** Get dream history. */
  app.get("/api/v2/dream/history", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const state = dreamTaskEngine.getState();
    res.json({ history: state.turns?.slice(-limit) || [], total: state.turns?.length || 0 });
  });

  /** Update dream configuration. */
  app.patch("/api/v2/dream/config", (req, res) => {
    const config = req.body;
    if (!config || typeof config !== "object") {
      return res.status(400).json({ error: "config object is required" });
    }
    dreamTaskEngine.updateConfig(config);
    res.json({ ok: true, config: dreamTaskEngine.getConfig() });
  });

  // =========================================================================
  // 3. Prompt Cache Sharing
  // =========================================================================

  /** Get cache statistics. */
  app.get("/api/v2/prompt-cache/stats", (_req, res) => {
    const stats = getForkedAgentStats();
    const lastParams = getLastCacheSafeParams();
    res.json({ ...stats, lastCacheSafeParams: lastParams });
  });

  /** Build a cached prompt for a swarm worker. */
  app.post("/api/v2/prompt-cache/build", (req, res) => {
    const { sessionId, systemPrompt, conversationHistory } = req.body;
    if (!sessionId || !systemPrompt) {
      return res.status(400).json({ error: "sessionId and systemPrompt are required" });
    }
    const params: any = { systemPrompt, conversationPrefix: conversationHistory || [], sessionId };
    saveCacheSafeParams(params);
    const lastParams = getLastCacheSafeParams();
    res.json({ ok: true, sessionId, cached: true, params: lastParams });
  });

  /** Invalidate cache for a session. */
  app.delete("/api/v2/prompt-cache/:sessionId", (req, res) => {
    clearCacheSafeParams();
    res.json({ ok: true });
  });

  // =========================================================================
  // 4. File History & Undo/Redo
  // =========================================================================

  /** Record a file snapshot (before/after edit). */
  app.post("/api/v2/file-history/snapshot", async (req, res) => {
    const { filePath, operationType, agentId } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    if (!operationType || !["create", "edit", "delete", "rename"].includes(operationType)) {
      return res.status(400).json({ error: "operationType must be one of: create, edit, delete, rename" });
    }
    try {
      const snapshot = await fileHistoryEngine.takeSnapshot(filePath, operationType, "before");
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: "Failed to record snapshot", details: String(err) });
    }
  });

  /** Get file history for a specific file. */
  app.get("/api/v2/file-history/file", (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: "path query parameter is required" });
    }
    const limit = parseInt(req.query.limit as string) || 20;
    const history = fileHistoryEngine.getFileHistory(filePath);
    res.json(history);
  });

  /** Undo the last operation on a file. */
  app.post("/api/v2/file-history/undo", async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    try {
      const result = await fileHistoryEngine.undo();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Undo failed", details: String(err) });
    }
  });

  /** Redo the last undone operation on a file. */
  app.post("/api/v2/file-history/redo", async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    try {
      const result = await fileHistoryEngine.redo();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Redo failed", details: String(err) });
    }
  });

  /** Get overall file history stats. */
  app.get("/api/v2/file-history/stats", (_req, res) => {
    const stats = fileHistoryEngine.getStats();
    res.json(stats);
  });

  // =========================================================================
  // 5. Token Budgeting
  // =========================================================================

  /** Create a new token budget. */
  app.post("/api/v2/token-budget/create", (req, res) => {
    const { ownerId, ownerType, maxTokens, maxCostUsd } = req.body;
    if (!ownerId || !ownerType) {
      return res.status(400).json({ error: "ownerId and ownerType are required" });
    }
    if (!["conversation", "swarm", "agent", "global"].includes(ownerType)) {
      return res.status(400).json({ error: "ownerType must be one of: conversation, swarm, agent, global" });
    }
    tokenBudgetEngine.setBudget(ownerId, {
      maxTotalTokens: maxTokens || 1_000_000,
      maxCostUsd: maxCostUsd || 10.0,
    });
    const budget = tokenBudgetEngine.getBudget(ownerId);
    res.json({ budgetId: ownerId, ownerType, ...budget });
  });

  /** Record token usage. */
  app.post("/api/v2/token-budget/record", (req, res) => {
    const { budgetId, inputTokens, outputTokens, costUsd, modelId } = req.body;
    if (!budgetId) {
      return res.status(400).json({ error: "budgetId is required" });
    }
    tokenBudgetEngine.recordUsage({
      conversationId: budgetId,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      model: modelId || "unknown",
    } as any);
    const status = tokenBudgetEngine.getStatus(budgetId);
    res.json(status);
  });

  /** Get budget status. */
  app.get("/api/v2/token-budget/:budgetId", (req, res) => {
    const budget = tokenBudgetEngine.getBudget(req.params.budgetId as string);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    res.json(budget);
  });

  /** Check diminishing returns for a budget. */
  app.get("/api/v2/token-budget/:budgetId/diminishing-returns", (req, res) => {
    const status = tokenBudgetEngine.getStatus(req.params.budgetId as string);
    if (!status) return res.status(404).json({ error: "Budget not found" });
    res.json(status);
  });

  /** Get all active budgets. */
  app.get("/api/v2/token-budget", (_req, res) => {
    const stats = tokenBudgetEngine.getGlobalStats();
    res.json(stats);
  });

  // =========================================================================
  // 6. Notebook Edit Tool
  // =========================================================================

  /** Read a notebook file. */
  app.post("/api/v2/notebook/read", async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    try {
      const notebook = await notebookFns.readNotebook(filePath);
      res.json(notebook);
    } catch (err) {
      res.status(500).json({ error: "Failed to read notebook", details: String(err) });
    }
  });

  /** Edit a specific cell in a notebook. */
  app.post("/api/v2/notebook/edit-cell", async (req, res) => {
    const { filePath, cellIndex, newSource, newCellType } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    if (cellIndex === undefined || typeof cellIndex !== "number") {
      return res.status(400).json({ error: "cellIndex (number) is required" });
    }
    if (!newSource || typeof newSource !== "string") {
      return res.status(400).json({ error: "newSource (string) is required" });
    }
    try {
      const notebook = await notebookFns.readNotebook(filePath);
      const result = notebookFns.setCellSource(notebook, cellIndex, newSource);
      if (newCellType) notebookFns.changeCellType(notebook, cellIndex, newCellType as notebookFns.CellType);
      await notebookFns.writeNotebook(filePath, notebook);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to edit cell", details: String(err) });
    }
  });

  /** Insert a new cell into a notebook. */
  app.post("/api/v2/notebook/insert-cell", async (req, res) => {
    const { filePath, afterIndex, source, cellType } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    try {
      const notebook = await notebookFns.readNotebook(filePath);
      const result = notebookFns.insertCell(notebook, afterIndex ?? -1, source || "", (cellType || "code") as notebookFns.CellType);
      await notebookFns.writeNotebook(filePath, notebook);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to insert cell", details: String(err) });
    }
  });

  /** Delete a cell from a notebook. */
  app.post("/api/v2/notebook/delete-cell", async (req, res) => {
    const { filePath, cellIndex } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    if (cellIndex === undefined || typeof cellIndex !== "number") {
      return res.status(400).json({ error: "cellIndex (number) is required" });
    }
    try {
      const notebook = await notebookFns.readNotebook(filePath);
      const result = notebookFns.deleteCell(notebook, cellIndex);
      await notebookFns.writeNotebook(filePath, notebook);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to delete cell", details: String(err) });
    }
  });

  // =========================================================================
  // 7. LSP Integration
  // =========================================================================

  /** Get diagnostics for a file. */
  app.post("/api/v2/lsp/diagnostics", async (req, res) => {
    const { filePath, content, rootPath } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath (string) is required" });
    }
    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "content (string) is required" });
    }
    try {
      const diagnostics = await lspService.getDiagnostics(filePath, content, rootPath || "/tmp");
      res.json({ filePath, diagnostics, count: diagnostics.length });
    } catch (err) {
      res.status(500).json({ error: "LSP diagnostics failed", details: String(err) });
    }
  });

  /** Get hover information. */
  app.post("/api/v2/lsp/hover", async (req, res) => {
    const { filePath, content, line, column, rootPath } = req.body;
    if (!filePath || !content || !line || !column) {
      return res.status(400).json({ error: "filePath, content, line, and column are required" });
    }
    try {
      const hover = await lspService.getHover(filePath, content, line, column, rootPath || "/tmp");
      res.json(hover || { contents: null });
    } catch (err) {
      res.status(500).json({ error: "LSP hover failed", details: String(err) });
    }
  });

  /** Get supported languages. */
  app.get("/api/v2/lsp/languages", (_req, res) => {
    res.json({ languages: lspService.getSupportedLanguages() });
  });

  /** Get LSP server status. */
  app.get("/api/v2/lsp/status", (_req, res) => {
    res.json({ servers: lspService.getStatus() });
  });

  // =========================================================================
  // 8. Away Summary
  // =========================================================================

  /** Mark user as present. */
  app.post("/api/v2/away/present", (_req, res) => {
    awaySummaryEngine.markUserPresent();
    res.json({ ok: true, status: awaySummaryEngine.getUserStatus() });
  });

  /** Mark user as away. */
  app.post("/api/v2/away/leave", (_req, res) => {
    awaySummaryEngine.markUserAway();
    res.json({ ok: true, status: awaySummaryEngine.getUserStatus() });
  });

  /** Get user presence status. */
  app.get("/api/v2/away/status", (_req, res) => {
    res.json(awaySummaryEngine.getUserStatus());
  });

  /** Generate an away summary. */
  app.get("/api/v2/away/summary", (req, res) => {
    const depth = (req.query.depth as string) || "standard";
    if (!["brief", "standard", "detailed"].includes(depth)) {
      return res.status(400).json({ error: "depth must be one of: brief, standard, detailed" });
    }
    const summary = awaySummaryEngine.generateSummary(depth as "brief" | "standard" | "detailed");
    res.json(summary);
  });

  /** Record an event (for internal use by other systems). */
  app.post("/api/v2/away/event", (req, res) => {
    const { category, title, description, source, priority, relatedIds, requiresAttention } = req.body;
    if (!category || !title || !description || !source) {
      return res.status(400).json({ error: "category, title, description, and source are required" });
    }
    const validCategories = [
      "error", "task_completed", "task_started", "swarm_update", "agent_action",
      "memory_update", "system_alert", "user_mention", "decision_made",
      "file_changed", "deployment", "security_event",
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${validCategories.join(", ")}` });
    }
    const event = awaySummaryEngine.recordEvent(category, title, description, source, {
      priority,
      relatedIds,
      requiresAttention,
    });
    res.json(event);
  });

  /** Get items requiring attention. */
  app.get("/api/v2/away/attention", (_req, res) => {
    const items = awaySummaryEngine.getAttentionItems();
    res.json({ items, count: items.length });
  });

  /** Acknowledge an event. */
  app.post("/api/v2/away/acknowledge/:eventId", (req, res) => {
    const ok = awaySummaryEngine.acknowledgeEvent(req.params.eventId as string);
    if (!ok) return res.status(404).json({ error: "Event not found" });
    res.json({ ok: true });
  });

  /** Acknowledge all events. */
  app.post("/api/v2/away/acknowledge-all", (_req, res) => {
    const count = awaySummaryEngine.acknowledgeAll();
    res.json({ ok: true, acknowledged: count });
  });

  /** Get summary history. */
  app.get("/api/v2/away/history", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    res.json(awaySummaryEngine.getSummaryHistory(limit));
  });

  /** Get overall away stats. */
  app.get("/api/v2/away/stats", (_req, res) => {
    res.json(awaySummaryEngine.getStats());
  });

  // =========================================================================
  // Combined Health / Feature Discovery
  // =========================================================================

  /** List all v2 features and their status. */
  app.get("/api/v2/features", (_req, res) => {
    res.json({
      version: "2.0.0",
      features: [
        { name: "bash-security", status: "active", description: "AST-based command analysis and security classification" },
        { name: "dream-task", status: "active", description: "Background memory consolidation and knowledge extraction" },
        { name: "prompt-cache", status: "active", description: "Forked agent prompt cache sharing for cost reduction" },
        { name: "file-history", status: "active", description: "File snapshots with undo/redo capabilities" },
        { name: "token-budget", status: "active", description: "Token budgeting with diminishing returns detection" },
        { name: "notebook", status: "active", description: "Jupyter notebook cell-level editing" },
        { name: "lsp", status: "active", description: "Language Server Protocol integration for code diagnostics" },
        { name: "away-summary", status: "active", description: "User absence tracking and event summarization" },
      ],
      endpoints: {
        bashSecurity: ["/api/v2/bash-security/analyze", "/api/v2/bash-security/classify"],
        dreamTask: ["/api/v2/dream/trigger", "/api/v2/dream/status", "/api/v2/dream/history", "/api/v2/dream/config"],
        promptCache: ["/api/v2/prompt-cache/stats", "/api/v2/prompt-cache/build", "/api/v2/prompt-cache/:sessionId"],
        fileHistory: ["/api/v2/file-history/snapshot", "/api/v2/file-history/file", "/api/v2/file-history/undo", "/api/v2/file-history/redo", "/api/v2/file-history/stats"],
        tokenBudget: ["/api/v2/token-budget/create", "/api/v2/token-budget/record", "/api/v2/token-budget/:budgetId", "/api/v2/token-budget/:budgetId/diminishing-returns"],
        notebook: ["/api/v2/notebook/read", "/api/v2/notebook/edit-cell", "/api/v2/notebook/insert-cell", "/api/v2/notebook/delete-cell"],
        lsp: ["/api/v2/lsp/diagnostics", "/api/v2/lsp/hover", "/api/v2/lsp/languages", "/api/v2/lsp/status"],
        awaySummary: ["/api/v2/away/present", "/api/v2/away/leave", "/api/v2/away/status", "/api/v2/away/summary", "/api/v2/away/event", "/api/v2/away/attention", "/api/v2/away/acknowledge/:eventId", "/api/v2/away/acknowledge-all", "/api/v2/away/history", "/api/v2/away/stats"],
      },
    });
  });
}
