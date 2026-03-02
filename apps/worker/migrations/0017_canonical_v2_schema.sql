-- 0017_canonical_v2_schema.sql
-- Canonical workspace-scoped schema and compatibility views.

CREATE TABLE IF NOT EXISTS users_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default_public',
  email TEXT,
  name TEXT,
  password_hash TEXT,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin', 'manager', 'agent', 'staff')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users_v2(id),
  step_up_until DATETIME,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_threads_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES chat_threads_v2(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_health (
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('healthy', 'degraded', 'cooloff', 'disabled')),
  reason TEXT NOT NULL,
  until_ts DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, model_id)
);

CREATE TABLE IF NOT EXISTS model_policies (
  workspace_id TEXT PRIMARY KEY,
  preferred_models TEXT,
  max_fallback_depth INTEGER NOT NULL DEFAULT 3,
  max_latency_ms INTEGER NOT NULL DEFAULT 12000,
  daily_token_budget INTEGER NOT NULL DEFAULT 500000,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_daily_spend (
  workspace_id TEXT NOT NULL,
  day TEXT NOT NULL,
  spent_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, day)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing', 'done', 'replayed')),
  response_hash TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key, scope, principal_id)
);

CREATE TABLE IF NOT EXISTS archive_manifest (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  range_start DATETIME NOT NULL,
  range_end DATETIME NOT NULL,
  r2_key TEXT NOT NULL,
  codec TEXT NOT NULL DEFAULT 'jsonl+gzip',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_threads_v2_workspace_updated
  ON chat_threads_v2(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_v2_workspace_status
  ON chat_threads_v2(workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_v2_workspace_thread_created
  ON chat_messages_v2(workspace_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_v2_workspace_created
  ON chat_messages_v2(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_v2_workspace_user
  ON sessions_v2(workspace_id, user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_archive_manifest_workspace_table
  ON archive_manifest(workspace_id, table_name, created_at DESC);

CREATE VIEW IF NOT EXISTS compat_users AS
  SELECT id,
         COALESCE(email, name) AS identity,
         role,
         workspace_id,
         created_at,
         updated_at
  FROM users_v2;

CREATE VIEW IF NOT EXISTS compat_threads AS
  SELECT id,
         workspace_id,
         user_id,
         title,
         status,
         created_at,
         updated_at
  FROM chat_threads_v2;

CREATE VIEW IF NOT EXISTS compat_messages AS
  SELECT id,
         workspace_id,
         thread_id,
         role,
         content,
         model_id,
         created_at
  FROM chat_messages_v2;
