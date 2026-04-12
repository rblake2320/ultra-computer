/**
 * Swarm Intelligence API Routes — Layer 2
 *
 * Endpoints for managing swarms, agents, tasks, blackboard, handoffs, consensus,
 * SSE streaming, and swarm execution.
 */

import type { Express, Request, Response } from "express";
import { swarmEngine } from "./swarmEngine.js";

export function registerSwarmRoutes(app: Express): void {
  // ── Swarm CRUD ──────────────────────────────────────────────────────────

  app.get("/api/swarm", (_req: Request, res: Response) => {
    const swarms = swarmEngine.listSwarms().map(s => ({
      ...s.config,
      status: s.status,
      agentCount: s.agents.size,
      taskCount: s.tasks.size,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      totalTokensUsed: s.totalTokensUsed,
      circuitBroken: s.circuitBroken,
    }));
    res.json(swarms);
  });

  app.post("/api/swarm", (req: Request, res: Response) => {
    try {
      const swarm = swarmEngine.createSwarm(req.body);
      res.status(201).json({
        ...swarm.config,
        status: swarm.status,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id", (req: Request, res: Response) => {
    const data = swarmEngine.serializeSwarm(req.params.id);
    if (!data) return res.status(404).json({ error: "Swarm not found" });
    res.json(data);
  });

  app.delete("/api/swarm/:id", (req: Request, res: Response) => {
    const ok = swarmEngine.deleteSwarm(req.params.id);
    if (!ok) return res.status(404).json({ error: "Swarm not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/start", (req: Request, res: Response) => {
    try {
      const swarm = swarmEngine.startSwarm(req.params.id);
      res.json({ status: swarm.status });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/:id/stop", (req: Request, res: Response) => {
    try {
      const swarm = swarmEngine.stopSwarm(req.params.id);
      res.json({ status: swarm.status });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id/stats", (req: Request, res: Response) => {
    const stats = swarmEngine.getStats(req.params.id);
    if (!stats) return res.status(404).json({ error: "Swarm not found" });
    res.json(stats);
  });

  app.get("/api/swarm/:id/events", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = swarmEngine.getEventLog(req.params.id, limit);
    res.json(events);
  });

  // ── SSE Streaming ──────────────────────────────────────────────────────

  app.get("/api/swarm/:id/stream", (req: Request, res: Response) => {
    const swarmId = req.params.id;
    const swarm = swarmEngine.getSwarm(swarmId);
    if (!swarm) return res.status(404).json({ error: "Swarm not found" });

    // Set up SSE headers
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

    // Subscribe to events
    const sseClient = (event: any) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    };

    swarmEngine.addSSEClient(swarmId, sseClient);

    // Keep-alive ping every 15s
    const keepAlive = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(keepAlive);
      swarmEngine.removeSSEClient(swarmId, sseClient);
    });
  });

  // ── Swarm Execution ────────────────────────────────────────────────────

  /**
   * POST /api/swarm/:id/run
   * Start the full swarm execution loop — assigns tasks to agents, runs LLM+tools,
   * writes to blackboard, handles handoffs. Returns when all tasks complete or safety cap hit.
   */
  app.post("/api/swarm/:id/run", async (req: Request, res: Response) => {
    try {
      const results = await swarmEngine.runSwarm(req.params.id);
      const resultObj: Record<string, string> = {};
      for (const [k, v] of results) {
        resultObj[k] = v;
      }
      res.json({ ok: true, results: resultObj });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/swarm/:id/agents/:agentId/execute
   * Execute a specific agent's current claimed task using LLM + tools.
   */
  app.post("/api/swarm/:id/agents/:agentId/execute", async (req: Request, res: Response) => {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: "taskId required" });

    try {
      const result = await swarmEngine.executeAgentTask(req.params.id, req.params.agentId, taskId);
      res.json({ ok: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Agents ──────────────────────────────────────────────────────────────

  app.get("/api/swarm/:id/agents", (req: Request, res: Response) => {
    res.json(swarmEngine.listAgents(req.params.id));
  });

  app.post("/api/swarm/:id/agents", (req: Request, res: Response) => {
    try {
      const agent = swarmEngine.addAgent(req.params.id, req.body);
      res.status(201).json(agent);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id/agents/:agentId", (req: Request, res: Response) => {
    const agent = swarmEngine.getAgent(req.params.id, req.params.agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  });

  app.delete("/api/swarm/:id/agents/:agentId", (req: Request, res: Response) => {
    const ok = swarmEngine.removeAgent(req.params.id, req.params.agentId);
    if (!ok) return res.status(404).json({ error: "Agent not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/agents/:agentId/spawn", (req: Request, res: Response) => {
    const agent = swarmEngine.spawnAgent(req.params.id, req.params.agentId, req.body);
    if (!agent) return res.status(400).json({ error: "Spawn failed — dynamic spawning may be disabled, agent cannot spawn, or max spawn depth reached" });
    res.status(201).json(agent);
  });

  // ── Tasks (Role Negotiation) ────────────────────────────────────────────

  app.get("/api/swarm/:id/tasks", (req: Request, res: Response) => {
    const swarm = swarmEngine.getSwarm(req.params.id);
    if (!swarm) return res.status(404).json({ error: "Swarm not found" });
    res.json(Array.from(swarm.tasks.values()));
  });

  app.post("/api/swarm/:id/tasks", (req: Request, res: Response) => {
    try {
      const task = swarmEngine.addTask(req.params.id, req.body);
      res.status(201).json(task);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id/tasks/available", (req: Request, res: Response) => {
    res.json(swarmEngine.getAvailableTasks(req.params.id));
  });

  app.post("/api/swarm/:id/tasks/:taskId/claim", (req: Request, res: Response) => {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const ok = swarmEngine.claimTask(req.params.id, agentId, req.params.taskId);
    if (!ok) return res.status(409).json({ error: "Task already claimed or not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/tasks/:taskId/complete", (req: Request, res: Response) => {
    const { agentId, result } = req.body;
    if (!agentId || !result) return res.status(400).json({ error: "agentId and result required" });
    const ok = swarmEngine.completeTask(req.params.id, agentId, req.params.taskId, result);
    if (!ok) return res.status(400).json({ error: "Cannot complete — task not claimed by this agent" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/tasks/:taskId/fail", (req: Request, res: Response) => {
    const { agentId, error } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    swarmEngine.failTask(req.params.id, agentId, req.params.taskId, error || "Unknown error");
    res.json({ ok: true });
  });

  // ── Blackboard (Shared State) ───────────────────────────────────────────

  app.get("/api/swarm/:id/blackboard", (req: Request, res: Response) => {
    const topic = req.query.topic as string | undefined;
    res.json(swarmEngine.readBlackboard(req.params.id, topic));
  });

  app.post("/api/swarm/:id/blackboard", (req: Request, res: Response) => {
    try {
      const { agentId, topic, key, value, priority, ttlMs } = req.body;
      if (!agentId || !topic || !key || !value) {
        return res.status(400).json({ error: "agentId, topic, key, and value required" });
      }
      const entry = swarmEngine.writeBlackboard(req.params.id, agentId, topic, key, value, priority, ttlMs);
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/:id/blackboard/boost", (req: Request, res: Response) => {
    const { topic, key, amount } = req.body;
    if (!topic || !key) return res.status(400).json({ error: "topic and key required" });
    const ok = swarmEngine.boostSignal(req.params.id, topic, key, amount);
    if (!ok) return res.status(404).json({ error: "Blackboard entry not found" });
    res.json({ ok: true });
  });

  // ── Handoffs ────────────────────────────────────────────────────────────

  app.get("/api/swarm/:id/handoffs", (req: Request, res: Response) => {
    res.json(swarmEngine.getHandoffs(req.params.id));
  });

  app.post("/api/swarm/:id/handoffs", (req: Request, res: Response) => {
    const { fromAgentId, toAgentId, reason, context } = req.body;
    if (!fromAgentId || !toAgentId) {
      return res.status(400).json({ error: "fromAgentId and toAgentId required" });
    }
    const record = swarmEngine.handoff(
      req.params.id, fromAgentId, toAgentId,
      reason || "", context || ""
    );
    if (!record) return res.status(400).json({ error: "Handoff failed — check agent IDs and permissions" });
    res.status(201).json(record);
  });

  // ── Consensus / Voting ──────────────────────────────────────────────────

  app.get("/api/swarm/:id/consensus", (req: Request, res: Response) => {
    res.json(swarmEngine.listConsensusRounds(req.params.id));
  });

  app.post("/api/swarm/:id/consensus", (req: Request, res: Response) => {
    const { question, agentIds, strategy } = req.body;
    if (!question || !agentIds || !Array.isArray(agentIds)) {
      return res.status(400).json({ error: "question and agentIds[] required" });
    }
    const round = swarmEngine.startConsensus(req.params.id, question, agentIds, strategy);
    if (!round) return res.status(400).json({ error: "Need at least 2 valid agents for consensus" });
    res.status(201).json(round);
  });

  app.get("/api/swarm/:id/consensus/:roundId", (req: Request, res: Response) => {
    const round = swarmEngine.getConsensusRound(req.params.id, req.params.roundId);
    if (!round) return res.status(404).json({ error: "Consensus round not found" });
    res.json(round);
  });

  app.post("/api/swarm/:id/consensus/:roundId/vote", (req: Request, res: Response) => {
    const { agentId, answer, confidence, reasoning } = req.body;
    if (!agentId || !answer) {
      return res.status(400).json({ error: "agentId and answer required" });
    }
    const ok = swarmEngine.submitVote(
      req.params.id, req.params.roundId,
      agentId, answer,
      confidence ?? 0.5, reasoning || ""
    );
    if (!ok) return res.status(400).json({ error: "Vote failed — round may be resolved or agent not participating" });

    // Return current round state
    const round = swarmEngine.getConsensusRound(req.params.id, req.params.roundId);
    res.json(round);
  });
}
