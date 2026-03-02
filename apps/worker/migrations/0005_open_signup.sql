-- Migration number: 0005 	 2026-03-02T16:00:00.000Z

-- Users/Auth Schema Update
CREATE TABLE IF NOT EXISTS failed_logins (
  ip_address TEXT,
  email TEXT,
  attempts INTEGER DEFAULT 1,
  last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ip_address, email)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  tokens INTEGER,
  last_refill DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ensure base models are up to date
DROP TABLE IF EXISTS models;
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('DISABLED', 'HF_ROUTED_FREE', 'CF_WORKERS_AI_FREE')),
  model_id TEXT NOT NULL,
  base_url TEXT,
  enabled INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  license TEXT,
  free_policy TEXT DEFAULT 'FREE_ONLY',
  health_status TEXT DEFAULT 'unknown',
  cooloff_until DATETIME,
  last_ok_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recreate chat messages to add metadata JSON explicitly
DROP TABLE IF EXISTS chat_messages;
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recreate chat threads
DROP TABLE IF EXISTS chat_threads;
CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  folder TEXT DEFAULT 'inbox',
  pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ensure all hot path indexes
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated ON chat_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_documents_visibility ON kb_documents(visibility_role, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_models_enabled_priority ON models(enabled, priority);
