import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env } from './types';
import { withAuth, withCorrelationId, requirePermission } from './middleware';
import { logAudit } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked } from './modelRouter';
import * as bcrypt from 'bcryptjs';

const { preflight, corsify } = cors({ origins: ['*'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], headers: ['*'] });
const router = Router<IRequest, [Env, ExecutionContext]>();

router.all('*', preflight);
router.all('*', withCorrelationId);

async function verifyTurnstile(token: string, secret?: string) {
  if (!secret) return true; // Disabled
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: formData });
  const outcome = await result.json() as any;
  return outcome.success;
}

const checkAuthRateLimit = async (env: Env, ip: string) => {
  const limitKey = `rl_${ip}`;
  const now = Date.now();
  let limit = await env.DB.prepare('SELECT tokens, last_refill FROM rate_limits WHERE key = ?').bind(limitKey).first() as any;
  if (!limit) {
    await env.DB.prepare('INSERT INTO rate_limits (key, tokens, last_refill) VALUES (?, ?, ?)').bind(limitKey, 5, new Date().toISOString()).run();
    return true;
  }
  const lastRefill = new Date(limit.last_refill).getTime();
  let tokens = limit.tokens;
  if (now - lastRefill > 60000) tokens = 5;
  if (tokens <= 0) return false;
  await env.DB.prepare('UPDATE rate_limits SET tokens = ?, last_refill = ? WHERE key = ?').bind(tokens - 1, new Date().toISOString(), limitKey).run();
  return true;
};

// --- AUTH & OPEN SIGNUP ---
router.post('/api/auth/signup', async (req, env: Env) => {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkAuthRateLimit(env, ip))) return error(429, 'Too many attempts');

  const { email, password, turnstile_token } = await req.json() as any;
  if (!email || !password || password.length < 8) return error(400, 'Invalid input');
  
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot verification failed');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error(400, 'Email already exists');

  if (env.REQUIRE_INVITE_CODE === 'true') {
    // optional logic here for invite codes
  }

  const id = 'u_' + Date.now();
  const hash = await bcrypt.hash(password, 10);
  
  // New users are ALWAYS agents.
  // First admin bootstrap via allowlist or env:
  const allowlist = (env.ADMIN_ALLOWLIST_EMAILS || '').split(',').map(e => e.trim());
  const role = allowlist.includes(email) ? 'admin' : 'agent';

  await env.DB.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').bind(id, email, hash, role).run();
  
  const sessionId = 'sess_' + Date.now() + Math.random().toString(36).substring(2);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, id, expiresAt).run();

  await logAudit(env, id, 'signup', 'auth', null, { role }, req.correlationId);
  return json({ token: sessionId, role });
});

router.post('/api/auth/login', async (req, env: Env) => {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkAuthRateLimit(env, ip))) return error(429, 'Too many attempts');

  const { email, password, turnstile_token } = await req.json() as any;
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot verification failed');

  const user = await env.DB.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').bind(email).first() as any;
  
  const lockout = await env.DB.prepare('SELECT attempts, last_attempt FROM failed_logins WHERE ip_address = ? AND email = ?').bind(ip, email).first() as any;
  if (lockout && lockout.attempts > 5 && (Date.now() - new Date(lockout.last_attempt).getTime()) < 15 * 60000) {
    return error(429, 'Account locked temporarily due to failed logins');
  }

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await env.DB.prepare(`
      INSERT INTO failed_logins (ip_address, email, attempts, last_attempt) VALUES (?, ?, 1, ?)
      ON CONFLICT(ip_address, email) DO UPDATE SET attempts = attempts + 1, last_attempt = ?
    `).bind(ip, email, new Date().toISOString(), new Date().toISOString()).run();
    await logAudit(env, 'system', 'login_failed', 'auth', null, { email, ip }, req.correlationId);
    return error(401, 'Invalid credentials');
  }

  await env.DB.prepare('DELETE FROM failed_logins WHERE ip_address = ? AND email = ?').bind(ip, email).run();

  const sessionId = 'sess_' + Date.now() + Math.random().toString(36).substring(2);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, user.id, expiresAt).run();

  await logAudit(env, user.id, 'login_success', 'auth', null, {}, req.correlationId);
  return json({ token: sessionId, role: user.role });
});

router.post('/api/auth/logout', withAuth, async (req, env: Env) => {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
  return json({ success: true });
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
  await env.DB.prepare('INSERT INTO kb_documents (id, title, body_text, visibility_role, effective_date) VALUES (?, ?, ?, ?, ?)').bind(id, title, body_text, visibility_role || 'agent', effective_date || null).run();
  await logAudit(env, req.userId, 'create', 'kb_document', id, { title }, req.correlationId);
  return json({ id });
});

// --- ADMIN ---
router.get('/api/admin/audit', withAuth, requirePermission('audit:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  await logAudit(env, req.userId, 'read_sensitive', 'audit_viewer', null, {}, req.correlationId);
  return json(results);
});

router.get('/api/admin/audit/export.csv', withAuth, requirePermission('audit:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000').all();
  let csv = 'id,user_id,action,entity,entity_id,correlation_id,created_at\n';
  results.forEach((r: any) => { csv += `${r.id},${r.user_id},${r.action},${r.entity},${r.entity_id},${r.correlation_id},${r.created_at}\n`; });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
});

router.get('/api/admin/users', withAuth, requirePermission('users:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT id, email, role, created_at FROM users').all();
  await logAudit(env, req.userId, 'read_sensitive', 'users_list', null, {}, req.correlationId);
  return json(results);
});

router.patch('/api/admin/users/:id/role', withAuth, requirePermission('users:write'), async (req, env: Env) => {
  const { role } = await req.json() as any;
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, req.params.id).run();
  await logAudit(env, req.userId, 'update_role', 'user', req.params.id, { role }, req.correlationId);
  return json({ success: true });
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

router.get('/api/admin/macros', withAuth, requirePermission('macros:read'), async (req, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM macros').all();
  return json(results);
});

// --- CHAT ---
router.get('/api/chat/threads', withAuth, async (req, env: Env) => {
  return await getCached(req as any, async () => {
    const { results } = await env.DB.prepare('SELECT * FROM chat_threads WHERE user_id = ? AND archived = 0 ORDER BY pinned DESC, updated_at DESC').bind(req.userId).all();
    return json(results) as any;
  });
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

router.post('/api/chat/messages', withAuth, async (req, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  
  // Rate limiting for chat messages handled per session token bucket logic
  const rlKey = `chat_${req.userId}`;
  let limit = await env.DB.prepare('SELECT tokens, last_refill FROM rate_limits WHERE key = ?').bind(rlKey).first() as any;
  const now = Date.now();
  if (!limit) {
    await env.DB.prepare('INSERT INTO rate_limits (key, tokens, last_refill) VALUES (?, ?, ?)').bind(rlKey, 30, new Date().toISOString()).run();
    limit = { tokens: 30, last_refill: new Date().toISOString() };
  }
  let tokens = limit.tokens;
  if (now - new Date(limit.last_refill).getTime() > 60000) tokens = 30; // 30 req/min
  if (tokens <= 0) return error(429, 'Chat rate limit exceeded. Please wait.');
  await env.DB.prepare('UPDATE rate_limits SET tokens = ?, last_refill = ? WHERE key = ?').bind(tokens - 1, new Date().toISOString(), rlKey).run();

  const msgId = 'msg_' + Date.now();
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind(msgId, thread_id, 'user', content).run();
  await env.DB.prepare('UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(thread_id).run();
  
  const kbRaw = await env.DB.prepare(`
    SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid
    WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') LIMIT 3
  `).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole).all();
  const kbContext = kbRaw.results as any[];

  const systemPrompt = `You are an internal Ops Copilot. Answer ONLY using the KB context. Cite docs as [Title]. If not in context, say "I don't have that info."\n\nContext:\n` + 
    kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n');
  
  const aiRes = await routeChat(env, [{ role: 'system', content: systemPrompt }, { role: 'user', content }]);
  
  let reply = aiRes.content;
  const toolData = { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider, fallbacks: aiRes.fallbacks, kbHits: kbContext.map(k=>k.title) };

  if (!reply) {
    if (kbContext.length > 0) reply = `I found matching policies in our KB:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 300)}...`).join('\n\n');
    else reply = "No matching info in KB. Please ask a manager or refine your query.";
  }

  const assistantMsgId = 'msg_' + (Date.now() + 1);
  const metadataJson = JSON.stringify({ model: aiRes.model_id, tool: toolData });
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)').bind(assistantMsgId, thread_id, 'assistant', reply, metadataJson).run();
  
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
    router.handle(req, env, ctx).then(corsify).catch(e => {
      console.error(e);
      return corsify(error(500, e.message));
    }),
};
