import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, PERMISSIONS, Role } from './types';
import { withAuthAndWorkspace, withCorrelationId, requirePermission } from './middleware';
import { logAudit } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked, setRouterContext } from './modelRouter';
import { RetentionManager } from './retention';
import { checkCompliance } from './billingGuard';

const { preflight, corsify } = cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['*'] });
const router = Router<any>();

router.get('/health', () => new Response('OK'));

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

const checkRateLimit = async (env: Env, key: string, max: number, windowMs: number = 60000) => {
  const rlKey = `rl_${key}`;
  const now = Date.now();
  let limit = await env.DB.prepare('SELECT tokens, last_refill FROM rate_limits WHERE key = ?').bind(rlKey).first() as any;
  if (!limit) {
    await env.DB.prepare('INSERT INTO rate_limits (key, tokens, last_refill) VALUES (?, ?, ?)').bind(rlKey, max - 1, new Date().toISOString()).run();
    return true;
  }
  const lastRefill = new Date(limit.last_refill).getTime();
  let tokens = limit.tokens;
  if (now - lastRefill > windowMs) tokens = max;
  if (tokens <= 0) return false;
  await env.DB.prepare('UPDATE rate_limits SET tokens = ?, last_refill = ? WHERE key = ?').bind(tokens - 1, new Date().toISOString(), rlKey).run();
  return true;
};

// --- AUTH ---
router.post('/api/auth/signup', async (req: any, env: Env) => {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(env, `signup_ip_${ip}`, 5, 60000))) return error(429, 'Too many signups from this IP');

  const { email, password, turnstile_token } = await req.json() as any;
  if (!email || !password || password.length < 8) return error(400, 'Invalid input');
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot check failed');

  if (!(await checkRateLimit(env, `signup_email_${email}`, 3, 3600000))) return error(429, 'Too many signup attempts for this email');

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
  
  await logAudit(env, id, 'signup', 'user', id, { role }, req.correlationId);
  return json({ token: sessId, role, workspace_id: 'ws_default_public' });
});

router.post('/api/auth/login', async (req: any, env: Env) => {
  const { email, password, turnstile_token } = await req.json() as any;
  if (!(await verifyTurnstile(turnstile_token, env.TURNSTILE_SECRET_KEY))) return error(400, 'Bot check failed');

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const lockoutKey = `lockout_${ip}_${email}`;
  
  const user = await env.DB.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').bind(email).first() as any;
  
  if (!user || ((await hashPassword(password)) !== user.password_hash)) {
    if (!(await checkRateLimit(env, lockoutKey, 5, 900000))) {
      return error(429, 'Account locked for 15 minutes due to too many failed attempts');
    }
    return error(401, 'Failed');
  }

  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, user.id).run();
  
  await logAudit(env, user.id, 'login', 'session', sessId, {}, req.correlationId);
  return json({ token: sessId, role: user.role, workspace_id: 'ws_default_public' });
});

// --- COMPLIANCE ---
router.get('/api/admin/compliance/status', withAuthAndWorkspace, requirePermission('models:read'), async (req: any, env: Env) => {
  const report = checkCompliance(env);
  return json(report);
});

// --- DATA RETENTION ---
router.post('/api/admin/retention/run', withAuthAndWorkspace, requirePermission('admin:retention'), async (req: any, env: Env) => {
  const res = await RetentionManager.run(env);
  await logAudit(env, req.userId!, 'run_retention', 'system', null, res, req.correlationId!, req.workspaceId);
  return json(res);
});

// --- CHAT ---
router.post('/api/chat/messages', withAuthAndWorkspace, async (req: any, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  
  // Budget Check (P3)
  const today = new Date().toISOString().split('T')[0];
  const usage = await env.DB.prepare('SELECT model_calls FROM daily_usage_stats WHERE day = ? AND user_id = ?').bind(today, req.userId).first() as any;
  const userBudget = await env.DB.prepare('SELECT daily_model_budget FROM users WHERE id = ?').bind(req.userId).first() as any;
  
  if (usage && usage.model_calls >= (userBudget?.daily_model_budget || 100)) {
    return error(429, 'Daily model call budget exceeded');
  }

  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind('msg_' + Date.now(), thread_id, 'user', content).run();
  
  const kbRaw = await env.DB.prepare(`SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') AND workspace_id = ? LIMIT 3`).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole, req.workspaceId).all();
  const kbContext = kbRaw.results as any[];

  const aiRes = await routeChat(env, req.workspaceId!, [{ role: 'system', content: `Context:\n` + kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n') }, { role: 'user', content }], thread_id);
  
  // Log usage
  await env.DB.prepare(`
    INSERT INTO daily_usage_stats (day, workspace_id, user_id, model_calls) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, workspace_id, user_id) DO UPDATE SET model_calls = model_calls + 1
  `).bind(today, req.workspaceId, req.userId).run();

  let reply = aiRes.content;
  if (!reply) reply = kbContext.length > 0 ? `Policies:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 200)}...`).join('\n\n') : "No info.";

  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)').bind('msg_' + (Date.now() + 1), thread_id, 'assistant', reply, JSON.stringify({ model: aiRes.model_id, correlationId: req.correlationId })).run();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply, toolData: { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider, correlationId: req.correlationId } })}\n\n`)); controller.enqueue(encoder.encode(`data: [DONE]\n\n`)); controller.close(); } });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
});

// Fallback all
router.all('*', (req: any) => {
  if (req.method === 'OPTIONS') return preflight(req);
  return error(404);
});

export default {
  fetch: async (req: Request, env: Env, ctx: ExecutionContext) => {
    try {
      const response = await router.handle(req, env, ctx);
      return corsify(response || error(404));
    } catch (e: any) {
      console.error('WORKER_CRASH:', e.message, e.stack);
      return new Response(e.message || 'Internal Error', { status: 500 });
    }
  },
  scheduled: (event: any, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(RetentionManager.run(env)); }
};
