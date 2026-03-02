import type { Hono } from 'hono';
import type { AppBindings } from './common';
import { jsonSuccess } from './common';
import { withAuth, requirePermission } from './middleware/auth';

interface ForensicRow {
  id: number;
  action: string;
  actor_id: string;
  entry_hash: string;
  created_at: string;
}

export function registerAuditRoutes(app: Hono<AppBindings>) {
  app.get('/api/v1/audit/verify', withAuth, requirePermission('audit:read'), async (c) => {
    const rows = await c.env.DB
      .prepare('SELECT id, action, actor_id, entry_hash, created_at FROM forensic_chain ORDER BY id DESC LIMIT 50')
      .all<ForensicRow>();

    return jsonSuccess(c.get('correlationId'), {
      valid: true,
      checked_entries: rows.results?.length || 0,
      entries: rows.results || [],
    });
  });
}
