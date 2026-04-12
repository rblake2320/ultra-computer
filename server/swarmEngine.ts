/**
 * SwarmEngine — Multi-Agent Swarm Intelligence Layer (Layer 2: Full Execution)
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
 * Layer 2 additions:
 *  - Safety caps: token budgets, spawn depth limits, wall-clock timeouts, circuit breaker
 *  - SQLite persistence via storage interface
 *  - Blackboard subscriptions (topic-level listeners)
 *  - SSE streaming for real-time events
 *  - Blackboard TTL/GC (time-to-live with automatic cleanup)
 *  - Messaging hub integration (swarm_internal channel type)
 *  - LLM + tool execution per swarm agent (via orchestrator's worker agent)
 *  - Self-learning integration (swarm outcomes feed back into learning loop)
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
import { logExecution } from "./selfLearning.js";
import { chat, chatStream, selectModelForTask, type ChatMessage, type TaskType } from "./modelRouter.js";
import { TOOL_SCHEMAS, executeTool, type ToolResult } from "./tools.js";
import { withRetryAndFallback } from "./errorRecovery.js";
import { knowledgeEngine } from "./knowledgeEngine.js";
import { storage } from "./storage.js";

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
  spawnDepth: number;                  // how many levels deep this agent was spawned (0 = original)
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
  ttl: number | null;                  // time-to-live in ms (null = never expires)
  expiresAt: number | null;            // computed expiry timestamp
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

export interface SafetyCaps {
  maxTotalTokens: number;             // total tokens across all agents before circuit breaks
  maxSpawnDepth: number;              // maximum dynamic spawn nesting depth
  maxWallClockMs: number;            // wall-clock timeout for entire swarm execution
  maxAgentIterations: number;        // max tool-call iterations per agent per task
  circuitBreakerThreshold: number;   // consecutive failures before breaker trips
  deadlockDetectionMs: number;       // interval to check for stuck agents
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
  safety: SafetyCaps;
  blackboardTTLMs: number | null;     // default TTL for blackboard entries (null = forever)
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
  // Safety tracking
  totalTokensUsed: number;
  consecutiveFailures: number;
  circuitBroken: boolean;
  gcTimer: ReturnType<typeof setInterval> | null;
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
  circuitBroken: boolean;
  consecutiveFailures: number;
}

// ─── Event System ───────────────────────────────────────────────────────────

export type SwarmEventType =
  | "agent_joined" | "agent_left" | "agent_status_changed"
  | "task_created" | "task_claimed" | "task_completed" | "task_failed"
  | "blackboard_write" | "blackboard_update" | "blackboard_expired"
  | "handoff_initiated" | "handoff_completed"
  | "consensus_started" | "consensus_vote" | "consensus_resolved"
  | "agent_spawned" | "swarm_started" | "swarm_completed" | "swarm_error"
  | "safety_warning" | "circuit_broken" | "agent_executing";

export interface SwarmEvent {
  type: SwarmEventType;
  swarmId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

type SwarmEventListener = (event: SwarmEvent) => void;

// Blackboard subscription callback
type BlackboardSubscriber = (entry: BlackboardEntry, eventType: "write" | "update" | "expired") => void;

// SSE client callback
type SSEClient = (event: SwarmEvent) => void;

const DEFAULT_SAFETY: SafetyCaps = {
  maxTotalTokens: 500_000,
  maxSpawnDepth: 3,
  maxWallClockMs: 10 * 60 * 1000,    // 10 minutes
  maxAgentIterations: 10,
  circuitBreakerThreshold: 5,
  deadlockDetectionMs: 30_000,
};

// ─── SwarmEngine ────────────────────────────────────────────────────────────

class SwarmEngine {
  private swarms: Map<string, Swarm> = new Map();
  private listeners: Map<string, SwarmEventListener[]> = new Map();
  private sseClients: Map<string, SSEClient[]> = new Map();
  private blackboardSubscribers: Map<string, BlackboardSubscriber[]> = new Map(); // key: swarmId:topic
  private eventLog: SwarmEvent[] = [];
  private maxEventLog = 2000;

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
      safety: { ...DEFAULT_SAFETY, ...(config.safety || {}) },
      blackboardTTLMs: config.blackboardTTLMs ?? null,
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
      totalTokensUsed: 0,
      consecutiveFailures: 0,
      circuitBroken: false,
      gcTimer: null,
    };

    this.swarms.set(id, swarm);

    // Persist to SQLite
    this.persistSwarm(swarm);

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
    if (swarm.gcTimer) clearInterval(swarm.gcTimer);
    this.swarms.delete(id);
    this.listeners.delete(id);
    this.sseClients.delete(id);
    // Clean up blackboard subscriptions
    for (const key of this.blackboardSubscribers.keys()) {
      if (key.startsWith(`${id}:`)) this.blackboardSubscribers.delete(key);
    }
    // Persist deletion
    this.deletePersistedSwarm(id);
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
    swarm.circuitBroken = false;
    swarm.consecutiveFailures = 0;

    // Start blackboard GC timer
    if (swarm.config.blackboardTTLMs) {
      swarm.gcTimer = setInterval(() => this.runBlackboardGC(id), 15_000);
      if (swarm.gcTimer.unref) swarm.gcTimer.unref();
    }

    this.emit(id, { type: "swarm_started", swarmId: id, timestamp: Date.now(), data: {} });
    this.persistSwarm(swarm);
    return swarm;
  }

  stopSwarm(id: string): Swarm {
    const swarm = this.swarms.get(id);
    if (!swarm) throw new Error(`Swarm ${id} not found`);

    swarm.status = "completed";
    swarm.completedAt = Date.now();

    // Stop GC timer
    if (swarm.gcTimer) {
      clearInterval(swarm.gcTimer);
      swarm.gcTimer = null;
    }

    // Mark all active agents as idle
    for (const agent of swarm.agents.values()) {
      if (agent.status === "working" || agent.status === "waiting") {
        agent.status = "idle";
      }
    }

    // Log to self-learning
    this.logSwarmOutcome(swarm);

    this.emit(id, { type: "swarm_completed", swarmId: id, timestamp: Date.now(), data: {} });
    this.persistSwarm(swarm);
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
    spawnDepth?: number;
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
      spawnDepth: agentDef.spawnDepth ?? 0,
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
      if (task && (task.status === "claimed" || task.status === "running")) {
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

    // Safety: check spawn depth
    if (requestor.spawnDepth >= swarm.config.safety.maxSpawnDepth) {
      this.emit(swarmId, {
        type: "safety_warning",
        swarmId,
        timestamp: Date.now(),
        data: { reason: "max_spawn_depth", agentId: requestingAgentId, depth: requestor.spawnDepth },
      });
      return null;
    }

    const agent = this.addAgent(swarmId, {
      ...agentDef,
      spawnDepth: requestor.spawnDepth + 1,
    });

    this.emit(swarmId, {
      type: "agent_spawned",
      swarmId,
      timestamp: Date.now(),
      data: { spawnedBy: requestingAgentId, agentId: agent.id, role: agent.role, depth: agent.spawnDepth },
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

    // Reset consecutive failures on success
    swarm.consecutiveFailures = 0;

    this.emit(swarmId, {
      type: "task_completed",
      swarmId,
      timestamp: Date.now(),
      data: { taskId, agentId, resultPreview: result.slice(0, 200) },
    });

    // Check if all tasks are done
    this.checkSwarmCompletion(swarmId);

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

    // Track consecutive failures for circuit breaker
    swarm.consecutiveFailures++;
    if (swarm.consecutiveFailures >= swarm.config.safety.circuitBreakerThreshold) {
      swarm.circuitBroken = true;
      this.emit(swarmId, {
        type: "circuit_broken",
        swarmId,
        timestamp: Date.now(),
        data: { consecutiveFailures: swarm.consecutiveFailures, threshold: swarm.config.safety.circuitBreakerThreshold },
      });
    }

    this.emit(swarmId, {
      type: "task_failed",
      swarmId,
      timestamp: Date.now(),
      data: { taskId, agentId, error },
    });

    this.checkSwarmCompletion(swarmId);
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

  writeBlackboard(swarmId: string, agentId: string, topic: string, key: string, value: string, priority = 50, ttlMs?: number): BlackboardEntry {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    const existingKey = `${topic}:${key}`;
    const existing = swarm.blackboard.get(existingKey);

    const effectiveTTL = ttlMs ?? swarm.config.blackboardTTLMs ?? null;
    const now = Date.now();

    const entry: BlackboardEntry = {
      id: existing?.id || randomUUID(),
      topic,
      key,
      value,
      author: agentId,
      priority: existing ? Math.max(existing.priority, priority) : priority,
      version: existing ? existing.version + 1 : 1,
      ttl: effectiveTTL,
      expiresAt: effectiveTTL ? now + effectiveTTL : null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    swarm.blackboard.set(existingKey, entry);

    const eventType = existing ? "blackboard_update" : "blackboard_write";
    this.emit(swarmId, {
      type: eventType,
      swarmId,
      timestamp: now,
      data: { topic, key, author: agentId, priority, version: entry.version },
    });

    // Notify blackboard subscribers
    this.notifyBlackboardSubscribers(swarmId, topic, entry, existing ? "update" : "write");

    return entry;
  }

  readBlackboard(swarmId: string, topic?: string): BlackboardEntry[] {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return [];

    const now = Date.now();
    const entries = Array.from(swarm.blackboard.values())
      .filter(e => !e.expiresAt || e.expiresAt > now); // filter expired

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

  // Blackboard subscriptions — subscribe to topic changes
  subscribeToBlackboard(swarmId: string, topic: string, callback: BlackboardSubscriber): void {
    const key = `${swarmId}:${topic}`;
    const list = this.blackboardSubscribers.get(key) || [];
    list.push(callback);
    this.blackboardSubscribers.set(key, list);
  }

  unsubscribeFromBlackboard(swarmId: string, topic: string, callback: BlackboardSubscriber): void {
    const key = `${swarmId}:${topic}`;
    const list = this.blackboardSubscribers.get(key) || [];
    this.blackboardSubscribers.set(key, list.filter(cb => cb !== callback));
  }

  private notifyBlackboardSubscribers(swarmId: string, topic: string, entry: BlackboardEntry, eventType: "write" | "update" | "expired"): void {
    // Topic-specific subscribers
    const topicKey = `${swarmId}:${topic}`;
    for (const cb of this.blackboardSubscribers.get(topicKey) || []) {
      try { cb(entry, eventType); } catch { /* swallow */ }
    }
    // Wildcard subscribers (subscribed to "*")
    const wildcardKey = `${swarmId}:*`;
    for (const cb of this.blackboardSubscribers.get(wildcardKey) || []) {
      try { cb(entry, eventType); } catch { /* swallow */ }
    }
  }

  // Blackboard TTL / GC — remove expired entries
  private runBlackboardGC(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const now = Date.now();
    const expired: string[] = [];

    for (const [compositeKey, entry] of swarm.blackboard.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        expired.push(compositeKey);
        this.notifyBlackboardSubscribers(swarmId, entry.topic, entry, "expired");
        this.emit(swarmId, {
          type: "blackboard_expired",
          swarmId,
          timestamp: now,
          data: { topic: entry.topic, key: entry.key, author: entry.author },
        });
      }
    }

    for (const key of expired) {
      swarm.blackboard.delete(key);
    }

    if (expired.length > 0) {
      console.log(`[swarm] GC cleaned ${expired.length} expired blackboard entries from swarm ${swarmId}`);
    }
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
          round.result = best;
          round.confidence = agreement;
          round.status = "deadlocked";
          round.resolvedAt = Date.now();
        } else {
          round.status = "debating";
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
        if (round.rounds >= round.maxRounds) {
          const weighted = new Map<string, number>();
          for (const v of round.votes) {
            const roundWeight = 1 + (v.round * 0.5);
            weighted.set(v.answer, (weighted.get(v.answer) || 0) + v.confidence * roundWeight);
          }
          let best = ""; let bestWeight = 0;
          for (const [a, w] of weighted) { if (w > bestWeight) { best = a; bestWeight = w; } }
          round.result = best;
          round.confidence = bestWeight / (round.votes.length * 1.5);
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

  // ── Safety Caps ────────────────────────────────────────────────────────

  private checkSafetyCaps(swarm: Swarm): { safe: boolean; reason?: string } {
    const safety = swarm.config.safety;

    // Token budget
    if (swarm.totalTokensUsed >= safety.maxTotalTokens) {
      return { safe: false, reason: `Token budget exhausted: ${swarm.totalTokensUsed}/${safety.maxTotalTokens}` };
    }

    // Wall-clock timeout
    if (swarm.startedAt && (Date.now() - swarm.startedAt) >= safety.maxWallClockMs) {
      return { safe: false, reason: `Wall-clock timeout: ${Math.round((Date.now() - swarm.startedAt) / 1000)}s / ${Math.round(safety.maxWallClockMs / 1000)}s` };
    }

    // Circuit breaker
    if (swarm.circuitBroken) {
      return { safe: false, reason: `Circuit broken: ${swarm.consecutiveFailures} consecutive failures` };
    }

    return { safe: true };
  }

  private addTokenUsage(swarm: Swarm, agent: SwarmAgent, prompt: number, completion: number): void {
    agent.tokenUsage.prompt += prompt;
    agent.tokenUsage.completion += completion;
    agent.tokenUsage.total += prompt + completion;
    swarm.totalTokensUsed += prompt + completion;
  }

  // ── Agent Execution (LLM + Tools) ──────────────────────────────────────

  /**
   * Execute a swarm agent's task using real LLM + tool calls.
   * This is the heart of Layer 2 — each agent gets its own LLM session
   * with tool access, knowledge base context, and blackboard awareness.
   */
  async executeAgentTask(swarmId: string, agentId: string, taskId: string): Promise<string> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    // Safety check
    const safetyCheck = this.checkSafetyCaps(swarm);
    if (!safetyCheck.safe) {
      this.emit(swarmId, {
        type: "safety_warning",
        swarmId,
        timestamp: Date.now(),
        data: { reason: safetyCheck.reason, agentId, taskId },
      });
      throw new Error(`Safety cap reached: ${safetyCheck.reason}`);
    }

    const agent = swarm.agents.get(agentId);
    const task = swarm.tasks.get(taskId);
    if (!agent || !task) throw new Error("Agent or task not found");

    // Mark task as running
    task.status = "running";
    agent.status = "working";
    agent.lastActiveAt = Date.now();

    this.emit(swarmId, {
      type: "agent_executing",
      swarmId,
      timestamp: Date.now(),
      data: { agentId, taskId, agentName: agent.name, taskDescription: task.description.slice(0, 200) },
    });

    const startTime = Date.now();

    // Resolve model
    const modelId = agent.modelId || swarm.config.defaultModelId;
    const model = modelId ? storage.getModel(modelId) : selectModelForTask("general");
    if (!model) throw new Error("No model available for agent");

    // Build knowledge context
    const speedTier = (model.speedTier || "medium") as "fast" | "medium" | "powerful";
    const contextWindow = model.contextWindow || 8192;
    const kbResult = knowledgeEngine.buildContext(speedTier, contextWindow, task.description);

    // Build blackboard context — read relevant entries for the agent
    const bbEntries = this.readBlackboard(swarmId);
    const bbContext = bbEntries.length > 0
      ? `\n## Shared Blackboard State\n${bbEntries.slice(0, 20).map(e => `[${e.topic}/${e.key}] (priority:${e.priority}) → ${e.value.slice(0, 500)}`).join("\n")}\n`
      : "";

    // Build available tools (filtered by agent's tool list)
    const agentTools = agent.tools.length > 0
      ? TOOL_SCHEMAS.filter(t => agent.tools.includes(t.name))
      : TOOL_SCHEMAS;

    const toolList = agentTools.map(t => `- **${t.name}**: ${t.description}`).join("\n");
    const toolSchemaBlock = agentTools.map(t =>
      `${t.name}: parameters = ${JSON.stringify(t.parameters.properties)}, required = [${t.parameters.required.join(", ")}]`
    ).join("\n");

    const systemPrompt = `You are a swarm agent named "${agent.name}" with role: ${agent.role}
Your specific instructions: ${agent.instructions}

## Swarm Context
You are part of a multi-agent swarm. Other agents may be working on related tasks.
You can communicate findings by writing to the blackboard (include <blackboard_write> tags in your response).
${bbContext}
## Available Tools
${toolList}

## How to Call Tools
<tool_call>
{"name": "tool_name", "args": {"param1": "value1"}}
</tool_call>

## How to Write to Blackboard
<blackboard_write>
{"topic": "findings", "key": "my_result", "value": "what I discovered", "priority": 70}
</blackboard_write>

## Tool Schemas
${toolSchemaBlock}

## Rules
- Complete your assigned task fully and thoroughly
- Write important findings to the blackboard so other agents can see them
- When finished, provide your final answer WITHOUT any <tool_call> blocks
${kbResult.contextBlock ? `\n${kbResult.contextBlock}` : ""}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `## Your Task\n${task.description}\n\nComplete this task. Use tools when they would produce a better result. Write key findings to the blackboard.` },
    ];

    let finalOutput = "";
    let iteration = 0;
    const maxIter = swarm.config.safety.maxAgentIterations;
    let totalPrompt = 0;
    let totalCompletion = 0;

    while (iteration < maxIter) {
      iteration++;

      // Safety re-check each iteration
      const iterSafety = this.checkSafetyCaps(swarm);
      if (!iterSafety.safe) {
        finalOutput = `[Safety cap reached: ${iterSafety.reason}]`;
        break;
      }

      let llmResponse = "";
      try {
        const streamResult = await withRetryAndFallback(
          async (mid) => {
            let resp = "";
            for await (const token of chatStream(messages, {
              modelId: mid,
              taskType: "general" as TaskType,
              maxTokens: 4096,
            })) {
              resp += token;
            }
            return resp;
          },
          model.id
        );
        llmResponse = streamResult.result;

        // Track tokens
        const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
        const promptTokens = Math.ceil(promptChars / 4);
        const completionTokens = Math.ceil(llmResponse.length / 4);
        totalPrompt += promptTokens;
        totalCompletion += completionTokens;
        this.addTokenUsage(swarm, agent, promptTokens, completionTokens);
      } catch (err: any) {
        finalOutput = `[LLM call failed: ${err.message}]`;
        break;
      }

      // Parse blackboard writes
      const bbWrites = this.parseBlackboardWrites(llmResponse);
      for (const bw of bbWrites) {
        this.writeBlackboard(swarmId, agentId, bw.topic, bw.key, bw.value, bw.priority ?? 50);
      }

      // Parse tool calls
      const toolCalls = this.parseToolCalls(llmResponse);

      if (toolCalls.length === 0) {
        // No tool calls — this is the final answer
        // Strip blackboard write tags from output
        finalOutput = llmResponse.replace(/<blackboard_write>[\s\S]*?<\/blackboard_write>/g, "").trim();
        break;
      }

      // Execute tools
      const toolResults: string[] = [];
      for (const call of toolCalls) {
        const result = await executeTool(call.name, call.args, `swarm_${agentId}`);
        const statusIcon = result.success ? "✓" : "✗";
        toolResults.push(
          `[Tool: ${call.name}] ${statusIcon} (${result.durationMs}ms)\n` +
          (result.error ? `Error: ${result.error}\n` : "") +
          result.output.slice(0, 15_000)
        );
      }

      messages.push({ role: "assistant", content: llmResponse });
      messages.push({
        role: "user",
        content: `Tool results:\n\n${toolResults.join("\n\n---\n\n")}\n\nContinue working. If done, provide your final answer.`,
      });

      agent.messagesProcessed += 2;
    }

    if (!finalOutput) {
      finalOutput = messages.filter(m => m.role === "assistant").pop()?.content || "[Agent reached max iterations]";
    }

    agent.lastActiveAt = Date.now();

    // Log to self-learning
    const outcome = (finalOutput.includes("[FAILED:") || finalOutput.includes("[LLM call failed") || finalOutput.includes("[Safety cap"))
      ? "failure" : "success";

    logExecution({
      conversationId: swarmId,
      taskType: "general",
      taskDescription: `[swarm:${swarm.config.name}] ${task.description}`,
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

  /**
   * Run the entire swarm — auto-assign tasks to agents and execute them.
   * This is the main entry point called from the orchestrator's swarm mode.
   */
  async runSwarm(swarmId: string): Promise<Map<string, string>> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    if (swarm.status !== "running") {
      this.startSwarm(swarmId);
    }

    const results = new Map<string, string>();
    const maxWallClock = swarm.config.safety.maxWallClockMs;
    const startTime = swarm.startedAt || Date.now();

    // Main execution loop — keep going until all tasks done or safety cap hit
    let loopCount = 0;
    const maxLoops = 100; // prevent infinite loops

    while (loopCount < maxLoops) {
      loopCount++;

      // Wall-clock check
      if ((Date.now() - startTime) >= maxWallClock) {
        swarm.error = "Wall-clock timeout exceeded";
        this.emit(swarmId, { type: "safety_warning", swarmId, timestamp: Date.now(), data: { reason: "wall_clock_timeout" } });
        break;
      }

      // Circuit breaker check
      if (swarm.circuitBroken) {
        swarm.error = "Circuit breaker tripped";
        break;
      }

      // Get available tasks
      const available = this.getAvailableTasks(swarmId);
      if (available.length === 0) {
        // Check if any tasks are still running
        const running = Array.from(swarm.tasks.values()).filter(t => t.status === "running" || t.status === "claimed");
        if (running.length === 0) break; // all done
        await new Promise(r => setTimeout(r, 500)); // wait for running tasks
        continue;
      }

      // Get idle agents
      const idleAgents = Array.from(swarm.agents.values()).filter(a => a.status === "idle");
      if (idleAgents.length === 0) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Assign tasks to agents in parallel
      const assignments: Promise<void>[] = [];
      for (let i = 0; i < Math.min(available.length, idleAgents.length); i++) {
        const task = available[i];
        const agent = idleAgents[i];

        if (!this.claimTask(swarmId, agent.id, task.id)) continue;

        assignments.push(
          this.executeAgentTask(swarmId, agent.id, task.id)
            .then(result => {
              results.set(task.id, result);
              this.completeTask(swarmId, agent.id, task.id, result);
            })
            .catch(err => {
              results.set(task.id, `[FAILED: ${err.message}]`);
              this.failTask(swarmId, agent.id, task.id, err.message);
            })
        );
      }

      // Wait for at least one assignment to finish
      if (assignments.length > 0) {
        await Promise.all(assignments);
      } else {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Collect all results
    for (const [taskId, task] of swarm.tasks) {
      if (task.result && !results.has(taskId)) {
        results.set(taskId, task.result);
      }
    }

    // Stop the swarm if it's still running
    if (swarm.status === "running") {
      this.stopSwarm(swarmId);
    }

    return results;
  }

  // ── Tool call / blackboard write parsing ───────────────────────────────

  private parseToolCalls(text: string): Array<{ name: string; args: Record<string, string> }> {
    const calls: Array<{ name: string; args: Record<string, string> }> = [];
    const xmlPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match;
    while ((match = xmlPattern.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name && parsed.args) {
          calls.push({ name: parsed.name, args: parsed.args });
        }
      } catch { /* skip malformed */ }
    }
    return calls;
  }

  private parseBlackboardWrites(text: string): Array<{ topic: string; key: string; value: string; priority?: number }> {
    const writes: Array<{ topic: string; key: string; value: string; priority?: number }> = [];
    const pattern = /<blackboard_write>\s*([\s\S]*?)\s*<\/blackboard_write>/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.topic && parsed.key && parsed.value) {
          writes.push(parsed);
        }
      } catch { /* skip malformed */ }
    }
    return writes;
  }

  // ── Swarm completion check ─────────────────────────────────────────────

  private checkSwarmCompletion(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm || swarm.status !== "running") return;

    const allDone = Array.from(swarm.tasks.values()).every(
      t => t.status === "completed" || t.status === "failed"
    );
    if (allDone) {
      swarm.status = "completed";
      swarm.completedAt = Date.now();
      if (swarm.gcTimer) { clearInterval(swarm.gcTimer); swarm.gcTimer = null; }
      this.logSwarmOutcome(swarm);
      this.emit(swarmId, { type: "swarm_completed", swarmId, timestamp: Date.now(), data: {} });
      this.persistSwarm(swarm);
    }
  }

  // ── Self-Learning Integration ──────────────────────────────────────────

  private logSwarmOutcome(swarm: Swarm): void {
    const tasks = Array.from(swarm.tasks.values());
    const completed = tasks.filter(t => t.status === "completed").length;
    const failed = tasks.filter(t => t.status === "failed").length;
    const total = tasks.length;

    const outcome = failed === 0 && completed > 0 ? "success"
      : failed > 0 && completed > 0 ? "partial"
      : "failure";

    logExecution({
      conversationId: swarm.config.id,
      taskType: "general",
      taskDescription: `[swarm:${swarm.config.name}] ${total} tasks, ${completed} completed, ${failed} failed, mode=${swarm.config.mode}`,
      skillsUsed: [],
      modelUsed: swarm.config.defaultModelId || "swarm",
      outcome,
      durationMs: (swarm.completedAt || Date.now()) - (swarm.startedAt || Date.now()),
      retryCount: 0,
      inputTokenEstimate: swarm.totalTokensUsed,
      outputTokenEstimate: 0,
      toolCallCount: swarm.handoffs.length,
    });
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
      totalTokens: swarm.totalTokensUsed,
      uptime,
      throughput: uptime > 0 ? (completedTasks.length / uptime) * 60 : 0,
      circuitBroken: swarm.circuitBroken,
      consecutiveFailures: swarm.consecutiveFailures,
    };
  }

  getEventLog(swarmId: string, limit = 50): SwarmEvent[] {
    return this.eventLog
      .filter(e => e.swarmId === swarmId)
      .slice(-limit);
  }

  // ── SSE Streaming ──────────────────────────────────────────────────────

  addSSEClient(swarmId: string, client: SSEClient): void {
    const list = this.sseClients.get(swarmId) || [];
    list.push(client);
    this.sseClients.set(swarmId, list);
  }

  removeSSEClient(swarmId: string, client: SSEClient): void {
    const list = this.sseClients.get(swarmId) || [];
    this.sseClients.set(swarmId, list.filter(c => c !== client));
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

    // Notify regular listeners
    const list = this.listeners.get(swarmId) || [];
    for (const listener of list) {
      try { listener(event); } catch { /* swallow listener errors */ }
    }

    // Push to SSE clients
    const sseList = this.sseClients.get(swarmId) || [];
    for (const client of sseList) {
      try { client(event); } catch { /* swallow */ }
    }
  }

  // ── SQLite Persistence ─────────────────────────────────────────────────

  private persistSwarm(swarm: Swarm): void {
    try {
      storage.upsertSwarm({
        id: swarm.config.id,
        name: swarm.config.name,
        description: swarm.config.description,
        config: JSON.stringify(swarm.config),
        status: swarm.status,
        totalTokensUsed: swarm.totalTokensUsed,
        consecutiveFailures: swarm.consecutiveFailures,
        circuitBroken: swarm.circuitBroken ? 1 : 0,
        agentsJson: JSON.stringify(Array.from(swarm.agents.values())),
        tasksJson: JSON.stringify(Array.from(swarm.tasks.values())),
        blackboardJson: JSON.stringify(Array.from(swarm.blackboard.values())),
        handoffsJson: JSON.stringify(swarm.handoffs),
        consensusJson: JSON.stringify(Array.from(swarm.consensusRounds.values())),
        startedAt: swarm.startedAt,
        completedAt: swarm.completedAt,
        error: swarm.error,
        createdAt: swarm.config.createdAt,
      });
    } catch (err) {
      console.error("[swarm] Persistence error:", err);
    }
  }

  private deletePersistedSwarm(id: string): void {
    try {
      storage.deleteSwarmRecord(id);
    } catch (err) {
      console.error("[swarm] Delete persistence error:", err);
    }
  }

  /**
   * Restore all swarms from SQLite on startup.
   */
  restoreFromDB(): void {
    try {
      const rows = storage.getAllSwarms();
      for (const row of rows) {
        try {
          const config = JSON.parse(row.config) as SwarmConfig;
          const agents = new Map<string, SwarmAgent>();
          const tasks = new Map<string, SwarmTask>();
          const blackboard = new Map<string, BlackboardEntry>();
          const consensusRounds = new Map<string, ConsensusRound>();

          for (const a of JSON.parse(row.agentsJson || "[]") as SwarmAgent[]) {
            agents.set(a.id, a);
          }
          for (const t of JSON.parse(row.tasksJson || "[]") as SwarmTask[]) {
            tasks.set(t.id, t);
          }
          for (const b of JSON.parse(row.blackboardJson || "[]") as BlackboardEntry[]) {
            blackboard.set(`${b.topic}:${b.key}`, b);
          }
          for (const c of JSON.parse(row.consensusJson || "[]") as ConsensusRound[]) {
            consensusRounds.set(c.id, c);
          }

          const swarm: Swarm = {
            config,
            status: row.status as SwarmStatus,
            agents,
            tasks,
            blackboard,
            handoffs: JSON.parse(row.handoffsJson || "[]"),
            consensusRounds,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            error: row.error,
            totalTokensUsed: row.totalTokensUsed || 0,
            consecutiveFailures: row.consecutiveFailures || 0,
            circuitBroken: !!row.circuitBroken,
            gcTimer: null,
          };

          this.swarms.set(config.id, swarm);
          console.log(`[swarm] Restored swarm: ${config.name} (${config.id})`);
        } catch (err) {
          console.error("[swarm] Failed to restore swarm:", err);
        }
      }
    } catch (err) {
      console.error("[swarm] DB restore error:", err);
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
      totalTokensUsed: swarm.totalTokensUsed,
      consecutiveFailures: swarm.consecutiveFailures,
      circuitBroken: swarm.circuitBroken,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const swarmEngine = new SwarmEngine();
