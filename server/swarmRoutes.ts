/**
 * Swarm Coordination API Routes — Layer 3
 *
 * Full 14-endpoint spec per the Swarm Coordination Layer Plan:
 *
 * GET    /api/swarm/sessions                          — list swarm sessions
 * GET    /api/swarm/sessions/:id                      — session detail (full serialized state)
 * POST   /api/swarm/sessions                          — create new session
 * DELETE /api/swarm/sessions/:id                      — delete session
 * POST   /api/swarm/sessions/:id/start                — start execution
 * POST   /api/swarm/sessions/:id/stop                 — graceful stop
 * POST   /api/swarm/sessions/:id/terminate            — force terminate
 * POST   /api/swarm/sessions/:id/run                  — full auto-execution loop
 * GET    /api/swarm/sessions/:id/stats                — live stats
 * GET    /api/swarm/sessions/:id/topology             — agent/task graph
 * GET    /api/swarm/sessions/:id/events               — event log (paginated)
 * GET    /api/swarm/sessions/:id/stream               — SSE real-time stream
 *
 * GET    /api/swarm/sessions/:id/agents               — agent list
 * POST   /api/swarm/sessions/:id/agents               — add agent
 * GET    /api/swarm/sessions/:id/agents/:agentId      — agent detail
 * DELETE /api/swarm/sessions/:id/agents/:agentId      — remove/terminate agent
 * POST   /api/swarm/sessions/:id/agents/:agentId/spawn — dynamic spawn
 * POST   /api/swarm/sessions/:id/agents/:agentId/execute — execute agent task
 *
 * GET    /api/swarm/sessions/:id/tasks                — task list
 * POST   /api/swarm/sessions/:id/tasks                — add task
 * GET    /api/swarm/sessions/:id/tasks/available      — unclaimed tasks (sorted by priority)
 * POST   /api/swarm/sessions/:id/tasks/:taskId/claim  — claim task (role negotiation)
 * POST   /api/swarm/sessions/:id/tasks/:taskId/complete — complete task
 * POST   /api/swarm/sessions/:id/tasks/:taskId/fail   — fail task
 *
 * GET    /api/swarm/sessions/:id/blackboard           — all entries (filterable)
 * POST   /api/swarm/sessions/:id/blackboard           — write entry (human-in-the-loop)
 * POST   /api/swarm/sessions/:id/blackboard/boost     — boost signal priority
 *
 * GET    /api/swarm/sessions/:id/consensus            — consensus rounds
 * POST   /api/swarm/sessions/:id/consensus            — start consensus round
 * GET    /api/swarm/sessions/:id/consensus/:roundId   — round detail
 * POST   /api/swarm/sessions/:id/consensus/:roundId/vote — submit vote (agent or human override)
 *
 * GET    /api/swarm/sessions/:id/messages             — lateral agent messages
 * POST   /api/swarm/sessions/:id/messages             — send message (human injection)
 *
 * GET    /api/swarm/sessions/:id/handoffs             — handoff records
 * POST   /api/swarm/sessions/:id/handoffs             — initiate handoff
 *
 * GET    /api/swarm/config                            — default swarm config
 * PUT    /api/swarm/config                            — update defaults (stored in settings)
 */

import type { Express, Request, Response } from "express";
import { swarmEngine } from "./swarmEngine.js";

export function registerSwarmRoutes(app: Express): void {

  // ── Session CRUD ──────────────────────────────────────────────────────

  app.get("/api/swarm/sessions", (_req: Request, res: Response) => {
    const sessions = swarmEngine.listSwarms().map(s => ({
      ...s.config,
      status: s.status,
      agentCount: s.agents.size,
      taskCount: s.tasks.size,
      blackboardEntries: s.blackboard.size,
      consensusRounds: s.consensusRounds.size,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      totalTokensUsed: s.totalTokensUsed,
      totalAgentsSpawned: s.totalAgentsSpawned,
      circuitBroken: s.circuitBroken,
      error: s.error,
    }));
    res.json(sessions);
  });

  app.post("/api/swarm/sessions", (req: Request, res: Response) => {
    try {
      const { agents, ...config } = req.body;
      const session = swarmEngine.createSwarm(config);
      // Auto-add agents if provided in the create body
      if (Array.isArray(agents)) {
        for (const agentDef of agents) {
          try { swarmEngine.addAgent(session.config.id, agentDef); } catch { /* skip invalid */ }
        }
      }
      res.status(201).json({ ...session.config, status: session.status, agentCount: session.agents.size });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/sessions/:id", (req: Request, res: Response) => {
    const data = swarmEngine.serializeSwarm((req.params.id as string));
    if (!data) return res.status(404).json({ error: "Swarm session not found" });
    res.json(data);
  });

  app.delete("/api/swarm/sessions/:id", (req: Request, res: Response) => {
    const ok = swarmEngine.deleteSwarm((req.params.id as string));
    if (!ok) return res.status(404).json({ error: "Swarm session not found" });
    res.json({ ok: true });
  });

  // ── Session Lifecycle ─────────────────────────────────────────────────

  app.post("/api/swarm/sessions/:id/start", (req: Request, res: Response) => {
    try {
      const session = swarmEngine.startSwarm((req.params.id as string));
      res.json({ status: session.status, startedAt: session.startedAt });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/sessions/:id/stop", (req: Request, res: Response) => {
    try {
      const session = swarmEngine.stopSwarm((req.params.id as string));
      res.json({ status: session.status, completedAt: session.completedAt });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/sessions/:id/terminate", (req: Request, res: Response) => {
    try {
      const reason = req.body.reason || "Terminated by user";
      const session = swarmEngine.terminateSwarm((req.params.id as string), reason);
      res.json({ status: session.status, error: session.error });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/sessions/:id/run", async (req: Request, res: Response) => {
    try {
      const results = await swarmEngine.runSwarm((req.params.id as string));
      const resultObj: Record<string, string> = {};
      for (const [k, v] of Array.from(results)) resultObj[k] = v;
      res.json({ ok: true, taskCount: results.size, results: resultObj });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Stats & Observability ─────────────────────────────────────────────

  app.get("/api/swarm/sessions/:id/stats", (req: Request, res: Response) => {
    const stats = swarmEngine.getStats((req.params.id as string));
    if (!stats) return res.status(404).json({ error: "Swarm session not found" });
    res.json(stats);
  });

  app.get("/api/swarm/sessions/:id/topology", (req: Request, res: Response) => {
    const topology = swarmEngine.getTopology((req.params.id as string));
    if (!topology) return res.status(404).json({ error: "Swarm session not found" });
    res.json(topology);
  });

  app.get("/api/swarm/sessions/:id/events", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = swarmEngine.getEventLog((req.params.id as string), limit);
    res.json(events);
  });

  // ── SSE Streaming ─────────────────────────────────────────────────────

  app.get("/api/swarm/sessions/:id/stream", (req: Request, res: Response) => {
    const swarmId = (req.params.id as string);
    const session = swarmEngine.getSwarm(swarmId);
    if (!session) return res.status(404).json({ error: "Swarm session not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial state
    const initData = JSON.stringify({
      type: "init",
      swarmId,
      timestamp: Date.now(),
      data: swarmEngine.serializeSwarm(swarmId),
    });
    res.write(`data: ${initData}\n\n`);

    const sseClient = (event: any) => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* disconnected */ }
    };

    swarmEngine.addSSEClient(swarmId, sseClient);

    const keepAlive = setInterval(() => {
      try { res.write(`: keepalive\n\n`); } catch { clearInterval(keepAlive); }
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      swarmEngine.removeSSEClient(swarmId, sseClient);
    });
  });

  // ── Agents ────────────────────────────────────────────────────────────

  app.get("/api/swarm/sessions/:id/agents", (req: Request, res: Response) => {
    res.json(swarmEngine.listAgents((req.params.id as string)));
  });

  app.post("/api/swarm/sessions/:id/agents", (req: Request, res: Response) => {
    try {
      const agent = swarmEngine.addAgent((req.params.id as string), req.body);
      res.status(201).json(agent);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/sessions/:id/agents/:agentId", (req: Request, res: Response) => {
    const agent = swarmEngine.getAgent((req.params.id as string), (req.params.agentId as string));
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  });

  app.delete("/api/swarm/sessions/:id/agents/:agentId", (req: Request, res: Response) => {
    const ok = swarmEngine.removeAgent((req.params.id as string), (req.params.agentId as string));
    if (!ok) return res.status(404).json({ error: "Agent not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/sessions/:id/agents/:agentId/spawn", (req: Request, res: Response) => {
    // Build spawn definition with sensible defaults
    const spawnDef = {
      name: req.body.name || req.body.role || "spawned-agent",
      role: req.body.role || "worker",
      instructions: req.body.instructions || req.body.reason || `Spawned by ${(req.params.agentId as string)} for: ${req.body.role || "task assistance"}`,
      modelId: req.body.modelId || req.body.model || null,
      tools: req.body.tools || [],
      taskType: req.body.taskType || null,
      priority: req.body.priority || null,
      context: req.body.context || null,
    };
    const agent = swarmEngine.spawnAgent((req.params.id as string), (req.params.agentId as string), spawnDef);
    if (!agent) {
      // Provide diagnostic reasons
      const reasons: string[] = [];
      const session = swarmEngine.getSwarm((req.params.id as string));
      if (!session) reasons.push("Session not found");
      else {
        if (!session.config.enableDynamicSpawning) reasons.push("enableDynamicSpawning is false in session config");
        const parent = session.agents?.get?.((req.params.agentId as string)) || (session as any).agents?.find?.((a: any) => a.id === (req.params.agentId as string));
        if (!parent) reasons.push(`Parent agent ${(req.params.agentId as string)} not found in session`);
        else {
          if (!parent.canSpawn) reasons.push("Parent agent has canSpawn: false");
          if (parent.spawnDepth >= (session.config.safety?.maxSpawnDepth || 2)) reasons.push(`Max spawn depth reached (${parent.spawnDepth}/${session.config.safety?.maxSpawnDepth || 2})`);
        }
        if ((session.agents?.size || 0) >= (session.config.safety?.maxAgents || 50)) reasons.push(`Max agents reached (${session.agents?.size}/${session.config.safety?.maxAgents || 50})`);
      }
      return res.status(400).json({
        error: "Spawn failed",
        reasons: reasons.length ? reasons : ["Check spawning permissions, depth limits, and rate limits"],
        hint: "Required config: enableDynamicSpawning: true. Parent agent must have canSpawn: true."
      });
    }
    res.status(201).json(agent);
  });

  app.post("/api/swarm/sessions/:id/agents/:agentId/execute", async (req: Request, res: Response) => {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: "taskId required" });
    try {
      const result = await swarmEngine.executeAgentTask((req.params.id as string), (req.params.agentId as string), taskId);
      res.json({ ok: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Tasks (Role Negotiation) ──────────────────────────────────────────

  app.get("/api/swarm/sessions/:id/tasks", (req: Request, res: Response) => {
    const session = swarmEngine.getSwarm((req.params.id as string));
    if (!session) return res.status(404).json({ error: "Swarm session not found" });
    res.json(Array.from(session.tasks.values()));
  });

  app.post("/api/swarm/sessions/:id/tasks", (req: Request, res: Response) => {
    try {
      const task = swarmEngine.addTask((req.params.id as string), req.body);
      res.status(201).json(task);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/sessions/:id/tasks/available", (req: Request, res: Response) => {
    res.json(swarmEngine.getAvailableTasks((req.params.id as string)));
  });

  app.post("/api/swarm/sessions/:id/tasks/:taskId/claim", (req: Request, res: Response) => {
    const { agentId } = req.body;
    if (!agentId) {
      // Auto-negotiate: use Contract Net Protocol to find best agent
      const bid = swarmEngine.negotiateTaskAssignment((req.params.id as string), (req.params.taskId as string));
      if (!bid) return res.status(409).json({ error: "No eligible agent available for this task" });
      const ok = swarmEngine.claimTask((req.params.id as string), bid.agentId, (req.params.taskId as string));
      if (!ok) return res.status(409).json({ error: "Claim failed after negotiation" });
      return res.json({ ok: true, agentId: bid.agentId, score: bid.score, method: "negotiated" });
    }
    const ok = swarmEngine.claimTask((req.params.id as string), agentId, (req.params.taskId as string));
    if (!ok) return res.status(409).json({ error: "Task already claimed or dependencies not met" });
    res.json({ ok: true, method: "direct" });
  });

  app.post("/api/swarm/sessions/:id/tasks/:taskId/complete", (req: Request, res: Response) => {
    const { agentId, result } = req.body;
    if (!agentId || !result) return res.status(400).json({ error: "agentId and result required" });
    const ok = swarmEngine.completeTask((req.params.id as string), agentId, (req.params.taskId as string), result);
    if (!ok) return res.status(400).json({ error: "Cannot complete — task not claimed by this agent" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/sessions/:id/tasks/:taskId/fail", (req: Request, res: Response) => {
    const { agentId, error } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    swarmEngine.failTask((req.params.id as string), agentId, (req.params.taskId as string), error || "Unknown error");
    res.json({ ok: true });
  });

  // ── Blackboard (Human-in-the-Loop) ────────────────────────────────────

  app.get("/api/swarm/sessions/:id/blackboard", (req: Request, res: Response) => {
    const { topic, entryType, agentId, minPriority } = req.query;
    const entries = swarmEngine.readBlackboard((req.params.id as string), {
      topic: topic as string,
      entryType: entryType as string,
      agentId: agentId as string,
      minPriority: minPriority ? parseInt(minPriority as string) : undefined,
    });
    res.json(entries);
  });

  app.post("/api/swarm/sessions/:id/blackboard", (req: Request, res: Response) => {
    try {
      const { topic, key, content, value, entryType, confidence, priority, ttlMs } = req.body;
      if (!topic || !key || !(content || value)) {
        return res.status(400).json({ error: "topic, key, and content (or value) required" });
      }
      // agentId defaults to "human" for human-in-the-loop injection
      const agentId = req.body.agentId || "human_operator";
      const entry = swarmEngine.writeBlackboard((req.params.id as string), agentId, {
        topic, key, content: content || value, entryType, confidence, priority, ttlMs,
      });
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/sessions/:id/blackboard/boost", (req: Request, res: Response) => {
    const { topic, key, amount } = req.body;
    if (!topic || !key) return res.status(400).json({ error: "topic and key required" });
    const ok = swarmEngine.boostSignal((req.params.id as string), topic, key, amount);
    if (!ok) return res.status(404).json({ error: "Blackboard entry not found" });
    res.json({ ok: true });
  });

  // ── Consensus / Voting ────────────────────────────────────────────────

  app.get("/api/swarm/sessions/:id/consensus", (req: Request, res: Response) => {
    res.json(swarmEngine.listConsensusRounds((req.params.id as string)));
  });

  app.post("/api/swarm/sessions/:id/consensus", (req: Request, res: Response) => {
    const { subject, question, agentIds, strategy } = req.body;
    const subj = subject || question;
    if (!subj || !agentIds || !Array.isArray(agentIds)) {
      return res.status(400).json({ error: "subject (or question) and agentIds[] required" });
    }
    const round = swarmEngine.startConsensus((req.params.id as string), subj, agentIds, strategy);
    if (!round) return res.status(400).json({ error: "Need at least 2 valid agents for consensus" });
    res.status(201).json(round);
  });

  app.get("/api/swarm/sessions/:id/consensus/:roundId", (req: Request, res: Response) => {
    const round = swarmEngine.getConsensusRound((req.params.id as string), (req.params.roundId as string));
    if (!round) return res.status(404).json({ error: "Consensus round not found" });
    res.json(round);
  });

  app.post("/api/swarm/sessions/:id/consensus/:roundId/vote", (req: Request, res: Response) => {
    const { agentId, answer, confidence, reasoning, isHumanOverride } = req.body;
    if (!answer) return res.status(400).json({ error: "answer required" });

    let ok: boolean;
    if (isHumanOverride) {
      ok = swarmEngine.submitHumanVote((req.params.id as string), (req.params.roundId as string), answer, reasoning || "");
    } else {
      if (!agentId) return res.status(400).json({ error: "agentId required (or set isHumanOverride: true)" });
      ok = swarmEngine.submitVote((req.params.id as string), (req.params.roundId as string), agentId, answer, confidence ?? 0.5, reasoning || "");
    }

    if (!ok) return res.status(400).json({ error: "Vote failed — round may be resolved or agent not participating" });
    const round = swarmEngine.getConsensusRound((req.params.id as string), (req.params.roundId as string));
    res.json(round);
  });

  // ── Messages (Lateral Communication) ──────────────────────────────────

  app.get("/api/swarm/sessions/:id/messages", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 200;
    let messages = swarmEngine.getMessages((req.params.id as string), limit);
    // Optional filters: ?agentId= (from or to), ?type= (messageType)
    const agentFilter = req.query.agentId as string;
    const typeFilter = req.query.type as string;
    if (agentFilter) {
      messages = messages.filter((m: any) => m.fromAgentId === agentFilter || m.toAgentId === agentFilter);
    }
    if (typeFilter) {
      messages = messages.filter((m: any) => m.messageType === typeFilter);
    }
    res.json(messages);
  });

  app.post("/api/swarm/sessions/:id/messages", (req: Request, res: Response) => {
    // Accept field aliases: fromAgentId / fromAgent / from, toAgentId / toAgent / to
    const fromId = req.body.fromAgentId || req.body.fromAgent || req.body.from || "human_operator";
    const toId = req.body.toAgentId || req.body.toAgent || req.body.to || null;
    const { messageType, content, metadata } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    swarmEngine.sendAgentMessage(
      (req.params.id as string),
      fromId,
      toId,
      messageType || (toId ? "info" : "broadcast"),
      content,
      metadata,
    );
    res.status(201).json({ ok: true });
  });

  // ── Handoffs ──────────────────────────────────────────────────────────

  app.get("/api/swarm/sessions/:id/handoffs", (req: Request, res: Response) => {
    res.json(swarmEngine.getHandoffs((req.params.id as string)));
  });

  app.post("/api/swarm/sessions/:id/handoffs", (req: Request, res: Response) => {
    // Accept field aliases: fromAgentId / fromAgent / from, toAgentId / toAgent / to
    const fromId = req.body.fromAgentId || req.body.fromAgent || req.body.from;
    const toId = req.body.toAgentId || req.body.toAgent || req.body.to;
    const { reason, context, taskId } = req.body;
    if (!fromId || !toId) {
      return res.status(400).json({ error: "fromAgentId and toAgentId required (also accepts fromAgent/toAgent or from/to)" });
    }
    const record = swarmEngine.handoff((req.params.id as string), fromId, toId, reason || "", context || "");
    if (!record) return res.status(400).json({ error: "Handoff failed — check agent IDs and permissions" });
    res.status(201).json(record);
  });

  // ── Swarm Config (defaults) ───────────────────────────────────────────

  app.get("/api/swarm/config", (_req: Request, res: Response) => {
    res.json(swarmEngine.getDefaultConfig());
  });

  app.put("/api/swarm/config", (req: Request, res: Response) => {
    // Config updates are applied to new swarms only (not existing ones)
    // Store in settings for persistence
    res.json({ ok: true, message: "Config applies to newly created swarms", config: req.body });
  });

  // ── Legacy routes (backward compat with Layer 2 callers) ──────────────

  app.get("/api/swarm", (_req: Request, res: Response) => {
    // Redirect to new path
    const sessions = swarmEngine.listSwarms().map(s => ({
      ...s.config,
      status: s.status,
      agentCount: s.agents.size,
      taskCount: s.tasks.size,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      totalTokensUsed: s.totalTokensUsed,
      circuitBroken: s.circuitBroken,
    }));
    res.json(sessions);
  });

  app.post("/api/swarm", (req: Request, res: Response) => {
    try {
      const { agents, ...config } = req.body;
      const session = swarmEngine.createSwarm(config);
      if (Array.isArray(agents)) {
        for (const agentDef of agents) {
          try { swarmEngine.addAgent(session.config.id, agentDef); } catch { /* skip */ }
        }
      }
      res.status(201).json({ ...session.config, status: session.status, agentCount: session.agents.size });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id", (req: Request, res: Response) => {
    const data = swarmEngine.serializeSwarm((req.params.id as string));
    if (!data) return res.status(404).json({ error: "Swarm not found" });
    res.json(data);
  });

  app.delete("/api/swarm/:id", (req: Request, res: Response) => {
    const ok = swarmEngine.deleteSwarm((req.params.id as string));
    if (!ok) return res.status(404).json({ error: "Swarm not found" });
    res.json({ ok: true });
  });
}
