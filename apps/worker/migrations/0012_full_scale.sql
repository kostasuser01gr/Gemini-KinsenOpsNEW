-- Migration number: 0012 	 2026-03-03T18:00:00.000Z

-- 1) Device Trust
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_user_ws ON devices(user_id, workspace_id);

-- 2) Approval Workflows (Drafts)
CREATE TABLE IF NOT EXISTS kb_drafts (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES kb_documents(id), -- NULL if new
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  visibility_role TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published')),
  review_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS macro_drafts (
  id TEXT PRIMARY KEY,
  macro_id TEXT REFERENCES macros(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT,
  visibility_role TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published')),
  review_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3) Saved Views
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4) Activity Feed
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  actor_user_id TEXT REFERENCES users(id),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_ws_ts ON activity_events(workspace_id, ts);

-- 5) Audit Hash Chain fields
ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT;

-- 6) Quota Governor State
CREATE TABLE IF NOT EXISTS quota_config (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  mode TEXT DEFAULT 'normal' CHECK (mode IN ('normal', 'degraded', 'read_only')),
  custom_limits_json TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7) Feature Flags / Workspace Config
ALTER TABLE workspaces ADD COLUMN device_trust_mode TEXT DEFAULT 'open' CHECK (device_trust_mode IN ('open', 'approve_new_device'));
ALTER TABLE workspaces ADD COLUMN hmac_secret TEXT; -- For signed exports

-- 8) Step-up Auth timestamp in sessions
ALTER TABLE sessions ADD COLUMN last_step_up_at DATETIME;
