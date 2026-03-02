-- Migration number: 0010 	 2026-03-03T10:00:00.000Z

-- 1) Quota Governor Tracking
CREATE TABLE IF NOT EXISTS quota_usage (
  key TEXT PRIMARY KEY, -- e.g., "route:/api/chat/messages" or "user:u_123:model_calls"
  count INTEGER DEFAULT 0,
  limit_threshold INTEGER,
  reset_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2) Model Canary Rollout
ALTER TABLE models ADD COLUMN is_canary INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN canary_percentage INTEGER DEFAULT 0; -- 0-100
ALTER TABLE models ADD COLUMN baseline_success_rate REAL;

-- 3) Content Redaction / PII Reveal Audit
CREATE TABLE IF NOT EXISTS pii_reveal_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4) Passkey Labels and metadata
ALTER TABLE passkeys ADD COLUMN device_label TEXT;
ALTER TABLE passkeys ADD COLUMN last_used_at DATETIME;

-- 5) Versioning for "What's New"
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('version', '9.0.0');
