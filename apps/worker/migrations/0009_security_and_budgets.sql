-- Migration number: 0009 	 2026-03-02T23:00:00.000Z

-- IP Denylist for security hardening
CREATE TABLE IF NOT EXISTS ip_denylist (
  ip_address TEXT PRIMARY KEY,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Passkeys / WebAuthn (Optional)
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  device_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Model Budgets
ALTER TABLE users ADD COLUMN daily_model_budget INTEGER DEFAULT 100;
ALTER TABLE workspaces ADD COLUMN daily_model_budget INTEGER DEFAULT 5000;

-- Telemetry for budgets
CREATE TABLE IF NOT EXISTS daily_usage_stats (
  day TEXT, -- YYYY-MM-DD
  workspace_id TEXT,
  user_id TEXT,
  model_calls INTEGER DEFAULT 0,
  PRIMARY KEY (day, workspace_id, user_id)
);
