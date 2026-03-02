-- 0015_god_tier_master.sql
-- Project Aegis: Forensic Hash Chain
CREATE TABLE IF NOT EXISTS forensic_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    actor_id TEXT REFERENCES users(id),
    prev_hash TEXT,
    entry_hash TEXT NOT NULL,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Visual-Twin: Fleet Media
CREATE TABLE IF NOT EXISTS fleet_media (
    id TEXT PRIMARY KEY,
    fleet_id TEXT NOT NULL REFERENCES fleet(id),
    r2_key TEXT NOT NULL,
    media_type TEXT CHECK(media_type IN ('condition', 'damage', 'document')),
    analyzed_data TEXT, -- AI analysis of damage
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quantum-Search: Vector Metadata (Helper)
CREATE TABLE IF NOT EXISTS vector_metadata (
    id TEXT PRIMARY KEY,
    fleet_id TEXT REFERENCES fleet(id),
    embedding_status TEXT DEFAULT 'pending'
);

-- Add encrypted flag to messages
ALTER TABLE private_messages ADD COLUMN is_encrypted INTEGER DEFAULT 1;
ALTER TABLE private_messages ADD COLUMN iv TEXT; -- Initialization vector for AES-GCM
