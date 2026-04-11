import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc, and } from "drizzle-orm";
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
    created_at INTEGER NOT NULL
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
    created_at INTEGER NOT NULL
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
    completed_at INTEGER
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
    created_at INTEGER NOT NULL
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
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS marketplace_ratings (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    review TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS marketplace_installs (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    local_skill_id TEXT,
    local_type TEXT NOT NULL DEFAULT 'instruction',
    installed_version TEXT NOT NULL,
    auto_update INTEGER NOT NULL DEFAULT 0,
    installed_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
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
    db.delete(marketplaceVersions).where(eq(marketplaceVersions.skillId, id)).run();
    db.delete(marketplaceRatings).where(eq(marketplaceRatings.skillId, id)).run();
    db.delete(marketplaceInstalls).where(eq(marketplaceInstalls.skillId, id)).run();
    db.delete(marketplaceSkills).where(eq(marketplaceSkills.id, id)).run();
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
}

export const storage = new SQLiteStorage();
