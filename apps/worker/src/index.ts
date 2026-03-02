import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, PERMISSIONS } from './types';
import { withAuth, withCorrelationId, requirePermission } from './middleware';
import { logAudit } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked, setRouterContext } from './modelRouter';
import { RetentionManager } from './retention';
import * as bcrypt from 'bcryptjs';

const { preflight, corsify } = cors({ origins: ['*'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], headers: ['*'] });
const router = Router<IRequest, [Env, ExecutionContext]>();

router.all('*', preflight);
router.all('*', withCorrelationId);

async function verifyTurnstile(token: string, secret?: string) {
  if (!secret) return true;
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: formData });
  return (await result.json() as any).success;
}

// --- AUTH ---
router.post('/api/auth/signup', async (req, env: Env) => {
  const { email, password, turnstile_token } = await req.json() as any;
  if (!email || !password || password.length < 8) return error(400, 'Invalid input');
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot check failed');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error(400, 'Exists');

  const id = 'u_' + Date.now();
  const hash = await bcrypt.hash(password, 10);
  const allowlist = (env.ADMIN_ALLOWLIST_EMAILS || '').split(',').map(e => e.trim());
  const role = allowlist.includes(email) ? 'admin' : 'agent';

  await env.DB.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').bind(id, email, hash, role).run();
  
  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, id).run();
  
  return json({ token: sessId, role });
});

router.post('/api/auth/login', async (req, env: Env) => {
  const { email, password, turnstile_token } = await req.json() as any;
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot check failed');

  const user = await env.DB.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').bind(email).first() as any;
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return error(401, 'Failed');

  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, user.id).run();
  
  return json({ token: sessId, role: user.role });
});

// --- USER PREFS ---
router.get('/api/me/preferences', withAuth, async (req, env: Env) => {
  const prefs = await env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(req.userId).first();
  return json(prefs || { language: 'en', theme: 'light' });
});

router.patch('/api/me/preferences', withAuth, async (req, env: Env) => {
  const data = await req.json() as any;
  await env.DB.prepare(`
    INSERT INTO user_preferences (user_id, language, theme, compact_mode, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      language = COALESCE(excluded.language, language),
      theme = COALESCE(excluded.theme, theme),
      compact_mode = COALESCE(excluded.compact_mode, compact_mode),
      updated_at = CURRENT_TIMESTAMP
  `).bind(req.userId, data.language, data.theme, data.compact_mode ? 1 : 0).run();
  return json({ success: true });
});

// --- KB SEARCH ---
router.get('/api/kb/search', withAuth, async (req, env: Env) => {
  const q = req.query.q as string;
  if (!q) return json([]);
  return await getCached(req as any, async () => {
    const { results } = await env.DB.prepare(`
      SELECT title, snippet(kb_fts, -1, '**', '**', '...', 64) as snippet, body_text 
      FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid
      WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') LIMIT 10
    `).bind(q.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole).all();
    return json(results) as any;
  });
});

// --- ADMIN: EXPORT / IMPORT ---
router.get('/api/admin/export', withAuth, requirePermission('admin:export'), async (req, env: Env) => {
  const [kb, macros, models, users] = await Promise.all([
    env.DB.prepare('SELECT * FROM kb_documents').all(),
    env.DB.prepare('SELECT * FROM macros').all(),
    env.DB.prepare('SELECT id, display_name, provider_kind, model_id, license, enabled, priority FROM models').all(),
    env.DB.prepare('SELECT email, role, created_at FROM users').all(),
  ]);
  return json({ kb: kb.results, macros: macros.results, models: models.results, users: users.results, exported_at: new Date().toISOString() });
});

router.post('/api/admin/import', withAuth, requirePermission('admin:import'), async (req, env: Env) => {
  const bundle = await req.json() as any;
  // Simplified merging logic
  if (bundle.kb) {
    for (const doc of bundle.kb) {
      await env.DB.prepare('INSERT OR REPLACE INTO kb_documents (id, title, body_text, visibility_role) VALUES (?, ?, ?, ?)').bind(doc.id, doc.title, doc.body_text, doc.visibility_role).run();
    }
  }
  return json({ success: true });
});

// --- ADMIN: RETENTION ---
router.post('/api/admin/retention/run', withAuth, requirePermission('admin:retention'), async (req, env: Env) => {
  const res = await RetentionManager.run(env);
  await logAudit(env, req.userId, 'run_retention', 'system', null, res, req.correlationId);
  return json(res);
});

// --- ADMIN: MODEL KPIs ---
router.get('/api/admin/models/kpis', withAuth, requirePermission('models:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM model_kpis_daily ORDER BY date DESC LIMIT 30').all();
  return json(results);
});

// --- CHAT ---
router.post('/api/chat/messages', withAuth, async (req, env: Env, ctx: ExecutionContext) => {
  const { thread_id, content } = await req.json() as any;
  setRouterContext(ctx);
  
  const msgId = 'msg_' + Date.now();
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind(msgId, thread_id, 'user', content).run();
  
  const kbRaw = await env.DB.prepare(`
    SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid
    WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') LIMIT 3
  `).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole).all();
  const kbContext = kbRaw.results as any[];

  const aiRes = await routeChat(env, [{ role: 'system', content: `Context:\n` + kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n') }, { role: 'user', content }], thread_id);
  
  let reply = aiRes.content;
  if (!reply) reply = kbContext.length > 0 ? `Policies:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 200)}...`).join('\n\n') : "No info.";

  const assistantMsgId = 'msg_' + (Date.now() + 1);
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)').bind(assistantMsgId, thread_id, 'assistant', reply, JSON.stringify({ model: aiRes.model_id })).run();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply, toolData: { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider } })}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
});

router.all('*', () => error(404));

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
    router.handle(req, env, ctx).then(corsify).catch(e => corsify(error(500, e.message))),
  scheduled: (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(RetentionManager.run(env));
  }
};
