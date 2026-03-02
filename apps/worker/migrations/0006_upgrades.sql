-- Migration number: 0006 	 2026-03-02T18:00:00.000Z

-- Ensure Users table exists with proper schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Turnstile and Login Abuse Prevention
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

-- FREE-ONLY Model Router Schema
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
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  cooloff_until DATETIME,
  last_ok_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Base (SOP)
DROP TABLE IF EXISTS kb_fts;
DROP TABLE IF EXISTS kb_documents;
CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  visibility_role TEXT NOT NULL DEFAULT 'agent',
  version INTEGER DEFAULT 1,
  effective_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE kb_fts USING fts5(
  title,
  body_text,
  content='kb_documents',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS kb_ai AFTER INSERT ON kb_documents BEGIN
  INSERT INTO kb_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
END;
CREATE TRIGGER IF NOT EXISTS kb_ad AFTER DELETE ON kb_documents BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body_text) VALUES('delete', old.rowid, old.title, old.body_text);
END;
CREATE TRIGGER IF NOT EXISTS kb_au AFTER UPDATE ON kb_documents BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body_text) VALUES('delete', old.rowid, old.title, old.body_text);
  INSERT INTO kb_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
END;

-- Chat Threads & Collaboration
DROP TABLE IF EXISTS chat_threads;
CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  folder TEXT DEFAULT 'inbox',
  pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved')),
  assigned_to TEXT REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS chat_messages;
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'note')),
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS thread_settings (
  thread_id TEXT PRIMARY KEY REFERENCES chat_threads(id) ON DELETE CASCADE,
  preferred_model_id TEXT REFERENCES models(id)
);

-- Macros
DROP TABLE IF EXISTS macros;
CREATE TABLE macros (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT DEFAULT '[]',
  visibility_role TEXT NOT NULL DEFAULT 'agent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  correlation_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI Usage tracking for Free Tier
CREATE TABLE IF NOT EXISTS ai_usage_log (
  day TEXT PRIMARY KEY,
  neurons_used INTEGER DEFAULT 0
);

-- Hot path indexes
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated ON chat_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_documents_visibility ON kb_documents(visibility_role, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, created_at);
CREATE INDEX IF NOT EXISTS idx_models_enabled_priority ON models(enabled, priority);
