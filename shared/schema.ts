import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Models Registry ─────────────────────────────────────────────────────────
export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // openai | anthropic | google | ollama | openai_compat | custom | mistral | groq | together | replicate | cohere | deepseek | xai
  modelId: text("model_id").notNull(),  // e.g. gpt-4o, claude-opus-4-5, llama3.3:70b
  baseUrl: text("base_url"),            // for custom/ollama endpoints
  apiKey: text("api_key"),              // encrypted at rest — for api_key auth method
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  capabilities: text("capabilities").notNull().default("[]"), // JSON: ["chat","code","vision","search"]
  contextWindow: integer("context_window").notNull().default(8192),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isOrchestrator: integer("is_orchestrator", { mode: "boolean" }).notNull().default(false),
  speedTier: text("speed_tier").notNull().default("medium"), // fast | medium | powerful
  notes: text("notes"),
  // ─── Multi-Auth Connection Fields ──────────────────────────────────────────
  authMethod: text("auth_method").notNull().default("api_key"),  // api_key | oauth | env_var | browser_login | none
  oauthTokens: text("oauth_tokens"),     // JSON: { access_token, refresh_token, expires_at, token_type, scope }
  envVarName: text("env_var_name"),       // e.g. OPENAI_API_KEY — resolved at runtime from process.env
  connectionStatus: text("connection_status").notNull().default("unconfigured"), // unconfigured | connected | disconnected | expired | error
  connectionError: text("connection_error"), // last error message from connection attempt
  lastTestedAt: integer("last_tested_at"),
  lastTestLatency: integer("last_test_latency"), // ms
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertModelSchema = createInsertSchema(models).omit({ createdAt: true });
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Model = typeof models.$inferSelect;

// ─── Skills ───────────────────────────────────────────────────────────────────
export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  content: text("content").notNull(),       // full .md content
  triggerKeywords: text("trigger_keywords").notNull().default("[]"), // JSON string[]
  embeddings: text("embeddings"),           // JSON float[] for semantic matching
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertSkillSchema = createInsertSchema(skills).omit({ createdAt: true, usageCount: true });
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type Skill = typeof skills.$inferSelect;

// ─── Connectors ───────────────────────────────────────────────────────────────
export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),             // oauth | api_key | mcp | open
  category: text("category").notNull(),     // productivity | dev | data | crm | custom
  logoUrl: text("logo_url"),
  description: text("description").notNull(),
  status: text("status").notNull().default("disconnected"), // connected | disconnected | error
  config: text("config").notNull().default("{}"),           // JSON — keys, tokens, urls (server-side only)
  mcpServerUrl: text("mcp_server_url"),
  scopes: text("scopes").notNull().default("[]"),           // JSON string[]
  lastSynced: integer("last_synced"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertConnectorSchema = createInsertSchema(connectors).omit({ createdAt: true });
export type InsertConnector = z.infer<typeof insertConnectorSchema>;
export type Connector = typeof connectors.$inferSelect;

// ─── Memory ───────────────────────────────────────────────────────────────────
export const memory = sqliteTable("memory", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  summary: text("summary"),
  category: text("category").notNull().default("general"),
  importance: real("importance").notNull().default(0.5), // 0-1
  embeddings: text("embeddings"),                        // JSON float[]
  sessionId: text("session_id"),
  sourceMessageId: text("source_message_id"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  lastAccessedAt: integer("last_accessed_at"),
});

export const insertMemorySchema = createInsertSchema(memory).omit({ createdAt: true });
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Memory = typeof memory.$inferSelect;

// ─── Conversations (Sessions) ─────────────────────────────────────────────────
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Session"),
  status: text("status").notNull().default("idle"), // idle | planning | running | complete | error
  orchestratorModelId: text("orchestrator_model_id"),
  activeSkillIds: text("active_skill_ids").notNull().default("[]"), // JSON string[]
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ createdAt: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),   // user | assistant | system | tool | agent
  content: text("content").notNull(),
  modelId: text("model_id"),
  agentId: text("agent_id"),
  taskId: text("task_id"),
  metadata: text("metadata").notNull().default("{}"), // JSON
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ─── Task Graph ───────────────────────────────────────────────────────────────
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  parentTaskId: text("parent_task_id"),   // null = root orchestrator task
  title: text("title").notNull(),
  description: text("description").notNull(),
  taskType: text("task_type").notNull().default("general"), // research | code | write | browse | analyze | general
  status: text("status").notNull().default("pending"),     // pending | running | complete | failed | cancelled
  dependsOn: text("depends_on").notNull().default("[]"),   // JSON string[] of task IDs
  assignedModelId: text("assigned_model_id"),
  result: text("result"),             // final output text
  resultPath: text("result_path"),    // filesystem IPC path for large payloads
  error: text("error"),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// ─── Agent Runs ───────────────────────────────────────────────────────────────
export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  level: integer("level").notNull().default(1),     // 0 = orchestrator, 1 = worker
  modelId: text("model_id").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  inputContext: text("input_context").notNull(),    // context injected at spawn time
  output: text("output"),
  toolCalls: text("tool_calls").notNull().default("[]"),     // JSON
  ipcPath: text("ipc_path"),                                 // filesystem message path
  status: text("status").notNull().default("running"),
  tokenUsage: text("token_usage").notNull().default("{}"),   // JSON {prompt, completion, total}
  startedAt: integer("started_at").notNull().$defaultFn(() => Date.now()),
  completedAt: integer("completed_at"),
});

export const insertAgentRunSchema = createInsertSchema(agentRuns).omit({ startedAt: true });
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type AgentRun = typeof agentRuns.$inferSelect;

// ─── Skill Scripts (Persistent Library) ───────────────────────────────────────
export const skillScripts = sqliteTable("skill_scripts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  language: text("language").notNull().default("bash"),     // bash | python | javascript | typescript
  content: text("content").notNull(),                        // the script body
  tags: text("tags").notNull().default("[]"),                 // JSON string[]
  version: integer("version").notNull().default(1),
  sourceConversationId: text("source_conversation_id"),       // which session it was captured from
  sourceToolCallId: text("source_tool_call_id"),              // the specific tool call that produced it
  filePath: text("file_path"),                                // optional workspace file path
  usageCount: integer("usage_count").notNull().default(0),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

export const insertSkillScriptSchema = createInsertSchema(skillScripts).omit({ createdAt: true, updatedAt: true, usageCount: true });
export type InsertSkillScript = z.infer<typeof insertSkillScriptSchema>;
export type SkillScript = typeof skillScripts.$inferSelect;

// ─── Skill Script Versions ────────────────────────────────────────────────────
export const skillScriptVersions = sqliteTable("skill_script_versions", {
  id: text("id").primaryKey(),
  scriptId: text("script_id").notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  changeNote: text("change_note").notNull().default(""),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertSkillScriptVersionSchema = createInsertSchema(skillScriptVersions).omit({ createdAt: true });
export type InsertSkillScriptVersion = z.infer<typeof insertSkillScriptVersionSchema>;
export type SkillScriptVersion = typeof skillScriptVersions.$inferSelect;

// ─── Marketplace: Published Skills ────────────────────────────────────────────
export const marketplaceSkills = sqliteTable("marketplace_skills", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  longDescription: text("long_description").notNull().default(""),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email"),
  authorAvatarUrl: text("author_avatar_url"),
  category: text("category").notNull().default("general"),
  tags: text("tags").notNull().default("[]"),
  license: text("license").notNull().default("MIT"),
  repoUrl: text("repo_url"),
  currentVersion: text("current_version").notNull().default("1.0.0"),
  visibility: text("visibility").notNull().default("public"),
  installCount: integer("install_count").notNull().default(0),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  forkedFromId: text("forked_from_id"),
  forkCount: integer("fork_count").notNull().default(0),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  // ─── Quality scoring pipeline columns ─────────────────────────────────────
  qualityScore: real("quality_score").notNull().default(0),           // 0-100 composite
  installVelocity: real("install_velocity").notNull().default(0),     // installs per day (7d window)
  ratingBayesian: real("rating_bayesian").notNull().default(0),       // bayesian avg rating (0-5)
  ratingVariance: real("rating_variance").notNull().default(0),       // variance across ratings
  forkDepth: integer("fork_depth").notNull().default(0),              // 0 = original, 1+ = fork chain depth
  versionFrequency: real("version_frequency").notNull().default(0),   // versions per 30 days
  contentRichness: real("content_richness").notNull().default(0),     // heuristic 0-1 (length, structure)
  scoreTier: text("score_tier").notNull().default("unranked"),        // unranked | bronze | silver | gold | platinum
  lastScoredAt: integer("last_scored_at"),
  publishedAt: integer("published_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

export const insertMarketplaceSkillSchema = createInsertSchema(marketplaceSkills).omit({ publishedAt: true, updatedAt: true, installCount: true, ratingSum: true, ratingCount: true, forkCount: true, qualityScore: true, installVelocity: true, ratingBayesian: true, ratingVariance: true, forkDepth: true, versionFrequency: true, contentRichness: true, scoreTier: true, lastScoredAt: true });
export type InsertMarketplaceSkill = z.infer<typeof insertMarketplaceSkillSchema>;
export type MarketplaceSkill = typeof marketplaceSkills.$inferSelect;

// ─── Marketplace: Skill Versions ──────────────────────────────────────────────
export const marketplaceVersions = sqliteTable("marketplace_versions", {
  id: text("id").primaryKey(),
  skillId: text("skill_id").notNull(),
  version: text("version").notNull(),
  content: text("content").notNull(),
  changelog: text("changelog").notNull().default(""),
  skillType: text("skill_type").notNull().default("instruction"),
  language: text("language"),
  triggerKeywords: text("trigger_keywords").notNull().default("[]"),
  fileSize: integer("file_size").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertMarketplaceVersionSchema = createInsertSchema(marketplaceVersions).omit({ createdAt: true });
export type InsertMarketplaceVersion = z.infer<typeof insertMarketplaceVersionSchema>;
export type MarketplaceVersion = typeof marketplaceVersions.$inferSelect;

// ─── Marketplace: Ratings ─────────────────────────────────────────────────────
export const marketplaceRatings = sqliteTable("marketplace_ratings", {
  id: text("id").primaryKey(),
  skillId: text("skill_id").notNull(),
  userId: text("user_id").notNull(),
  rating: integer("rating").notNull(),
  review: text("review"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});

export const insertMarketplaceRatingSchema = createInsertSchema(marketplaceRatings).omit({ createdAt: true });
export type InsertMarketplaceRating = z.infer<typeof insertMarketplaceRatingSchema>;
export type MarketplaceRating = typeof marketplaceRatings.$inferSelect;

// ─── Marketplace: Installations ───────────────────────────────────────────────
export const marketplaceInstalls = sqliteTable("marketplace_installs", {
  id: text("id").primaryKey(),
  skillId: text("skill_id").notNull(),
  localSkillId: text("local_skill_id"),
  localType: text("local_type").notNull().default("instruction"),
  installedVersion: text("installed_version").notNull(),
  autoUpdate: integer("auto_update", { mode: "boolean" }).notNull().default(false),
  installedAt: integer("installed_at").notNull().$defaultFn(() => Date.now()),
});

export const insertMarketplaceInstallSchema = createInsertSchema(marketplaceInstalls).omit({ installedAt: true });
export type InsertMarketplaceInstall = z.infer<typeof insertMarketplaceInstallSchema>;
export type MarketplaceInstall = typeof marketplaceInstalls.$inferSelect;

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

export type Setting = typeof settings.$inferSelect;

// ─── Knowledge Base ────────────────────────────────────────────────────────────
export const knowledgeBase = sqliteTable("knowledge_base", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),          // raw content
  summary: text("summary"),                    // auto-generated summary for medium-tier models
  contentType: text("content_type").notNull(),  // "text" | "markdown" | "json" | "code" | "system-reference"
  category: text("category"),                  // "models" | "architecture" | "tools" | "prompts" | "custom"
  tags: text("tags"),                          // JSON array of strings for keyword matching
  sizeBytes: integer("size_bytes").notNull(),
  tokenEstimate: integer("token_estimate").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(50), // 0-100, higher = more important
  tierPolicy: text("tier_policy").notNull().default("auto"), // "auto" | "always" | "powerful-only" | "never"
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});

export type KnowledgeEntry = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeEntry = typeof knowledgeBase.$inferInsert;

// ─── Swarm Sessions ─────────────────────────────────────────────────────────
export const swarmSessions = sqliteTable("swarm_sessions", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  config: text("config").notNull(),                    // full JSON SwarmConfig
  status: text("status").notNull().default("idle"),     // idle | running | paused | completed | failed | terminated
  mode: text("mode").notNull().default("collaborative"), // collaborative | competitive | exploratory
  totalAgentsSpawned: integer("total_agents_spawned").notNull().default(0),
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  circuitBroken: integer("circuit_broken").notNull().default(0),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  error: text("error"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
export type SwarmSession = typeof swarmSessions.$inferSelect;
export type InsertSwarmSession = typeof swarmSessions.$inferInsert;

// ─── Swarm Agents ───────────────────────────────────────────────────────────
export const swarmAgents = sqliteTable("swarm_agents", {
  id: text("id").primaryKey(),
  swarmSessionId: text("swarm_session_id").notNull(),
  parentAgentId: text("parent_agent_id"),               // null for top-level agents
  name: text("name").notNull(),
  role: text("role").notNull(),
  instructions: text("instructions").notNull(),
  modelId: text("model_id"),
  tools: text("tools").notNull().default("[]"),          // JSON string[]
  canHandoffTo: text("can_handoff_to").notNull().default("[]"), // JSON string[]
  canSpawn: integer("can_spawn", { mode: "boolean" }).notNull().default(false),
  spawnDepth: integer("spawn_depth").notNull().default(0),
  status: text("status").notNull().default("idle"),      // idle | working | waiting | handed_off | completed | failed | terminated
  currentTaskId: text("current_task_id"),
  tokensUsed: integer("tokens_used").notNull().default(0),
  messagesProcessed: integer("messages_processed").notNull().default(0),
  handoffsMade: integer("handoffs_made").notNull().default(0),
  capabilityProfile: text("capability_profile").notNull().default("{}"), // JSON: speed, accuracy, cost, specialties[]
  lastActiveAt: integer("last_active_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
export type SwarmAgent = typeof swarmAgents.$inferSelect;
export type InsertSwarmAgent = typeof swarmAgents.$inferInsert;

// ─── Blackboard Entries ─────────────────────────────────────────────────────
export const blackboardEntries = sqliteTable("blackboard_entries", {
  id: text("id").primaryKey(),
  swarmSessionId: text("swarm_session_id").notNull(),
  authorAgentId: text("author_agent_id").notNull(),
  entryType: text("entry_type").notNull().default("fact"), // fact | hypothesis | partial_result | signal | request | decision | conflict
  topic: text("topic").notNull(),                       // dot-notation namespacing (e.g., research.findings)
  key: text("key").notNull(),
  content: text("content").notNull(),
  confidence: real("confidence").notNull().default(0.5), // 0-1
  priority: integer("priority").notNull().default(50),   // 0-100, stigmergy signal
  version: integer("version").notNull().default(1),
  supersedesEntryId: text("supersedes_entry_id"),        // points to entry this replaces
  readByAgentIds: text("read_by_agent_ids").notNull().default("[]"), // JSON string[]
  ttlMs: integer("ttl_ms"),                              // time-to-live in ms
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
});
export type BlackboardEntry = typeof blackboardEntries.$inferSelect;
export type InsertBlackboardEntry = typeof blackboardEntries.$inferInsert;

// ─── Consensus Rounds ───────────────────────────────────────────────────────
export const consensusRounds = sqliteTable("consensus_rounds", {
  id: text("id").primaryKey(),
  swarmSessionId: text("swarm_session_id").notNull(),
  subject: text("subject").notNull(),                   // the question being voted on
  strategy: text("strategy").notNull().default("majority_vote"), // majority_vote | weighted_majority | unanimity | reconciliation_agent
  status: text("status").notNull().default("open"),      // open | voting | reconciling | resolved | deadlocked
  votes: text("votes").notNull().default("[]"),          // JSON ConsensusVote[]
  result: text("result"),                                // JSON { winner, confidence, reasoning }
  participantAgentIds: text("participant_agent_ids").notNull().default("[]"), // JSON string[]
  maxRounds: integer("max_rounds").notNull().default(3),
  currentRound: integer("current_round").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  resolvedAt: integer("resolved_at"),
});
export type ConsensusRound = typeof consensusRounds.$inferSelect;
export type InsertConsensusRound = typeof consensusRounds.$inferInsert;

// ─── Swarm Messages ─────────────────────────────────────────────────────────
export const swarmMessages = sqliteTable("swarm_messages", {
  id: text("id").primaryKey(),
  swarmSessionId: text("swarm_session_id").notNull(),
  fromAgentId: text("from_agent_id").notNull(),
  toAgentId: text("to_agent_id"),                       // null = broadcast
  messageType: text("message_type").notNull().default("info"), // ping | info_request | info_response | delegation | signal | merge_request | handoff | broadcast
  content: text("content").notNull(),
  metadata: text("metadata").notNull().default("{}"),    // JSON extra data
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
export type SwarmMessage = typeof swarmMessages.$inferSelect;
export type InsertSwarmMessage = typeof swarmMessages.$inferInsert;

// ─── Swarm Tasks ────────────────────────────────────────────────────────────
export const swarmTasks = sqliteTable("swarm_tasks", {
  id: text("id").primaryKey(),
  swarmSessionId: text("swarm_session_id").notNull(),
  description: text("description").notNull(),
  taskType: text("task_type").notNull().default("general"), // research | code | write | analyze | general
  priority: integer("priority").notNull().default(50),  // 0-100
  claimedBy: text("claimed_by"),                         // agent ID
  status: text("status").notNull().default("pending"),   // pending | claimed | running | completed | failed
  result: text("result"),
  dependencies: text("dependencies").notNull().default("[]"), // JSON taskId[] — tasks that must finish first
  metadata: text("metadata").notNull().default("{}"),
  claimedAt: integer("claimed_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
export type SwarmTask = typeof swarmTasks.$inferSelect;
export type InsertSwarmTask = typeof swarmTasks.$inferInsert;

// ─── Telemetry & Privacy ────────────────────────────────────────────────────
// Per-user privacy preferences controlling what data is collected and retained.
// Free tier: full telemetry (anonymized and aggregated for platform learning).
// Paid tier: can opt out entirely, or choose granular controls.
export const telemetrySettings = sqliteTable("telemetry_settings", {
  userId: text("user_id").primaryKey(), // "default" for single-tenant, or real user IDs
  // ── Consent Level ──
  // "full"       = everything logged (default / free tier)
  // "anonymized" = logged but PII stripped (task descriptions hashed, no conversation content)
  // "aggregate"  = only numeric stats (counts, durations, success rates) — no text at all
  // "none"       = fully opted out, zero data collection
  consentLevel: text("consent_level").notNull().default("full"),
  // ── Granular Controls ──
  logTaskDescriptions: integer("log_task_descriptions", { mode: "boolean" }).notNull().default(true),
  logModelUsage: integer("log_model_usage", { mode: "boolean" }).notNull().default(true),
  logToolCalls: integer("log_tool_calls", { mode: "boolean" }).notNull().default(true),
  logTokenCounts: integer("log_token_counts", { mode: "boolean" }).notNull().default(true),
  logErrorDetails: integer("log_error_details", { mode: "boolean" }).notNull().default(true),
  logUserFeedback: integer("log_user_feedback", { mode: "boolean" }).notNull().default(true),
  // ── Data Retention ──
  retentionDays: integer("retention_days").notNull().default(90), // auto-purge after N days (0 = forever)
  // ── Sharing ──
  shareAnonymizedForPlatformLearning: integer("share_anonymized", { mode: "boolean" }).notNull().default(true),
  // ── Metadata ──
  tier: text("tier").notNull().default("free"), // "free" | "pro" | "enterprise"
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
export type TelemetrySetting = typeof telemetrySettings.$inferSelect;
export type InsertTelemetrySetting = typeof telemetrySettings.$inferInsert;

// ─── Aggregate Analytics ────────────────────────────────────────────────────
// Pre-computed aggregate stats for platform-level learning.
// Contains NO individual user data — only counts, rates, and distributions.
export const aggregateAnalytics = sqliteTable("aggregate_analytics", {
  id: text("id").primaryKey(),
  period: text("period").notNull(), // "hourly" | "daily" | "weekly"
  periodStart: integer("period_start").notNull(), // epoch ms
  periodEnd: integer("period_end").notNull(),
  // Execution metrics (anonymized aggregates)
  totalExecutions: integer("total_executions").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  partialCount: integer("partial_count").notNull().default(0),
  avgDurationMs: integer("avg_duration_ms"),
  p50DurationMs: integer("p50_duration_ms"),
  p95DurationMs: integer("p95_duration_ms"),
  // Model usage distribution (JSON: { modelId: count })
  modelUsageDistribution: text("model_usage_distribution").notNull().default("{}"),
  // Task type distribution (JSON: { taskType: count })
  taskTypeDistribution: text("task_type_distribution").notNull().default("{}"),
  // Error patterns (JSON: { errorType: count })
  errorDistribution: text("error_distribution").notNull().default("{}"),
  // Token economy
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  // Fallback/retry stats
  totalRetries: integer("total_retries").notNull().default(0),
  totalFallbacks: integer("total_fallbacks").notNull().default(0),
  // User satisfaction (from feedback, anonymized)
  positiveRatings: integer("positive_ratings").notNull().default(0),
  negativeRatings: integer("negative_ratings").notNull().default(0),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
export type AggregateAnalytic = typeof aggregateAnalytics.$inferSelect;
export type InsertAggregateAnalytic = typeof aggregateAnalytics.$inferInsert;
