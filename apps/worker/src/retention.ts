import { Env } from './types';

export class RetentionManager {
  static async run(env: Env) {
    const threadDays = parseInt(env.THREAD_ARCHIVE_DAYS || '30');
    const auditDays = parseInt(env.AUDIT_ARCHIVE_DAYS || '30');

    // 1. Archive old threads
    const threadThreshold = new Date(Date.now() - threadDays * 24 * 60 * 60 * 1000).toISOString();
    
    // Process in batches of 50 to stay within CPU limits
    interface OldThreadRow {
      id: string;
      workspace_id: string;
      user_id: string;
      title: string;
    }

    const { results: oldThreads } = await env.DB.prepare(`
      SELECT id, workspace_id, user_id, title, folder FROM chat_threads 
      WHERE updated_at < ? OR archived = 1
      LIMIT 50
    `).bind(threadThreshold).all<OldThreadRow>();

    for (const thread of oldThreads as OldThreadRow[]) {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO archived_chat_threads (thread_id, workspace_id, user_id, title, archived_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).bind(thread.id, thread.workspace_id, thread.user_id, thread.title),
        env.DB.prepare(`INSERT INTO archived_chat_messages (id, thread_id, role, content, created_at) SELECT id, thread_id, role, content, created_at FROM chat_messages WHERE thread_id = ?`).bind(thread.id),
        env.DB.prepare(`DELETE FROM chat_threads WHERE id = ?`).bind(thread.id)
      ]);
    }

    // 2. Audit Rollups (Compaction)
    const auditThreshold = new Date(Date.now() - auditDays * 24 * 60 * 60 * 1000).toISOString();

    // Rollup yesterday's logs that aren't rolled up yet
    interface AuditRollupRow {
      log_date: string;
      workspace_id: string;
      action: string;
      entity: string;
      cnt: number;
    }

    const { results: rollups } = await env.DB.prepare(`
      SELECT date(created_at) as log_date, workspace_id, action, entity, COUNT(*) as cnt
      FROM audit_logs
      WHERE created_at < ?
      GROUP BY log_date, workspace_id, action, entity
      LIMIT 100
    `).bind(auditThreshold).all<AuditRollupRow>();

    for (const r of rollups as AuditRollupRow[]) {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO audit_rollups_daily (date, workspace_id, action, entity, count) VALUES (?, ?, ?, ?, ?) ON CONFLICT(date, action, entity) DO UPDATE SET count = count + excluded.count`).bind(r.log_date, r.workspace_id, r.action, r.entity, r.cnt),
        env.DB.prepare(`DELETE FROM audit_logs WHERE date(created_at) = ? AND action = ? AND entity = ?`).bind(r.log_date, r.action, r.entity)
      ]);
    }

    return { archivedThreads: oldThreads.length, rollupsProcessed: rollups.length };
  }
}
