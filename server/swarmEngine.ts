/**
 * SwarmEngine — Layer 3: Complete Swarm Coordination System
 *
 * Full production-grade multi-agent swarm with:
 *  1. BLACKBOARD — Persistent shared workspace with topic namespacing, subscriptions,
 *     signal pheromones, TTL/GC, confidence scoring, and conflict detection
 *  2. HANDOFFS — Agent-to-agent task transfer with context preservation
 *  3. DYNAMIC SPAWNING — Runtime agent creation with depth limits
 *  4. CONSENSUS — 4 strategies: majority, weighted_majority, unanimity, reconciliation_agent
 *  5. STIGMERGY — Priority signals on blackboard entries to attract agents
 *  6. ROLE NEGOTIATION — Contract Net Protocol with algorithmic bidding
 *  7. DELIBERATION — Conflict resolution between agents via NIP
 *  8. DEADLOCK DETECTION — Cycle detection, stale agents, mutual-wait resolution
 *  9. MESSAGING — Agent-to-agent lateral communication via EventEmitter mailbox
 * 10. SAFETY — Token budgets, spawn depth, wall-clock, circuit breaker, budget enforcement
 * 11. PERSISTENCE — Full 6-table SQLite schema (sessions, agents, tasks, blackboard, consensus, messages)
 * 12. SSE STREAMING — Real-time events for frontend topology/blackboard/consensus views
 * 13. SELF-LEARNING — Swarm outcomes feed into learning loop
 *
 * Architecture: Hybrid Blackboard + DAG + Ensemble
 * The engine wraps the existing orchestrator, adding swarm mode as a drop-in.
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { logExecution } from "./selfLearning.js";
import { chat, chatStream, selectModelForTask, type ChatMessage, type TaskType } from "./modelRouter.js";
import { TOOL_SCHEMAS, executeTool, type ToolResult } from "./tools.js";
import { withRetryAndFallback } from "./errorRecovery.js";
import { knowledgeEngine } from "./knowledgeEngine.js";
import { storage } from "./storage.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SwarmStatus = "idle" | "running" | "paused" | "completed" | "failed" | "terminated";
export type AgentStatus = "idle" | "working" | "waiting" | "handed_off" | "completed" | "failed" | "terminated";
export type ConsensusStrategy = "majority_vote" | "weighted_majority" | "unanimity" | "reconciliation_agent";
export type BlackboardEntryType = "fact" | "hypothesis" | "partial_result" | "signal" | "request" | "decision" | "conflict";
export type SwarmMessageType = "ping" | "info_request" | "info_response" | "delegation" | "signal" | "merge_request" | "handoff" | "broadcast";

export interface SafetyCaps {
  maxTotalTokens: number;
  maxSpawnDepth: number;
  maxWallClockMs: number;
  maxAgentIterations: number;
  maxAgents: number;
  maxConcurrentAgents: number;
  circuitBreakerThreshold: number;
  deadlockDetectionMs: number;
  budgetWarningPct: number;  // emit warning at this % of token budget (0-1)
}

export interface SwarmConfig {
  id: string;
  name: string;
  description: string;
  conversationId?: string;
  mode: "collaborative" | "competitive" | "exploratory";
  defaultModelId: string | null;
  maxTasksPerAgent: number;
  consensusStrategy: ConsensusStrategy;
  consensusThreshold: number;
  maxConsensusRounds: number;
  enableDynamicSpawning: boolean;
  enableStigmergy: boolean;
  enableHandoffs: boolean;
  enableRoleNegotiation: boolean;
  enableDeadlockDetection: boolean;
  taskClaimTimeout: number;
  agentIdleTimeout: number;
  safety: SafetyCaps;
  blackboardTTLMs: number | null;
  createdAt: number;
}

// In-memory agent representation (richer than DB row)
export interface SwarmAgentMem {
  id: string;
  swarmSessionId: string;
  parentAgentId: string | null;
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  tools: string[];
  canHandoffTo: string[];
  canSpawn: boolean;
  spawnDepth: number;
  status: AgentStatus;
  currentTaskId: string | null;
  tokenUsage: { prompt: number; completion: number; total: number };
  messagesProcessed: number;
  handoffsMade: number;
  capabilityProfile: { speed: number; accuracy: number; cost: number; specialties: string[] };
  lastActiveAt: number;
  createdAt: number;
}

export interface SwarmTaskMem {
  id: string;
  swarmSessionId: string;
  description: string;
  taskType: string;
  priority: number;
  claimedBy: string | null;
  status: "pending" | "claimed" | "running" | "completed" | "failed";
  result: string | null;
  dependencies: string[];
  metadata: Record<string, unknown>;
  claimedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface BlackboardEntryMem {
  id: string;
  swarmSessionId: string;
  authorAgentId: string;
  entryType: BlackboardEntryType;
  topic: string;
  key: string;
  content: string;
  confidence: number;
  priority: number;
  version: number;
  supersedesEntryId: string | null;
  readByAgentIds: string[];
  ttlMs: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConsensusVote {
  agentId: string;
  answer: string;
  confidence: number;
  reasoning: string;
  round: number;
  timestamp: number;
}

export interface ConsensusRoundMem {
  id: string;
  swarmSessionId: string;
  subject: string;
  strategy: ConsensusStrategy;
  status: "open" | "voting" | "reconciling" | "resolved" | "deadlocked";
  votes: ConsensusVote[];
  result: { winner: string; confidence: number; reasoning: string } | null;
  participantAgentIds: string[];
  maxRounds: number;
  currentRound: number;
  createdAt: number;
  resolvedAt: number | null;
}

export interface HandoffRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: string;
  taskId: string | null;
  timestamp: number;
}

export interface SwarmSession {
  config: SwarmConfig;
  status: SwarmStatus;
  agents: Map<string, SwarmAgentMem>;
  tasks: Map<string, SwarmTaskMem>;
  blackboard: Map<string, BlackboardEntryMem>;  // key: topic:key
  handoffs: HandoffRecord[];
  consensusRounds: Map<string, ConsensusRoundMem>;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  totalTokensUsed: number;
  totalAgentsSpawned: number;
  consecutiveFailures: number;
  circuitBroken: boolean;
  gcTimer: ReturnType<typeof setInterval> | null;
  deadlockTimer: ReturnType<typeof setInterval> | null;
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
  runningTasks: number;
  blackboardEntries: number;
  handoffCount: number;
  consensusRounds: number;
  totalTokens: number;
  totalAgentsSpawned: number;
  uptime: number;
  throughput: number;
  circuitBroken: boolean;
  consecutiveFailures: number;
  budgetUsedPct: number;
}

// ─── Event System ───────────────────────────────────────────────────────────

export type SwarmEventType =
  | "agent_spawned" | "agent_status" | "agent_completed" | "agent_terminated"
  | "task_created" | "task_claimed" | "task_completed" | "task_failed"
  | "blackboard_write" | "blackboard_read" | "blackboard_expired"
  | "handoff_initiated" | "handoff_completed"
  | "consensus_started" | "vote_cast" | "consensus_resolved"
  | "message_sent" | "budget_warning" | "safety_alert"
  | "swarm_started" | "swarm_completed" | "swarm_error"
  | "circuit_broken" | "deadlock_detected"
  | "bid_awarded" | "negotiation_complete";

export interface SwarmEvent {
  type: SwarmEventType;
  swarmId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

type SwarmEventListener = (event: SwarmEvent) => void;
type BlackboardSubscriber = (entry: BlackboardEntryMem, eventType: "write" | "update" | "expired") => void;
type SSEClient = (event: SwarmEvent) => void;

const DEFAULT_SAFETY: SafetyCaps = {
  maxTotalTokens: 500_000,
  maxSpawnDepth: 2,
  maxWallClockMs: 10 * 60 * 1000,    // 10 minutes
  maxAgentIterations: 10,
  maxAgents: 12,
  maxConcurrentAgents: 6,
  circuitBreakerThreshold: 5,
  deadlockDetectionMs: 5_000,
  budgetWarningPct: 0.9,
};

// ─── SwarmEngine ────────────────────────────────────────────────────────────

class SwarmEngine {
  private swarms: Map<string, SwarmSession> = new Map();
  private listeners: Map<string, SwarmEventListener[]> = new Map();
  private sseClients: Map<string, SSEClient[]> = new Map();
  private bbSubscribers: Map<string, BlackboardSubscriber[]> = new Map(); // key: swarmId:topicPattern
  private agentMailboxes = new EventEmitter();
  private eventLog: SwarmEvent[] = [];
  private maxEventLog = 5000;
  private spawnRateTracker: Map<string, number[]> = new Map(); // swarmId -> timestamps

  constructor() {
    this.agentMailboxes.setMaxListeners(200);
  }

  // ── Swarm Lifecycle ─────────────────────────────────────────────────────

  createSwarm(config: Partial<SwarmConfig> & { name: string }): SwarmSession {
    const id = config.id || randomUUID();
    const fullConfig: SwarmConfig = {
      id,
      name: config.name,
      description: config.description || "",
      conversationId: config.conversationId,
      mode: config.mode || "collaborative",
      defaultModelId: config.defaultModelId || null,
      maxTasksPerAgent: config.maxTasksPerAgent || 5,
      consensusStrategy: config.consensusStrategy || "majority_vote",
      consensusThreshold: config.consensusThreshold || 0.6,
      maxConsensusRounds: config.maxConsensusRounds || 3,
      enableDynamicSpawning: config.enableDynamicSpawning ?? true,
      enableStigmergy: config.enableStigmergy ?? true,
      enableHandoffs: config.enableHandoffs ?? true,
      enableRoleNegotiation: config.enableRoleNegotiation ?? true,
      enableDeadlockDetection: config.enableDeadlockDetection ?? true,
      taskClaimTimeout: config.taskClaimTimeout || 30000,
      agentIdleTimeout: config.agentIdleTimeout || 120000,
      safety: { ...DEFAULT_SAFETY, ...(config.safety || {}) },
      blackboardTTLMs: config.blackboardTTLMs ?? null,
      createdAt: Date.now(),
    };

    const session: SwarmSession = {
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
      totalTokensUsed: 0,
      totalAgentsSpawned: 0,
      consecutiveFailures: 0,
      circuitBroken: false,
      gcTimer: null,
      deadlockTimer: null,
    };

    this.swarms.set(id, session);
    this.persistSession(session);
    return session;
  }

  getSwarm(id: string): SwarmSession | undefined { return this.swarms.get(id); }

  listSwarms(): SwarmSession[] { return Array.from(this.swarms.values()); }

  deleteSwarm(id: string): boolean {
    const session = this.swarms.get(id);
    if (!session) return false;
    if (session.status === "running") this.terminateSwarm(id, "Deleted by user");
    this.cleanupTimers(session);
    this.swarms.delete(id);
    this.listeners.delete(id);
    this.sseClients.delete(id);
    this.spawnRateTracker.delete(id);
    for (const key of this.bbSubscribers.keys()) {
      if (key.startsWith(`${id}:`)) this.bbSubscribers.delete(key);
    }
    try { storage.deleteSwarmSession(id); } catch (e) { console.error("[swarm] Delete error:", e); }
    return true;
  }

  startSwarm(id: string): SwarmSession {
    const session = this.swarms.get(id);
    if (!session) throw new Error(`Swarm ${id} not found`);
    if (session.status === "running") return session;

    session.status = "running";
    session.startedAt = Date.now();
    session.completedAt = null;
    session.error = null;
    session.circuitBroken = false;
    session.consecutiveFailures = 0;

    // Start blackboard GC timer
    if (session.config.blackboardTTLMs) {
      session.gcTimer = setInterval(() => this.runBlackboardGC(id), 15_000);
      if (session.gcTimer.unref) session.gcTimer.unref();
    }

    // Start deadlock detection
    if (session.config.enableDeadlockDetection) {
      session.deadlockTimer = setInterval(() => this.detectDeadlocks(id), session.config.safety.deadlockDetectionMs);
      if (session.deadlockTimer.unref) session.deadlockTimer.unref();
    }

    this.emitEvent(id, "swarm_started", {});
    this.persistSession(session);
    return session;
  }

  stopSwarm(id: string): SwarmSession {
    const session = this.swarms.get(id);
    if (!session) throw new Error(`Swarm ${id} not found`);

    session.status = "completed";
    session.completedAt = Date.now();
    this.cleanupTimers(session);

    for (const agent of session.agents.values()) {
      if (agent.status === "working" || agent.status === "waiting") {
        agent.status = "completed";
        this.persistAgent(session.config.id, agent);
      }
    }

    this.logSwarmOutcome(session);
    this.emitEvent(id, "swarm_completed", {});
    this.persistSession(session);
    return session;
  }

  terminateSwarm(id: string, reason: string): SwarmSession {
    const session = this.swarms.get(id);
    if (!session) throw new Error(`Swarm ${id} not found`);

    session.status = "terminated";
    session.completedAt = Date.now();
    session.error = reason;
    this.cleanupTimers(session);

    for (const agent of session.agents.values()) {
      if (agent.status !== "completed" && agent.status !== "failed") {
        agent.status = "terminated";
        this.persistAgent(session.config.id, agent);
      }
    }

    this.emitEvent(id, "swarm_error", { reason });
    this.persistSession(session);
    return session;
  }

  private cleanupTimers(session: SwarmSession): void {
    if (session.gcTimer) { clearInterval(session.gcTimer); session.gcTimer = null; }
    if (session.deadlockTimer) { clearInterval(session.deadlockTimer); session.deadlockTimer = null; }
  }

  // ── Agent Management ────────────────────────────────────────────────────

  addAgent(swarmId: string, agentDef: {
    id?: string;
    name: string;
    role: string;
    instructions?: string;
    modelId?: string | null;
    tools?: string[];
    capabilities?: string[];
    canHandoffTo?: string[];
    canSpawn?: boolean;
    spawnDepth?: number;
    parentAgentId?: string | null;
    capabilityProfile?: { speed: number; accuracy: number; cost: number; specialties: string[] };
  }): SwarmAgentMem {
    const session = this.swarms.get(swarmId);
    if (!session) throw new Error(`Swarm ${swarmId} not found`);
    if (session.agents.size >= session.config.safety.maxAgents) {
      throw new Error(`Swarm at max capacity (${session.config.safety.maxAgents} agents)`);
    }

    const agent: SwarmAgentMem = {
      id: agentDef.id || randomUUID(),
      swarmSessionId: swarmId,
      parentAgentId: agentDef.parentAgentId ?? null,
      name: agentDef.name,
      role: agentDef.role,
      instructions: agentDef.instructions || `${agentDef.role} agent`,
      modelId: agentDef.modelId ?? null,
      tools: agentDef.tools || agentDef.capabilities || [],
      canHandoffTo: agentDef.canHandoffTo || [],
      canSpawn: agentDef.canSpawn ?? false,
      spawnDepth: agentDef.spawnDepth ?? 0,
      status: "idle",
      currentTaskId: null,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      messagesProcessed: 0,
      handoffsMade: 0,
      capabilityProfile: agentDef.capabilityProfile || { speed: 0.5, accuracy: 0.5, cost: 0.5, specialties: [] },
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
    };

    session.agents.set(agent.id, agent);
    session.totalAgentsSpawned++;
    this.persistAgent(swarmId, agent);
    this.emitEvent(swarmId, "agent_spawned", { agentId: agent.id, name: agent.name, role: agent.role, depth: agent.spawnDepth });
    return agent;
  }

  removeAgent(swarmId: string, agentId: string): boolean {
    const session = this.swarms.get(swarmId);
    if (!session) return false;
    const agent = session.agents.get(agentId);
    if (!agent) return false;

    // Release claimed tasks
    if (agent.currentTaskId) {
      const task = session.tasks.get(agent.currentTaskId);
      if (task && (task.status === "claimed" || task.status === "running")) {
        task.status = "pending";
        task.claimedBy = null;
        task.claimedAt = null;
        this.persistTask(swarmId, task);
      }
    }

    session.agents.delete(agentId);
    for (const other of session.agents.values()) {
      other.canHandoffTo = other.canHandoffTo.filter(id => id !== agentId);
    }

    try { storage.deleteSwarmAgent(agentId); } catch { /* ok */ }
    this.emitEvent(swarmId, "agent_terminated", { agentId, name: agent.name });
    return true;
  }

  getAgent(swarmId: string, agentId: string): SwarmAgentMem | undefined {
    return this.swarms.get(swarmId)?.agents.get(agentId);
  }

  listAgents(swarmId: string): SwarmAgentMem[] {
    const session = this.swarms.get(swarmId);
    return session ? Array.from(session.agents.values()) : [];
  }

  // Dynamic spawning with rate limiting
  spawnAgent(swarmId: string, requestingAgentId: string, agentDef: {
    name: string;
    role: string;
    instructions: string;
    modelId?: string | null;
    tools?: string[];
    taskType?: string;
    priority?: string;
    context?: string;
  }): SwarmAgentMem | null {
    const session = this.swarms.get(swarmId);
    if (!session || !session.config.enableDynamicSpawning) return null;

    const requestor = session.agents.get(requestingAgentId);
    if (!requestor || !requestor.canSpawn) return null;

    // Check spawn depth
    if (requestor.spawnDepth >= session.config.safety.maxSpawnDepth) {
      this.emitEvent(swarmId, "safety_alert", { reason: "max_spawn_depth", agentId: requestingAgentId, depth: requestor.spawnDepth });
      return null;
    }

    // Check spawn rate (circuit breaker pattern — max 5 spawns per 10s window)
    const now = Date.now();
    const tracker = this.spawnRateTracker.get(swarmId) || [];
    const recentSpawns = tracker.filter(t => now - t < 10_000);
    if (recentSpawns.length >= 5) {
      this.emitEvent(swarmId, "safety_alert", { reason: "spawn_rate_limit", recentSpawns: recentSpawns.length });
      return null;
    }
    recentSpawns.push(now);
    this.spawnRateTracker.set(swarmId, recentSpawns);

    return this.addAgent(swarmId, {
      ...agentDef,
      parentAgentId: requestingAgentId,
      spawnDepth: requestor.spawnDepth + 1,
      canSpawn: requestor.spawnDepth + 1 < session.config.safety.maxSpawnDepth,
    });
  }

  // ── Task Pool ─────────────────────────────────────────────────────────

  addTask(swarmId: string, taskDef: {
    description: string;
    taskType?: string;
    priority?: number;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
  }): SwarmTaskMem {
    const session = this.swarms.get(swarmId);
    if (!session) throw new Error(`Swarm ${swarmId} not found`);

    const task: SwarmTaskMem = {
      id: randomUUID(),
      swarmSessionId: swarmId,
      description: taskDef.description,
      taskType: taskDef.taskType || "general",
      priority: taskDef.priority ?? 50,
      claimedBy: null,
      status: "pending",
      result: null,
      dependencies: taskDef.dependencies || [],
      metadata: taskDef.metadata || {},
      claimedAt: null,
      completedAt: null,
      createdAt: Date.now(),
    };

    session.tasks.set(task.id, task);
    this.persistTask(swarmId, task);
    this.emitEvent(swarmId, "task_created", { taskId: task.id, description: task.description.slice(0, 200), priority: task.priority });
    return task;
  }

  // Role Negotiation: Algorithmic bid scoring (Contract Net Protocol)
  negotiateTaskAssignment(swarmId: string, taskId: string): { agentId: string; score: number } | null {
    const session = this.swarms.get(swarmId);
    if (!session || !session.config.enableRoleNegotiation) return null;

    const task = session.tasks.get(taskId);
    if (!task || task.status !== "pending") return null;

    // Check task dependencies
    for (const depId of task.dependencies) {
      const dep = session.tasks.get(depId);
      if (dep && dep.status !== "completed") return null; // dependency not met
    }

    const idleAgents = Array.from(session.agents.values()).filter(a => a.status === "idle");
    if (idleAgents.length === 0) return null;

    let bestAgent: SwarmAgentMem | null = null;
    let bestScore = -1;

    for (const agent of idleAgents) {
      const cap = agent.capabilityProfile;

      // Capability match: does agent's specialty match task type?
      const capabilityScore = cap.specialties.includes(task.taskType) ? 1.0
        : cap.specialties.length === 0 ? 0.5 // generalist
        : 0.2;

      // Load: how many tasks has this agent already done?
      const completedByAgent = Array.from(session.tasks.values()).filter(t => t.claimedBy === agent.id && t.status === "completed").length;
      const loadFactor = 1 - Math.min(1, completedByAgent / session.config.maxTasksPerAgent);

      // Speed bonus: faster agents preferred for lower-priority tasks
      const speedBonus = task.priority < 50 ? cap.speed : (1 - cap.speed) * 0.3;

      // Algorithmic bid: capability * 0.5 + (1 - load) * 0.3 + speedBonus * 0.2
      const score = capabilityScore * 0.5 + loadFactor * 0.3 + speedBonus * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    if (!bestAgent) return null;

    this.emitEvent(swarmId, "bid_awarded", {
      taskId,
      agentId: bestAgent.id,
      agentName: bestAgent.name,
      score: bestScore,
      candidates: idleAgents.length,
    });

    return { agentId: bestAgent.id, score: bestScore };
  }

  claimTask(swarmId: string, agentId: string, taskId: string): boolean {
    const session = this.swarms.get(swarmId);
    if (!session) return false;

    const agent = session.agents.get(agentId);
    const task = session.tasks.get(taskId);
    if (!agent || !task) return false;
    if (task.status !== "pending") return false;

    // Check dependencies
    for (const depId of task.dependencies) {
      const dep = session.tasks.get(depId);
      if (dep && dep.status !== "completed") return false;
    }

    task.status = "claimed";
    task.claimedBy = agentId;
    task.claimedAt = Date.now();
    agent.status = "working";
    agent.currentTaskId = taskId;
    agent.lastActiveAt = Date.now();

    this.persistTask(swarmId, task);
    this.persistAgent(swarmId, agent);
    this.emitEvent(swarmId, "task_claimed", { taskId, agentId, agentName: agent.name });
    return true;
  }

  completeTask(swarmId: string, agentId: string, taskId: string, result: string): boolean {
    const session = this.swarms.get(swarmId);
    if (!session) return false;

    const task = session.tasks.get(taskId);
    const agent = session.agents.get(agentId);
    if (!task || !agent) return false;
    if (task.claimedBy !== agentId) return false;

    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();
    agent.status = "idle";
    agent.currentTaskId = null;
    agent.lastActiveAt = Date.now();
    session.consecutiveFailures = 0;

    this.persistTask(swarmId, task);
    this.persistAgent(swarmId, agent);
    this.emitEvent(swarmId, "task_completed", { taskId, agentId, resultPreview: result.slice(0, 200) });
    this.checkSwarmCompletion(swarmId);
    return true;
  }

  failTask(swarmId: string, agentId: string, taskId: string, error: string): boolean {
    const session = this.swarms.get(swarmId);
    if (!session) return false;

    const task = session.tasks.get(taskId);
    const agent = session.agents.get(agentId);
    if (!task || !agent) return false;

    task.status = "failed";
    task.result = `ERROR: ${error}`;
    task.completedAt = Date.now();
    agent.status = "idle";
    agent.currentTaskId = null;

    session.consecutiveFailures++;
    if (session.consecutiveFailures >= session.config.safety.circuitBreakerThreshold) {
      session.circuitBroken = true;
      this.emitEvent(swarmId, "circuit_broken", { consecutiveFailures: session.consecutiveFailures });
    }

    this.persistTask(swarmId, task);
    this.persistAgent(swarmId, agent);
    this.emitEvent(swarmId, "task_failed", { taskId, agentId, error });
    this.checkSwarmCompletion(swarmId);
    return true;
  }

  getAvailableTasks(swarmId: string): SwarmTaskMem[] {
    const session = this.swarms.get(swarmId);
    if (!session) return [];
    return Array.from(session.tasks.values())
      .filter(t => {
        if (t.status !== "pending") return false;
        // Check dependencies are met
        for (const depId of t.dependencies) {
          const dep = session.tasks.get(depId);
          if (dep && dep.status !== "completed") return false;
        }
        return true;
      })
      .sort((a, b) => b.priority - a.priority);
  }

  // ── Blackboard (Shared State) ───────────────────────────────────────────

  writeBlackboard(swarmId: string, agentId: string, entry: {
    topic: string;
    key: string;
    content: string;
    entryType?: BlackboardEntryType;
    confidence?: number;
    priority?: number;
    ttlMs?: number;
  }): BlackboardEntryMem {
    const session = this.swarms.get(swarmId);
    if (!session) throw new Error(`Swarm ${swarmId} not found`);

    const compositeKey = `${entry.topic}:${entry.key}`;
    const existing = session.blackboard.get(compositeKey);
    const effectiveTTL = entry.ttlMs ?? session.config.blackboardTTLMs ?? null;
    const now = Date.now();

    const bbEntry: BlackboardEntryMem = {
      id: existing?.id || randomUUID(),
      swarmSessionId: swarmId,
      authorAgentId: agentId,
      entryType: entry.entryType || "fact",
      topic: entry.topic,
      key: entry.key,
      content: entry.content,
      confidence: entry.confidence ?? 0.5,
      priority: existing ? Math.max(existing.priority, entry.priority ?? 50) : (entry.priority ?? 50),
      version: existing ? existing.version + 1 : 1,
      supersedesEntryId: existing?.id || null,
      readByAgentIds: [],
      ttlMs: effectiveTTL,
      expiresAt: effectiveTTL ? now + effectiveTTL : null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    session.blackboard.set(compositeKey, bbEntry);

    // Persist to SQLite
    try {
      if (existing) {
        storage.updateBlackboardEntry(bbEntry.id, {
          content: bbEntry.content,
          confidence: bbEntry.confidence,
          priority: bbEntry.priority,
          version: bbEntry.version,
          authorAgentId: bbEntry.authorAgentId,
          readByAgentIds: JSON.stringify(bbEntry.readByAgentIds),
        });
      } else {
        storage.createBlackboardEntry({
          id: bbEntry.id,
          swarmSessionId: swarmId,
          authorAgentId: agentId,
          entryType: bbEntry.entryType,
          topic: bbEntry.topic,
          key: bbEntry.key,
          content: bbEntry.content,
          confidence: bbEntry.confidence,
          priority: bbEntry.priority,
          version: bbEntry.version,
          supersedesEntryId: bbEntry.supersedesEntryId,
          readByAgentIds: JSON.stringify(bbEntry.readByAgentIds),
          ttlMs: bbEntry.ttlMs,
          expiresAt: bbEntry.expiresAt,
        });
      }
    } catch (e) { console.error("[swarm] Blackboard persist error:", e); }

    const evtType = existing ? "blackboard_write" : "blackboard_write";
    this.emitEvent(swarmId, evtType, { topic: entry.topic, key: entry.key, author: agentId, version: bbEntry.version, entryType: bbEntry.entryType });
    this.notifyBBSubscribers(swarmId, entry.topic, bbEntry, existing ? "update" : "write");

    // Detect conflicts: same topic+key from different agents with different content
    if (existing && existing.authorAgentId !== agentId && existing.content !== entry.content) {
      this.emitEvent(swarmId, "blackboard_write", {
        subType: "conflict_detected",
        topic: entry.topic,
        key: entry.key,
        agents: [existing.authorAgentId, agentId],
      });
    }

    return bbEntry;
  }

  readBlackboard(swarmId: string, filters?: { topic?: string; entryType?: string; agentId?: string; minPriority?: number }): BlackboardEntryMem[] {
    const session = this.swarms.get(swarmId);
    if (!session) return [];

    const now = Date.now();
    let entries = Array.from(session.blackboard.values())
      .filter(e => !e.expiresAt || e.expiresAt > now);

    if (filters?.topic) entries = entries.filter(e => e.topic === filters.topic || e.topic.startsWith(filters.topic + "."));
    if (filters?.entryType) entries = entries.filter(e => e.entryType === filters.entryType);
    if (filters?.agentId) entries = entries.filter(e => e.authorAgentId === filters.agentId);
    if (filters?.minPriority) entries = entries.filter(e => e.priority >= filters.minPriority!);

    return entries.sort((a, b) => b.priority - a.priority);
  }

  markBlackboardRead(swarmId: string, entryId: string, agentId: string): void {
    const session = this.swarms.get(swarmId);
    if (!session) return;
    for (const entry of session.blackboard.values()) {
      if (entry.id === entryId && !entry.readByAgentIds.includes(agentId)) {
        entry.readByAgentIds.push(agentId);
        this.emitEvent(swarmId, "blackboard_read", { entryId, agentId, topic: entry.topic });
      }
    }
  }

  // Blackboard snapshot for context injection into agent prompts
  blackboardSnapshot(swarmId: string, maxEntries = 30): string {
    const entries = this.readBlackboard(swarmId);
    if (entries.length === 0) return "";
    const topEntries = entries.slice(0, maxEntries);
    const lines = topEntries.map(e =>
      `[${e.entryType}] ${e.topic}/${e.key} (confidence:${e.confidence.toFixed(2)}, priority:${e.priority}) by agent:${e.authorAgentId.slice(0, 8)}\n  ${e.content.slice(0, 500)}`
    );
    return `## Shared Blackboard (${entries.length} entries)\n${lines.join("\n")}`;
  }

  boostSignal(swarmId: string, topic: string, key: string, amount = 10): boolean {
    const session = this.swarms.get(swarmId);
    if (!session) return false;
    const entry = session.blackboard.get(`${topic}:${key}`);
    if (!entry) return false;
    entry.priority = Math.min(100, entry.priority + amount);
    entry.updatedAt = Date.now();
    return true;
  }

  // Blackboard subscriptions
  subscribeToBB(swarmId: string, topicPattern: string, callback: BlackboardSubscriber): void {
    const key = `${swarmId}:${topicPattern}`;
    const list = this.bbSubscribers.get(key) || [];
    list.push(callback);
    this.bbSubscribers.set(key, list);
  }

  unsubscribeFromBB(swarmId: string, topicPattern: string, callback: BlackboardSubscriber): void {
    const key = `${swarmId}:${topicPattern}`;
    const list = this.bbSubscribers.get(key) || [];
    this.bbSubscribers.set(key, list.filter(cb => cb !== callback));
  }

  private notifyBBSubscribers(swarmId: string, topic: string, entry: BlackboardEntryMem, eventType: "write" | "update" | "expired"): void {
    // Exact topic match
    const topicKey = `${swarmId}:${topic}`;
    for (const cb of this.bbSubscribers.get(topicKey) || []) {
      try { cb(entry, eventType); } catch { /* swallow */ }
    }
    // Wildcard
    for (const cb of this.bbSubscribers.get(`${swarmId}:*`) || []) {
      try { cb(entry, eventType); } catch { /* swallow */ }
    }
    // Parent topic match (e.g., "research" matches "research.findings")
    const parts = topic.split(".");
    for (let i = 1; i < parts.length; i++) {
      const parentTopic = parts.slice(0, i).join(".");
      for (const cb of this.bbSubscribers.get(`${swarmId}:${parentTopic}`) || []) {
        try { cb(entry, eventType); } catch { /* swallow */ }
      }
    }
  }

  // Blackboard TTL / GC
  private runBlackboardGC(swarmId: string): void {
    const session = this.swarms.get(swarmId);
    if (!session) return;

    const now = Date.now();
    const expired: string[] = [];

    for (const [compositeKey, entry] of session.blackboard.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        expired.push(compositeKey);
        this.notifyBBSubscribers(swarmId, entry.topic, entry, "expired");
        this.emitEvent(swarmId, "blackboard_expired", { topic: entry.topic, key: entry.key });
      }
    }

    for (const key of expired) { session.blackboard.delete(key); }
    if (expired.length > 0) {
      try { storage.deleteExpiredBlackboardEntries(swarmId, now); } catch { /* ok */ }
      console.log(`[swarm] GC cleaned ${expired.length} expired entries from ${swarmId}`);
    }
  }

  // ── Handoffs ──────────────────────────────────────────────────────────

  handoff(swarmId: string, fromAgentId: string, toAgentId: string, reason: string, context: string): HandoffRecord | null {
    const session = this.swarms.get(swarmId);
    if (!session || !session.config.enableHandoffs) return null;

    const from = session.agents.get(fromAgentId);
    const to = session.agents.get(toAgentId);
    if (!from || !to) return null;
    if (from.canHandoffTo.length > 0 && !from.canHandoffTo.includes(toAgentId)) return null;

    const record: HandoffRecord = {
      id: randomUUID(),
      fromAgentId,
      toAgentId,
      reason,
      context,
      taskId: from.currentTaskId,
      timestamp: Date.now(),
    };

    session.handoffs.push(record);

    // Transfer task
    if (from.currentTaskId) {
      const task = session.tasks.get(from.currentTaskId);
      if (task) {
        task.claimedBy = toAgentId;
        to.currentTaskId = from.currentTaskId;
        to.status = "working";
        from.currentTaskId = null;
        this.persistTask(swarmId, task);
      }
    }

    from.status = "handed_off";
    from.handoffsMade++;
    from.lastActiveAt = Date.now();
    to.lastActiveAt = Date.now();

    this.persistAgent(swarmId, from);
    this.persistAgent(swarmId, to);

    // Persist as swarm message
    try {
      storage.createSwarmMessage({
        id: record.id,
        swarmSessionId: swarmId,
        fromAgentId,
        toAgentId,
        messageType: "handoff",
        content: JSON.stringify({ reason, context, taskId: record.taskId }),
      });
    } catch { /* ok */ }

    this.emitEvent(swarmId, "handoff_completed", { fromAgent: from.name, toAgent: to.name, reason, taskId: record.taskId });
    return record;
  }

  getHandoffs(swarmId: string): HandoffRecord[] { return this.swarms.get(swarmId)?.handoffs || []; }

  // ── Agent Messaging (Lateral Communication) ───────────────────────────

  sendAgentMessage(swarmId: string, fromAgentId: string, toAgentId: string | null, messageType: SwarmMessageType, content: string, metadata?: Record<string, unknown>): void {
    const session = this.swarms.get(swarmId);
    if (!session) return;

    const msg = {
      id: randomUUID(),
      swarmSessionId: swarmId,
      fromAgentId,
      toAgentId,
      messageType,
      content,
      metadata: JSON.stringify(metadata || {}),
    };

    try { storage.createSwarmMessage(msg); } catch { /* ok */ }

    // Emit to mailbox
    if (toAgentId) {
      this.agentMailboxes.emit(`${swarmId}:${toAgentId}`, { ...msg, metadata });
    } else {
      // Broadcast
      for (const agent of session.agents.values()) {
        if (agent.id !== fromAgentId) {
          this.agentMailboxes.emit(`${swarmId}:${agent.id}`, { ...msg, metadata });
        }
      }
    }

    this.emitEvent(swarmId, "message_sent", { fromAgentId, toAgentId, messageType });
  }

  getMessages(swarmId: string, limit = 200): any[] {
    try { return storage.getSwarmMessages(swarmId, limit); } catch { return []; }
  }

  // ── Consensus / Voting ──────────────────────────────────────────────────

  startConsensus(swarmId: string, subject: string, agentIds: string[], strategy?: ConsensusStrategy): ConsensusRoundMem | null {
    const session = this.swarms.get(swarmId);
    if (!session) return null;

    const validAgents = agentIds.filter(id => session.agents.has(id));
    if (validAgents.length < 2) return null;

    const round: ConsensusRoundMem = {
      id: randomUUID(),
      swarmSessionId: swarmId,
      subject,
      strategy: strategy || session.config.consensusStrategy,
      status: "voting",
      votes: [],
      result: null,
      participantAgentIds: validAgents,
      maxRounds: session.config.maxConsensusRounds,
      currentRound: 0,
      createdAt: Date.now(),
      resolvedAt: null,
    };

    session.consensusRounds.set(round.id, round);
    this.persistConsensus(swarmId, round);
    this.emitEvent(swarmId, "consensus_started", { roundId: round.id, subject, agents: validAgents.length, strategy: round.strategy });
    return round;
  }

  submitVote(swarmId: string, roundId: string, agentId: string, answer: string, confidence: number, reasoning: string): boolean {
    const session = this.swarms.get(swarmId);
    if (!session) return false;

    const round = session.consensusRounds.get(roundId);
    if (!round || round.status === "resolved" || round.status === "deadlocked") return false;
    // Allow human_override to bypass participant check (HITL injection)
    if (agentId !== "human_override" && !round.participantAgentIds.includes(agentId)) return false;

    const vote: ConsensusVote = {
      agentId,
      answer,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
      round: round.currentRound,
      timestamp: Date.now(),
    };

    round.votes.push(vote);
    this.emitEvent(swarmId, "vote_cast", { roundId, agentId, confidence: vote.confidence });

    // Check if all agents voted this round
    const currentRoundVotes = round.votes.filter(v => v.round === round.currentRound);
    if (currentRoundVotes.length >= round.participantAgentIds.length) {
      this.resolveConsensus(swarmId, roundId);
    }

    this.persistConsensus(swarmId, round);
    return true;
  }

  // Human override vote
  submitHumanVote(swarmId: string, roundId: string, answer: string, reasoning: string): boolean {
    return this.submitVote(swarmId, roundId, "human_override", answer, 1.0, `[HUMAN OVERRIDE] ${reasoning}`);
  }

  private resolveConsensus(swarmId: string, roundId: string): void {
    const session = this.swarms.get(swarmId);
    if (!session) return;
    const round = session.consensusRounds.get(roundId);
    if (!round) return;

    const currentVotes = round.votes.filter(v => v.round === round.currentRound);
    round.currentRound++;

    switch (round.strategy) {
      case "majority_vote": {
        const tally = new Map<string, { count: number; totalConf: number }>();
        for (const v of currentVotes) {
          const e = tally.get(v.answer) || { count: 0, totalConf: 0 };
          e.count++;
          e.totalConf += v.confidence;
          tally.set(v.answer, e);
        }
        let best = ""; let bestCount = 0; let bestConf = 0;
        for (const [ans, stats] of tally) {
          if (stats.count > bestCount || (stats.count === bestCount && stats.totalConf > bestConf)) {
            best = ans; bestCount = stats.count; bestConf = stats.totalConf;
          }
        }
        const agreement = bestCount / currentVotes.length;
        if (agreement >= session.config.consensusThreshold) {
          round.result = { winner: best, confidence: agreement, reasoning: `Majority vote: ${bestCount}/${currentVotes.length}` };
          round.status = "resolved";
          round.resolvedAt = Date.now();
        } else if (round.currentRound >= round.maxRounds) {
          round.result = { winner: best, confidence: agreement, reasoning: `Deadlocked after ${round.maxRounds} rounds` };
          round.status = "deadlocked";
          round.resolvedAt = Date.now();
        } else {
          round.status = "voting"; // another round
        }
        break;
      }

      case "weighted_majority": {
        // ACL 2025: argument-quality-weighted voting (not naive majority)
        const weighted = new Map<string, { weight: number; bestReasoning: string }>();
        let totalWeight = 0;
        for (const v of currentVotes) {
          // Weight = confidence * reasoning quality proxy (length > 50 chars = higher quality)
          const qualityBonus = v.reasoning.length > 50 ? 1.2 : v.reasoning.length > 20 ? 1.0 : 0.8;
          const weight = v.confidence * qualityBonus;
          const existing = weighted.get(v.answer) || { weight: 0, bestReasoning: "" };
          existing.weight += weight;
          if (v.reasoning.length > existing.bestReasoning.length) existing.bestReasoning = v.reasoning;
          weighted.set(v.answer, existing);
          totalWeight += weight;
        }
        let best = ""; let bestWeight = 0; let bestReasoning = "";
        for (const [ans, data] of weighted) {
          if (data.weight > bestWeight) { best = ans; bestWeight = data.weight; bestReasoning = data.bestReasoning; }
        }
        const conf = totalWeight > 0 ? bestWeight / totalWeight : 0;
        round.result = { winner: best, confidence: conf, reasoning: bestReasoning };
        round.status = conf >= session.config.consensusThreshold ? "resolved" : "deadlocked";
        round.resolvedAt = Date.now();
        break;
      }

      case "unanimity": {
        const answers = new Set(currentVotes.map(v => v.answer));
        if (answers.size === 1) {
          round.result = { winner: currentVotes[0].answer, confidence: 1, reasoning: "Unanimous agreement" };
          round.status = "resolved";
          round.resolvedAt = Date.now();
        } else if (round.currentRound >= round.maxRounds) {
          // Fall back to majority
          const tally = new Map<string, number>();
          for (const v of currentVotes) tally.set(v.answer, (tally.get(v.answer) || 0) + 1);
          let best = ""; let bestCount = 0;
          for (const [a, c] of tally) { if (c > bestCount) { best = a; bestCount = c; } }
          round.result = { winner: best, confidence: bestCount / currentVotes.length, reasoning: `No unanimity after ${round.maxRounds} rounds, fell back to majority` };
          round.status = "deadlocked";
          round.resolvedAt = Date.now();
        } else {
          round.status = "voting";
        }
        break;
      }

      case "reconciliation_agent": {
        if (round.currentRound >= round.maxRounds) {
          // Collect all reasoning and let the reconciler decide
          const allVotes = round.votes.map(v => `Agent ${v.agentId.slice(0, 8)}: "${v.answer}" (confidence: ${v.confidence})\nReasoning: ${v.reasoning}`).join("\n\n");
          const bestByWeight = this.getWeightedWinner(currentVotes);
          round.result = {
            winner: bestByWeight,
            confidence: 0.7,
            reasoning: `Reconciliation needed. All votes:\n${allVotes}`
          };
          round.status = "resolved";
          round.resolvedAt = Date.now();
        } else {
          round.status = "reconciling";
        }
        break;
      }
    }

    if (round.status === "resolved" || round.status === "deadlocked") {
      // Write result to blackboard
      if (round.result) {
        this.writeBlackboard(swarmId, "consensus_system", {
          topic: "consensus.decisions",
          key: roundId,
          content: JSON.stringify(round.result),
          entryType: "decision",
          confidence: round.result.confidence,
          priority: 80,
        });
      }
      this.emitEvent(swarmId, "consensus_resolved", {
        roundId, result: round.result, status: round.status, totalRounds: round.currentRound,
      });
    }

    this.persistConsensus(swarmId, round);
  }

  private getWeightedWinner(votes: ConsensusVote[]): string {
    const w = new Map<string, number>();
    for (const v of votes) w.set(v.answer, (w.get(v.answer) || 0) + v.confidence);
    let best = ""; let bestW = 0;
    for (const [a, weight] of w) { if (weight > bestW) { best = a; bestW = weight; } }
    return best;
  }

  getConsensusRound(swarmId: string, roundId: string): ConsensusRoundMem | undefined {
    return this.swarms.get(swarmId)?.consensusRounds.get(roundId);
  }

  listConsensusRounds(swarmId: string): ConsensusRoundMem[] {
    const session = this.swarms.get(swarmId);
    return session ? Array.from(session.consensusRounds.values()) : [];
  }

  // ── Deadlock Detection ────────────────────────────────────────────────

  private detectDeadlocks(swarmId: string): void {
    const session = this.swarms.get(swarmId);
    if (!session || session.status !== "running") return;

    const now = Date.now();
    const staleDuration = session.config.agentIdleTimeout;

    // 1. Stale agent detection: working but no output for too long
    for (const agent of session.agents.values()) {
      if (agent.status === "working" && (now - agent.lastActiveAt) > staleDuration) {
        // Warning at 50%, terminate at 100%
        if ((now - agent.lastActiveAt) > staleDuration * 2) {
          agent.status = "terminated";
          if (agent.currentTaskId) {
            const task = session.tasks.get(agent.currentTaskId);
            if (task) { task.status = "pending"; task.claimedBy = null; task.claimedAt = null; }
          }
          agent.currentTaskId = null;
          this.emitEvent(swarmId, "deadlock_detected", { type: "stale_agent_terminated", agentId: agent.id, name: agent.name });
        } else {
          this.emitEvent(swarmId, "safety_alert", { type: "stale_agent_warning", agentId: agent.id, idleMs: now - agent.lastActiveAt });
        }
      }
    }

    // 2. Mutual wait detection: A waiting for B, B waiting for A
    const waitingAgents = Array.from(session.agents.values()).filter(a => a.status === "waiting");
    for (let i = 0; i < waitingAgents.length; i++) {
      for (let j = i + 1; j < waitingAgents.length; j++) {
        const a = waitingAgents[i];
        const b = waitingAgents[j];
        // Check if they're in each other's handoff chains
        if (a.canHandoffTo.includes(b.id) && b.canHandoffTo.includes(a.id)) {
          // Potential mutual wait — force-resolve
          a.status = "idle";
          b.status = "idle";
          this.emitEvent(swarmId, "deadlock_detected", { type: "mutual_wait", agents: [a.id, b.id] });
        }
      }
    }

    // 3. Cycle detection in task dependencies (topological sort)
    const tasks = Array.from(session.tasks.values()).filter(t => t.status === "pending" || t.status === "claimed");
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (taskId: string): boolean => {
      if (inStack.has(taskId)) return true;
      if (visited.has(taskId)) return false;
      visited.add(taskId);
      inStack.add(taskId);
      const task = session.tasks.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (hasCycle(depId)) return true;
        }
      }
      inStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      visited.clear();
      inStack.clear();
      if (hasCycle(task.id)) {
        // Break the cycle by removing the last dependency
        const lastDep = task.dependencies.pop();
        this.emitEvent(swarmId, "deadlock_detected", { type: "dependency_cycle", taskId: task.id, brokenDep: lastDep });
      }
    }
  }

  // ── Safety Caps ────────────────────────────────────────────────────────

  private checkSafetyCaps(session: SwarmSession): { safe: boolean; reason?: string } {
    const safety = session.config.safety;

    if (session.totalTokensUsed >= safety.maxTotalTokens) {
      return { safe: false, reason: `Token budget exhausted: ${session.totalTokensUsed}/${safety.maxTotalTokens}` };
    }
    if (session.startedAt && (Date.now() - session.startedAt) >= safety.maxWallClockMs) {
      return { safe: false, reason: `Wall-clock timeout: ${Math.round((Date.now() - session.startedAt) / 1000)}s` };
    }
    if (session.circuitBroken) {
      return { safe: false, reason: `Circuit broken: ${session.consecutiveFailures} consecutive failures` };
    }

    // Budget warning
    if (session.totalTokensUsed >= safety.maxTotalTokens * safety.budgetWarningPct) {
      this.emitEvent(session.config.id, "budget_warning", {
        used: session.totalTokensUsed,
        budget: safety.maxTotalTokens,
        pct: Math.round((session.totalTokensUsed / safety.maxTotalTokens) * 100),
      });
    }

    return { safe: true };
  }

  private addTokenUsage(session: SwarmSession, agent: SwarmAgentMem, prompt: number, completion: number): void {
    agent.tokenUsage.prompt += prompt;
    agent.tokenUsage.completion += completion;
    agent.tokenUsage.total += prompt + completion;
    session.totalTokensUsed += prompt + completion;
  }

  // ── Agent Execution (LLM + Tools) ──────────────────────────────────────

  async executeAgentTask(swarmId: string, agentId: string, taskId: string): Promise<string> {
    const session = this.swarms.get(swarmId);
    if (!session) throw new Error(`Swarm ${swarmId} not found`);

    const safetyCheck = this.checkSafetyCaps(session);
    if (!safetyCheck.safe) {
      this.emitEvent(swarmId, "safety_alert", { reason: safetyCheck.reason, agentId, taskId });
      throw new Error(`Safety cap: ${safetyCheck.reason}`);
    }

    const agent = session.agents.get(agentId);
    const task = session.tasks.get(taskId);
    if (!agent || !task) throw new Error("Agent or task not found");

    task.status = "running";
    agent.status = "working";
    agent.lastActiveAt = Date.now();

    this.emitEvent(swarmId, "agent_status", { agentId, status: "working", taskId, taskDesc: task.description.slice(0, 200) });

    const startTime = Date.now();

    // Resolve model
    const modelId = agent.modelId || session.config.defaultModelId;
    const model = modelId ? storage.getModel(modelId) : selectModelForTask("general");
    if (!model) throw new Error("No model available");

    // Build context
    const speedTier = (model.speedTier || "medium") as "fast" | "medium" | "powerful";
    const contextWindow = model.contextWindow || 8192;
    const kbResult = knowledgeEngine.buildContext(speedTier, contextWindow, task.description);
    const bbSnapshot = this.blackboardSnapshot(swarmId, 20);

    // Build tools
    const agentTools = agent.tools.length > 0
      ? TOOL_SCHEMAS.filter(t => agent.tools.includes(t.name))
      : TOOL_SCHEMAS;

    const toolSchemaBlock = agentTools.map(t =>
      `${t.name}: ${t.description} | params: ${JSON.stringify(t.parameters.properties)}`
    ).join("\n");

    const systemPrompt = `You are "${agent.name}", a swarm agent with role: ${agent.role}
Instructions: ${agent.instructions}

## Swarm Context
You are part of swarm "${session.config.name}" (mode: ${session.config.mode}).
${bbSnapshot}

## Tool Usage
Call tools with: <tool_call>{"name": "tool_name", "args": {"param": "value"}}</tool_call>
Write to blackboard: <blackboard_write>{"topic": "x", "key": "y", "value": "z", "entryType": "fact", "confidence": 0.8, "priority": 70}</blackboard_write>

Available tools:
${toolSchemaBlock}

## Rules
- Complete your task thoroughly
- Write findings to blackboard so other agents can access them
- When finished, provide your final answer without any <tool_call> blocks
${kbResult.contextBlock ? `\n${kbResult.contextBlock}` : ""}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `## Task\n${task.description}\n\nComplete this task. Use tools when needed. Write key findings to the blackboard.` },
    ];

    let finalOutput = "";
    let iteration = 0;
    const maxIter = session.config.safety.maxAgentIterations;
    let totalPrompt = 0;
    let totalCompletion = 0;

    while (iteration < maxIter) {
      iteration++;

      const iterSafety = this.checkSafetyCaps(session);
      if (!iterSafety.safe) { finalOutput = `[Safety: ${iterSafety.reason}]`; break; }

      let llmResponse = "";
      try {
        const streamResult = await withRetryAndFallback(
          async (mid) => {
            let resp = "";
            for await (const token of chatStream(messages, { modelId: mid, taskType: "general" as TaskType, maxTokens: 4096 })) {
              resp += token;
            }
            return resp;
          },
          model.id
        );
        llmResponse = streamResult.result;

        const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
        const promptTokens = Math.ceil(promptChars / 4);
        const completionTokens = Math.ceil(llmResponse.length / 4);
        totalPrompt += promptTokens;
        totalCompletion += completionTokens;
        this.addTokenUsage(session, agent, promptTokens, completionTokens);
      } catch (err: any) {
        finalOutput = `[LLM error: ${err.message}]`;
        break;
      }

      // Parse blackboard writes
      const bbWrites = this.parseBlackboardWrites(llmResponse);
      for (const bw of bbWrites) {
        this.writeBlackboard(swarmId, agentId, bw);
      }

      // Parse tool calls
      const toolCalls = this.parseToolCalls(llmResponse);

      if (toolCalls.length === 0) {
        finalOutput = llmResponse.replace(/<blackboard_write>[\s\S]*?<\/blackboard_write>/g, "").trim();
        break;
      }

      // Execute tools
      const toolResults: string[] = [];
      for (const call of toolCalls) {
        const result = await executeTool(call.name, call.args, `swarm_${agentId}`);
        toolResults.push(
          `[Tool: ${call.name}] ${result.success ? "✓" : "✗"} (${result.durationMs}ms)\n` +
          (result.error ? `Error: ${result.error}\n` : "") +
          result.output.slice(0, 15_000)
        );
      }

      messages.push({ role: "assistant", content: llmResponse });
      messages.push({ role: "user", content: `Tool results:\n\n${toolResults.join("\n\n---\n\n")}\n\nContinue. If done, provide final answer.` });
      agent.messagesProcessed += 2;
    }

    if (!finalOutput) {
      finalOutput = messages.filter(m => m.role === "assistant").pop()?.content || "[Max iterations reached]";
    }

    agent.lastActiveAt = Date.now();
    this.persistAgent(swarmId, agent);

    // Self-learning
    const outcome = (finalOutput.includes("[LLM error") || finalOutput.includes("[Safety")) ? "failure" : "success";
    logExecution({
      conversationId: swarmId,
      taskType: "general",
      taskDescription: `[swarm:${session.config.name}] ${task.description}`,
      skillsUsed: [],
      modelUsed: model.id,
      outcome,
      durationMs: Date.now() - startTime,
      retryCount: 0,
      inputTokenEstimate: totalPrompt,
      outputTokenEstimate: totalCompletion,
      toolCallCount: iteration - 1,
    });

    return finalOutput;
  }

  // ── Main Execution Loop ───────────────────────────────────────────────

  async runSwarm(swarmId: string): Promise<Map<string, string>> {
    const session = this.swarms.get(swarmId);
    if (!session) throw new Error(`Swarm ${swarmId} not found`);

    if (session.status !== "running") this.startSwarm(swarmId);

    const results = new Map<string, string>();
    const maxWallClock = session.config.safety.maxWallClockMs;
    const startTime = session.startedAt || Date.now();
    const maxConcurrent = session.config.safety.maxConcurrentAgents;
    let loopCount = 0;

    while (loopCount < 100) {
      loopCount++;

      if ((Date.now() - startTime) >= maxWallClock) {
        session.error = "Wall-clock timeout";
        this.emitEvent(swarmId, "safety_alert", { reason: "wall_clock_timeout" });
        break;
      }

      if (session.circuitBroken) { session.error = "Circuit breaker tripped"; break; }

      // Budget enforcement: at 90%, block new task claims and send wrap-up
      const budgetUsed = session.totalTokensUsed / session.config.safety.maxTotalTokens;
      const budgetExhausted = budgetUsed >= 1.0;
      const budgetWarning = budgetUsed >= session.config.safety.budgetWarningPct;

      if (budgetExhausted) {
        session.error = "Token budget exhausted";
        // Force-complete remaining agents
        for (const agent of session.agents.values()) {
          if (agent.status === "working") {
            agent.status = "completed";
            this.persistAgent(swarmId, agent);
          }
        }
        break;
      }

      const available = this.getAvailableTasks(swarmId);
      if (available.length === 0) {
        const running = Array.from(session.tasks.values()).filter(t => t.status === "running" || t.status === "claimed");
        if (running.length === 0) break;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      if (budgetWarning) {
        // Only allow 1 agent at a time when in warning zone
        const working = Array.from(session.agents.values()).filter(a => a.status === "working");
        if (working.length > 0) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
      }

      // Get idle agents (respect concurrent limit)
      const workingCount = Array.from(session.agents.values()).filter(a => a.status === "working").length;
      const slotsAvailable = maxConcurrent - workingCount;
      if (slotsAvailable <= 0) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const idleAgents = Array.from(session.agents.values()).filter(a => a.status === "idle");
      if (idleAgents.length === 0) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Role negotiation or direct assignment
      const assignments: Promise<void>[] = [];
      const tasksToAssign = available.slice(0, Math.min(slotsAvailable, idleAgents.length));

      for (const task of tasksToAssign) {
        let assignedAgent: SwarmAgentMem | undefined;

        if (session.config.enableRoleNegotiation) {
          const bid = this.negotiateTaskAssignment(swarmId, task.id);
          if (bid) assignedAgent = session.agents.get(bid.agentId);
        }

        if (!assignedAgent) {
          // Fallback: direct assignment to first idle agent
          assignedAgent = idleAgents.shift();
        }

        if (!assignedAgent) continue;
        if (!this.claimTask(swarmId, assignedAgent.id, task.id)) continue;

        assignments.push(
          this.executeAgentTask(swarmId, assignedAgent.id, task.id)
            .then(result => {
              results.set(task.id, result);
              this.completeTask(swarmId, assignedAgent!.id, task.id, result);
            })
            .catch(err => {
              results.set(task.id, `[FAILED: ${err.message}]`);
              this.failTask(swarmId, assignedAgent!.id, task.id, err.message);
            })
        );
      }

      if (assignments.length > 0) {
        await Promise.all(assignments);
      } else {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Collect all results
    for (const [taskId, task] of session.tasks) {
      if (task.result && !results.has(taskId)) results.set(taskId, task.result);
    }

    if (session.status === "running") this.stopSwarm(swarmId);
    return results;
  }

  // ── Parsing ───────────────────────────────────────────────────────────

  private parseToolCalls(text: string): Array<{ name: string; args: Record<string, string> }> {
    const calls: Array<{ name: string; args: Record<string, string> }> = [];
    const pat = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let m;
    while ((m = pat.exec(text)) !== null) {
      try { const p = JSON.parse(m[1].trim()); if (p.name && p.args) calls.push(p); } catch { /* skip */ }
    }
    return calls;
  }

  private parseBlackboardWrites(text: string): Array<{ topic: string; key: string; content: string; entryType?: BlackboardEntryType; confidence?: number; priority?: number }> {
    const writes: Array<any> = [];
    const pat = /<blackboard_write>\s*([\s\S]*?)\s*<\/blackboard_write>/g;
    let m;
    while ((m = pat.exec(text)) !== null) {
      try {
        const p = JSON.parse(m[1].trim());
        if (p.topic && p.key) {
          writes.push({
            topic: p.topic,
            key: p.key,
            content: p.value || p.content || "",
            entryType: p.entryType || "fact",
            confidence: p.confidence,
            priority: p.priority,
          });
        }
      } catch { /* skip */ }
    }
    return writes;
  }

  // ── Completion Check ─────────────────────────────────────────────────

  private checkSwarmCompletion(swarmId: string): void {
    const session = this.swarms.get(swarmId);
    if (!session || session.status !== "running") return;
    const allDone = Array.from(session.tasks.values()).every(t => t.status === "completed" || t.status === "failed");
    if (allDone) {
      session.status = "completed";
      session.completedAt = Date.now();
      this.cleanupTimers(session);
      this.logSwarmOutcome(session);
      this.emitEvent(swarmId, "swarm_completed", {});
      this.persistSession(session);
    }
  }

  // ── Self-Learning ─────────────────────────────────────────────────────

  private logSwarmOutcome(session: SwarmSession): void {
    const tasks = Array.from(session.tasks.values());
    const completed = tasks.filter(t => t.status === "completed").length;
    const failed = tasks.filter(t => t.status === "failed").length;
    const outcome = failed === 0 && completed > 0 ? "success" : failed > 0 && completed > 0 ? "partial" : "failure";

    logExecution({
      conversationId: session.config.id,
      taskType: "general",
      taskDescription: `[swarm:${session.config.name}] ${tasks.length} tasks, ${completed}✓ ${failed}✗, agents:${session.agents.size}, mode:${session.config.mode}, consensus:${session.consensusRounds.size}`,
      skillsUsed: [],
      modelUsed: session.config.defaultModelId || "swarm",
      outcome,
      durationMs: (session.completedAt || Date.now()) - (session.startedAt || Date.now()),
      retryCount: 0,
      inputTokenEstimate: session.totalTokensUsed,
      outputTokenEstimate: 0,
      toolCallCount: session.handoffs.length,
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  getStats(swarmId: string): SwarmStats | null {
    const session = this.swarms.get(swarmId);
    if (!session) return null;

    const agents = Array.from(session.agents.values());
    const tasks = Array.from(session.tasks.values());
    const completedTasks = tasks.filter(t => t.status === "completed");
    const uptime = session.startedAt ? (Date.now() - session.startedAt) / 1000 : 0;

    return {
      swarmId,
      status: session.status,
      agentCount: agents.length,
      activeAgents: agents.filter(a => a.status === "working").length,
      taskCount: tasks.length,
      completedTasks: completedTasks.length,
      failedTasks: tasks.filter(t => t.status === "failed").length,
      pendingTasks: tasks.filter(t => t.status === "pending").length,
      runningTasks: tasks.filter(t => t.status === "running").length,
      blackboardEntries: session.blackboard.size,
      handoffCount: session.handoffs.length,
      consensusRounds: session.consensusRounds.size,
      totalTokens: session.totalTokensUsed,
      totalAgentsSpawned: session.totalAgentsSpawned,
      uptime,
      throughput: uptime > 0 ? (completedTasks.length / uptime) * 60 : 0,
      circuitBroken: session.circuitBroken,
      consecutiveFailures: session.consecutiveFailures,
      budgetUsedPct: Math.round((session.totalTokensUsed / session.config.safety.maxTotalTokens) * 100),
    };
  }

  // Topology: graph of agents, tasks, and message edges
  getTopology(swarmId: string): { nodes: any[]; edges: any[] } | null {
    const session = this.swarms.get(swarmId);
    if (!session) return null;

    const nodes: any[] = [];
    const edges: any[] = [];

    for (const agent of session.agents.values()) {
      nodes.push({ id: agent.id, type: "agent", name: agent.name, role: agent.role, status: agent.status, depth: agent.spawnDepth, tokens: agent.tokenUsage.total });
    }

    for (const task of session.tasks.values()) {
      nodes.push({ id: task.id, type: "task", description: task.description.slice(0, 100), status: task.status, priority: task.priority });
      if (task.claimedBy) edges.push({ from: task.claimedBy, to: task.id, type: "claimed" });
      for (const dep of task.dependencies) edges.push({ from: dep, to: task.id, type: "dependency" });
    }

    // Parent-child edges
    for (const agent of session.agents.values()) {
      if (agent.parentAgentId) edges.push({ from: agent.parentAgentId, to: agent.id, type: "spawned" });
    }

    // Handoff edges
    for (const h of session.handoffs) {
      edges.push({ from: h.fromAgentId, to: h.toAgentId, type: "handoff" });
    }

    return { nodes, edges };
  }

  getEventLog(swarmId: string, limit = 50): SwarmEvent[] {
    return this.eventLog.filter(e => e.swarmId === swarmId).slice(-limit);
  }

  // ── SSE ────────────────────────────────────────────────────────────────

  addSSEClient(swarmId: string, client: SSEClient): void {
    const list = this.sseClients.get(swarmId) || [];
    list.push(client);
    this.sseClients.set(swarmId, list);
  }

  removeSSEClient(swarmId: string, client: SSEClient): void {
    const list = this.sseClients.get(swarmId) || [];
    this.sseClients.set(swarmId, list.filter(c => c !== client));
  }

  // ── Events ────────────────────────────────────────────────────────────

  on(swarmId: string, listener: SwarmEventListener): void {
    const list = this.listeners.get(swarmId) || [];
    list.push(listener);
    this.listeners.set(swarmId, list);
  }

  off(swarmId: string, listener: SwarmEventListener): void {
    const list = this.listeners.get(swarmId) || [];
    this.listeners.set(swarmId, list.filter(l => l !== listener));
  }

  private emitEvent(swarmId: string, type: SwarmEventType, data: Record<string, unknown>): void {
    const event: SwarmEvent = { type, swarmId, timestamp: Date.now(), data };
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLog) this.eventLog = this.eventLog.slice(-this.maxEventLog);

    for (const listener of this.listeners.get(swarmId) || []) {
      try { listener(event); } catch { /* swallow */ }
    }
    for (const client of this.sseClients.get(swarmId) || []) {
      try { client(event); } catch { /* swallow */ }
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private persistSession(session: SwarmSession): void {
    try {
      storage.upsertSwarmSession({
        id: session.config.id,
        conversationId: session.config.conversationId || null,
        name: session.config.name,
        description: session.config.description,
        config: JSON.stringify(session.config),
        status: session.status,
        mode: session.config.mode,
        totalAgentsSpawned: session.totalAgentsSpawned,
        totalTokensUsed: session.totalTokensUsed,
        consecutiveFailures: session.consecutiveFailures,
        circuitBroken: session.circuitBroken ? 1 : 0,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        error: session.error,
        createdAt: session.config.createdAt,
      });
    } catch (e) { console.error("[swarm] Session persist error:", e); }
  }

  private persistAgent(swarmId: string, agent: SwarmAgentMem): void {
    try {
      storage.upsertSwarmAgent({
        id: agent.id,
        swarmSessionId: swarmId,
        parentAgentId: agent.parentAgentId,
        name: agent.name,
        role: agent.role,
        instructions: agent.instructions,
        modelId: agent.modelId,
        tools: JSON.stringify(agent.tools),
        canHandoffTo: JSON.stringify(agent.canHandoffTo),
        canSpawn: agent.canSpawn,
        spawnDepth: agent.spawnDepth,
        status: agent.status,
        currentTaskId: agent.currentTaskId,
        tokensUsed: agent.tokenUsage.total,
        messagesProcessed: agent.messagesProcessed,
        handoffsMade: agent.handoffsMade,
        capabilityProfile: JSON.stringify(agent.capabilityProfile),
        lastActiveAt: agent.lastActiveAt,
      });
    } catch (e) { console.error("[swarm] Agent persist error:", e); }
  }

  private persistTask(swarmId: string, task: SwarmTaskMem): void {
    try {
      storage.upsertSwarmTask({
        id: task.id,
        swarmSessionId: swarmId,
        description: task.description,
        taskType: task.taskType,
        priority: task.priority,
        claimedBy: task.claimedBy,
        status: task.status,
        result: task.result,
        dependencies: JSON.stringify(task.dependencies),
        metadata: JSON.stringify(task.metadata),
        claimedAt: task.claimedAt,
        completedAt: task.completedAt,
      });
    } catch (e) { console.error("[swarm] Task persist error:", e); }
  }

  private persistConsensus(swarmId: string, round: ConsensusRoundMem): void {
    try {
      storage.upsertConsensusRound({
        id: round.id,
        swarmSessionId: swarmId,
        subject: round.subject,
        strategy: round.strategy,
        status: round.status,
        votes: JSON.stringify(round.votes),
        result: round.result ? JSON.stringify(round.result) : null,
        participantAgentIds: JSON.stringify(round.participantAgentIds),
        maxRounds: round.maxRounds,
        currentRound: round.currentRound,
        resolvedAt: round.resolvedAt,
      });
    } catch (e) { console.error("[swarm] Consensus persist error:", e); }
  }

  // ── Restore from DB ───────────────────────────────────────────────────

  restoreFromDB(): void {
    try {
      const rows = storage.getAllSwarmSessions();
      for (const row of rows) {
        try {
          const config = JSON.parse(row.config) as SwarmConfig;
          const agents = new Map<string, SwarmAgentMem>();
          const tasks = new Map<string, SwarmTaskMem>();
          const blackboard = new Map<string, BlackboardEntryMem>();
          const consensusRounds = new Map<string, ConsensusRoundMem>();

          // Restore agents from their own table
          for (const a of storage.getSwarmAgents(row.id)) {
            agents.set(a.id, {
              id: a.id,
              swarmSessionId: a.swarmSessionId,
              parentAgentId: a.parentAgentId,
              name: a.name,
              role: a.role,
              instructions: a.instructions,
              modelId: a.modelId,
              tools: JSON.parse(a.tools || "[]"),
              canHandoffTo: JSON.parse(a.canHandoffTo || "[]"),
              canSpawn: !!a.canSpawn,
              spawnDepth: a.spawnDepth || 0,
              status: a.status as AgentStatus,
              currentTaskId: a.currentTaskId,
              tokenUsage: { prompt: 0, completion: 0, total: a.tokensUsed || 0 },
              messagesProcessed: a.messagesProcessed || 0,
              handoffsMade: a.handoffsMade || 0,
              capabilityProfile: JSON.parse(a.capabilityProfile || "{}"),
              lastActiveAt: a.lastActiveAt || a.createdAt,
              createdAt: a.createdAt,
            });
          }

          // Restore tasks
          for (const t of storage.getSwarmTasks(row.id)) {
            tasks.set(t.id, {
              id: t.id,
              swarmSessionId: t.swarmSessionId,
              description: t.description,
              taskType: t.taskType || "general",
              priority: t.priority || 50,
              claimedBy: t.claimedBy,
              status: t.status as any,
              result: t.result,
              dependencies: JSON.parse(t.dependencies || "[]"),
              metadata: JSON.parse(t.metadata || "{}"),
              claimedAt: t.claimedAt,
              completedAt: t.completedAt,
              createdAt: t.createdAt,
            });
          }

          // Restore blackboard
          for (const b of storage.getBlackboardEntries(row.id)) {
            blackboard.set(`${b.topic}:${b.key}`, {
              id: b.id,
              swarmSessionId: b.swarmSessionId,
              authorAgentId: b.authorAgentId,
              entryType: b.entryType as BlackboardEntryType,
              topic: b.topic,
              key: b.key,
              content: b.content,
              confidence: b.confidence || 0.5,
              priority: b.priority || 50,
              version: b.version || 1,
              supersedesEntryId: b.supersedesEntryId,
              readByAgentIds: JSON.parse(b.readByAgentIds || "[]"),
              ttlMs: b.ttlMs,
              expiresAt: b.expiresAt,
              createdAt: b.createdAt,
              updatedAt: b.updatedAt,
            });
          }

          // Restore consensus
          for (const c of storage.getConsensusRounds(row.id)) {
            consensusRounds.set(c.id, {
              id: c.id,
              swarmSessionId: c.swarmSessionId,
              subject: c.subject,
              strategy: c.strategy as ConsensusStrategy,
              status: c.status as any,
              votes: JSON.parse(c.votes || "[]"),
              result: c.result ? JSON.parse(c.result) : null,
              participantAgentIds: JSON.parse(c.participantAgentIds || "[]"),
              maxRounds: c.maxRounds || 3,
              currentRound: c.currentRound || 0,
              createdAt: c.createdAt,
              resolvedAt: c.resolvedAt,
            });
          }

          const session: SwarmSession = {
            config,
            status: row.status as SwarmStatus,
            agents,
            tasks,
            blackboard,
            handoffs: [], // handoffs are in swarm_messages
            consensusRounds,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            error: row.error,
            totalTokensUsed: row.totalTokensUsed || 0,
            totalAgentsSpawned: row.totalAgentsSpawned || 0,
            consecutiveFailures: row.consecutiveFailures || 0,
            circuitBroken: !!row.circuitBroken,
            gcTimer: null,
            deadlockTimer: null,
          };

          this.swarms.set(config.id, session);
          console.log(`[swarm] Restored: ${config.name} (${config.id}) — ${agents.size} agents, ${tasks.size} tasks, ${blackboard.size} bb entries`);
        } catch (e) { console.error("[swarm] Restore error:", e); }
      }
    } catch (e) { console.error("[swarm] DB restore error:", e); }
  }

  // ── Serialization ────────────────────────────────────────────────────

  serializeSwarm(swarmId: string): Record<string, unknown> | null {
    const session = this.swarms.get(swarmId);
    if (!session) return null;
    return {
      config: session.config,
      status: session.status,
      agents: Array.from(session.agents.values()),
      tasks: Array.from(session.tasks.values()),
      blackboard: Array.from(session.blackboard.values()),
      handoffs: session.handoffs,
      consensusRounds: Array.from(session.consensusRounds.values()),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      error: session.error,
      totalTokensUsed: session.totalTokensUsed,
      totalAgentsSpawned: session.totalAgentsSpawned,
      consecutiveFailures: session.consecutiveFailures,
      circuitBroken: session.circuitBroken,
    };
  }

  // ── Swarm Config (defaults) ───────────────────────────────────────────

  getDefaultConfig(): { safety: SafetyCaps; [k: string]: any } {
    return {
      mode: "collaborative",
      maxTasksPerAgent: 5,
      consensusStrategy: "majority_vote",
      consensusThreshold: 0.6,
      maxConsensusRounds: 3,
      enableDynamicSpawning: true,
      enableStigmergy: true,
      enableHandoffs: true,
      enableRoleNegotiation: true,
      enableDeadlockDetection: true,
      taskClaimTimeout: 30000,
      agentIdleTimeout: 120000,
      blackboardTTLMs: null,
      safety: { ...DEFAULT_SAFETY },
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const swarmEngine = new SwarmEngine();
