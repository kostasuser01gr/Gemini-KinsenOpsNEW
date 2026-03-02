-- Migration number: 0002 	 2026-03-02T12:00:00.000Z

DROP TABLE IF EXISTS models;

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('disabled', 'hf_routed_free', 'openai_compat_nonbilling')),
  model_id TEXT NOT NULL,
  base_url TEXT,
  api_key_secret_name TEXT,
  license TEXT,
  free_policy TEXT NOT NULL DEFAULT 'FREE_ONLY',
  priority INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 0,
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  last_ok_at DATETIME,
  cooloff_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_models_enabled_priority ON models(enabled, priority);
CREATE INDEX idx_kb_documents_visibility ON kb_documents(visibility_role, updated_at);
