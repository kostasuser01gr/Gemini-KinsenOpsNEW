import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppBindings } from './common';
import { jsonError, jsonSuccess } from './common';
import { withAuth, requirePermission } from './middleware/auth';

async function callRoom(c: Context<AppBindings>, threadId: string, path: string, method = 'GET'): Promise<Response> {
  if (!c.env.THREAD_ROOM) {
    return jsonError(c.get('correlationId'), 503, 'NOT_READY', 'THREAD_ROOM Durable Object is not configured');
  }

  const id = c.env.THREAD_ROOM.idFromName(threadId);
  const stub = c.env.THREAD_ROOM.get(id);
  const request = new Request(`https://thread-room/${path}`, { method });
  const res = await stub.fetch(request);
  const data = await res.json<Record<string, unknown>>();
  return jsonSuccess(c.get('correlationId'), data);
}

export function registerPresenceRoutes(app: Hono<AppBindings>) {
  app.get('/api/v1/threads/:threadId/presence', withAuth, requirePermission('threads:read'), async (c) => {
    return callRoom(c, c.req.param('threadId'), 'presence');
  });

  app.post('/api/v1/threads/:threadId/presence/join', withAuth, requirePermission('threads:write'), async (c) => {
    return callRoom(c, c.req.param('threadId'), 'join', 'POST');
  });

  app.post('/api/v1/threads/:threadId/presence/leave', withAuth, requirePermission('threads:write'), async (c) => {
    return callRoom(c, c.req.param('threadId'), 'leave', 'POST');
  });
}
