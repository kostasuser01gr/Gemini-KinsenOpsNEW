-- 0013_master_init.sql
-- Fix for FTS5 only since other tables exist

CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
    title,
    body_text
);
