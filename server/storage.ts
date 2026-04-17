import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  models, conversations, messages, tasks, agentRuns, skills, connectors, memory, settings,
  skillScripts, skillScriptVersions,
  marketplaceSkills, marketplaceVersions, marketplaceRatings, marketplaceInstalls,
  type Model, type InsertModel,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type Task, type InsertTask,
  type AgentRun, type InsertAgentRun,
  type Skill, type InsertSkill,
  type Connector, type InsertConnector,
  type Memory, type InsertMemory,
  type SkillScript, type InsertSkillScript,
  type SkillScriptVersion, type InsertSkillScriptVersion,
  type MarketplaceSkill, type InsertMarketplaceSkill,
  type MarketplaceVersion, type InsertMarketplaceVersion,
  type MarketplaceRating, type InsertMarketplaceRating,
  type MarketplaceInstall, type InsertMarketplaceInstall,
  knowledgeBase, type KnowledgeEntry, type InsertKnowledgeEntry,
  swarmSessions, type SwarmSession, type InsertSwarmSession,
  swarmAgents, type SwarmAgent as SwarmAgentRow, type InsertSwarmAgent,
  blackboardEntries, type BlackboardEntry as BlackboardEntryRow, type InsertBlackboardEntry,
  consensusRounds, type ConsensusRound as ConsensusRoundRow, type InsertConsensusRound,
  swarmMessages, type SwarmMessage, type InsertSwarmMessage,
  swarmTasks, type SwarmTask as SwarmTaskRow, type InsertSwarmTask,
} from "@shared/schema";

const sqlite = new Database("ultra_computer.db");
export const db = drizzle(sqlite);

// Enable WAL mode for better concurrency and durability
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    base_url TEXT,
    api_key TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    capabilities TEXT NOT NULL DEFAULT '[]',
    context_window INTEGER NOT NULL DEFAULT 8192,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_orchestrator INTEGER NOT NULL DEFAULT 0,
    speed_tier TEXT NOT NULL DEFAULT 'medium',
    notes TEXT,
    auth_method TEXT NOT NULL DEFAULT 'api_key',
    oauth_tokens TEXT,
    env_var_name TEXT,
    connection_status TEXT NOT NULL DEFAULT 'unconfigured',
    connection_error TEXT,
    last_tested_at INTEGER,
    last_test_latency INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    trigger_keywords TEXT NOT NULL DEFAULT '[]',
    embeddings TEXT,
    is_built_in INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    logo_url TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    config TEXT NOT NULL DEFAULT '{}',
    mcp_server_url TEXT,
    scopes TEXT NOT NULL DEFAULT '[]',
    last_synced INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memory (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    summary TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    importance REAL NOT NULL DEFAULT 0.5,
    embeddings TEXT,
    session_id TEXT,
    source_message_id TEXT,
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Session',
    status TEXT NOT NULL DEFAULT 'idle',
    orchestrator_model_id TEXT,
    active_skill_ids TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_id TEXT,
    agent_id TEXT,
    task_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    parent_task_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'pending',
    depends_on TEXT NOT NULL DEFAULT '[]',
    assigned_model_id TEXT,
    result TEXT,
    result_path TEXT,
    error TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    model_id TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    input_context TEXT NOT NULL,
    output TEXT,
    tool_calls TEXT NOT NULL DEFAULT '[]',
    ipc_path TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    token_usage TEXT NOT NULL DEFAULT '{}',
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS skill_scripts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'bash',
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    source_conversation_id TEXT,
    source_tool_call_id TEXT,
    file_path TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skill_script_versions (
    id TEXT PRIMARY KEY,
    script_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    change_note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (script_id) REFERENCES skill_scripts(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS marketplace_skills (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    long_description TEXT NOT NULL DEFAULT '',
    author_name TEXT NOT NULL,
    author_email TEXT,
    author_avatar_url TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    tags TEXT NOT NULL DEFAULT '[]',
    license TEXT NOT NULL DEFAULT 'MIT',
    repo_url TEXT,
    current_version TEXT NOT NULL DEFAULT '1.0.0',
    visibility TEXT NOT NULL DEFAULT 'public',
    install_count INTEGER NOT NULL DEFAULT 0,
    rating_sum INTEGER NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    forked_from_id TEXT,
    fork_count INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0,
    quality_score REAL NOT NULL DEFAULT 0,
    install_velocity REAL NOT NULL DEFAULT 0,
    rating_bayesian REAL NOT NULL DEFAULT 0,
    rating_variance REAL NOT NULL DEFAULT 0,
    fork_depth INTEGER NOT NULL DEFAULT 0,
    version_frequency REAL NOT NULL DEFAULT 0,
    content_richness REAL NOT NULL DEFAULT 0,
    score_tier TEXT NOT NULL DEFAULT 'unranked',
    last_scored_at INTEGER,
    published_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS marketplace_versions (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    changelog TEXT NOT NULL DEFAULT '',
    skill_type TEXT NOT NULL DEFAULT 'instruction',
    language TEXT,
    trigger_keywords TEXT NOT NULL DEFAULT '[]',
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (skill_id) REFERENCES marketplace_skills(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS marketplace_ratings (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    review TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (skill_id) REFERENCES marketplace_skills(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS marketplace_installs (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    local_skill_id TEXT,
    local_type TEXT NOT NULL DEFAULT 'instruction',
    installed_version TEXT NOT NULL,
    auto_update INTEGER NOT NULL DEFAULT 0,
    installed_at INTEGER NOT NULL,
    FOREIGN KEY (skill_id) REFERENCES marketplace_skills(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS knowledge_base (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    summary TEXT,
    content_type TEXT NOT NULL DEFAULT 'text',
    category TEXT,
    tags TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    token_estimate INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 50,
    tier_policy TEXT NOT NULL DEFAULT 'auto',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- NOTE: Removed destructive DROP TABLE IF EXISTS swarms (was destroying data on every startup)
  -- Migration: The old 'swarms' table has been replaced by 'swarm_sessions'.
  -- If upgrading from an older version, manually run: DROP TABLE IF EXISTS swarms;

  CREATE TABLE IF NOT EXISTS swarm_sessions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    mode TEXT NOT NULL DEFAULT 'collaborative',
    total_agents_spawned INTEGER NOT NULL DEFAULT 0,
    total_tokens_used INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    circuit_broken INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS swarm_agents (
    id TEXT PRIMARY KEY,
    swarm_session_id TEXT NOT NULL,
    parent_agent_id TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    instructions TEXT NOT NULL,
    model_id TEXT,
    tools TEXT NOT NULL DEFAULT '[]',
    can_handoff_to TEXT NOT NULL DEFAULT '[]',
    can_spawn INTEGER NOT NULL DEFAULT 0,
    spawn_depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'idle',
    current_task_id TEXT,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    messages_processed INTEGER NOT NULL DEFAULT 0,
    handoffs_made INTEGER NOT NULL DEFAULT 0,
    capability_profile TEXT NOT NULL DEFAULT '{}',
    last_active_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (swarm_session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS blackboard_entries (
    id TEXT PRIMARY KEY,
    swarm_session_id TEXT NOT NULL,
    author_agent_id TEXT NOT NULL,
    entry_type TEXT NOT NULL DEFAULT 'fact',
    topic TEXT NOT NULL,
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    priority INTEGER NOT NULL DEFAULT 50,
    version INTEGER NOT NULL DEFAULT 1,
    supersedes_entry_id TEXT,
    read_by_agent_ids TEXT NOT NULL DEFAULT '[]',
    ttl_ms INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (swarm_session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS consensus_rounds (
    id TEXT PRIMARY KEY,
    swarm_session_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT 'majority_vote',
    status TEXT NOT NULL DEFAULT 'open',
    votes TEXT NOT NULL DEFAULT '[]',
    result TEXT,
    participant_agent_ids TEXT NOT NULL DEFAULT '[]',
    max_rounds INTEGER NOT NULL DEFAULT 3,
    current_round INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    FOREIGN KEY (swarm_session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS swarm_messages (
    id TEXT PRIMARY KEY,
    swarm_session_id TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT,
    message_type TEXT NOT NULL DEFAULT 'info',
    content TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (swarm_session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS swarm_tasks (
    id TEXT PRIMARY KEY,
    swarm_session_id TEXT NOT NULL,
    description TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'general',
    priority INTEGER NOT NULL DEFAULT 50,
    claimed_by TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    dependencies TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    claimed_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (swarm_session_id) REFERENCES swarm_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_swarm_agents_session ON swarm_agents(swarm_session_id);
  CREATE INDEX IF NOT EXISTS idx_blackboard_session ON blackboard_entries(swarm_session_id);
  CREATE INDEX IF NOT EXISTS idx_blackboard_topic ON blackboard_entries(swarm_session_id, topic);
  CREATE INDEX IF NOT EXISTS idx_consensus_session ON consensus_rounds(swarm_session_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_messages_session ON swarm_messages(swarm_session_id);
  CREATE INDEX IF NOT EXISTS idx_swarm_tasks_session ON swarm_tasks(swarm_session_id);
`);

export interface IStorage {
  // Models
  getModels(): Model[];
  getModel(id: string): Model | undefined;
  createModel(data: InsertModel): Model;
  updateModel(id: string, data: Partial<InsertModel>): Model | undefined;
  deleteModel(id: string): void;
  getDefaultModel(): Model | undefined;
  getOrchestratorModel(): Model | undefined;

  // Conversations
  getConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  createConversation(data: InsertConversation): Conversation;
  updateConversation(id: string, data: Partial<InsertConversation>): Conversation | undefined;
  deleteConversation(id: string): void;

  // Messages
  getMessages(conversationId: string): Message[];
  getMessage(id: string): Message | undefined;
  createMessage(data: InsertMessage): Message;

  // Tasks
  getTasks(conversationId: string): Task[];
  getTask(id: string): Task | undefined;
  createTask(data: InsertTask): Task;
  updateTask(id: string, data: Partial<InsertTask>): Task | undefined;
  getChildTasks(parentTaskId: string): Task[];

  // Agent Runs
  getAgentRuns(conversationId: string): AgentRun[];
  getAllAgentRuns(): AgentRun[];
  createAgentRun(data: InsertAgentRun): AgentRun;
  updateAgentRun(id: string, data: Partial<InsertAgentRun>): AgentRun | undefined;

  // Skills
  getSkills(): Skill[];
  getSkill(id: string): Skill | undefined;
  createSkill(data: InsertSkill): Skill;
  updateSkill(id: string, data: Partial<InsertSkill>): Skill | undefined;
  deleteSkill(id: string): void;
  incrementSkillUsage(id: string): void;

  // Connectors
  getConnectors(): Connector[];
  getConnector(id: string): Connector | undefined;
  createConnector(data: InsertConnector): Connector;
  updateConnector(id: string, data: Partial<InsertConnector>): Connector | undefined;
  deleteConnector(id: string): void;

  // Memory
  getMemories(limit?: number): Memory[];
  createMemory(data: InsertMemory): Memory;
  updateMemory(id: string, data: Partial<InsertMemory>): Memory | undefined;
  deleteMemory(id: string): void;
  searchMemories(query: string, limit?: number): Memory[];

  // Skill Scripts (Library)
  getSkillScripts(): SkillScript[];
  getSkillScript(id: string): SkillScript | undefined;
  createSkillScript(data: InsertSkillScript): SkillScript;
  updateSkillScript(id: string, data: Partial<InsertSkillScript>): SkillScript | undefined;
  deleteSkillScript(id: string): void;
  incrementSkillScriptUsage(id: string): void;
  searchSkillScripts(query: string): SkillScript[];

  // Skill Script Versions
  getSkillScriptVersions(scriptId: string): SkillScriptVersion[];
  createSkillScriptVersion(data: InsertSkillScriptVersion): SkillScriptVersion;

  // Settings
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;

  // Marketplace
  getMarketplaceSkills(opts?: { category?: string; search?: string; sort?: string; limit?: number; offset?: number }): MarketplaceSkill[];
  getMarketplaceSkill(id: string): MarketplaceSkill | undefined;
  getMarketplaceSkillBySlug(slug: string): MarketplaceSkill | undefined;
  createMarketplaceSkill(data: InsertMarketplaceSkill): MarketplaceSkill;
  updateMarketplaceSkill(id: string, data: Partial<InsertMarketplaceSkill>): MarketplaceSkill | undefined;
  deleteMarketplaceSkill(id: string): void;
  incrementMarketplaceInstallCount(id: string): void;
  updateMarketplaceRating(id: string, ratingDelta: number, countDelta: number): void;
  incrementMarketplaceForkCount(id: string): void;

  getMarketplaceVersions(skillId: string): MarketplaceVersion[];
  getMarketplaceVersion(id: string): MarketplaceVersion | undefined;
  createMarketplaceVersion(data: InsertMarketplaceVersion): MarketplaceVersion;

  getMarketplaceRatings(skillId: string): MarketplaceRating[];
  getMarketplaceRatingByUser(skillId: string, userId: string): MarketplaceRating | undefined;
  createMarketplaceRating(data: InsertMarketplaceRating): MarketplaceRating;
  updateMarketplaceRatingRecord(id: string, data: Partial<InsertMarketplaceRating>): MarketplaceRating | undefined;

  getMarketplaceInstalls(): MarketplaceInstall[];
  getMarketplaceInstallBySkill(skillId: string): MarketplaceInstall | undefined;
  createMarketplaceInstall(data: InsertMarketplaceInstall): MarketplaceInstall;
  deleteMarketplaceInstall(id: string): void;

  // Knowledge Base
  getKnowledgeEntries(): KnowledgeEntry[];
  getKnowledgeEntry(id: string): KnowledgeEntry | undefined;
  getEnabledKnowledgeEntries(): KnowledgeEntry[];
  getKnowledgeByCategory(category: string): KnowledgeEntry[];
  searchKnowledge(query: string): KnowledgeEntry[];
  createKnowledgeEntry(data: InsertKnowledgeEntry): KnowledgeEntry;
  updateKnowledgeEntry(id: string, data: Partial<InsertKnowledgeEntry>): KnowledgeEntry | undefined;
  deleteKnowledgeEntry(id: string): void;

  // Swarm Sessions
  getAllSwarmSessions(): SwarmSession[];
  getSwarmSession(id: string): SwarmSession | undefined;
  upsertSwarmSession(data: InsertSwarmSession): SwarmSession;
  deleteSwarmSession(id: string): void;
  // Swarm Agents
  getSwarmAgents(sessionId: string): SwarmAgentRow[];
  getSwarmAgent(id: string): SwarmAgentRow | undefined;
  upsertSwarmAgent(data: InsertSwarmAgent): SwarmAgentRow;
  deleteSwarmAgent(id: string): void;
  // Blackboard Entries
  getBlackboardEntries(sessionId: string, topic?: string): BlackboardEntryRow[];
  getBlackboardEntry(id: string): BlackboardEntryRow | undefined;
  createBlackboardEntry(data: InsertBlackboardEntry): BlackboardEntryRow;
  updateBlackboardEntry(id: string, data: Partial<InsertBlackboardEntry>): BlackboardEntryRow | undefined;
  deleteBlackboardEntry(id: string): void;
  deleteExpiredBlackboardEntries(sessionId: string, now: number): number;
  // Consensus Rounds
  getConsensusRounds(sessionId: string): ConsensusRoundRow[];
  getConsensusRound(id: string): ConsensusRoundRow | undefined;
  upsertConsensusRound(data: InsertConsensusRound): ConsensusRoundRow;
  deleteConsensusRound(id: string): void;
  // Swarm Messages
  getSwarmMessages(sessionId: string, limit?: number): SwarmMessage[];
  createSwarmMessage(data: InsertSwarmMessage): SwarmMessage;
  // Swarm Tasks
  getSwarmTasks(sessionId: string): SwarmTaskRow[];
  getSwarmTask(id: string): SwarmTaskRow | undefined;
  upsertSwarmTask(data: InsertSwarmTask): SwarmTaskRow;
  deleteSwarmTask(id: string): void;
}

export class SQLiteStorage implements IStorage {
  getModels(): Model[] { return db.select().from(models).orderBy(desc(models.createdAt)).all(); }
  getModel(id: string): Model | undefined { return db.select().from(models).where(eq(models.id, id)).get(); }
  createModel(data: InsertModel): Model { return db.insert(models).values({ ...data, createdAt: Date.now() }).returning().get(); }
  updateModel(id: string, data: Partial<InsertModel>): Model | undefined {
    return db.update(models).set(data).where(eq(models.id, id)).returning().get();
  }
  deleteModel(id: string): void { db.delete(models).where(eq(models.id, id)).run(); }
  getDefaultModel(): Model | undefined { return db.select().from(models).where(and(eq(models.isDefault, true), eq(models.enabled, true))).get(); }
  getOrchestratorModel(): Model | undefined { return db.select().from(models).where(and(eq(models.isOrchestrator, true), eq(models.enabled, true))).get(); }

  getConversations(): Conversation[] { return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all(); }
  getConversation(id: string): Conversation | undefined { return db.select().from(conversations).where(eq(conversations.id, id)).get(); }
  createConversation(data: InsertConversation): Conversation {
    return db.insert(conversations).values({ ...data, createdAt: Date.now(), updatedAt: Date.now() }).returning().get();
  }
  updateConversation(id: string, data: Partial<InsertConversation>): Conversation | undefined {
    return db.update(conversations).set({ ...data, updatedAt: Date.now() }).where(eq(conversations.id, id)).returning().get();
  }
  deleteConversation(id: string): void {
    // Cascade delete associated messages, tasks, and agentRuns
    db.delete(messages).where(eq(messages.conversationId, id)).run();
    db.delete(tasks).where(eq(tasks.conversationId, id)).run();
    db.delete(agentRuns).where(eq(agentRuns.conversationId, id)).run();
    db.delete(conversations).where(eq(conversations.id, id)).run();
  }

  getMessages(conversationId: string): Message[] {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt).all();
  }
  getMessage(id: string): Message | undefined { return db.select().from(messages).where(eq(messages.id, id)).get(); }
  createMessage(data: InsertMessage): Message { return db.insert(messages).values({ ...data, createdAt: Date.now() }).returning().get(); }

  getTasks(conversationId: string): Task[] {
    return db.select().from(tasks).where(eq(tasks.conversationId, conversationId)).orderBy(tasks.createdAt).all();
  }
  getTask(id: string): Task | undefined { return db.select().from(tasks).where(eq(tasks.id, id)).get(); }
  createTask(data: InsertTask): Task { return db.insert(tasks).values({ ...data, createdAt: Date.now() }).returning().get(); }
  updateTask(id: string, data: Partial<InsertTask>): Task | undefined {
    return db.update(tasks).set(data).where(eq(tasks.id, id)).returning().get();
  }
  getChildTasks(parentTaskId: string): Task[] {
    return db.select().from(tasks).where(eq(tasks.parentTaskId, parentTaskId)).all();
  }

  getAgentRuns(conversationId: string): AgentRun[] {
    return db.select().from(agentRuns).where(eq(agentRuns.conversationId, conversationId)).orderBy(agentRuns.startedAt).all();
  }
  getAllAgentRuns(): AgentRun[] {
    return db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).all();
  }
  createAgentRun(data: InsertAgentRun): AgentRun { return db.insert(agentRuns).values({ ...data, startedAt: Date.now() }).returning().get(); }
  updateAgentRun(id: string, data: Partial<InsertAgentRun>): AgentRun | undefined {
    return db.update(agentRuns).set(data).where(eq(agentRuns.id, id)).returning().get();
  }

  getSkills(): Skill[] { return db.select().from(skills).orderBy(desc(skills.usageCount)).all(); }
  getSkill(id: string): Skill | undefined { return db.select().from(skills).where(eq(skills.id, id)).get(); }
  createSkill(data: InsertSkill): Skill { return db.insert(skills).values({ ...data, createdAt: Date.now(), usageCount: 0 }).returning().get(); }
  updateSkill(id: string, data: Partial<InsertSkill>): Skill | undefined {
    return db.update(skills).set(data).where(eq(skills.id, id)).returning().get();
  }
  deleteSkill(id: string): void { db.delete(skills).where(eq(skills.id, id)).run(); }
  incrementSkillUsage(id: string): void {
    sqlite.prepare("UPDATE skills SET usage_count = usage_count + 1 WHERE id = ?").run(id);
  }

  getConnectors(): Connector[] { return db.select().from(connectors).orderBy(connectors.name).all(); }
  getConnector(id: string): Connector | undefined { return db.select().from(connectors).where(eq(connectors.id, id)).get(); }
  createConnector(data: InsertConnector): Connector { return db.insert(connectors).values({ ...data, createdAt: Date.now() }).returning().get(); }
  updateConnector(id: string, data: Partial<InsertConnector>): Connector | undefined {
    return db.update(connectors).set(data).where(eq(connectors.id, id)).returning().get();
  }
  deleteConnector(id: string): void { db.delete(connectors).where(eq(connectors.id, id)).run(); }

  getMemories(limit = 50): Memory[] {
    return db.select().from(memory).orderBy(desc(memory.importance)).limit(limit).all();
  }
  createMemory(data: InsertMemory): Memory { return db.insert(memory).values({ ...data, createdAt: Date.now() }).returning().get(); }
  updateMemory(id: string, data: Partial<InsertMemory>): Memory | undefined {
    return db.update(memory).set(data).where(eq(memory.id, id)).returning().get();
  }
  deleteMemory(id: string): void { db.delete(memory).where(eq(memory.id, id)).run(); }
  searchMemories(query: string, limit = 10): Memory[] {
    // Simple keyword search — production would use embeddings
    const all = db.select().from(memory).orderBy(desc(memory.importance)).all();
    const q = query.toLowerCase();
    return all.filter(m => m.content.toLowerCase().includes(q) || (m.summary || "").toLowerCase().includes(q)).slice(0, limit);
  }

  // Skill Scripts (Library)
  getSkillScripts(): SkillScript[] {
    return db.select().from(skillScripts).orderBy(desc(skillScripts.updatedAt)).all();
  }
  getSkillScript(id: string): SkillScript | undefined {
    return db.select().from(skillScripts).where(eq(skillScripts.id, id)).get();
  }
  createSkillScript(data: InsertSkillScript): SkillScript {
    return db.insert(skillScripts).values({ ...data, createdAt: Date.now(), updatedAt: Date.now(), usageCount: 0 }).returning().get();
  }
  updateSkillScript(id: string, data: Partial<InsertSkillScript>): SkillScript | undefined {
    return db.update(skillScripts).set({ ...data, updatedAt: Date.now() }).where(eq(skillScripts.id, id)).returning().get();
  }
  deleteSkillScript(id: string): void {
    db.delete(skillScriptVersions).where(eq(skillScriptVersions.scriptId, id)).run();
    db.delete(skillScripts).where(eq(skillScripts.id, id)).run();
  }
  incrementSkillScriptUsage(id: string): void {
    sqlite.prepare("UPDATE skill_scripts SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?").run(Date.now(), id);
  }
  searchSkillScripts(query: string): SkillScript[] {
    const all = db.select().from(skillScripts).orderBy(desc(skillScripts.updatedAt)).all();
    const q = query.toLowerCase();
    return all.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      (s.tags || "[]").toLowerCase().includes(q)
    );
  }

  // Skill Script Versions
  getSkillScriptVersions(scriptId: string): SkillScriptVersion[] {
    return db.select().from(skillScriptVersions).where(eq(skillScriptVersions.scriptId, scriptId)).orderBy(desc(skillScriptVersions.version)).all();
  }
  createSkillScriptVersion(data: InsertSkillScriptVersion): SkillScriptVersion {
    return db.insert(skillScriptVersions).values({ ...data, createdAt: Date.now() }).returning().get();
  }

  getSetting(key: string): string | null {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  }
  setSetting(key: string, value: string): void {
    db.insert(settings).values({ key, value, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } }).run();
  }

  // ─── Marketplace ───────────────────────────────────────────────────────────
  getMarketplaceSkills(opts?: { category?: string; search?: string; sort?: string; limit?: number; offset?: number }): MarketplaceSkill[] {
    let all = db.select().from(marketplaceSkills).orderBy(desc(marketplaceSkills.publishedAt)).all();
    if (opts?.category && opts.category !== "all") {
      all = all.filter(s => s.category === opts.category);
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      all = all.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.authorName.toLowerCase().includes(q) ||
        (s.tags || "[]").toLowerCase().includes(q)
      );
    }
    if (opts?.sort === "popular") {
      all.sort((a, b) => b.installCount - a.installCount);
    } else if (opts?.sort === "rating") {
      all.sort((a, b) => {
        const ra = a.ratingCount > 0 ? a.ratingSum / a.ratingCount : 0;
        const rb = b.ratingCount > 0 ? b.ratingSum / b.ratingCount : 0;
        return rb - ra;
      });
    } else if (opts?.sort === "newest") {
      all.sort((a, b) => b.publishedAt - a.publishedAt);
    } else if (opts?.sort === "quality") {
      all.sort((a, b) => b.qualityScore - a.qualityScore);
    }
    const offset = opts?.offset || 0;
    const limit = opts?.limit || 50;
    return all.slice(offset, offset + limit);
  }

  getMarketplaceSkill(id: string): MarketplaceSkill | undefined {
    return db.select().from(marketplaceSkills).where(eq(marketplaceSkills.id, id)).get();
  }

  getMarketplaceSkillBySlug(slug: string): MarketplaceSkill | undefined {
    return db.select().from(marketplaceSkills).where(eq(marketplaceSkills.slug, slug)).get();
  }

  createMarketplaceSkill(data: InsertMarketplaceSkill): MarketplaceSkill {
    return db.insert(marketplaceSkills).values({
      ...data,
      publishedAt: Date.now(),
      updatedAt: Date.now(),
      installCount: 0,
      ratingSum: 0,
      ratingCount: 0,
      forkCount: 0,
    }).returning().get();
  }

  updateMarketplaceSkill(id: string, data: Partial<InsertMarketplaceSkill>): MarketplaceSkill | undefined {
    return db.update(marketplaceSkills).set({ ...data, updatedAt: Date.now() }).where(eq(marketplaceSkills.id, id)).returning().get();
  }

  deleteMarketplaceSkill(id: string): void {
    const deleteTx = sqlite.transaction(() => {
      db.delete(marketplaceVersions).where(eq(marketplaceVersions.skillId, id)).run();
      db.delete(marketplaceRatings).where(eq(marketplaceRatings.skillId, id)).run();
      db.delete(marketplaceInstalls).where(eq(marketplaceInstalls.skillId, id)).run();
      db.delete(marketplaceSkills).where(eq(marketplaceSkills.id, id)).run();
    });
    deleteTx();
  }

  incrementMarketplaceInstallCount(id: string): void {
    sqlite.prepare("UPDATE marketplace_skills SET install_count = install_count + 1 WHERE id = ?").run(id);
  }

  updateMarketplaceRating(id: string, ratingDelta: number, countDelta: number): void {
    sqlite.prepare("UPDATE marketplace_skills SET rating_sum = rating_sum + ?, rating_count = rating_count + ? WHERE id = ?").run(ratingDelta, countDelta, id);
  }

  incrementMarketplaceForkCount(id: string): void {
    sqlite.prepare("UPDATE marketplace_skills SET fork_count = fork_count + 1 WHERE id = ?").run(id);
  }

  getMarketplaceVersions(skillId: string): MarketplaceVersion[] {
    return db.select().from(marketplaceVersions).where(eq(marketplaceVersions.skillId, skillId)).orderBy(desc(marketplaceVersions.createdAt)).all();
  }

  getMarketplaceVersion(id: string): MarketplaceVersion | undefined {
    return db.select().from(marketplaceVersions).where(eq(marketplaceVersions.id, id)).get();
  }

  createMarketplaceVersion(data: InsertMarketplaceVersion): MarketplaceVersion {
    return db.insert(marketplaceVersions).values({ ...data, createdAt: Date.now() }).returning().get();
  }

  getMarketplaceRatings(skillId: string): MarketplaceRating[] {
    return db.select().from(marketplaceRatings).where(eq(marketplaceRatings.skillId, skillId)).orderBy(desc(marketplaceRatings.createdAt)).all();
  }

  getMarketplaceRatingByUser(skillId: string, userId: string): MarketplaceRating | undefined {
    return db.select().from(marketplaceRatings).where(and(eq(marketplaceRatings.skillId, skillId), eq(marketplaceRatings.userId, userId))).get();
  }

  createMarketplaceRating(data: InsertMarketplaceRating): MarketplaceRating {
    return db.insert(marketplaceRatings).values({ ...data, createdAt: Date.now() }).returning().get();
  }

  updateMarketplaceRatingRecord(id: string, data: Partial<InsertMarketplaceRating>): MarketplaceRating | undefined {
    return db.update(marketplaceRatings).set(data).where(eq(marketplaceRatings.id, id)).returning().get();
  }

  getMarketplaceInstalls(): MarketplaceInstall[] {
    return db.select().from(marketplaceInstalls).orderBy(desc(marketplaceInstalls.installedAt)).all();
  }

  getMarketplaceInstallBySkill(skillId: string): MarketplaceInstall | undefined {
    return db.select().from(marketplaceInstalls).where(eq(marketplaceInstalls.skillId, skillId)).get();
  }

  createMarketplaceInstall(data: InsertMarketplaceInstall): MarketplaceInstall {
    return db.insert(marketplaceInstalls).values({ ...data, installedAt: Date.now() }).returning().get();
  }

  deleteMarketplaceInstall(id: string): void {
    db.delete(marketplaceInstalls).where(eq(marketplaceInstalls.id, id)).run();
  }

  // ─── Knowledge Base ──────────────────────────────────────────────────────────
  getKnowledgeEntries(): KnowledgeEntry[] {
    return db.select().from(knowledgeBase).orderBy(desc(knowledgeBase.priority)).all();
  }
  getKnowledgeEntry(id: string): KnowledgeEntry | undefined {
    return db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).get();
  }
  getEnabledKnowledgeEntries(): KnowledgeEntry[] {
    return db.select().from(knowledgeBase)
      .where(eq(knowledgeBase.enabled, true))
      .orderBy(desc(knowledgeBase.priority))
      .all();
  }
  getKnowledgeByCategory(category: string): KnowledgeEntry[] {
    return db.select().from(knowledgeBase)
      .where(and(eq(knowledgeBase.category, category), eq(knowledgeBase.enabled, true)))
      .orderBy(desc(knowledgeBase.priority))
      .all();
  }
  searchKnowledge(query: string): KnowledgeEntry[] {
    // Keyword search across name, description, tags, content
    const all = this.getEnabledKnowledgeEntries();
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (terms.length === 0) return all;
    return all.filter(entry => {
      const haystack = `${entry.name} ${entry.description || ""} ${entry.tags || ""} ${entry.content}`.toLowerCase();
      return terms.some(t => haystack.includes(t));
    }).slice(0, 20);
  }
  createKnowledgeEntry(data: InsertKnowledgeEntry): KnowledgeEntry {
    return db.insert(knowledgeBase).values({ ...data, createdAt: Date.now(), updatedAt: Date.now() }).returning().get();
  }
  updateKnowledgeEntry(id: string, data: Partial<InsertKnowledgeEntry>): KnowledgeEntry | undefined {
    const result = db.update(knowledgeBase).set({ ...data, updatedAt: Date.now() }).where(eq(knowledgeBase.id, id)).returning().get();
    return result;
  }
  deleteKnowledgeEntry(id: string): void {
    db.delete(knowledgeBase).where(eq(knowledgeBase.id, id)).run();
  }

  // ── Swarm Sessions ────────────────────────────────────────────────────────
  getAllSwarmSessions(): SwarmSession[] {
    return db.select().from(swarmSessions).orderBy(desc(swarmSessions.createdAt)).all();
  }
  getSwarmSession(id: string): SwarmSession | undefined {
    return db.select().from(swarmSessions).where(eq(swarmSessions.id, id)).get();
  }
  upsertSwarmSession(data: InsertSwarmSession): SwarmSession {
    const existing = this.getSwarmSession(data.id!);
    if (existing) {
      return db.update(swarmSessions).set(data).where(eq(swarmSessions.id, data.id!)).returning().get();
    }
    return db.insert(swarmSessions).values({ ...data, createdAt: Date.now() }).returning().get();
  }
  deleteSwarmSession(id: string): void {
    // Cascade: delete agents, tasks, blackboard, consensus, messages
    db.delete(swarmAgents).where(eq(swarmAgents.swarmSessionId, id)).run();
    db.delete(swarmTasks).where(eq(swarmTasks.swarmSessionId, id)).run();
    db.delete(blackboardEntries).where(eq(blackboardEntries.swarmSessionId, id)).run();
    db.delete(consensusRounds).where(eq(consensusRounds.swarmSessionId, id)).run();
    db.delete(swarmMessages).where(eq(swarmMessages.swarmSessionId, id)).run();
    db.delete(swarmSessions).where(eq(swarmSessions.id, id)).run();
  }
  // ── Swarm Agents ──────────────────────────────────────────────────────────
  getSwarmAgents(sessionId: string): SwarmAgentRow[] {
    return db.select().from(swarmAgents).where(eq(swarmAgents.swarmSessionId, sessionId)).all();
  }
  getSwarmAgent(id: string): SwarmAgentRow | undefined {
    return db.select().from(swarmAgents).where(eq(swarmAgents.id, id)).get();
  }
  upsertSwarmAgent(data: InsertSwarmAgent): SwarmAgentRow {
    const existing = this.getSwarmAgent(data.id!);
    if (existing) {
      return db.update(swarmAgents).set(data).where(eq(swarmAgents.id, data.id!)).returning().get();
    }
    return db.insert(swarmAgents).values({ ...data, createdAt: Date.now() }).returning().get();
  }
  deleteSwarmAgent(id: string): void {
    db.delete(swarmAgents).where(eq(swarmAgents.id, id)).run();
  }
  // ── Blackboard Entries ────────────────────────────────────────────────────
  getBlackboardEntries(sessionId: string, topic?: string): BlackboardEntryRow[] {
    if (topic) {
      return db.select().from(blackboardEntries)
        .where(sql`${blackboardEntries.swarmSessionId} = ${sessionId} AND ${blackboardEntries.topic} = ${topic}`)
        .orderBy(desc(blackboardEntries.priority)).all();
    }
    return db.select().from(blackboardEntries)
      .where(eq(blackboardEntries.swarmSessionId, sessionId))
      .orderBy(desc(blackboardEntries.priority)).all();
  }
  getBlackboardEntry(id: string): BlackboardEntryRow | undefined {
    return db.select().from(blackboardEntries).where(eq(blackboardEntries.id, id)).get();
  }
  createBlackboardEntry(data: InsertBlackboardEntry): BlackboardEntryRow {
    const now = Date.now();
    return db.insert(blackboardEntries).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }
  updateBlackboardEntry(id: string, data: Partial<InsertBlackboardEntry>): BlackboardEntryRow | undefined {
    return db.update(blackboardEntries).set({ ...data, updatedAt: Date.now() }).where(eq(blackboardEntries.id, id)).returning().get();
  }
  deleteBlackboardEntry(id: string): void {
    db.delete(blackboardEntries).where(eq(blackboardEntries.id, id)).run();
  }
  deleteExpiredBlackboardEntries(sessionId: string, now: number): number {
    const result = db.delete(blackboardEntries)
      .where(sql`${blackboardEntries.swarmSessionId} = ${sessionId} AND ${blackboardEntries.expiresAt} IS NOT NULL AND ${blackboardEntries.expiresAt} <= ${now}`)
      .run();
    return result.changes;
  }
  // ── Consensus Rounds ─────────────────────────────────────────────────────
  getConsensusRounds(sessionId: string): ConsensusRoundRow[] {
    return db.select().from(consensusRounds).where(eq(consensusRounds.swarmSessionId, sessionId)).all();
  }
  getConsensusRound(id: string): ConsensusRoundRow | undefined {
    return db.select().from(consensusRounds).where(eq(consensusRounds.id, id)).get();
  }
  upsertConsensusRound(data: InsertConsensusRound): ConsensusRoundRow {
    const existing = this.getConsensusRound(data.id!);
    if (existing) {
      return db.update(consensusRounds).set(data).where(eq(consensusRounds.id, data.id!)).returning().get();
    }
    return db.insert(consensusRounds).values({ ...data, createdAt: Date.now() }).returning().get();
  }
  deleteConsensusRound(id: string): void {
    db.delete(consensusRounds).where(eq(consensusRounds.id, id)).run();
  }
  // ── Swarm Messages ───────────────────────────────────────────────────────
  getSwarmMessages(sessionId: string, limit = 200): SwarmMessage[] {
    return db.select().from(swarmMessages)
      .where(eq(swarmMessages.swarmSessionId, sessionId))
      .orderBy(desc(swarmMessages.createdAt))
      .limit(limit).all();
  }
  createSwarmMessage(data: InsertSwarmMessage): SwarmMessage {
    return db.insert(swarmMessages).values({ ...data, createdAt: Date.now() }).returning().get();
  }
  // ── Swarm Tasks ──────────────────────────────────────────────────────────
  getSwarmTasks(sessionId: string): SwarmTaskRow[] {
    return db.select().from(swarmTasks).where(eq(swarmTasks.swarmSessionId, sessionId)).all();
  }
  getSwarmTask(id: string): SwarmTaskRow | undefined {
    return db.select().from(swarmTasks).where(eq(swarmTasks.id, id)).get();
  }
  upsertSwarmTask(data: InsertSwarmTask): SwarmTaskRow {
    const existing = this.getSwarmTask(data.id!);
    if (existing) {
      return db.update(swarmTasks).set(data).where(eq(swarmTasks.id, data.id!)).returning().get();
    }
    return db.insert(swarmTasks).values({ ...data, createdAt: Date.now() }).returning().get();
  }
  deleteSwarmTask(id: string): void {
    db.delete(swarmTasks).where(eq(swarmTasks.id, id)).run();
  }
}

export const storage = new SQLiteStorage();
