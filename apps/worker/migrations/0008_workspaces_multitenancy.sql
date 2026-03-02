-- Migration number: 0008 	 2026-03-02T22:00:00.000Z

-- A) WORKSPACES (Multi-tenancy)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_workspace TEXT NOT NULL DEFAULT 'agent' CHECK (role_in_workspace IN ('admin', 'manager', 'agent')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  expires_at DATETIME,
  max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Public Workspace if not exists
INSERT OR IGNORE INTO workspaces (id, name, visibility) VALUES ('ws_default_public', 'Default Public Workspace', 'public');

-- Upgrade existing users to default workspace
INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role_in_workspace)
SELECT 'ws_default_public', id, role FROM users;

-- B) Update existing tables with workspace_id
-- We add the column and set it to default, then we would need to enforce NOT NULL in a real schema rebuild, 
-- but for SQLite alter table we allow nulls initially then update.
ALTER TABLE kb_documents ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public' REFERENCES workspaces(id);
ALTER TABLE chat_threads ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public' REFERENCES workspaces(id);
ALTER TABLE macros ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public' REFERENCES workspaces(id);
ALTER TABLE audit_logs ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public' REFERENCES workspaces(id);
ALTER TABLE models ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public' REFERENCES workspaces(id);
ALTER TABLE user_preferences ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public' REFERENCES workspaces(id);

-- C) Update Archived/Analytics tables
ALTER TABLE archived_chat_threads ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public';
ALTER TABLE audit_rollups_daily ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public';
ALTER TABLE model_call_events ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public';
ALTER TABLE model_kpis_daily ADD COLUMN workspace_id TEXT DEFAULT 'ws_default_public';

-- D) Indexes for workspace-scoped queries
CREATE INDEX IF NOT EXISTS idx_chat_threads_ws_user_updated ON chat_threads(workspace_id, user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_kb_documents_ws_updated ON kb_documents(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ws_created ON audit_logs(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_models_ws_enabled_priority ON models(workspace_id, enabled, priority);
