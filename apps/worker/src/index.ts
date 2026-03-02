import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, Action, PERMISSIONS } from './types';
import { withAuth, withCorrelationId, requirePermission, withRateLimit } from './middleware';
import { logAudit } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked } from './modelRouter';

const { preflight, corsify } = cors({ origins: ['*'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], headers: ['*'] });
const router = Router<IRequest, [Env, ExecutionContext]>();

router.all('*', preflight);
router.all('*', withCorrelationId);

// --- AUTH ---
router.post('/api/auth/login', async (req, env: Env) => {
  const { email, password } = await req.json() as any;
  const stmt = env.DB.prepare(`SELECT id, role FROM users WHERE email = ? AND password_hash = ?`);
  const user = await stmt.bind(email, password).first();
  if (!user) {
    await logAudit(env, 'system', 'login_failed', 'auth', null, { email }, req.correlationId);
    return error(401, 'Invalid credentials');
  }
  await logAudit(env, user.id as string, 'login_success', 'auth', null, {}, req.correlationId);
  return json({ token: user.id, role: user.role });
});

// --- FLEET (Information Only) ---
router.get('/api/fleet/search', withAuth, requirePermission('fleet:read'), async (req, env: Env) => {
  return await getCached(req as any, async () => {
    const { results } = await env.DB.prepare('SELECT * FROM vehicles LIMIT 50').all();
    return json(results) as any;
  });
});

// --- KB (Knowledge Base) ---
router.get('/api/kb/search', withAuth, requirePermission('kb:read'), async (req, env: Env) => {
  const q = req.query.q as string;
  if (!q) return json([]);
  const { results } = await env.DB.prepare(`
    SELECT title, snippet(kb_fts, -1, '**', '**', '...', 64) as snippet, body_text 
    FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid
    WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') LIMIT 5
  `).bind(q.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole).all();
  return json(results);
});

router.post('/api/kb/upload', withAuth, requirePermission('kb:write'), async (req, env: Env) => {
  const { title, body_text, visibility_role, effective_date } = await req.json() as any;
  const id = 'kb_' + Date.now();
  await env.DB.prepare('INSERT INTO kb_documents (id, title, body_text, visibility_role, effective_date) VALUES (?, ?, ?, ?, ?)').bind(id, title, visibility_role || 'agent', body_text, effective_date || null).run();
  await logAudit(env, req.userId, 'create', 'kb_document', id, { title }, req.correlationId);
  return json({ id });
});

// --- ADMIN ---
router.get('/api/admin/audit', withAuth, requirePermission('audit:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  return json(results);
});

router.get('/api/admin/audit/export.csv', withAuth, requirePermission('audit:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000').all();
  let csv = 'id,user_id,action,entity,entity_id,correlation_id,created_at\n';
  results.forEach((r: any) => { csv += `${r.id},${r.user_id},${r.action},${r.entity},${r.entity_id},${r.correlation_id},${r.created_at}\n`; });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
});

router.get('/api/admin/models', withAuth, requirePermission('models:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM models ORDER BY priority DESC').all();
  return json(results);
});

router.post('/api/admin/models', withAuth, requirePermission('models:write'), async (req, env: Env) => {
  const data = await req.json() as any;
  if (isModelBlocked(data.model_id, data.display_name)) return error(400, 'Blocked model');
  let license = data.license || 'unknown';
  if (data.provider_kind === 'HF_ROUTED_FREE') {
    try { license = await verifyHFLicense(data.model_id); } catch (e: any) { return error(400, `License verify failed: ${e.message}`); }
  }
  const id = 'mod_' + Date.now();
  await env.DB.prepare('INSERT INTO models (id, display_name, provider_kind, model_id, license, enabled, priority) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, data.display_name, data.provider_kind, data.model_id, license, data.enabled ? 1 : 0, data.priority || 0).run();
  await logAudit(env, req.userId, 'create', 'model', id, { model_id: data.model_id, license }, req.correlationId);
  return json({ id, license });
});

// --- CHAT ---
router.get('/api/chat/threads', withAuth, async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM chat_threads WHERE user_id = ? AND archived = 0 ORDER BY updated_at DESC').bind(req.userId).all();
  return json(results);
});

router.post('/api/chat/threads', withAuth, async (req, env: Env) => {
  const id = 'th_' + Date.now();
  await env.DB.prepare('INSERT INTO chat_threads (id, user_id, title) VALUES (?, ?, ?)').bind(id, req.userId, 'New Chat').run();
  return json({ id });
});

router.get('/api/chat/threads/:id/messages', withAuth, async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC').bind(req.params.id).all();
  return json(results);
});

router.post('/api/chat/messages', withAuth, withRateLimit, async (req, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  const msgId = 'msg_' + Date.now();
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind(msgId, thread_id, 'user', content).run();
  
  const kbRaw = await env.DB.prepare(`
    SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid
    WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') LIMIT 3
  `).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole).all();
  const kbContext = kbRaw.results as any[];

  const systemPrompt = `You are an internal car rental copilot. Answer ONLY using the KB context. Cite docs as [Title].\n\nContext:\n` + 
    kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n');
  
  const aiRes = await routeChat(env, [{ role: 'system', content: systemPrompt }, { role: 'user', content }]);
  
  let reply = aiRes.content;
  const toolData = { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider, fallbacks: aiRes.fallbacks };

  if (!reply) {
    if (kbContext.length > 0) reply = `I found matching policies in our KB:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 300)}...`).join('\n\n');
    else reply = "No matching info in KB. Please refine your query.";
  }

  const assistantMsgId = 'msg_' + (Date.now() + 1);
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind(assistantMsgId, thread_id, 'assistant', JSON.stringify({ text: reply, toolData })).run();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply, toolData })}\n\n`));
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
};
