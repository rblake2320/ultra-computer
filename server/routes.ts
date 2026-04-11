import type { Express } from "express";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";
import { runOrchestrator, subscribeToConversation, unsubscribeFromConversation } from "./orchestrator.js";
import { testModelConnection } from "./modelRouter.js";
import { connectModel, disconnectModel, testConnection, quickAdd, discoverEnvVars, getProviderCatalog, PROVIDER_REGISTRY } from "./modelConnections.js";
import { seedConnectors, connectWithApiKey, callMCPTool } from "./connectorRegistry.js";
import { seedBuiltInSkills } from "./skillSystem.js";
import { memoryManager } from "./memoryManager.js";
import { dockerSandbox } from "./tools.js";
import { registerFileRoutes } from "./fileRoutes.js";
import { registerOAuthRoutes } from "./oauthFlow.js";
import { registerExportRoutes } from "./exportSession.js";
import { registerBrowserRoutes } from "./browserRoutes.js";
import { registerMarketplaceRoutes } from "./marketplaceRoutes.js";
import { registerAutonomyRoutes } from "./autonomyRoutes.js";
import { registerProtocolRoutes } from "./protocolRoutes.js";
import { registerMessagingRoutes } from "./messagingRoutes.js";
import { registerNIPRoutes } from "./nipRoutes.js";
import { registerIdentityRoutes } from "./identityRoutes.js";
import { setIdentityEngine } from "./nipEngine.js";
import { identityEngine } from "./identityEngine.js";
import { taskQueue } from "./taskQueue.js";
import { initWatchdog, getHealthStatus } from "./processWatchdog.js";
import { startCheckpointHeartbeats } from "./taskCheckpointing.js";
import { startScheduler } from "./cronScheduler.js";
import { startLearningLoop } from "./selfLearning.js";
import { startAutoImproveLoop } from "./skillAutoImprove.js";
import { registerCacheRoutes } from "./cacheRoutes.js";
import { cacheEngine } from "./cacheEngine.js";

export async function registerRoutes(httpServer: Server, app: Express) {
  // ─── Seed on startup ──────────────────────────────────────────────────────
  seedConnectors();
  seedBuiltInSkills();

  // ─── Register modular route groups ─────────────────────────────────────────
  registerFileRoutes(app);
  registerOAuthRoutes(app);
  registerExportRoutes(app);
  registerBrowserRoutes(app);
  registerMarketplaceRoutes(app);
  registerAutonomyRoutes(app);
  registerProtocolRoutes(app);
  registerMessagingRoutes(app);
  registerNIPRoutes(app);
  registerIdentityRoutes(app);
  registerCacheRoutes(app);

  // ─── Link identity engine to NIP for session authentication ────────────────
  setIdentityEngine(identityEngine);
  console.log("[identity] Identity engine linked to NIP protocol for session auth");

  // ─── Initialize autonomy systems ────────────────────────────────────────────
  initWatchdog(httpServer);
  startCheckpointHeartbeats();
  startScheduler(async (job) => {
    console.log(`[cron] Executing job: ${job.name}`);
    if (job.taskType === "health_check") {
      return JSON.stringify(getHealthStatus());
    }
    return `Job ${job.name} executed`;
  });
  startLearningLoop();
  startAutoImproveLoop();
  console.log("[autonomy] All autonomous systems initialized: watchdog, checkpointing, cron, learning, skill-improvement");

  // ─── Initialize task queue (non-blocking) ──────────────────────────────────
  taskQueue.initialize().then(available => {
    if (available) console.log("[taskQueue] BullMQ connected to Redis");
    else console.log("[taskQueue] Redis not available — queue disabled (graceful fallback)");
  }).catch(() => {});

  // ─── Models ───────────────────────────────────────────────────────────────
  app.get("/api/models", (req, res) => {
    // Strip apiKey and oauthTokens from response for security
    const models = storage.getModels().map(m => ({
      ...m,
      apiKey: m.apiKey ? "***" : null,
      oauthTokens: m.oauthTokens ? "***" : null,
    }));
    res.json(models);
  });

  // Provider catalog — frontend uses this to render auth options per provider
  app.get("/api/models/providers", (_req, res) => {
    res.json(getProviderCatalog());
  });

  // Discover environment variables already set on the server
  app.get("/api/models/env-vars", (_req, res) => {
    res.json(discoverEnvVars());
  });

  app.post("/api/models", (req, res) => {
    const { id, name, provider, modelId, baseUrl, apiKey, capabilities, contextWindow,
            isDefault, isOrchestrator, speedTier, notes, authMethod, envVarName } = req.body;
    if (!name || !provider || !modelId) return res.status(400).json({ error: "name, provider, modelId required" });
    if (typeof name !== "string" || name.length > 200) return res.status(400).json({ error: "name must be a string (max 200 chars)" });
    if (typeof modelId !== "string" || modelId.length > 500) return res.status(400).json({ error: "modelId must be a string (max 500 chars)" });
    const parsedCtxWindow = Number(contextWindow);
    if (contextWindow !== undefined && (isNaN(parsedCtxWindow) || parsedCtxWindow < 1 || parsedCtxWindow > 10_000_000)) {
      return res.status(400).json({ error: "contextWindow must be a positive integer" });
    }

    // If setting as default, unset others
    if (isDefault) {
      storage.getModels().forEach(m => storage.updateModel(m.id, { isDefault: false }));
    }
    if (isOrchestrator) {
      storage.getModels().forEach(m => storage.updateModel(m.id, { isOrchestrator: false }));
    }

    const model = storage.createModel({
      id: id || uuidv4(),
      name,
      provider,
      modelId,
      baseUrl: baseUrl || null,
      apiKey: apiKey || null,
      enabled: true,
      capabilities: capabilities ? JSON.stringify(capabilities) : '["chat"]',
      contextWindow: contextWindow || 8192,
      isDefault: isDefault || false,
      isOrchestrator: isOrchestrator || false,
      speedTier: speedTier || "medium",
      notes: notes || null,
      authMethod: authMethod || "api_key",
      envVarName: envVarName || null,
      connectionStatus: "unconfigured",
    } as any);
    res.json(model);
  });

  // Quick-add: create model from preset + connect in one step
  app.post("/api/models/quick-add", async (req, res) => {
    try {
      const { provider, presetModelId, authMethod, apiKey, envVarName, baseUrl } = req.body;
      if (!provider || !presetModelId) return res.status(400).json({ error: "provider and presetModelId required" });
      const result = await quickAdd(provider, presetModelId, authMethod || "api_key", {
        apiKey, envVarName, baseUrl,
      });
      if (!result.model) return res.status(400).json({ error: "Invalid provider or preset model" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/models/:id", (req, res) => {
    const { isDefault, isOrchestrator } = req.body;
    if (isDefault) storage.getModels().forEach(m => storage.updateModel(m.id, { isDefault: false }));
    if (isOrchestrator) storage.getModels().forEach(m => storage.updateModel(m.id, { isOrchestrator: false }));
    // Whitelist allowed fields to prevent mass assignment
    const { name, enabled, speedTier, notes, isDefault: _isDefault, isOrchestrator: _isOrch, contextWindow, capabilities } = req.body;
    const allowedUpdate: Record<string, any> = {};
    if (name !== undefined) allowedUpdate.name = name;
    if (enabled !== undefined) allowedUpdate.enabled = enabled;
    if (speedTier !== undefined) allowedUpdate.speedTier = speedTier;
    if (notes !== undefined) allowedUpdate.notes = notes;
    if (_isDefault !== undefined) allowedUpdate.isDefault = _isDefault;
    if (_isOrch !== undefined) allowedUpdate.isOrchestrator = _isOrch;
    if (contextWindow !== undefined) allowedUpdate.contextWindow = contextWindow;
    if (capabilities !== undefined) allowedUpdate.capabilities = capabilities;
    const updated = storage.updateModel(req.params.id, allowedUpdate);
    if (!updated) return res.status(404).json({ error: "Model not found" });
    res.json(updated);
  });

  app.delete("/api/models/:id", (req, res) => {
    storage.deleteModel(req.params.id);
    res.json({ ok: true });
  });

  // Connect a model with specific auth method and credentials
  app.post("/api/models/:id/connect", async (req, res) => {
    try {
      const { authMethod, apiKey, envVarName, baseUrl } = req.body;
      const result = await connectModel(req.params.id, authMethod || "api_key", {
        apiKey, envVarName, baseUrl,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Disconnect — clears credentials, resets status
  app.post("/api/models/:id/disconnect", (req, res) => {
    const ok = disconnectModel(req.params.id);
    if (!ok) return res.status(404).json({ error: "Model not found" });
    res.json({ ok: true });
  });

  // Test connection (also updates DB status)
  app.post("/api/models/:id/test", async (req, res) => {
    try {
      const result = await testConnection(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Conversations ────────────────────────────────────────────────────────
  app.get("/api/conversations", (req, res) => {
    res.json(storage.getConversations());
  });

  app.post("/api/conversations", (req, res) => {
    const rawTitle = req.body.title || "New Session";
    const title = typeof rawTitle === "string" ? rawTitle.slice(0, 200) : "New Session";
    const conv = storage.createConversation({
      id: uuidv4(),
      title,
      status: "idle",
      orchestratorModelId: req.body.orchestratorModelId || null,
      activeSkillIds: "[]",
    });
    res.json(conv);
  });

  app.patch("/api/conversations/:id", (req, res) => {
    // Whitelist allowed fields to prevent mass assignment
    const { title, status, orchestratorModelId, activeSkillIds } = req.body;
    const allowedUpdate: Record<string, any> = {};
    if (title !== undefined) allowedUpdate.title = title;
    if (status !== undefined) allowedUpdate.status = status;
    if (orchestratorModelId !== undefined) allowedUpdate.orchestratorModelId = orchestratorModelId;
    if (activeSkillIds !== undefined) allowedUpdate.activeSkillIds = activeSkillIds;
    const updated = storage.updateConversation(req.params.id, allowedUpdate);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/conversations/:id", (req, res) => {
    storage.deleteConversation(req.params.id);
    res.json({ ok: true });
  });

  // ─── Messages ─────────────────────────────────────────────────────────────
  app.get("/api/conversations/:id/messages", (req, res) => {
    res.json(storage.getMessages(req.params.id));
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
    if (content.length > 100_000) return res.status(400).json({ error: "Message too long (max 100,000 characters)" });

    const convId = req.params.id;

    let userMsg: any;
    try {
      const conv = storage.getConversation(convId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });

      // Save user message
      userMsg = storage.createMessage({
        id: uuidv4(),
        conversationId: convId,
        role: "user",
        content,
        metadata: "{}",
      });

      // Update conversation title from first message
      const msgs = storage.getMessages(convId);
      if (msgs.length === 1) {
        const title = content.slice(0, 60) + (content.length > 60 ? "..." : "");
        storage.updateConversation(convId, { title });
      }
    } catch (err: any) {
      console.error("[routes] Storage error creating message:", err);
      return res.status(500).json({ error: "Failed to save message" });
    }

    res.json(userMsg);

    // Run orchestrator async (non-blocking)
    runOrchestrator(convId, content).catch(err => {
      console.error("Orchestrator error:", err);
    });
  });

  // ─── SSE Stream ───────────────────────────────────────────────────────────
  app.get("/api/conversations/:id/stream", (req, res) => {
    const convId = req.params.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: any) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected — unsubscribe on next tick
        unsubscribeFromConversation(convId, send);
      }
    };

    subscribeToConversation(convId, send);

    // Keep-alive ping
    const ping = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(ping);
        unsubscribeFromConversation(convId, send);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      unsubscribeFromConversation(convId, send);
    });
  });

  // ─── Tasks ────────────────────────────────────────────────────────────────
  app.get("/api/conversations/:id/tasks", (req, res) => {
    res.json(storage.getTasks(req.params.id));
  });

  app.get("/api/conversations/:id/agent-runs", (req, res) => {
    res.json(storage.getAgentRuns(req.params.id));
  });

  app.get("/api/all-agent-runs", (req, res) => {
    res.json(storage.getAllAgentRuns());
  });

  // ─── Skills ───────────────────────────────────────────────────────────────
  app.get("/api/skills", (req, res) => {
    res.json(storage.getSkills());
  });

  app.post("/api/skills", (req, res) => {
    const { name, description, content, triggerKeywords, enabled } = req.body;
    if (!name || !content) return res.status(400).json({ error: "name and content required" });
    if (typeof name !== "string" || name.length > 200) return res.status(400).json({ error: "name must be a string (max 200 chars)" });
    if (typeof content !== "string" || content.length > 100_000) return res.status(400).json({ error: "content must be a string (max 100,000 chars)" });
    const skill = storage.createSkill({
      id: uuidv4(),
      name,
      description: description || "",
      content,
      triggerKeywords: JSON.stringify(triggerKeywords || []),
      embeddings: null,
      isBuiltIn: false,
      enabled: enabled ?? true,
    });
    res.json(skill);
  });

  app.patch("/api/skills/:id", (req, res) => {
    // Whitelist allowed fields to prevent mass assignment
    const { name, description, content, triggerKeywords, enabled } = req.body;
    const allowedUpdate: Record<string, any> = {};
    if (name !== undefined) allowedUpdate.name = name;
    if (description !== undefined) allowedUpdate.description = description;
    if (content !== undefined) allowedUpdate.content = content;
    if (triggerKeywords !== undefined) allowedUpdate.triggerKeywords = triggerKeywords;
    if (enabled !== undefined) allowedUpdate.enabled = enabled;
    const updated = storage.updateSkill(req.params.id, allowedUpdate);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/skills/:id", (req, res) => {
    const skill = storage.getSkill(req.params.id);
    if (skill?.isBuiltIn) return res.status(400).json({ error: "Cannot delete built-in skill" });
    storage.deleteSkill(req.params.id);
    res.json({ ok: true });
  });

  // ─── Connectors ───────────────────────────────────────────────────────────
  app.get("/api/connectors", (req, res) => {
    // Never expose api_key/tokens to frontend
    const connectors = storage.getConnectors().map(c => ({ ...c, config: undefined }));
    res.json(connectors);
  });

  app.post("/api/connectors", (req, res) => {
    const { name, type, category, description, mcpServerUrl } = req.body;
    if (!name || !type) return res.status(400).json({ error: "name and type required" });
    if (typeof name !== "string" || name.length > 200) return res.status(400).json({ error: "name must be a string (max 200 chars)" });
    if (typeof type !== "string" || type.length > 100) return res.status(400).json({ error: "type must be a string (max 100 chars)" });
    const connector = storage.createConnector({
      id: uuidv4(),
      name,
      type,
      category: category || "custom",
      description: description || "",
      status: "disconnected",
      config: "{}",
      mcpServerUrl: mcpServerUrl || null,
      scopes: "[]",
      logoUrl: null,
    });
    res.json({ ...connector, config: undefined });
  });

  app.post("/api/connectors/:id/connect", (req, res) => {
    const { apiKey, serverUrl, ...extra } = req.body;
    const updated = connectWithApiKey(req.params.id, apiKey || "", { serverUrl, ...extra });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, config: undefined });
  });

  app.post("/api/connectors/:id/disconnect", (req, res) => {
    const updated = storage.updateConnector(req.params.id, { status: "disconnected", config: "{}" });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, config: undefined });
  });

  app.post("/api/connectors/:id/call", async (req, res) => {
    const { toolName, args } = req.body;
    if (!toolName || typeof toolName !== "string" || toolName.length > 200) {
      return res.status(400).json({ error: "toolName is required (string, max 200 chars)" });
    }
    try {
      const result = await callMCPTool(req.params.id, toolName, args || {});
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/connectors/:id", (req, res) => {
    storage.deleteConnector(req.params.id);
    res.json({ ok: true });
  });

  // ─── Memory ───────────────────────────────────────────────────────────────
  app.get("/api/memory", (req, res) => {
    res.json(storage.getMemories(100));
  });

  app.post("/api/memory", (req, res) => {
    const { content, summary, category, importance } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    const mem = storage.createMemory({
      id: uuidv4(),
      content,
      summary: summary || null,
      category: category || "general",
      importance: importance ?? 0.7,
      embeddings: null,
      sessionId: null,
      sourceMessageId: null,
    });
    res.json(mem);
  });

  app.delete("/api/memory/:id", (req, res) => {
    storage.deleteMemory(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/memory/search", (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });
    res.json(storage.searchMemories(query));
  });

  // ─── Settings ─────────────────────────────────────────────────────────────
  app.get("/api/settings", (req, res) => {
    const keys = ["theme", "default_model_id", "system_name", "max_tool_iterations", "sandbox_auto_enable"];
    const result: Record<string, string> = {};
    for (const k of keys) {
      const v = storage.getSetting(k);
      if (v !== null) result[k] = v;
    }
    res.json(result);
  });

  app.post("/api/settings", (req, res) => {
    const ALLOWED_SETTINGS = new Set(["theme", "default_model_id", "system_name", "max_tool_iterations", "sandbox_auto_enable", "sandbox_config"]);
    for (const [k, v] of Object.entries(req.body)) {
      if (!ALLOWED_SETTINGS.has(k)) continue; // silently skip unknown keys
      if (typeof v === "string" && v.length <= 10_000) storage.setSetting(k, v);
    }
    res.json({ ok: true });
  });

  // ─── Skill Script Library ─────────────────────────────────────────────────
  app.get("/api/skill-scripts", (req, res) => {
    const q = req.query.q as string | undefined;
    if (q) {
      res.json(storage.searchSkillScripts(q));
    } else {
      res.json(storage.getSkillScripts());
    }
  });

  app.get("/api/skill-scripts/:id", (req, res) => {
    const script = storage.getSkillScript(req.params.id);
    if (!script) return res.status(404).json({ error: "Not found" });
    res.json(script);
  });

  app.post("/api/skill-scripts", (req, res) => {
    const { name, description, language, content, tags, sourceConversationId, sourceToolCallId, filePath } = req.body;
    if (!name || !content) return res.status(400).json({ error: "name and content required" });

    const script = storage.createSkillScript({
      id: uuidv4(),
      name,
      description: description || "",
      language: language || "bash",
      content,
      tags: Array.isArray(tags) ? JSON.stringify(tags) : (tags || "[]"),
      version: 1,
      sourceConversationId: sourceConversationId || null,
      sourceToolCallId: sourceToolCallId || null,
      filePath: filePath || null,
      isFavorite: false,
    });

    // Create initial version
    storage.createSkillScriptVersion({
      id: uuidv4(),
      scriptId: script.id,
      version: 1,
      content,
      changeNote: "Initial version",
    });

    res.json(script);
  });

  app.patch("/api/skill-scripts/:id", (req, res) => {
    const existing = storage.getSkillScript(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const { content, changeNote, tags, ...rest } = req.body;
    const updateData: any = { ...rest };

    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? JSON.stringify(tags) : tags;
    }

    // If content changed, bump version and create version record
    if (content && content !== existing.content) {
      const newVersion = existing.version + 1;
      updateData.content = content;
      updateData.version = newVersion;

      storage.createSkillScriptVersion({
        id: uuidv4(),
        scriptId: existing.id,
        version: newVersion,
        content,
        changeNote: changeNote || `Updated to v${newVersion}`,
      });
    }

    const updated = storage.updateSkillScript(req.params.id, updateData);
    res.json(updated);
  });

  app.delete("/api/skill-scripts/:id", (req, res) => {
    storage.deleteSkillScript(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/skill-scripts/:id/versions", (req, res) => {
    const versions = storage.getSkillScriptVersions(req.params.id);
    res.json(versions);
  });

  app.post("/api/skill-scripts/:id/run", (req, res) => {
    const script = storage.getSkillScript(req.params.id);
    if (!script) return res.status(404).json({ error: "Not found" });
    storage.incrementSkillScriptUsage(script.id);
    // Return the script content — the frontend will insert it into a chat as a tool call
    res.json({ content: script.content, language: script.language, name: script.name });
  });

  // ─── Sandbox / Docker ──────────────────────────────────────────────────────
  app.get("/api/sandbox/status", async (req, res) => {
    try {
      const available = await dockerSandbox.isDockerAvailable();
      res.json({
        ...dockerSandbox.getStatus(),
        dockerAvailable: available,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sandbox/config", (req, res) => {
    const config = dockerSandbox.getConfig();
    res.json(config);
  });

  app.post("/api/sandbox/config", (req, res) => {
    const { image, cpuLimit, memoryLimit, execTimeoutMs, networkEnabled, maxContainers, idleTimeoutMs, enabled } = req.body;
    const update: Record<string, any> = {};
    if (image !== undefined) {
      const imgStr = String(image);
      // Validate Docker image name to prevent command injection
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-\/:@]*$/.test(imgStr)) {
        return res.status(400).json({ error: "Invalid Docker image name" });
      }
      update.image = imgStr;
    }
    if (cpuLimit !== undefined) update.cpuLimit = String(cpuLimit);
    if (memoryLimit !== undefined) update.memoryLimit = String(memoryLimit);
    if (execTimeoutMs !== undefined) {
      const val = Number(execTimeoutMs);
      if (isNaN(val) || val < 1000 || val > 600_000) return res.status(400).json({ error: "execTimeoutMs must be between 1000 and 600000" });
      update.execTimeoutMs = val;
    }
    if (networkEnabled !== undefined) update.networkEnabled = Boolean(networkEnabled);
    if (maxContainers !== undefined) {
      const val = Number(maxContainers);
      if (isNaN(val) || val < 1 || val > 50) return res.status(400).json({ error: "maxContainers must be between 1 and 50" });
      update.maxContainers = val;
    }
    if (idleTimeoutMs !== undefined) {
      const val = Number(idleTimeoutMs);
      if (isNaN(val) || val < 30_000 || val > 3_600_000) return res.status(400).json({ error: "idleTimeoutMs must be between 30000 and 3600000" });
      update.idleTimeoutMs = val;
    }
    if (enabled !== undefined) update.enabled = Boolean(enabled);

    dockerSandbox.updateConfig(update);

    // Persist config to settings
    storage.setSetting("sandbox_config", JSON.stringify(dockerSandbox.getConfig()));

    res.json(dockerSandbox.getConfig());
  });

  app.post("/api/sandbox/pull-image", async (req, res) => {
    try {
      const result = await dockerSandbox.pullImage();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ pulled: false, error: err.message });
    }
  });

  app.post("/api/sandbox/reset-detection", async (req, res) => {
    try {
      dockerSandbox.resetDetection();
      const available = await dockerSandbox.isDockerAvailable();
      res.json({ dockerAvailable: available });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sandbox/cleanup", async (req, res) => {
    try {
      await dockerSandbox.shutdown();
      res.json({ ok: true, message: "All sandbox containers removed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore sandbox config from settings on startup
  const savedConfig = storage.getSetting("sandbox_config");
  if (savedConfig) {
    try {
      dockerSandbox.updateConfig(JSON.parse(savedConfig));
    } catch { /* ignore corrupt config */ }
  }

  // Detect Docker availability at startup (non-blocking)
  dockerSandbox.isDockerAvailable().catch(() => {});

  // ─── Task Queue Status ──────────────────────────────────────────────────
  app.get("/api/queue/status", async (req, res) => {
    res.json({ available: taskQueue.isAvailable() });
  });

  app.get("/api/queue/job/:jobId", async (req, res) => {
    try {
      const status = await taskQueue.getJobStatus(req.params.jobId);
      if (!status) return res.status(404).json({ error: "Job not found" });
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Global Notifications SSE ──────────────────────────────────────────────
  // Aggregated SSE stream for the NotificationCenter component.
  // Subscribes to all active conversations and re-emits "done", "error", and
  // "agent_complete" events with a conversationId field attached.
  app.get("/api/notifications", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Subscribe to all current conversations
    const conversations = storage.getConversations();
    const handlers = new Map<string, (event: any) => void>();

    for (const conv of conversations) {
      const handler = (event: any) => {
        const NOTIFY_TYPES = new Set(["done", "error", "agent_complete", "task_update"]);
        if (NOTIFY_TYPES.has(event.type)) {
          send({ ...event, conversationId: conv.id });
        }
      };
      handlers.set(conv.id, handler);
      subscribeToConversation(conv.id, handler);
    }

    // Keep-alive ping
    const ping = setInterval(() => {
      res.write(": ping\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      Array.from(handlers.entries()).forEach(([convId, handler]) => {
        unsubscribeFromConversation(convId, handler);
      });
    });
  });

  // ─── Health ───────────────────────────────────────────────────────────────
  app.get("/api/health", async (req, res) => {
    const models = storage.getModels();
    const hasOrch = !!storage.getOrchestratorModel();
    const hasDefault = !!storage.getDefaultModel();
    res.json({
      status: "ok",
      modelCount: models.length,
      hasOrchestratorModel: hasOrch,
      hasDefaultModel: hasDefault,
      memoryCount: storage.getMemories(1000).length,
      skillCount: storage.getSkills().length,
      connectorCount: storage.getConnectors().length,
      sandbox: dockerSandbox.getStatus(),
      taskQueue: taskQueue.isAvailable(),
      marketplaceSkillCount: storage.getMarketplaceSkills().length,
    });
  });
}
