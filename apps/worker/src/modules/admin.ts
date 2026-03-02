import type { Hono } from 'hono';
import type { Context } from 'hono';
import { checkCompliance } from '../billingGuard';
import type { AppBindings } from './common';
import { jsonError, jsonSuccess, serviceSloStatus } from './common';

interface FleetCountRow {
  c: number;
}

export function registerAdminRoutes(app: Hono<AppBindings>) {
  app.get('/healthz', (c) => jsonSuccess(c.get('correlationId'), { status: 'ok', ts: new Date().toISOString() }));

  app.get('/readyz', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').first();
      return jsonSuccess(c.get('correlationId'), { status: 'ready', ts: new Date().toISOString() });
    } catch {
      return jsonError(c.get('correlationId'), 503, 'NOT_READY', 'Database not reachable', undefined, 5);
    }
  });

  const complianceHandler = (c: Context<AppBindings>) => {
    const report = checkCompliance(c.env);
    return jsonSuccess(c.get('correlationId'), {
      strict_free_mode: report.strictFreeMode,
      status: report.status,
      allowed_providers: report.allowedProviders,
      blocked_secrets: report.blockedSecrets,
      reasons: report.reasons,
    });
  };

  app.get('/api/compliance', complianceHandler);
  app.get('/api/v1/compliance', complianceHandler);

  app.get('/api/v1/slo/status', async (c) => {
    const stats = await c.env.DB.prepare('SELECT COUNT(*) as c FROM fleet').first<FleetCountRow>();
    return jsonSuccess(c.get('correlationId'), {
      services: serviceSloStatus('ops-api'),
      fleet_count: stats?.c || 0,
    });
  });
}
