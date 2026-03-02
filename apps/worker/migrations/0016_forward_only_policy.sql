-- 0016_forward_only_policy.sql
-- Forward-only migration policy metadata.
-- Historical migration 0014 remains for legacy environments,
-- but all migrations after this point must be non-destructive.

CREATE TABLE IF NOT EXISTS schema_migration_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  policy_name TEXT NOT NULL,
  baseline_migration TEXT NOT NULL,
  destructive_after_baseline INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migration_policy (id, policy_name, baseline_migration, destructive_after_baseline)
VALUES (1, 'forward_only', '0016_forward_only_policy', 0)
ON CONFLICT(id) DO UPDATE SET
  policy_name = excluded.policy_name,
  baseline_migration = excluded.baseline_migration,
  destructive_after_baseline = excluded.destructive_after_baseline,
  updated_at = CURRENT_TIMESTAMP;
