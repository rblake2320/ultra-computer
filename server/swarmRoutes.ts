/**
 * Swarm Intelligence API Routes
 *
 * Endpoints for managing swarms, agents, tasks, blackboard, handoffs, and consensus.
 */

import type { Express } from "express";
import { swarmEngine } from "./swarmEngine";

export function registerSwarmRoutes(app: Express): void {
  // ── Swarm CRUD ──────────────────────────────────────────────────────────

  app.get("/api/swarm", (_req, res) => {
    const swarms = swarmEngine.listSwarms().map(s => ({
      ...s.config,
      status: s.status,
      agentCount: s.agents.size,
      taskCount: s.tasks.size,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    }));
    res.json(swarms);
  });

  app.post("/api/swarm", (req, res) => {
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

  app.get("/api/swarm/:id", (req, res) => {
    const data = swarmEngine.serializeSwarm(req.params.id);
    if (!data) return res.status(404).json({ error: "Swarm not found" });
    res.json(data);
  });

  app.delete("/api/swarm/:id", (req, res) => {
    const ok = swarmEngine.deleteSwarm(req.params.id);
    if (!ok) return res.status(404).json({ error: "Swarm not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/start", (req, res) => {
    try {
      const swarm = swarmEngine.startSwarm(req.params.id);
      res.json({ status: swarm.status });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/:id/stop", (req, res) => {
    try {
      const swarm = swarmEngine.stopSwarm(req.params.id);
      res.json({ status: swarm.status });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id/stats", (req, res) => {
    const stats = swarmEngine.getStats(req.params.id);
    if (!stats) return res.status(404).json({ error: "Swarm not found" });
    res.json(stats);
  });

  app.get("/api/swarm/:id/events", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = swarmEngine.getEventLog(req.params.id, limit);
    res.json(events);
  });

  // ── Agents ──────────────────────────────────────────────────────────────

  app.get("/api/swarm/:id/agents", (req, res) => {
    res.json(swarmEngine.listAgents(req.params.id));
  });

  app.post("/api/swarm/:id/agents", (req, res) => {
    try {
      const agent = swarmEngine.addAgent(req.params.id, req.body);
      res.status(201).json(agent);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id/agents/:agentId", (req, res) => {
    const agent = swarmEngine.getAgent(req.params.id, req.params.agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  });

  app.delete("/api/swarm/:id/agents/:agentId", (req, res) => {
    const ok = swarmEngine.removeAgent(req.params.id, req.params.agentId);
    if (!ok) return res.status(404).json({ error: "Agent not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/agents/:agentId/spawn", (req, res) => {
    const agent = swarmEngine.spawnAgent(req.params.id, req.params.agentId, req.body);
    if (!agent) return res.status(400).json({ error: "Spawn failed — dynamic spawning may be disabled or agent cannot spawn" });
    res.status(201).json(agent);
  });

  // ── Tasks (Role Negotiation) ────────────────────────────────────────────

  app.get("/api/swarm/:id/tasks", (req, res) => {
    const swarm = swarmEngine.getSwarm(req.params.id);
    if (!swarm) return res.status(404).json({ error: "Swarm not found" });
    res.json(Array.from(swarm.tasks.values()));
  });

  app.post("/api/swarm/:id/tasks", (req, res) => {
    try {
      const task = swarmEngine.addTask(req.params.id, req.body);
      res.status(201).json(task);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/swarm/:id/tasks/available", (req, res) => {
    res.json(swarmEngine.getAvailableTasks(req.params.id));
  });

  app.post("/api/swarm/:id/tasks/:taskId/claim", (req, res) => {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const ok = swarmEngine.claimTask(req.params.id, agentId, req.params.taskId);
    if (!ok) return res.status(409).json({ error: "Task already claimed or not found" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/tasks/:taskId/complete", (req, res) => {
    const { agentId, result } = req.body;
    if (!agentId || !result) return res.status(400).json({ error: "agentId and result required" });
    const ok = swarmEngine.completeTask(req.params.id, agentId, req.params.taskId, result);
    if (!ok) return res.status(400).json({ error: "Cannot complete — task not claimed by this agent" });
    res.json({ ok: true });
  });

  app.post("/api/swarm/:id/tasks/:taskId/fail", (req, res) => {
    const { agentId, error } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    swarmEngine.failTask(req.params.id, agentId, req.params.taskId, error || "Unknown error");
    res.json({ ok: true });
  });

  // ── Blackboard (Shared State) ───────────────────────────────────────────

  app.get("/api/swarm/:id/blackboard", (req, res) => {
    const topic = req.query.topic as string | undefined;
    res.json(swarmEngine.readBlackboard(req.params.id, topic));
  });

  app.post("/api/swarm/:id/blackboard", (req, res) => {
    try {
      const { agentId, topic, key, value, priority } = req.body;
      if (!agentId || !topic || !key || !value) {
        return res.status(400).json({ error: "agentId, topic, key, and value required" });
      }
      const entry = swarmEngine.writeBlackboard(req.params.id, agentId, topic, key, value, priority);
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/swarm/:id/blackboard/boost", (req, res) => {
    const { topic, key, amount } = req.body;
    if (!topic || !key) return res.status(400).json({ error: "topic and key required" });
    const ok = swarmEngine.boostSignal(req.params.id, topic, key, amount);
    if (!ok) return res.status(404).json({ error: "Blackboard entry not found" });
    res.json({ ok: true });
  });

  // ── Handoffs ────────────────────────────────────────────────────────────

  app.get("/api/swarm/:id/handoffs", (req, res) => {
    res.json(swarmEngine.getHandoffs(req.params.id));
  });

  app.post("/api/swarm/:id/handoffs", (req, res) => {
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

  app.get("/api/swarm/:id/consensus", (req, res) => {
    res.json(swarmEngine.listConsensusRounds(req.params.id));
  });

  app.post("/api/swarm/:id/consensus", (req, res) => {
    const { question, agentIds, strategy } = req.body;
    if (!question || !agentIds || !Array.isArray(agentIds)) {
      return res.status(400).json({ error: "question and agentIds[] required" });
    }
    const round = swarmEngine.startConsensus(req.params.id, question, agentIds, strategy);
    if (!round) return res.status(400).json({ error: "Need at least 2 valid agents for consensus" });
    res.status(201).json(round);
  });

  app.get("/api/swarm/:id/consensus/:roundId", (req, res) => {
    const round = swarmEngine.getConsensusRound(req.params.id, req.params.roundId);
    if (!round) return res.status(404).json({ error: "Consensus round not found" });
    res.json(round);
  });

  app.post("/api/swarm/:id/consensus/:roundId/vote", (req, res) => {
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
