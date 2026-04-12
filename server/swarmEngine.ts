/**
 * SwarmEngine — Multi-Agent Swarm Intelligence Layer
 *
 * Combines the best patterns from OpenAI Swarm, LangGraph, CrewAI, and AutoGen:
 *
 *  1. BLACKBOARD (shared state):  Agents read/write to a common state store.
 *     No direct coupling — agents discover work by observing the blackboard.
 *
 *  2. HANDOFFS (OpenAI Swarm pattern):  Agents can transfer full control to
 *     another agent when a task falls outside their expertise.
 *
 *  3. DYNAMIC SPAWNING:  Agents can request new agents be created at runtime
 *     based on what they discover during execution.
 *
 *  4. CONSENSUS / VOTING:  Multiple agents evaluate the same input and the
 *     system reconciles via majority vote, weighted confidence, or debate rounds.
 *
 *  5. STIGMERGY (pheromone signals):  Agents leave priority signals on the
 *     blackboard that attract other agents to high-value work areas.
 *
 *  6. ROLE NEGOTIATION:  Agents claim tasks from a shared pool rather than
 *     being assigned by a central orchestrator.
 *
 * Integration points with existing Ultra Computer systems:
 *  - MessagingHub → blackboard pub/sub (channels become blackboard topics)
 *  - NIP Engine → agent-to-agent negotiation protocol
 *  - Orchestrator → swarm mode as alternative to DAG mode
 *  - ModelRouter → each swarm agent gets its own model assignment
 *  - KnowledgeEngine → shared KB context injected into all swarm agents
 *  - SelfLearning → swarm execution outcomes feed back into learning loop
 */

import { randomUUID } from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SwarmStatus = "idle" | "running" | "paused" | "completed" | "failed";
export type AgentStatus = "idle" | "working" | "waiting" | "handed_off" | "completed" | "failed";
export type ConsensusStrategy = "majority_vote" | "weighted_confidence" | "debate" | "unanimous";

export interface SwarmAgent {
  id: string;
  name: string;
  role: string;
  instructions: string;                // system prompt for this agent
  modelId: string | null;              // null = use swarm default
  tools: string[];                     // tool names this agent can use
  canHandoffTo: string[];              // agent IDs this agent can hand off to
  canSpawn: boolean;                   // whether this agent can dynamically spawn new agents
  status: AgentStatus;
  currentTaskId: string | null;
  tokenUsage: { prompt: number; completion: number; total: number };
  messagesProcessed: number;
  handoffsMade: number;
  startedAt: number;
  lastActiveAt: number;
}

export interface SwarmTask {
  id: string;
  description: string;
  priority: number;                    // 0-100, higher = more attractive to agents
  claimedBy: string | null;            // agent ID that claimed this task
  status: "pending" | "claimed" | "running" | "completed" | "failed";
  result: string | null;
  createdAt: number;
  claimedAt: number | null;
  completedAt: number | null;
  metadata: Record<string, unknown>;
}

export interface BlackboardEntry {
  id: string;
  topic: string;                       // grouping key (e.g., "research", "code", "analysis")
  key: string;                         // specific entry key within topic
  value: string;                       // the content
  author: string;                      // agent ID that wrote this
  priority: number;                    // stigmergy signal — higher attracts more attention
  version: number;                     // incremented on each update
  createdAt: number;
  updatedAt: number;
}

export interface HandoffRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: string;                     // conversation context passed along
  timestamp: number;
}

export interface ConsensusRound {
  id: string;
  question: string;
  strategy: ConsensusStrategy;
  agents: string[];                    // agent IDs participating
  votes: ConsensusVote[];
  result: string | null;
  confidence: number;
  rounds: number;                      // debate rounds completed
  maxRounds: number;
  status: "voting" | "debating" | "resolved" | "deadlocked";
  startedAt: number;
  resolvedAt: number | null;
}

export interface ConsensusVote {
  agentId: string;
  answer: string;
  confidence: number;                  // 0-1
  reasoning: string;
  round: number;
  timestamp: number;
}

export interface SwarmConfig {
  id: string;
  name: string;
  description: string;
  mode: "collaborative" | "competitive" | "exploratory";
  defaultModelId: string | null;
  maxAgents: number;
  maxTasksPerAgent: number;
  consensusStrategy: ConsensusStrategy;
  consensusThreshold: number;          // 0-1, minimum agreement to resolve
  maxConsensusRounds: number;
  enableDynamicSpawning: boolean;
  enableStigmergy: boolean;
  enableHandoffs: boolean;
  taskClaimTimeout: number;            // ms before unclaimed task is re-offered
  agentIdleTimeout: number;            // ms before idle agent is recycled
  createdAt: number;
}

export interface Swarm {
  config: SwarmConfig;
  status: SwarmStatus;
  agents: Map<string, SwarmAgent>;
  tasks: Map<string, SwarmTask>;
  blackboard: Map<string, BlackboardEntry>;
  handoffs: HandoffRecord[];
  consensusRounds: Map<string, ConsensusRound>;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

export interface SwarmStats {
  swarmId: string;
  status: SwarmStatus;
  agentCount: number;
  activeAgents: number;
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  blackboardEntries: number;
  handoffCount: number;
  consensusRounds: number;
  totalTokens: number;
  uptime: number;
  throughput: number;                  // tasks completed per minute
}

// ─── Event System ───────────────────────────────────────────────────────────

type SwarmEventType =
  | "agent_joined" | "agent_left" | "agent_status_changed"
  | "task_created" | "task_claimed" | "task_completed" | "task_failed"
  | "blackboard_write" | "blackboard_update"
  | "handoff_initiated" | "handoff_completed"
  | "consensus_started" | "consensus_vote" | "consensus_resolved"
  | "agent_spawned" | "swarm_started" | "swarm_completed" | "swarm_error";

interface SwarmEvent {
  type: SwarmEventType;
  swarmId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

type SwarmEventListener = (event: SwarmEvent) => void;

// ─── SwarmEngine ────────────────────────────────────────────────────────────

class SwarmEngine {
  private swarms: Map<string, Swarm> = new Map();
  private listeners: Map<string, SwarmEventListener[]> = new Map();
  private eventLog: SwarmEvent[] = [];
  private maxEventLog = 1000;

  // ── Swarm Lifecycle ─────────────────────────────────────────────────────

  createSwarm(config: Partial<SwarmConfig> & { name: string }): Swarm {
    const id = config.id || randomUUID();
    const fullConfig: SwarmConfig = {
      id,
      name: config.name,
      description: config.description || "",
      mode: config.mode || "collaborative",
      defaultModelId: config.defaultModelId || null,
      maxAgents: config.maxAgents || 20,
      maxTasksPerAgent: config.maxTasksPerAgent || 5,
      consensusStrategy: config.consensusStrategy || "majority_vote",
      consensusThreshold: config.consensusThreshold || 0.6,
      maxConsensusRounds: config.maxConsensusRounds || 3,
      enableDynamicSpawning: config.enableDynamicSpawning ?? true,
      enableStigmergy: config.enableStigmergy ?? true,
      enableHandoffs: config.enableHandoffs ?? true,
      taskClaimTimeout: config.taskClaimTimeout || 30000,
      agentIdleTimeout: config.agentIdleTimeout || 120000,
      createdAt: Date.now(),
    };

    const swarm: Swarm = {
      config: fullConfig,
      status: "idle",
      agents: new Map(),
      tasks: new Map(),
      blackboard: new Map(),
      handoffs: [],
      consensusRounds: new Map(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    this.swarms.set(id, swarm);
    return swarm;
  }

  getSwarm(id: string): Swarm | undefined {
    return this.swarms.get(id);
  }

  listSwarms(): Swarm[] {
    return Array.from(this.swarms.values());
  }

  deleteSwarm(id: string): boolean {
    const swarm = this.swarms.get(id);
    if (!swarm) return false;
    if (swarm.status === "running") this.stopSwarm(id);
    this.swarms.delete(id);
    this.listeners.delete(id);
    return true;
  }

  startSwarm(id: string): Swarm {
    const swarm = this.swarms.get(id);
    if (!swarm) throw new Error(`Swarm ${id} not found`);
    if (swarm.status === "running") return swarm;

    swarm.status = "running";
    swarm.startedAt = Date.now();
    swarm.completedAt = null;
    swarm.error = null;

    this.emit(id, { type: "swarm_started", swarmId: id, timestamp: Date.now(), data: {} });
    return swarm;
  }

  stopSwarm(id: string): Swarm {
    const swarm = this.swarms.get(id);
    if (!swarm) throw new Error(`Swarm ${id} not found`);

    swarm.status = "completed";
    swarm.completedAt = Date.now();

    // Mark all active agents as idle
    for (const agent of swarm.agents.values()) {
      if (agent.status === "working" || agent.status === "waiting") {
        agent.status = "idle";
      }
    }

    this.emit(id, { type: "swarm_completed", swarmId: id, timestamp: Date.now(), data: {} });
    return swarm;
  }

  // ── Agent Management ────────────────────────────────────────────────────

  addAgent(swarmId: string, agentDef: {
    name: string;
    role: string;
    instructions: string;
    modelId?: string | null;
    tools?: string[];
    canHandoffTo?: string[];
    canSpawn?: boolean;
  }): SwarmAgent {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);
    if (swarm.agents.size >= swarm.config.maxAgents) {
      throw new Error(`Swarm at max capacity (${swarm.config.maxAgents} agents)`);
    }

    const agent: SwarmAgent = {
      id: randomUUID(),
      name: agentDef.name,
      role: agentDef.role,
      instructions: agentDef.instructions,
      modelId: agentDef.modelId ?? null,
      tools: agentDef.tools || [],
      canHandoffTo: agentDef.canHandoffTo || [],
      canSpawn: agentDef.canSpawn ?? false,
      status: "idle",
      currentTaskId: null,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      messagesProcessed: 0,
      handoffsMade: 0,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    swarm.agents.set(agent.id, agent);

    this.emit(swarmId, {
      type: "agent_joined",
      swarmId,
      timestamp: Date.now(),
      data: { agentId: agent.id, name: agent.name, role: agent.role },
    });

    return agent;
  }

  removeAgent(swarmId: string, agentId: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const agent = swarm.agents.get(agentId);
    if (!agent) return false;

    // Release any claimed tasks back to the pool
    if (agent.currentTaskId) {
      const task = swarm.tasks.get(agent.currentTaskId);
      if (task && task.status === "claimed") {
        task.status = "pending";
        task.claimedBy = null;
        task.claimedAt = null;
      }
    }

    swarm.agents.delete(agentId);

    // Remove from other agents' handoff lists
    for (const other of swarm.agents.values()) {
      other.canHandoffTo = other.canHandoffTo.filter(id => id !== agentId);
    }

    this.emit(swarmId, {
      type: "agent_left",
      swarmId,
      timestamp: Date.now(),
      data: { agentId, name: agent.name },
    });

    return true;
  }

  getAgent(swarmId: string, agentId: string): SwarmAgent | undefined {
    return this.swarms.get(swarmId)?.agents.get(agentId);
  }

  listAgents(swarmId: string): SwarmAgent[] {
    const swarm = this.swarms.get(swarmId);
    return swarm ? Array.from(swarm.agents.values()) : [];
  }

  // Dynamic spawning — an agent requests a new agent be created
  spawnAgent(swarmId: string, requestingAgentId: string, agentDef: {
    name: string;
    role: string;
    instructions: string;
    modelId?: string | null;
    tools?: string[];
  }): SwarmAgent | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    if (!swarm.config.enableDynamicSpawning) return null;

    const requestor = swarm.agents.get(requestingAgentId);
    if (!requestor || !requestor.canSpawn) return null;

    const agent = this.addAgent(swarmId, agentDef);

    this.emit(swarmId, {
      type: "agent_spawned",
      swarmId,
      timestamp: Date.now(),
      data: { spawnedBy: requestingAgentId, agentId: agent.id, role: agent.role },
    });

    return agent;
  }

  // ── Task Pool (Role Negotiation) ────────────────────────────────────────

  addTask(swarmId: string, taskDef: {
    description: string;
    priority?: number;
    metadata?: Record<string, unknown>;
  }): SwarmTask {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    const task: SwarmTask = {
      id: randomUUID(),
      description: taskDef.description,
      priority: taskDef.priority ?? 50,
      claimedBy: null,
      status: "pending",
      result: null,
      createdAt: Date.now(),
      claimedAt: null,
      completedAt: null,
      metadata: taskDef.metadata || {},
    };

    swarm.tasks.set(task.id, task);

    this.emit(swarmId, {
      type: "task_created",
      swarmId,
      timestamp: Date.now(),
      data: { taskId: task.id, description: task.description, priority: task.priority },
    });

    return task;
  }

  // Agent claims a task from the pool (role negotiation)
  claimTask(swarmId: string, agentId: string, taskId: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const agent = swarm.agents.get(agentId);
    const task = swarm.tasks.get(taskId);
    if (!agent || !task) return false;
    if (task.status !== "pending") return false; // already claimed

    task.status = "claimed";
    task.claimedBy = agentId;
    task.claimedAt = Date.now();

    agent.status = "working";
    agent.currentTaskId = taskId;
    agent.lastActiveAt = Date.now();

    this.emit(swarmId, {
      type: "task_claimed",
      swarmId,
      timestamp: Date.now(),
      data: { taskId, agentId, agentName: agent.name },
    });

    return true;
  }

  // Agent completes a task
  completeTask(swarmId: string, agentId: string, taskId: string, result: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const task = swarm.tasks.get(taskId);
    const agent = swarm.agents.get(agentId);
    if (!task || !agent) return false;
    if (task.claimedBy !== agentId) return false;

    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();

    agent.status = "idle";
    agent.currentTaskId = null;
    agent.lastActiveAt = Date.now();

    this.emit(swarmId, {
      type: "task_completed",
      swarmId,
      timestamp: Date.now(),
      data: { taskId, agentId, resultPreview: result.slice(0, 200) },
    });

    // Check if all tasks are done
    const allDone = Array.from(swarm.tasks.values()).every(
      t => t.status === "completed" || t.status === "failed"
    );
    if (allDone && swarm.status === "running") {
      swarm.status = "completed";
      swarm.completedAt = Date.now();
      this.emit(swarmId, { type: "swarm_completed", swarmId, timestamp: Date.now(), data: {} });
    }

    return true;
  }

  failTask(swarmId: string, agentId: string, taskId: string, error: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const task = swarm.tasks.get(taskId);
    const agent = swarm.agents.get(agentId);
    if (!task || !agent) return false;

    task.status = "failed";
    task.result = `ERROR: ${error}`;
    task.completedAt = Date.now();

    agent.status = "idle";
    agent.currentTaskId = null;

    this.emit(swarmId, {
      type: "task_failed",
      swarmId,
      timestamp: Date.now(),
      data: { taskId, agentId, error },
    });

    return true;
  }

  // Get available tasks sorted by priority (stigmergy — higher priority attracts agents)
  getAvailableTasks(swarmId: string): SwarmTask[] {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return [];
    return Array.from(swarm.tasks.values())
      .filter(t => t.status === "pending")
      .sort((a, b) => b.priority - a.priority);
  }

  // ── Blackboard (Shared State) ───────────────────────────────────────────

  writeBlackboard(swarmId: string, agentId: string, topic: string, key: string, value: string, priority = 50): BlackboardEntry {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    const existingKey = `${topic}:${key}`;
    const existing = swarm.blackboard.get(existingKey);

    const entry: BlackboardEntry = {
      id: existing?.id || randomUUID(),
      topic,
      key,
      value,
      author: agentId,
      priority: existing ? Math.max(existing.priority, priority) : priority,
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    swarm.blackboard.set(existingKey, entry);

    const eventType = existing ? "blackboard_update" : "blackboard_write";
    this.emit(swarmId, {
      type: eventType,
      swarmId,
      timestamp: Date.now(),
      data: { topic, key, author: agentId, priority, version: entry.version },
    });

    return entry;
  }

  readBlackboard(swarmId: string, topic?: string): BlackboardEntry[] {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return [];

    const entries = Array.from(swarm.blackboard.values());
    if (topic) return entries.filter(e => e.topic === topic);
    return entries.sort((a, b) => b.priority - a.priority);
  }

  // Stigmergy: boost a blackboard entry's priority (attracting agent attention)
  boostSignal(swarmId: string, topic: string, key: string, amount = 10): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const entry = swarm.blackboard.get(`${topic}:${key}`);
    if (!entry) return false;

    entry.priority = Math.min(100, entry.priority + amount);
    entry.updatedAt = Date.now();
    return true;
  }

  // ── Handoffs (Agent-to-Agent Transfer) ──────────────────────────────────

  handoff(swarmId: string, fromAgentId: string, toAgentId: string, reason: string, context: string): HandoffRecord | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || !swarm.config.enableHandoffs) return null;

    const from = swarm.agents.get(fromAgentId);
    const to = swarm.agents.get(toAgentId);
    if (!from || !to) return null;

    // Verify handoff is allowed
    if (!from.canHandoffTo.includes(toAgentId) && from.canHandoffTo.length > 0) return null;

    const record: HandoffRecord = {
      id: randomUUID(),
      fromAgentId,
      toAgentId,
      reason,
      context,
      timestamp: Date.now(),
    };

    swarm.handoffs.push(record);

    // Transfer current task if the from-agent has one
    if (from.currentTaskId) {
      const task = swarm.tasks.get(from.currentTaskId);
      if (task) {
        task.claimedBy = toAgentId;
        to.currentTaskId = from.currentTaskId;
        to.status = "working";
        from.currentTaskId = null;
      }
    }

    from.status = "handed_off";
    from.handoffsMade++;
    from.lastActiveAt = Date.now();
    to.lastActiveAt = Date.now();

    this.emit(swarmId, {
      type: "handoff_completed",
      swarmId,
      timestamp: Date.now(),
      data: {
        fromAgent: from.name,
        toAgent: to.name,
        reason,
        hasTask: !!to.currentTaskId,
      },
    });

    return record;
  }

  getHandoffs(swarmId: string): HandoffRecord[] {
    return this.swarms.get(swarmId)?.handoffs || [];
  }

  // ── Consensus / Voting ──────────────────────────────────────────────────

  startConsensus(swarmId: string, question: string, agentIds: string[], strategy?: ConsensusStrategy): ConsensusRound | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    // Verify all agents exist
    const validAgents = agentIds.filter(id => swarm.agents.has(id));
    if (validAgents.length < 2) return null; // need at least 2 for consensus

    const round: ConsensusRound = {
      id: randomUUID(),
      question,
      strategy: strategy || swarm.config.consensusStrategy,
      agents: validAgents,
      votes: [],
      result: null,
      confidence: 0,
      rounds: 0,
      maxRounds: swarm.config.maxConsensusRounds,
      status: "voting",
      startedAt: Date.now(),
      resolvedAt: null,
    };

    swarm.consensusRounds.set(round.id, round);

    this.emit(swarmId, {
      type: "consensus_started",
      swarmId,
      timestamp: Date.now(),
      data: { roundId: round.id, question, agents: validAgents.length, strategy: round.strategy },
    });

    return round;
  }

  submitVote(swarmId: string, roundId: string, agentId: string, answer: string, confidence: number, reasoning: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const round = swarm.consensusRounds.get(roundId);
    if (!round || round.status === "resolved" || round.status === "deadlocked") return false;
    if (!round.agents.includes(agentId)) return false;

    const vote: ConsensusVote = {
      agentId,
      answer,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
      round: round.rounds,
      timestamp: Date.now(),
    };

    round.votes.push(vote);

    this.emit(swarmId, {
      type: "consensus_vote",
      swarmId,
      timestamp: Date.now(),
      data: { roundId, agentId, confidence: vote.confidence, round: round.rounds },
    });

    // Check if all agents in this round have voted
    const currentRoundVotes = round.votes.filter(v => v.round === round.rounds);
    if (currentRoundVotes.length >= round.agents.length) {
      this.resolveConsensus(swarmId, roundId);
    }

    return true;
  }

  private resolveConsensus(swarmId: string, roundId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const round = swarm.consensusRounds.get(roundId);
    if (!round) return;

    const currentVotes = round.votes.filter(v => v.round === round.rounds);
    round.rounds++;

    switch (round.strategy) {
      case "majority_vote": {
        const tally = new Map<string, { count: number; totalConf: number }>();
        for (const v of currentVotes) {
          const existing = tally.get(v.answer) || { count: 0, totalConf: 0 };
          existing.count++;
          existing.totalConf += v.confidence;
          tally.set(v.answer, existing);
        }

        let best = "";
        let bestCount = 0;
        let bestConf = 0;
        for (const [answer, stats] of tally) {
          if (stats.count > bestCount || (stats.count === bestCount && stats.totalConf > bestConf)) {
            best = answer;
            bestCount = stats.count;
            bestConf = stats.totalConf;
          }
        }

        const agreement = bestCount / currentVotes.length;
        if (agreement >= swarm.config.consensusThreshold) {
          round.result = best;
          round.confidence = agreement;
          round.status = "resolved";
          round.resolvedAt = Date.now();
        } else if (round.rounds >= round.maxRounds) {
          // Deadlock — take highest confidence answer
          round.result = best;
          round.confidence = agreement;
          round.status = "deadlocked";
          round.resolvedAt = Date.now();
        } else {
          round.status = "debating"; // needs another round
        }
        break;
      }

      case "weighted_confidence": {
        const weighted = new Map<string, number>();
        let totalWeight = 0;
        for (const v of currentVotes) {
          weighted.set(v.answer, (weighted.get(v.answer) || 0) + v.confidence);
          totalWeight += v.confidence;
        }

        let best = "";
        let bestWeight = 0;
        for (const [answer, weight] of weighted) {
          if (weight > bestWeight) {
            best = answer;
            bestWeight = weight;
          }
        }

        round.result = best;
        round.confidence = totalWeight > 0 ? bestWeight / totalWeight : 0;
        round.status = round.confidence >= swarm.config.consensusThreshold ? "resolved" : "deadlocked";
        round.resolvedAt = Date.now();
        break;
      }

      case "unanimous": {
        const answers = new Set(currentVotes.map(v => v.answer));
        if (answers.size === 1) {
          round.result = currentVotes[0].answer;
          round.confidence = 1;
          round.status = "resolved";
          round.resolvedAt = Date.now();
        } else if (round.rounds >= round.maxRounds) {
          // Fallback to majority
          const tally = new Map<string, number>();
          for (const v of currentVotes) tally.set(v.answer, (tally.get(v.answer) || 0) + 1);
          let best = ""; let bestCount = 0;
          for (const [a, c] of tally) { if (c > bestCount) { best = a; bestCount = c; } }
          round.result = best;
          round.confidence = bestCount / currentVotes.length;
          round.status = "deadlocked";
          round.resolvedAt = Date.now();
        } else {
          round.status = "debating";
        }
        break;
      }

      case "debate": {
        // In debate mode, always go to max rounds, then use weighted vote
        if (round.rounds >= round.maxRounds) {
          // Use all votes across all rounds, weighted by round number (later = more informed)
          const weighted = new Map<string, number>();
          for (const v of round.votes) {
            const roundWeight = 1 + (v.round * 0.5); // later rounds count more
            weighted.set(v.answer, (weighted.get(v.answer) || 0) + v.confidence * roundWeight);
          }
          let best = ""; let bestWeight = 0;
          for (const [a, w] of weighted) { if (w > bestWeight) { best = a; bestWeight = w; } }
          round.result = best;
          round.confidence = bestWeight / (round.votes.length * 1.5); // normalized
          round.status = "resolved";
          round.resolvedAt = Date.now();
        } else {
          round.status = "debating";
        }
        break;
      }
    }

    if (round.status === "resolved" || round.status === "deadlocked") {
      this.emit(swarmId, {
        type: "consensus_resolved",
        swarmId,
        timestamp: Date.now(),
        data: {
          roundId,
          result: round.result,
          confidence: round.confidence,
          status: round.status,
          totalRounds: round.rounds,
          totalVotes: round.votes.length,
        },
      });
    }
  }

  getConsensusRound(swarmId: string, roundId: string): ConsensusRound | undefined {
    return this.swarms.get(swarmId)?.consensusRounds.get(roundId);
  }

  listConsensusRounds(swarmId: string): ConsensusRound[] {
    const swarm = this.swarms.get(swarmId);
    return swarm ? Array.from(swarm.consensusRounds.values()) : [];
  }

  // ── Stats & Monitoring ──────────────────────────────────────────────────

  getStats(swarmId: string): SwarmStats | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    const agents = Array.from(swarm.agents.values());
    const tasks = Array.from(swarm.tasks.values());
    const completedTasks = tasks.filter(t => t.status === "completed");
    const uptime = swarm.startedAt ? (Date.now() - swarm.startedAt) / 1000 : 0;

    return {
      swarmId,
      status: swarm.status,
      agentCount: agents.length,
      activeAgents: agents.filter(a => a.status === "working").length,
      taskCount: tasks.length,
      completedTasks: completedTasks.length,
      failedTasks: tasks.filter(t => t.status === "failed").length,
      pendingTasks: tasks.filter(t => t.status === "pending").length,
      blackboardEntries: swarm.blackboard.size,
      handoffCount: swarm.handoffs.length,
      consensusRounds: swarm.consensusRounds.size,
      totalTokens: agents.reduce((sum, a) => sum + a.tokenUsage.total, 0),
      uptime,
      throughput: uptime > 0 ? (completedTasks.length / uptime) * 60 : 0,
    };
  }

  getEventLog(swarmId: string, limit = 50): SwarmEvent[] {
    return this.eventLog
      .filter(e => e.swarmId === swarmId)
      .slice(-limit);
  }

  // ── Events ──────────────────────────────────────────────────────────────

  on(swarmId: string, listener: SwarmEventListener): void {
    const list = this.listeners.get(swarmId) || [];
    list.push(listener);
    this.listeners.set(swarmId, list);
  }

  off(swarmId: string, listener: SwarmEventListener): void {
    const list = this.listeners.get(swarmId) || [];
    this.listeners.set(swarmId, list.filter(l => l !== listener));
  }

  private emit(swarmId: string, event: SwarmEvent): void {
    // Log
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLog) {
      this.eventLog = this.eventLog.slice(-this.maxEventLog);
    }

    // Notify listeners
    const list = this.listeners.get(swarmId) || [];
    for (const listener of list) {
      try { listener(event); } catch { /* swallow listener errors */ }
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────

  serializeSwarm(swarmId: string): Record<string, unknown> | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    return {
      config: swarm.config,
      status: swarm.status,
      agents: Array.from(swarm.agents.values()),
      tasks: Array.from(swarm.tasks.values()),
      blackboard: Array.from(swarm.blackboard.values()),
      handoffs: swarm.handoffs,
      consensusRounds: Array.from(swarm.consensusRounds.values()),
      startedAt: swarm.startedAt,
      completedAt: swarm.completedAt,
      error: swarm.error,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const swarmEngine = new SwarmEngine();
