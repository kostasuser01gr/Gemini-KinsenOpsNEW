-- Migration number: 0011 	 2026-03-03T14:00:00.000Z

-- 1) E2EE Vault Schema
CREATE TABLE IF NOT EXISTS vault_keys (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_dek_by_passphrase TEXT NOT NULL,     -- base64 ciphertext
  kdf_params_json TEXT NOT NULL,              -- salt, iterations, algo
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS vault_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_enc TEXT NOT NULL,
  username_enc TEXT,
  password_enc TEXT,
  url_enc TEXT,
  notes_enc TEXT,
  tags_enc TEXT,
  iv_json TEXT NOT NULL,                      -- per-field IVs or single IV
  version INTEGER DEFAULT 1,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vault_items_owner ON vault_items(workspace_id, owner_user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_vault_items_deleted ON vault_items(workspace_id, deleted_at);

-- 2) Device Management
CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  user_agent TEXT,
  last_ip TEXT,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);

-- 3) Permissions update
-- Add permissions for vault
-- (Handled in code via PERMISSIONS matrix)
