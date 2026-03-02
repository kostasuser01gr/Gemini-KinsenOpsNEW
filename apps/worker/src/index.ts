import { Hono } from 'hono';
import type { ExportedHandler, ScheduledController } from '@cloudflare/workers-types';
import { registerAdminRoutes } from './modules/admin';
import { registerAuditRoutes } from './modules/audit';
import { registerChatRoutes } from './modules/chat';
import { withCorrelation, withCors, withStructuredLogs, type AppBindings } from './modules/common';
import { registerFleetRoutes } from './modules/fleet';
import { registerAuthRoutes } from './modules/middleware/auth';
import { registerMcpRoutes } from './modules/mcp';
import { registerPresenceRoutes } from './modules/presence';
import { onScheduled } from './modules/jobs';
import { ThreadRoom } from './durable/threadRoom';
import type { Env } from './types';

const app = new Hono<AppBindings>();

app.use('*', withCorrelation);
app.use('*', withCors);
app.use('*', withStructuredLogs);

registerAdminRoutes(app);
registerAuthRoutes(app);
registerChatRoutes(app);
registerFleetRoutes(app);
registerMcpRoutes(app);
registerAuditRoutes(app);
registerPresenceRoutes(app);

app.notFound((c) => {
  const payload = {
    code: 'INVALID_REQUEST',
    message: `Route not found: ${c.req.path}`,
    correlation_id: c.get('correlationId'),
  };
  return new Response(JSON.stringify(payload), {
    status: 404,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': c.get('correlationId'),
    },
  });
});

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    return onScheduled(controller, env, ctx);
  },
};

export default handler;
export { ThreadRoom };
