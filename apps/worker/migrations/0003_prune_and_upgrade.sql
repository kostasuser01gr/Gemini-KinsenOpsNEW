-- Migration number: 0003 	 2026-03-02T14:00:00.000Z

-- Prune pricing and booking tables
DROP TABLE IF EXISTS booking_events;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS pricing_rules;
DROP TABLE IF EXISTS daily_kpis;

-- Upgrade KB documents
DROP TABLE IF EXISTS kb_fts;
DROP TABLE IF EXISTS kb_documents;

CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  visibility_role TEXT NOT NULL DEFAULT 'agent',
  version INTEGER DEFAULT 1,
  effective_date TEXT, -- YYYY-MM-DD
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE kb_fts USING fts5(
  title,
  body_text,
  content='kb_documents',
  content_rowid='rowid'
);

-- Triggers for FTS
CREATE TRIGGER kb_ai AFTER INSERT ON kb_documents BEGIN
  INSERT INTO kb_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
END;
CREATE TRIGGER kb_ad AFTER DELETE ON kb_documents BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body_text) VALUES('delete', old.rowid, old.title, old.body_text);
END;
CREATE TRIGGER kb_au AFTER UPDATE ON kb_documents BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body_text) VALUES('delete', old.rowid, old.title, old.body_text);
  INSERT INTO kb_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
END;

-- Upgrade models table
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
  cooloff_until TEXT,
  last_ok_at TEXT,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Thread settings
CREATE TABLE thread_settings (
  thread_id TEXT PRIMARY KEY REFERENCES chat_threads(id) ON DELETE CASCADE,
  preferred_model_id TEXT REFERENCES models(id),
  folder TEXT DEFAULT 'inbox'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated ON chat_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_docs_visibility ON kb_documents(visibility_role, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_models_enabled_priority ON models(enabled, priority);
