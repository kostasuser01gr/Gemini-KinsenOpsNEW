-- Migration number: 0004 	 2026-03-02T15:00:00.000Z

-- Ensure all hot path indexes exist
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated ON chat_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kb_documents_visibility ON kb_documents(visibility_role, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, created_at);
CREATE INDEX IF NOT EXISTS idx_models_enabled_priority ON models(enabled, priority);

-- Add AI Neuron tracking for Workers AI free tier allocation
CREATE TABLE IF NOT EXISTS ai_usage_log (
  day TEXT PRIMARY KEY, -- YYYY-MM-DD
  neurons_used INTEGER DEFAULT 0
);

-- Add thread folders/tags support
ALTER TABLE chat_threads ADD COLUMN folder TEXT DEFAULT 'inbox';
ALTER TABLE chat_threads ADD COLUMN pinned INTEGER DEFAULT 0;
ALTER TABLE chat_threads ADD COLUMN archived INTEGER DEFAULT 0;
