import type { ScheduledController } from '@cloudflare/workers-types';
import type { Env } from '../types';

async function runRetention(env: Env): Promise<void> {
  const threadDays = Number(env.THREAD_ARCHIVE_DAYS || 30);
  await env.DB
    .prepare(
      "DELETE FROM ai_messages WHERE created_at < datetime('now', ?)",
    )
    .bind(`-${threadDays} days`)
    .run();
}

async function runKpiRollups(env: Env): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO model_kpis_daily (date, workspace_id, model_id, provider_kind, calls, success_calls, fail_calls, latency_lt1s, latency_lt2s, latency_lt5s, latency_gte5s, fallback_used_calls)
       SELECT date('now'), workspace_id, used_model_id, provider_kind, COUNT(*),
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END),
       SUM(CASE WHEN latency_ms < 1000 THEN 1 ELSE 0 END),
       SUM(CASE WHEN latency_ms >= 1000 AND latency_ms < 2000 THEN 1 ELSE 0 END),
       SUM(CASE WHEN latency_ms >= 2000 AND latency_ms < 5000 THEN 1 ELSE 0 END),
       SUM(CASE WHEN latency_ms >= 5000 THEN 1 ELSE 0 END),
       SUM(CASE WHEN fallbacks_count > 0 THEN 1 ELSE 0 END)
       FROM model_call_events
       WHERE created_at >= datetime('now', '-1 day')
       GROUP BY workspace_id, used_model_id, provider_kind
       ON CONFLICT(date, model_id) DO UPDATE SET calls = calls + excluded.calls`,
    )
    .run();
}

async function runAuditCheckpoint(env: Env): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO schema_migration_policy (id, policy_name, baseline_migration, destructive_after_baseline, updated_at)
       VALUES (1, 'forward_only', '0016_forward_only_policy', 0, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    )
    .run();
}

export async function onScheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(runRetention(env));
  ctx.waitUntil(runKpiRollups(env));
  ctx.waitUntil(runAuditCheckpoint(env));

  if (controller.cron.includes('0 * * * *')) {
    // hourly checkpoint hook reserved for retry queues
    ctx.waitUntil(Promise.resolve());
  }
}
