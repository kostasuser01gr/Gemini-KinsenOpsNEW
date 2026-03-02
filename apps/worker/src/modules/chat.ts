import type { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { routeChat, checkRateLimit } from '../modelRouter';
import type { ChatMessageDTO } from '../types';
import type { AppBindings } from './common';
import { jsonError, jsonSuccess } from './common';
import { withAuth, requirePermission } from './middleware/auth';
import { withIdempotency } from './middleware/idempotency';

interface FleetCountRow {
  c: number;
}

const chatMessageSchema = z.object({
  thread_id: z.string().min(1),
  content: z.string().min(1).max(4000),
  preferred_model_id: z.string().optional(),
});

const kbSearchSchema = z.object({
  q: z.string().min(1).max(128),
  limit: z.coerce.number().min(1).max(50).optional(),
});

async function handleChatMessage(c: Context<AppBindings>) {
  const parsed = chatMessageSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid chat payload', {
      issues: parsed.error.issues,
    });
  }

  const blocked = !(await checkRateLimit(c.env, c.get('user').user_id));
  if (blocked) {
    return jsonError(c.get('correlationId'), 429, 'RATE_LIMITED', 'Too many requests', undefined, 60);
  }

  const { thread_id, content, preferred_model_id } = parsed.data;

  const userMessage: ChatMessageDTO = {
    id: crypto.randomUUID(),
    thread_id,
    role: 'user',
    content,
    created_at: new Date().toISOString(),
  };

  const routing = await routeChat(
    c.env,
    c.get('user').workspace_id,
    [{ role: 'user', content }],
    thread_id,
    preferred_model_id,
  );

  const assistantMessage: ChatMessageDTO = {
    id: crypto.randomUUID(),
    thread_id,
    role: 'assistant',
    content: routing.content || 'Unable to answer at this time.',
    created_at: new Date().toISOString(),
    model_id: routing.model_id,
  };

  try {
    await c.env.DB
      .prepare('INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userMessage.id, userMessage.thread_id, userMessage.role, userMessage.content, userMessage.created_at)
      .run();

    await c.env.DB
      .prepare('INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(
        assistantMessage.id,
        assistantMessage.thread_id,
        assistantMessage.role,
        assistantMessage.content,
        assistantMessage.created_at,
      )
      .run();
  } catch {
    // tolerate schema variants
  }

  return jsonSuccess(c.get('correlationId'), {
    response: assistantMessage.content,
    model_id: assistantMessage.model_id,
    provider: routing.provider,
    latency_ms: routing.latency_ms,
    fallbacks: routing.fallbacks,
    user_message: userMessage,
    assistant_message: assistantMessage,
  });
}

async function handleKbSearch(c: Context<AppBindings>) {
  const parsed = kbSearchSchema.safeParse({
    q: c.req.query('q') || '',
    limit: c.req.query('limit') || 20,
  });

  if (!parsed.success) {
    return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid search query', {
      issues: parsed.error.issues,
    });
  }

  const { q, limit } = parsed.data;

  try {
    const rows = await c.env.DB
      .prepare(
        'SELECT id, title, substr(body_text, 1, 220) as snippet FROM kb_documents WHERE title LIKE ? OR body_text LIKE ? LIMIT ?',
      )
      .bind(`%${q}%`, `%${q}%`, limit || 20)
      .all<{ id: string; title: string; snippet: string }>();

    return jsonSuccess(c.get('correlationId'), {
      results: rows.results || [],
    });
  } catch {
    return jsonSuccess(c.get('correlationId'), { results: [] });
  }
}

export function registerChatRoutes(app: Hono<AppBindings>) {
  app.post(
    '/api/v1/chat/message',
    withAuth,
    requirePermission('threads:write'),
    withIdempotency('chat_message'),
    handleChatMessage,
  );

  app.post('/api/chat/message', withAuth, requirePermission('threads:write'), handleChatMessage);

  app.post(
    '/api/v1/chat/stream',
    withAuth,
    requirePermission('threads:write'),
    withIdempotency('chat_stream'),
    async (c) => {
      const parsed = chatMessageSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid chat payload', {
          issues: parsed.error.issues,
        });
      }

      const blocked = !(await checkRateLimit(c.env, c.get('user').user_id));
      if (blocked) {
        return jsonError(c.get('correlationId'), 429, 'RATE_LIMITED', 'Too many requests', undefined, 60);
      }

      const { thread_id, content, preferred_model_id } = parsed.data;
      const routing = await routeChat(
        c.env,
        c.get('user').workspace_id,
        [{ role: 'user', content }],
        thread_id,
        preferred_model_id,
      );

      try {
        await c.env.DB
          .prepare('INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), thread_id, 'user', content, new Date().toISOString())
          .run();

        await c.env.DB
          .prepare('INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), thread_id, 'assistant', routing.content, new Date().toISOString())
          .run();
      } catch {
        // tolerate schema variants
      }

      return streamSSE(c, async (stream) => {
        const chunks = routing.content.split(/\s+/);
        for (let i = 0; i < chunks.length; i += 1) {
          await stream.writeSSE({
            event: 'token',
            data: JSON.stringify({ token: chunks[i], index: i }),
          });
          await stream.sleep(15);
        }

        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({
            model_id: routing.model_id,
            provider: routing.provider,
            latency_ms: routing.latency_ms,
            fallbacks: routing.fallbacks,
          }),
        });
      });
    },
  );
  app.post('/api/chat/stream', withAuth, requirePermission('threads:write'), async (c) => {
    return app.fetch(
      new Request(new URL('/api/v1/chat/stream', c.req.url), {
        method: 'POST',
        headers: c.req.raw.headers,
        body: c.req.raw.body,
      }),
      c.env,
      c.executionCtx,
    );
  });

  app.get('/api/v1/kb/search', withAuth, requirePermission('kb:read'), handleKbSearch);
  app.get('/api/kb/search', withAuth, requirePermission('kb:read'), handleKbSearch);

  const pulseHandler = async (c: Context<AppBindings>) => {
    return streamSSE(c, async (stream) => {
      const signal = c.req.raw.signal;

      while (!signal.aborted) {
        const stats = await c.env.DB
          .prepare('SELECT COUNT(*) as c FROM fleet WHERE status = "Available"')
          .first<FleetCountRow>();
        await stream.writeSSE({
          data: JSON.stringify({ available_cars: stats?.c || 0, ts: Date.now() }),
          event: 'pulse',
          id: Date.now().toString(),
        });
        await stream.sleep(5000);
      }
    });
  };

  app.get('/api/v1/sync/pulse', pulseHandler);
  app.get('/api/sync/pulse', pulseHandler);
}
