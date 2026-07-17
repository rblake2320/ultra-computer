import type { Express } from "express";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "./storage.js";
import { conversationService } from "./services/conversationService.js";
import { modelService } from "./services/modelService.js";
import { knowledgeService } from "./services/knowledgeService.js";
import { validate } from "./validateRequest.js";
import { insertConversationSchema, insertModelSchema } from "@shared/schema";
import { runOrchestrator, subscribeToConversation, unsubscribeFromConversation } from "./orchestrator.js";
import { testModelConnection } from "./modelRouter.js";
import { connectModel, disconnectModel, testConnection, quickAdd, discoverEnvVars, getProviderCatalog, PROVIDER_REGISTRY } from "./modelConnections.js";
import { seedConnectors, connectWithApiKey, callMCPTool, validateConnectorKey, getConnectorDef, BUILT_IN_CONNECTORS } from "./connectorRegistry.js";
import { seedBuiltInSkills, buildSkillVector, scheduleEmbeddingUpgrade } from "./skillSystem.js";
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
import { estimateTaskDuration, taskQueue } from "./taskQueue.js";
import { initWatchdog, getHealthStatus } from "./processWatchdog.js";
import { startCheckpointHeartbeats } from "./taskCheckpointing.js";
import { workflowIdFromMessage } from "./durableExecution.js";
import { startScheduler } from "./cronScheduler.js";
import { createStreamToken } from "./streamAuth.js";
import { governedFetch } from "./governedFetch.js";
import { startLearningLoop } from "./selfLearning.js";
import { startAutoImproveLoop } from "./skillAutoImprove.js";
import { registerCacheRoutes } from "./cacheRoutes.js";
import { cacheEngine } from "./cacheEngine.js";
import { knowledgeEngine } from "./knowledgeEngine.js";
import { registerSwarmRoutes } from "./swarmRoutes.js";
import { swarmEngine } from "./swarmEngine.js";
import { warmBrowserPool } from "./browserTool.js";
import { getSpendStatus, HARD_MAX_SPEND_USD } from "./spendGuard.js";

const sseConnectionsPerIp = new Map<string, number>();
const MAX_SSE_PER_IP = 5;

// ─── Validation schemas for knowledge endpoints ───────────────────────────────
// (KnowledgeEntry has no Zod insert schema exported from shared/schema.ts,
//  so we define a targeted one here with explicit length limits.)
const insertKnowledgeEntrySchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  content: z.string().min(1).max(500_000),
  contentType: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  tierPolicy: z.string().max(50).optional(),
});

// ─── OAuth state signing (HMAC-SHA256) ───────────────────────────────────────
// Prevents forged state parameters in OAuth CSRF attacks.
const OAUTH_STATE_SECRET = process.env.ENCRYPTION_KEY || process.env.ULTRA_API_KEY || "oauth-state-dev-secret-not-for-production";
if (!process.env.ENCRYPTION_KEY && !process.env.ULTRA_API_KEY && process.env.NODE_ENV === "production") {
  console.error("[FATAL] OAuth HMAC secret is using the insecure dev fallback in production. Set ENCRYPTION_KEY or ULTRA_API_KEY.");
}

function signOAuthState(payload: object): string {
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ d: data, h: hmac })).toString("base64url");
}

function verifyOAuthState(state: string): { connectorId: string; ts: number } | null {
  try {
    const { d, h } = JSON.parse(Buffer.from(state, "base64url").toString());
    const expected = crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(d).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(expected))) return null;
    return JSON.parse(d);
  } catch {
    return null;
  }
}

export async function registerRoutes(httpServer: Server, app: Express) {
  app.post("/api/auth/stream-token", (req, res) => {
    const path = typeof req.body?.path === "string" ? req.body.path.trim() : "";
    try {
      const token = createStreamToken(path);
      res.setHeader("Cache-Control", "no-store");
      res.json({ token, expiresInMs: 60_000 });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid stream token request",
      });
    }
  });

  // ─── Seed on startup ──────────────────────────────────────────────────────
  seedConnectors();
  seedBuiltInSkills();
  knowledgeEngine.seedIfEmpty();

  // Restore persisted LLM responses from Redis into in-memory cache (non-blocking)
  cacheEngine.warmFromRedis().then(n => {
    if (n > 0) console.log(`[cacheEngine] Restored ${n} entries from Redis`);
  }).catch(() => {});

  // Pre-warm browser pool so first browser task has no cold-start delay (non-blocking)
  warmBrowserPool().catch(() => {});

  // Load all-MiniLM-L6-v2 embedding model; once ready, upgrade skill TF-IDF → float32 vectors
  scheduleEmbeddingUpgrade();

  // ─── Register modular route groups ─────────────────────────────────────────
  registerFileRoutes(app);
  registerOAuthRoutes(app);
  registerExportRoutes(app);
  registerBrowserRoutes(app);
  registerProtocolRoutes(app);
  registerMessagingRoutes(app);
  registerCacheRoutes(app);

  const experimental = process.env.ULTRA_EXPERIMENTAL === "1";
  app.get("/api/app-config", (_req, res) => res.json({ experimental }));

  if (experimental) {
    registerMarketplaceRoutes(app);
    registerAutonomyRoutes(app);
    registerNIPRoutes(app);
    registerIdentityRoutes(app);
    registerSwarmRoutes(app);
    swarmEngine.restoreFromDB();
    setIdentityEngine(identityEngine);
    initWatchdog(httpServer, { installProcessHandlers: false });
    startCheckpointHeartbeats();
    startScheduler(async (job) => {
      if (job.taskType === "health_check") return JSON.stringify(getHealthStatus());
      return `Job ${job.name} executed`;
    });
    startLearningLoop();
    startAutoImproveLoop();
    console.log("[experimental] Swarm, NIP, Identity, Marketplace, and autonomy enabled");
  } else {
    console.log("[experimental] Optional surfaces disabled; set ULTRA_EXPERIMENTAL=1 to enable");
  }

  // ─── Initialize task queue (non-blocking) ──────────────────────────────────
  taskQueue.setProcessor(async (task) => {
    await runOrchestrator(task.conversationId, task.userMessage, {
      workflowId: workflowIdFromMessage(task.taskId),
      idempotencyKey: `message:${task.taskId}`,
      messageId: task.taskId,
      executionMode: "bullmq",
    });
    return "orchestrator completed";
  });

  taskQueue.initialize().then(available => {
    if (available) console.log("[taskQueue] BullMQ connected to Redis");
    else console.log("[taskQueue] Redis not available — queue disabled (graceful fallback). " +
      "All taskQueue.enqueue() calls will return synthetic IDs and log warnings.");
  }).catch((err) => {
    // initialize() has its own try/catch and should never reject, but if it
    // does the queue stays in its initial unavailable state (available=false).
    // Subsequent enqueue/status/cancel calls will degrade gracefully — they
    // check isAvailable() and log a warning before returning safe no-ops.
    console.error("[taskQueue] Initialization threw unexpectedly — queue permanently disabled:", err);
  });

  // ─── Models ───────────────────────────────────────────────────────────────
  app.get("/api/models", (req, res) => {
    // modelService.list() already strips apiKey and oauthTokens
    res.json(modelService.list());
  });

  // Provider catalog — frontend uses this to render auth options per provider
  app.get("/api/models/providers", (_req, res) => {
    res.json(modelService.getProviders());
  });

  // Discover environment variables already set on the server.
  // SECURITY NOTE: this endpoint reveals which API keys are configured on the
  // server (masked to first-6/last-4 characters).  It is intentionally placed
  // under /api/* so that it is covered by the auth middleware in
  // authMiddleware.ts — when ULTRA_API_KEY is set, all /api/* routes except
  // the explicit EXEMPT_ROUTES (health + webhook receivers) require a valid
  // bearer token.  This route is NOT in the exemption list and therefore
  // requires authentication in production.  In dev mode (no ULTRA_API_KEY) the
  // middleware is a pass-through, which is intentional and documented.
  app.get("/api/models/env-vars", (_req, res) => {
    res.json(modelService.discoverEnvVars());
  });

  app.get("/api/model-catalog", (req, res) => {
    const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;
    res.json({ entries: modelService.getCatalog(provider) });
  });

  app.post("/api/model-catalog/sync", async (req, res) => {
    const provider = typeof req.body?.provider === "string" ? req.body.provider.trim() : "";
    if (!provider) return res.status(400).json({ error: "provider is required" });
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : undefined;
    const baseUrl = typeof req.body?.baseUrl === "string" ? req.body.baseUrl.trim() : undefined;
    if (apiKey && apiKey.length > 4096) return res.status(400).json({ error: "apiKey is too long" });
    if (baseUrl && baseUrl.length > 2048) return res.status(400).json({ error: "baseUrl is too long" });
    try {
      res.json(await modelService.syncCatalog(provider, { apiKey, baseUrl }));
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Model catalog sync failed";
      const status = /Unknown provider|No configured credentials/.test(message) ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/models/:id", (req, res) => {
    try {
      res.json(modelService.get(req.params.id));
    } catch {
      res.status(404).json({ error: "Model not found" });
    }
  });

  app.post("/api/models", (req, res) => {
    const body = { ...(req.body ?? {}) };
    if (!body.id) body.id = uuidv4();
    if (Array.isArray(body.capabilities)) body.capabilities = JSON.stringify(body.capabilities);
    let input: any;
    try {
      input = validate(insertModelSchema, body);
    } catch (e: any) {
      return res.status(e.statusCode ?? 400).json({ error: e.message });
    }

    const { id, name, provider, modelId, baseUrl, apiKey, capabilities, contextWindow,
            isDefault, isOrchestrator, speedTier, notes, authMethod, envVarName } = input;
    if (!name || !provider || !modelId) return res.status(400).json({ error: "name, provider, modelId required" });
    if (typeof name !== "string" || name.length > 500) return res.status(400).json({ error: "name must be a string (max 500 chars)" });
    if (typeof modelId !== "string" || modelId.length > 500) return res.status(400).json({ error: "modelId must be a string (max 500 chars)" });

    // If setting as default, unset others
    if (isDefault) {
      storage.getModels().forEach(m => storage.updateModel(m.id, { isDefault: false }));
    }
    if (isOrchestrator) {
      storage.getModels().forEach(m => storage.updateModel(m.id, { isOrchestrator: false }));
    }

    let model;
    try {
      model = modelService.create({
        id,
        name,
        provider,
        modelId,
        baseUrl: baseUrl || null,
        apiKey: apiKey || null,
        enabled: true,
        capabilities: capabilities || '["chat"]',
        contextWindow: contextWindow || 8192,
        isDefault: isDefault || false,
        isOrchestrator: isOrchestrator || false,
        speedTier: speedTier || "medium",
        notes: notes || null,
        authMethod: authMethod || "api_key",
        envVarName: envVarName || null,
        connectionStatus: "unconfigured",
      } as any);
    } catch (err: any) {
      if (err.message?.includes("UNIQUE") || err.message?.includes("unique")) {
        return res.status(409).json({ error: "A model with this ID already exists" });
      }
      throw err;
    }
    res.status(201).json(model);
  });

  // Quick-add: create model from preset + connect in one step
  // Accepts credentials flat ({apiKey, envVarName, baseUrl}) or nested ({credentials: {apiKey, ...}})
  app.post("/api/models/quick-add", async (req, res) => {
    try {
      const { provider, presetModelId, authMethod, credentials } = req.body;
      // Support both flat and nested credential formats
      const apiKey = req.body.apiKey || credentials?.apiKey;
      const envVarName = req.body.envVarName || credentials?.envVarName;
      const baseUrl = req.body.baseUrl || credentials?.baseUrl;
      if (!provider || !presetModelId) return res.status(400).json({ error: "provider and presetModelId required" });
      const result = await modelService.quickAdd(provider, presetModelId, authMethod || "api_key", {
        apiKey, envVarName, baseUrl,
      });
      if (!result.model) return res.status(400).json({ error: "Invalid provider or preset model" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/models/:id", (req, res) => {
    let input: any;
    try {
      input = validate(insertModelSchema.partial(), req.body);
    } catch (e: any) {
      return res.status(e.statusCode ?? 400).json({ error: e.message });
    }

    const { isDefault, isOrchestrator } = input;
    if (isDefault) storage.getModels().forEach(m => storage.updateModel(m.id, { isDefault: false }));
    if (isOrchestrator) storage.getModels().forEach(m => storage.updateModel(m.id, { isOrchestrator: false }));
    // Whitelist allowed fields to prevent mass assignment
    const { name, modelId, enabled, speedTier, notes, isDefault: _isDefault, isOrchestrator: _isOrch, contextWindow, capabilities } = input;
    const allowedUpdate: Record<string, any> = {};
    if (name !== undefined) allowedUpdate.name = name;
    if (modelId !== undefined) allowedUpdate.modelId = modelId;
    if (enabled !== undefined) allowedUpdate.enabled = enabled;
    if (speedTier !== undefined) allowedUpdate.speedTier = speedTier;
    if (notes !== undefined) allowedUpdate.notes = notes;
    if (_isDefault !== undefined) allowedUpdate.isDefault = _isDefault;
    if (_isOrch !== undefined) allowedUpdate.isOrchestrator = _isOrch;
    if (contextWindow !== undefined) allowedUpdate.contextWindow = contextWindow;
    if (capabilities !== undefined) allowedUpdate.capabilities = capabilities;
    try {
      res.json(modelService.update(req.params.id, allowedUpdate));
    } catch {
      res.status(404).json({ error: "Model not found" });
    }
  });

  app.delete("/api/models/:id", (req, res) => {
    try {
      modelService.delete(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: "Model not found" });
    }
  });

  // Connect a model with specific auth method and credentials
  app.post("/api/models/:id/connect", async (req, res) => {
    try {
      const { authMethod, apiKey, envVarName, baseUrl } = req.body;
      const result = await modelService.connect(req.params.id, authMethod || "api_key", {
        apiKey, envVarName, baseUrl,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Disconnect — clears credentials, resets status
  app.post("/api/models/:id/disconnect", (req, res) => {
    const ok = modelService.disconnect(req.params.id);
    if (!ok) return res.status(404).json({ error: "Model not found" });
    res.json({ ok: true });
  });

  // Test connection (also updates DB status)
  app.post("/api/models/:id/test", async (req, res) => {
    try {
      const result = await modelService.test(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Conversations ────────────────────────────────────────────────────────
  app.get("/api/conversations", (req, res) => {
    res.json(conversationService.list());
  });

  app.get("/api/conversations/:id", (req, res) => {
    try {
      res.json(conversationService.get(req.params.id));
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.post("/api/conversations", (req, res) => {
    try {
      const input = validate(insertConversationSchema.partial(), req.body);
      const rawTitle = input.title || "New Session";
      const title = typeof rawTitle === "string" ? rawTitle.slice(0, 500) : "New Session";
      const conv = conversationService.create({
        id: uuidv4(),
        title,
        status: input.status ?? "idle",
        orchestratorModelId: input.orchestratorModelId ?? null,
        activeSkillIds: input.activeSkillIds ?? "[]",
      });
      res.status(201).json(conv);
    } catch (e: any) {
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  app.patch("/api/conversations/:id", (req, res) => {
    try {
      const input = validate(insertConversationSchema.partial(), req.body);
      // Whitelist allowed fields to prevent mass assignment
      const allowedUpdate: Record<string, any> = {};
      if (input.title !== undefined) allowedUpdate.title = input.title;
      if (input.status !== undefined) allowedUpdate.status = input.status;
      if (input.orchestratorModelId !== undefined) allowedUpdate.orchestratorModelId = input.orchestratorModelId;
      if (input.activeSkillIds !== undefined) allowedUpdate.activeSkillIds = input.activeSkillIds;
      res.json(conversationService.update(req.params.id, allowedUpdate));
    } catch (e: any) {
      res.status(e.statusCode ?? 404).json({ error: e.message });
    }
  });

  app.delete("/api/conversations/:id", (req, res) => {
    try {
      conversationService.get(req.params.id); // throws if not found
      conversationService.delete(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  // ─── Messages ─────────────────────────────────────────────────────────────
  app.get("/api/conversations/:id/messages", (req, res) => {
    res.json(conversationService.getMessages(req.params.id));
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

    res.status(201).json(userMsg);

    const workflowId = workflowIdFromMessage(userMsg.id);
    const estimatedDuration = estimateTaskDuration(content, storage.getTasks(convId).length);

    if (taskQueue.isAvailable()) {
      taskQueue.enqueue({
        conversationId: convId,
        taskId: userMsg.id,
        userMessage: content,
        estimatedDuration,
      }).then((jobId) => {
        if (jobId.startsWith("unavailable:") || jobId.startsWith("error:")) {
          console.warn(`[routes] Queue degraded for message ${userMsg.id}; falling back to direct in-process execution.`);
          runOrchestrator(convId, content, {
            workflowId,
            idempotencyKey: `message:${userMsg.id}`,
            messageId: userMsg.id,
            executionMode: "direct",
          }).catch(orchestratorErr => {
            console.error("Orchestrator error:", orchestratorErr);
          });
          return;
        }
        console.log(`[routes] Enqueued orchestrator workflow ${workflowId} as job ${jobId}.`);
      }).catch(err => {
        console.error("[routes] Queue enqueue failed; falling back to direct orchestrator:", err);
        runOrchestrator(convId, content, {
          workflowId,
          idempotencyKey: `message:${userMsg.id}`,
          messageId: userMsg.id,
          executionMode: "direct",
        }).catch(orchestratorErr => {
          console.error("Orchestrator error:", orchestratorErr);
        });
      });
      return;
    }

    // Run orchestrator async (non-blocking). This is NOT durable execution proof.
    runOrchestrator(convId, content, {
      workflowId,
      idempotencyKey: `message:${userMsg.id}`,
      messageId: userMsg.id,
      executionMode: "direct",
    }).catch(err => {
      console.error("Orchestrator error:", err);
    });
  });

  // ─── SSE Stream ───────────────────────────────────────────────────────────
  const SSE_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  const SSE_MAX_EVENTS = 10_000;

  app.get("/api/conversations/:id/stream", (req, res) => {
    const clientIp = (req.ip || req.socket?.remoteAddress || "unknown") as string;
    const ipCount = sseConnectionsPerIp.get(clientIp) ?? 0;
    if (ipCount >= MAX_SSE_PER_IP) {
      return res.status(429).json({ error: "Too many SSE connections from this IP" });
    }
    sseConnectionsPerIp.set(clientIp, ipCount + 1);

    const convId = req.params.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let eventCount = 0;

    const cleanup = () => {
      clearInterval(ping);
      clearTimeout(maxDurationTimer);
      unsubscribeFromConversation(convId, send);
    };

    const send = (event: any) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        eventCount++;
        if (eventCount >= SSE_MAX_EVENTS) {
          // Gracefully close the stream after hitting the event cap.
          res.write(`data: ${JSON.stringify({ type: "stream_limit", reason: "Max events reached" })}\n\n`);
          cleanup();
          res.end();
        }
      } catch {
        // Client disconnected — unsubscribe on next tick
        cleanup();
      }
    };

    subscribeToConversation(convId, send);

    // Keep-alive ping
    const ping = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        cleanup();
      }
    }, 15000);

    // Hard cap: close the stream after 30 minutes of inactivity or wall-clock time.
    const maxDurationTimer = setTimeout(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: "stream_timeout", reason: "Stream closed after 30 minutes" })}\n\n`);
      } catch { /* ignore write errors on timeout */ }
      cleanup();
      res.end();
    }, SSE_MAX_DURATION_MS);

    req.on("close", () => {
      const count = sseConnectionsPerIp.get(clientIp) ?? 1;
      if (count <= 1) sseConnectionsPerIp.delete(clientIp);
      else sseConnectionsPerIp.set(clientIp, count - 1);
      cleanup();
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

  app.get("/api/skills/:id", (req, res) => {
    const skill = storage.getSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    res.json(skill);
  });

  app.post("/api/skills", (req, res) => {
    const { name, description, content, triggerKeywords, enabled } = req.body;
    if (!name || !content) return res.status(400).json({ error: "name and content required" });
    if (typeof name !== "string" || name.length > 200) return res.status(400).json({ error: "name must be a string (max 200 chars)" });
    if (typeof content !== "string" || content.length > 100_000) return res.status(400).json({ error: "content must be a string (max 100,000 chars)" });
    const skillData = {
      id: uuidv4(),
      name,
      description: description || "",
      content,
      triggerKeywords: JSON.stringify(triggerKeywords || []),
      embeddings: null as string | null,
      isBuiltIn: false,
      enabled: enabled ?? true,
    };
    skillData.embeddings = buildSkillVector(skillData);
    const skill = storage.createSkill(skillData);
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
    // Recompute TF-IDF vector if any text field changed
    const vectorFields = ["name", "description", "content", "triggerKeywords"] as const;
    if (vectorFields.some(f => allowedUpdate[f] !== undefined)) {
      const current = storage.getSkill(req.params.id);
      if (current) {
        const merged = {
          name: allowedUpdate.name ?? current.name,
          description: allowedUpdate.description ?? current.description,
          content: allowedUpdate.content ?? current.content,
          triggerKeywords: allowedUpdate.triggerKeywords ?? current.triggerKeywords,
        };
        allowedUpdate.embeddings = buildSkillVector(merged);
      }
    }
    const updated = storage.updateSkill(req.params.id, allowedUpdate);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/skills/:id", (req, res) => {
    const skill = storage.getSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    if (skill.isBuiltIn) return res.status(400).json({ error: "Cannot delete built-in skill" });
    storage.deleteSkill(req.params.id);
    res.json({ ok: true });
  });

  // ─── Connectors ───────────────────────────────────────────────────────────
  // Connector definitions (field schemas, OAuth URLs, etc.) — no sensitive data
  app.get("/api/connectors/defs", (_req, res) => {
    res.json(BUILT_IN_CONNECTORS.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      category: d.category,
      description: d.description,
      logoUrl: d.logoUrl || null,
      fields: d.fields || [],
      scopes: d.scopes || [],
      mcpServerUrl: d.mcpServerUrl || null,
      oauthAuthUrl: d.oauthAuthUrl || null,
      validateUrl: d.validateUrl || null,
    })));
  });

  app.get("/api/connectors", (req, res) => {
    // Never expose api_key/tokens to frontend
    const connectors = storage.getConnectors().map(c => ({ ...c, config: undefined }));
    res.json(connectors);
  });

  app.get("/api/connectors/:id", (req, res) => {
    const connector = storage.getConnector(req.params.id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    res.json({ ...connector, config: undefined });
  });

  const CONNECTOR_CATEGORY_ALLOWLIST = new Set(["custom", "productivity", "communication", "developer", "data", "storage", "crm", "finance", "security", "ai", "social", "ecommerce", "analytics", "infrastructure"]);

  app.post("/api/connectors", (req, res) => {
    const { name, type, category, description, mcpServerUrl } = req.body;
    if (!name || !type) return res.status(400).json({ error: "name and type required" });
    if (typeof name !== "string" || name.length > 200) return res.status(400).json({ error: "name must be a string (max 200 chars)" });
    if (typeof type !== "string" || type.length > 100) return res.status(400).json({ error: "type must be a string (max 100 chars)" });
    const resolvedCategory = category || "custom";
    if (!CONNECTOR_CATEGORY_ALLOWLIST.has(resolvedCategory)) {
      return res.status(400).json({ error: `category must be one of: ${[...CONNECTOR_CATEGORY_ALLOWLIST].join(", ")}` });
    }
    const connector = storage.createConnector({
      id: uuidv4(),
      name,
      type,
      category: resolvedCategory,
      description: description || "",
      status: "disconnected",
      config: "{}",
      mcpServerUrl: mcpServerUrl || null,
      scopes: "[]",
      logoUrl: null,
    });
    res.status(201).json({ ...connector, config: undefined });
  });

  app.patch("/api/connectors/:id", (req, res) => {
    const connector = storage.getConnector(req.params.id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    const { name, description, type, category, mcpServerUrl } = req.body;
    const allowedUpdate: Record<string, any> = {};
    if (name !== undefined) allowedUpdate.name = name;
    if (description !== undefined) allowedUpdate.description = description;
    if (type !== undefined) allowedUpdate.type = type;
    if (category !== undefined) allowedUpdate.category = category;
    if (mcpServerUrl !== undefined) allowedUpdate.mcpServerUrl = mcpServerUrl;
    const updated = storage.updateConnector(connector.id, allowedUpdate);
    res.json({ ...updated, config: undefined });
  });

  app.post("/api/connectors/:id/connect", async (req, res) => {
    const { apiKey, serverUrl, client_id, client_secret, ...extra } = req.body;
    if (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length >= 500)) {
      return res.status(400).json({ error: "apiKey must be a string under 500 characters" });
    }
    // For OAuth connectors, store client credentials and return OAuth URL
    const def = getConnectorDef(req.params.id);
    if (def?.type === "oauth" && client_id) {
      const config = JSON.stringify({ client_id, client_secret, ...(apiKey ? { apiKey } : {}), ...extra });
      const updated = storage.updateConnector(req.params.id, {
        status: "pending",
        config,
        lastSynced: Date.now(),
      });
      if (!updated) return res.status(404).json({ error: "Not found" });
      // Build OAuth authorization URL
      const state = signOAuthState({ connectorId: req.params.id, ts: Date.now() });
      const redirectUri = `${req.protocol}://${req.get("host")}/api/connectors/oauth/callback`;
      const authUrl = new URL(def.oauthAuthUrl!);
      authUrl.searchParams.set("client_id", client_id);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);
      if (def.scopes?.length) authUrl.searchParams.set("scope", def.scopes.join(" "));
      return res.json({ ...updated, config: undefined, oauthUrl: authUrl.toString(), state });
    }
    // For API key connectors, validate the key first
    if (apiKey && def?.validateUrl) {
      const validation = await validateConnectorKey(req.params.id, apiKey);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || "API key validation failed" });
      }
    }
    const updated = connectWithApiKey(req.params.id, apiKey || "", { serverUrl, ...extra });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, config: undefined });
  });

  // OAuth callback handler for connector OAuth flows
  app.get("/api/connectors/oauth/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`/?connector_error=${encodeURIComponent(String(error))}`);
    }
    if (!code || !state) {
      return res.redirect("/?connector_error=missing_code_or_state");
    }
    let connectorId: string;
    const decoded = verifyOAuthState(String(state));
    if (!decoded) {
      return res.redirect("/?connector_error=invalid_state");
    }
    connectorId = decoded.connectorId;
    if (Date.now() - decoded.ts > 10 * 60 * 1000) {
      return res.redirect("/?connector_error=state_expired");
    }
    const connector = storage.getConnector(connectorId);
    if (!connector) return res.redirect("/?connector_error=connector_not_found");
    const def = getConnectorDef(connectorId);
    if (!def?.oauthTokenUrl) return res.redirect("/?connector_error=no_token_url");
    let config: Record<string, any> = {};
    try { config = JSON.parse(connector.config || "{}"); } catch { config = {}; }
    try {
      const redirectUri = `${req.protocol}://${req.get("host")}/api/connectors/oauth/callback`;
      const tokenRes = await governedFetch(def.oauthTokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(code),
          redirect_uri: redirectUri,
          client_id: config.client_id || "",
          client_secret: config.client_secret || "",
        }).toString(),
      }, `oauth-${connectorId}`, "network", "network:oauth_token_exchange", {
        timeoutMs: 15_000,
        maxResponseBytes: 1024 * 1024,
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error(`[connector oauth] Token exchange failed for ${connectorId}:`, errText);
        return res.redirect(`/?connector_error=token_exchange_failed`);
      }
      const tokenData = await tokenRes.json() as any;
      const newConfig = JSON.stringify({
        ...config,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        tokenFetchedAt: Date.now(),
      });
      storage.updateConnector(connectorId, { status: "connected", config: newConfig, lastSynced: Date.now() });
      return res.redirect(`/?connector_connected=${encodeURIComponent(connectorId)}`);
    } catch (err: any) {
      console.error(`[connector oauth] Error for ${connectorId}:`, err);
      return res.redirect(`/?connector_error=oauth_failed`);
    }
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
    const existing = storage.getConnector(req.params.id);
    if (!existing) return res.status(404).json({ error: "Connector not found" });
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
    if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
    if (importance !== undefined) {
      const imp = Number(importance);
      if (isNaN(imp) || imp < 0 || imp > 1) return res.status(400).json({ error: "importance must be a number between 0 and 1" });
    }
    if (category !== undefined) {
      if (typeof category !== "string" || category.length > 100) return res.status(400).json({ error: "category must be a string (max 100 chars)" });
    }
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
    res.status(201).json(mem);
  });

  app.delete("/api/memory/:id", (req, res) => {
    const existing = storage.getMemories(10000).find(m => m.id === req.params.id);
    if (!existing) return res.status(404).json({ error: "Memory not found" });
    storage.deleteMemory(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/memory/search", (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });
    res.json(storage.searchMemories(query));
  });

  app.get("/api/spend", (_req, res) => {
    res.json(getSpendStatus());
  });

  // ─── Settings ─────────────────────────────────────────────────────────────
  app.get("/api/settings", (req, res) => {
    const keys = ["theme", "default_model_id", "system_name", "max_tool_iterations", "sandbox_auto_enable", "spend_limit_usd",
      "model_for_decomposition", "model_for_workers", "model_for_swarm", "model_for_synthesis", "model_for_memory"];
    const result: Record<string, string> = {};
    for (const k of keys) {
      const v = storage.getSetting(k);
      if (v !== null) result[k] = v;
    }
    res.json(result);
  });

  app.post("/api/settings", (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Request body must be a plain object" });
    }
    const ALLOWED_SETTINGS = new Set(["theme", "default_model_id", "system_name", "max_tool_iterations", "sandbox_auto_enable", "sandbox_config", "spend_limit_usd",
      "model_for_decomposition", "model_for_workers", "model_for_swarm", "model_for_synthesis", "model_for_memory"]);
    for (const [k, v] of Object.entries(req.body)) {
      if (!ALLOWED_SETTINGS.has(k)) continue; // silently skip unknown keys
      if (k === "spend_limit_usd") {
        const parsed = typeof v === "string" ? Number(v) : NaN;
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > HARD_MAX_SPEND_USD) {
          return res.status(400).json({
            error: `spend_limit_usd must be between 0 and ${HARD_MAX_SPEND_USD}`,
          });
        }
      }
      if (typeof v === "string" && v.length <= 10_000) storage.setSetting(k, v);
    }
    res.json({ ok: true });
  });

  // ─── Skill Script Library ─────────────────────────────────────────────────
  app.get("/api/skill-scripts", (req, res) => {
    const q = req.query.q as string | undefined;
    if (q) {
      if (q.length > 500) return res.status(400).json({ error: "Search query too long (max 500 chars)" });
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

    const script = storage.createSkillScript({  // will return 201 below
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

    res.status(201).json(script);
  });

  app.patch("/api/skill-scripts/:id", (req, res) => {
    const existing = storage.getSkillScript(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    // Explicit allowlist — no mass assignment via ...rest
    const { content, changeNote, tags, name, description, language, filePath, isFavorite } = req.body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (language !== undefined) updateData.language = language;
    if (filePath !== undefined) updateData.filePath = filePath;
    if (isFavorite !== undefined) updateData.isFavorite = isFavorite;

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
    const existing = storage.getSkillScript(req.params.id);
    if (!existing) return res.status(404).json({ error: "Skill script not found" });
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
  //
  // Hardening: 30-minute inactivity timeout and 10,000 event cap (matches the
  // per-conversation SSE stream hardened in the same codebase).
  app.get("/api/notifications", (req, res) => {
    const clientIp = (req.ip || req.socket?.remoteAddress || "unknown") as string;
    const ipCount = sseConnectionsPerIp.get(clientIp) ?? 0;
    if (ipCount >= MAX_SSE_PER_IP) {
      return res.status(429).json({ error: "Too many SSE connections from this IP" });
    }
    sseConnectionsPerIp.set(clientIp, ipCount + 1);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let eventCount = 0;
    const NOTIF_MAX_EVENTS = SSE_MAX_EVENTS;
    const NOTIF_MAX_DURATION_MS = SSE_MAX_DURATION_MS;

    // Subscribe to all current conversations
    const conversations = storage.getConversations();
    const handlers = new Map<string, (event: any) => void>();

    const cleanup = () => {
      clearInterval(ping);
      clearTimeout(maxDurationTimer);
      Array.from(handlers.entries()).forEach(([convId, handler]) => {
        unsubscribeFromConversation(convId, handler);
      });
    };

    // Reset inactivity timer on each event sent
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        try {
          res.write(`data: ${JSON.stringify({ type: "stream_timeout", reason: "Stream closed after 30 minutes of inactivity" })}\n\n`);
        } catch { /* ignore */ }
        cleanup();
        res.end();
      }, NOTIF_MAX_DURATION_MS);
    };
    resetInactivityTimer();

    const send = (event: any) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        eventCount++;
        resetInactivityTimer();
        if (eventCount >= NOTIF_MAX_EVENTS) {
          // Gracefully close after hitting the event cap.
          try {
            res.write(`data: ${JSON.stringify({ type: "stream_limit", reason: "Max events reached" })}\n\n`);
          } catch { /* ignore */ }
          cleanup();
          res.end();
        }
      } catch {
        // Client disconnected — cleanup handled on "close" event
      }
    };

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

    // Hard wall-clock cap: close after 30 minutes regardless of activity.
    const maxDurationTimer = setTimeout(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: "stream_timeout", reason: "Stream closed after 30 minutes" })}\n\n`);
      } catch { /* ignore */ }
      cleanup();
      res.end();
    }, NOTIF_MAX_DURATION_MS);

    // Keep-alive ping
    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, 15000);

    req.on("close", () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      const count = sseConnectionsPerIp.get(clientIp) ?? 1;
      if (count <= 1) sseConnectionsPerIp.delete(clientIp);
      else sseConnectionsPerIp.set(clientIp, count - 1);
      cleanup();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Knowledge Base API
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/knowledge", (_req, res) => {
    res.json(knowledgeService.list());
  });

  app.get("/api/knowledge/stats", (_req, res) => {
    res.json(knowledgeService.getStats());
  });

  app.get("/api/knowledge/search", (req, res) => {
    const q = (req.query.q as string) || "";
    res.json(knowledgeService.search(q));
  });

  app.get("/api/knowledge/:id", (req, res) => {
    try {
      res.json(knowledgeService.get(req.params.id));
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.post("/api/knowledge", async (req, res) => {
    let input: any;
    try {
      input = validate(insertKnowledgeEntrySchema, req.body);
    } catch (e: any) {
      return res.status(e.statusCode ?? 400).json({ error: e.message });
    }

    try {
      const { name, description, content, contentType, category, tags, priority, tierPolicy } = input;
      const entry = await knowledgeService.create({
        name,
        description,
        content,
        contentType,
        category,
        tags: tags ? (typeof tags === "string" ? tags : JSON.stringify(tags)) : undefined,
        priority,
        tierPolicy,
      });
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/knowledge/:id", (req, res) => {
    let input: any;
    try {
      input = validate(insertKnowledgeEntrySchema.partial(), req.body);
    } catch (e: any) {
      return res.status(e.statusCode ?? 400).json({ error: e.message });
    }

    const updates: Record<string, any> = {};
    const allowedFields = ["name", "description", "content", "contentType", "category", "tags", "enabled", "priority", "tierPolicy"] as const;
    for (const field of allowedFields) {
      if (input[field] !== undefined) updates[field] = input[field];
    }
    // Recalculate size/tokens if content changed
    if (updates.content) {
      updates.sizeBytes = Buffer.byteLength(updates.content);
      updates.tokenEstimate = Math.ceil(updates.content.length / 4);
    }
    if (updates.tags && typeof updates.tags !== "string") {
      updates.tags = JSON.stringify(updates.tags);
    }
    try {
      res.json(knowledgeService.update(req.params.id, updates));
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/knowledge/:id", (req, res) => {
    try {
      knowledgeService.delete(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  // Reseed system references (useful after model updates)
  app.post("/api/knowledge/reseed", (_req, res) => {
    const result = knowledgeService.reseed();
    res.json(result);
  });

  // Preview what would be injected for a given tier
  app.get("/api/knowledge/preview/:tier", (req, res) => {
    const tier = req.params.tier as "fast" | "medium" | "powerful";
    if (!["fast", "medium", "powerful"].includes(tier)) {
      return res.status(400).json({ error: "tier must be fast, medium, or powerful" });
    }
    const contextWindow = parseInt(req.query.contextWindow as string) || 128000;
    const query = req.query.q as string | undefined;
    const result = knowledgeService.preview(tier, contextWindow, query);
    res.json(result);
  });
}
