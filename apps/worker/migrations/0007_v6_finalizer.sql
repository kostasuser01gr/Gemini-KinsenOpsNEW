-- Migration number: 0007 	 2026-03-02T20:00:00.000Z

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language TEXT DEFAULT 'en',
  theme TEXT DEFAULT 'light',
  compact_mode INTEGER DEFAULT 0,
  font_scale REAL DEFAULT 1.0,
  pwa_offline_threads INTEGER DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Data Retention: Archives
CREATE TABLE IF NOT EXISTS archived_chat_threads (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  tags_json TEXT,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  summary_text TEXT
);

CREATE TABLE IF NOT EXISTS archived_chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES archived_chat_threads(thread_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS audit_rollups_daily (
  date TEXT, -- YYYY-MM-DD
  action TEXT,
  entity TEXT,
  count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, action, entity)
);

CREATE TABLE IF NOT EXISTS retention_state (
  key TEXT PRIMARY KEY,
  last_cursor TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Model Performance KPIs
CREATE TABLE IF NOT EXISTS model_call_events (
  id TEXT PRIMARY KEY,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  thread_id TEXT,
  preferred_model_id TEXT,
  used_model_id TEXT,
  provider_kind TEXT,
  success INTEGER,
  latency_ms INTEGER,
  error_code TEXT,
  fallbacks_count INTEGER,
  tokens_out_estimate INTEGER,
  strict_free_mode INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_kpis_daily (
  date TEXT, -- YYYY-MM-DD
  model_id TEXT,
  provider_kind TEXT,
  calls INTEGER DEFAULT 0,
  success_calls INTEGER DEFAULT 0,
  fail_calls INTEGER DEFAULT 0,
  success_rate REAL,
  latency_lt1s INTEGER DEFAULT 0,
  latency_lt2s INTEGER DEFAULT 0,
  latency_lt5s INTEGER DEFAULT 0,
  latency_gte5s INTEGER DEFAULT 0,
  fallback_used_calls INTEGER DEFAULT 0,
  fallback_rate REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, model_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_model_call_events_ts ON model_call_events(ts);
CREATE INDEX IF NOT EXISTS idx_archived_threads_user ON archived_chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prefs_updated ON user_preferences(updated_at);
