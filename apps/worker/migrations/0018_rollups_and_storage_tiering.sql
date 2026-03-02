-- 0018_rollups_and_storage_tiering.sql
-- Hot/cold data tiering and dashboard rollups.

CREATE TABLE IF NOT EXISTS chat_rollups_daily (
  workspace_id TEXT NOT NULL,
  day TEXT NOT NULL,
  messages_total INTEGER NOT NULL DEFAULT 0,
  user_messages INTEGER NOT NULL DEFAULT 0,
  assistant_messages INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, day)
);

CREATE TABLE IF NOT EXISTS cold_storage_exports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  exported_rows INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'parquet',
  compression TEXT NOT NULL DEFAULT 'zstd',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS retry_queue (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rollups_workspace_day
  ON chat_rollups_daily(workspace_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_retry_queue_next_attempt
  ON retry_queue(next_attempt_at ASC);

CREATE INDEX IF NOT EXISTS idx_cold_storage_workspace_created
  ON cold_storage_exports(workspace_id, created_at DESC);
