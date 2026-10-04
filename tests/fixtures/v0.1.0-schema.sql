-- Historical published schema: v0.1.0, server/storage.ts

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
