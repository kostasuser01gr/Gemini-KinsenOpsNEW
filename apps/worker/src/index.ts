import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, PERMISSIONS, Role } from './types';
import { withAuthAndWorkspace, withCorrelationId, requirePermission } from './middleware';
import { logAudit } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked } from './modelRouter';
import { RetentionManager } from './retention';
import { QuotaGovernor, PIIGuard } from './quotaGovernor';
import { checkCompliance } from './billingGuard';

const { preflight, corsify } = cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['*'] });
const router = Router<any>();

router.get('/health', () => new Response('OK'));
router.get('/api/meta/version', () => json({ version: '9.0.0' }));

router.all('*', preflight);
router.all('*', withCorrelationId);

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token: string, secret?: string) {
  if (!secret) return true;
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: formData });
  return (await result.json() as any).success;
}

// --- AUTH ---
router.post('/api/auth/signup', async (req: any, env: Env) => {
  const { email, password, turnstile_token } = await req.json() as any;
  if (!email || !password || password.length < 8) return error(400, 'Invalid input');
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot check failed');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error(400, 'Exists');
  const id = 'u_' + Date.now();
  const hash = await hashPassword(password);
  const allowlist = (env.ADMIN_ALLOWLIST_EMAILS || '').split(',').map((e: string) => e.trim());
  const role = allowlist.includes(email) ? 'admin' : 'agent';
  await env.DB.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').bind(id, email, hash, role).run();
  await env.DB.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role_in_workspace) VALUES (?, ?, ?)').bind('ws_default_public', id, role).run();
  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, id).run();
  return json({ token: sessId, role, workspace_id: 'ws_default_public' });
});

router.post('/api/auth/login', async (req: any, env: Env) => {
  const { email, password, turnstile_token } = await req.json() as any;
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot check failed');
  const user = await env.DB.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').bind(email).first() as any;
  if (!user || ((await hashPassword(password)) !== user.password_hash)) return error(401, 'Failed');
  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, user.id).run();
  return json({ token: sessId, role: user.role, workspace_id: 'ws_default_public' });
});

router.get('/api/me/preferences', withAuthAndWorkspace, async (req: any, env: Env) => {
  const prefs = await env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(req.userId).first();
  return json(prefs || { language: 'en', theme: 'light' });
});

router.patch('/api/me/preferences', withAuthAndWorkspace, async (req: any, env: Env) => {
  const data = await req.json() as any;
  await env.DB.prepare(`INSERT INTO user_preferences (user_id, language, theme, compact_mode, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET language = COALESCE(excluded.language, language), theme = COALESCE(excluded.theme, theme), compact_mode = COALESCE(excluded.compact_mode, compact_mode), updated_at = CURRENT_TIMESTAMP`).bind(req.userId, data.language, data.theme, data.compact_mode ? 1 : 0).run();
  return json({ success: true });
});

router.get('/api/kb/search', withAuthAndWorkspace, async (req: any, env: Env) => {
  const q = req.query.q as string;
  if (!q) return json([]);
  return await getCached(req as any, async () => {
    const { results } = await env.DB.prepare(`SELECT title, snippet(kb_fts, -1, '**', '**', '...', 64) as snippet, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') AND workspace_id = ? LIMIT 10`).bind(q.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole, req.workspaceId).all();
    return json(results) as any;
  });
});

router.get('/api/admin/export', withAuthAndWorkspace, requirePermission('admin:export'), async (req: any, env: Env) => {
  const [kb, macros, models, users] = await Promise.all([env.DB.prepare('SELECT * FROM kb_documents WHERE workspace_id = ?').bind(req.workspaceId).all(), env.DB.prepare('SELECT * FROM macros WHERE workspace_id = ?').bind(req.workspaceId).all(), env.DB.prepare('SELECT id, display_name, provider_kind, model_id, license, enabled, priority FROM models WHERE workspace_id = ?').bind(req.workspaceId).all(), env.DB.prepare('SELECT users.email, workspace_members.role_in_workspace as role, users.created_at FROM users JOIN workspace_members ON users.id = workspace_members.user_id WHERE workspace_members.workspace_id = ?').bind(req.workspaceId).all()]);
  return json({ kb: kb.results, macros: macros.results, models: models.results, users: users.results, exported_at: new Date().toISOString() });
});

router.post('/api/admin/import', withAuthAndWorkspace, requirePermission('admin:import'), async (req: any, env: Env) => {
  const bundle = await req.json() as any;
  if (bundle.kb) { for (const doc of bundle.kb) { await env.DB.prepare('INSERT OR REPLACE INTO kb_documents (id, workspace_id, title, body_text, visibility_role) VALUES (?, ?, ?, ?, ?)').bind(doc.id, req.workspaceId, doc.title, doc.body_text, doc.visibility_role).run(); } }
  return json({ success: true });
});

router.post('/api/admin/retention/run', withAuthAndWorkspace, requirePermission('admin:retention'), async (req: any, env: Env) => {
  const res = await RetentionManager.run(env);
  await logAudit(env, req.userId!, 'run_retention', 'system', null, res, req.correlationId!, req.workspaceId);
  return json(res);
});

router.get('/api/admin/models/kpis', withAuthAndWorkspace, requirePermission('models:read'), async (req: any, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM model_kpis_daily WHERE workspace_id = ? ORDER BY date DESC LIMIT 30').bind(req.workspaceId).all();
  return json(results);
});

router.get('/api/admin/compliance/status', withAuthAndWorkspace, requirePermission('models:read'), async (req: any, env: Env) => {
  return json(checkCompliance(env));
});

router.get('/api/admin/quota/status', withAuthAndWorkspace, requirePermission('models:read'), async (req: any, env: Env) => {
  return json(await QuotaGovernor.getStatus(env, req.workspaceId));
});

router.patch('/api/admin/models/:id/canary', withAuthAndWorkspace, requirePermission('models:write'), async (req: any, env: Env) => {
  const { is_canary, canary_percentage } = await req.json() as any;
  await env.DB.prepare('UPDATE models SET is_canary = ?, canary_percentage = ? WHERE id = ?').bind(is_canary ? 1 : 0, canary_percentage || 0, req.params.id).run();
  await logAudit(env, req.userId, 'update_canary', 'model', req.params.id, { is_canary, canary_percentage }, req.correlationId, req.workspaceId);
  return json({ success: true });
});

router.post('/api/chat/messages', withAuthAndWorkspace, async (req: any, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind('msg_' + Date.now(), thread_id, 'user', content).run();
  const kbRaw = await env.DB.prepare(`SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') AND workspace_id = ? LIMIT 3`).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole, req.workspaceId).all();
  const kbContext = kbRaw.results as any[];
  const aiRes = await routeChat(env, req.workspaceId!, [{ role: 'system', content: `Context:\n` + kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n') }, { role: 'user', content }], thread_id);
  let reply = aiRes.content;
  if (!reply) reply = kbContext.length > 0 ? `Policies:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 200)}...`).join('\n\n') : "No info.";
  const assistantMsgId = 'msg_' + (Date.now() + 1);
  const redactedReply = PIIGuard.redact(reply, (PERMISSIONS[req.userRole as Role] || []).includes('users:read' as any));
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)').bind(assistantMsgId, thread_id, 'assistant', redactedReply, JSON.stringify({ model: aiRes.model_id, original: reply })).run();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: redactedReply, toolData: { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider, correlationId: req.correlationId } })}\n\n`)); controller.enqueue(encoder.encode(`data: [DONE]\n\n`)); controller.close(); } });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
});

router.post('/api/chat/messages/:id/reveal', withAuthAndWorkspace, async (req: any, env: Env) => {
  const msg = await env.DB.prepare('SELECT content, metadata_json, thread_id FROM chat_messages WHERE id = ?').bind(req.params.id).first() as any;
  if (!msg) return error(404);
  const meta = JSON.parse(msg.metadata_json);
  await logAudit(env, req.userId, 'pii_reveal', 'message', req.params.id, { thread_id: msg.thread_id }, req.correlationId, req.workspaceId);
  return json({ original: meta.original || msg.content });
});

router.all('*', () => error(404));

export default {
  fetch: async (req: Request, env: Env, ctx: ExecutionContext) => {
    try {
      const response = await router.handle(req, env, ctx);
      return corsify(response || error(404));
    } catch (e: any) {
      console.error('WORKER_CRASH:', e.message, e.stack);
      return new Response(e.message || 'Error', { status: 500 });
    }
  },
  scheduled: (event: any, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(RetentionManager.run(env)); }
};
