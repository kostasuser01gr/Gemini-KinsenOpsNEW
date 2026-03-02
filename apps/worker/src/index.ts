import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, PERMISSIONS, Role } from './types';
import { withAuthAndWorkspace, withCorrelationId, requirePermission, requireStepUp } from './middleware';
import { logAudit, verifyAuditChain } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked } from './modelRouter';
import { RetentionManager } from './retention';
import { QuotaGovernor, PIIGuard } from './quotaGovernor';
import { checkCompliance } from './billingGuard';

const { preflight, corsify } = cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['*'] });
const router = Router<any>();

// --- HEALTH ---
router.get('/healthz', () => new Response('OK'));
router.get('/readyz', async (req: any, env: Env) => {
  try {
    await env.DB.prepare('SELECT 1').first();
    return new Response('READY');
  } catch (e) {
    return new Response('UNREADY', { status: 500 });
  }
});
router.get('/api/compliance', (req: any, env: Env) => json(checkCompliance(env)));
router.get('/api/meta/version', () => json({ version: '10.0.0' }));

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

router.post('/api/auth/step-up', withAuthAndWorkspace, async (req: any, env: Env) => {
  const { password } = await req.json() as any;
  const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(req.userId).first() as any;
  if (!user || ((await hashPassword(password)) !== user.password_hash)) return error(401, 'Failed');
  
  await env.DB.prepare('UPDATE sessions SET last_step_up_at = CURRENT_TIMESTAMP WHERE id = ?').bind(req.session.id).run();
  return json({ success: true });
});

// --- QUOTA ---
router.get('/api/admin/quota/status', withAuthAndWorkspace, requirePermission('models:read'), async (req: any, env: Env) => {
  return json(await QuotaGovernor.getStatus(env, req.workspaceId));
});
router.post('/api/admin/quota/mode', withAuthAndWorkspace, requirePermission('models:write'), requireStepUp, async (req: any, env: Env) => {
  const { mode } = await req.json() as any;
  await QuotaGovernor.setMode(env, req.workspaceId, mode);
  return json({ success: true });
});

// --- APPROVALS ---
router.get('/api/admin/approvals', withAuthAndWorkspace, requirePermission('kb:write'), async (req: any, env: Env) => {
  const kbDrafts = await env.DB.prepare('SELECT * FROM kb_drafts WHERE workspace_id = ? AND status != "published"').bind(req.workspaceId).all();
  return json({ kb: kbDrafts.results });
});

router.post('/api/kb/drafts', withAuthAndWorkspace, requirePermission('kb:read'), async (req: any, env: Env) => {
  const data = await req.json() as any;
  const id = 'kbd_' + Date.now();
  await env.DB.prepare(`INSERT INTO kb_drafts (id, document_id, workspace_id, author_id, title, body_text, visibility_role, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`)
    .bind(id, data.document_id || null, req.workspaceId, req.userId, data.title, data.body_text, data.visibility_role || 'agent').run();
  return json({ id });
});

router.post('/api/admin/approvals/kb/:id/publish', withAuthAndWorkspace, requirePermission('kb:write'), requireStepUp, async (req: any, env: Env) => {
  const draft = await env.DB.prepare('SELECT * FROM kb_drafts WHERE id = ? AND workspace_id = ?').bind(req.params.id, req.workspaceId).first() as any;
  if (!draft) return error(404);
  
  const docId = draft.document_id || 'kb_' + Date.now();
  
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO kb_documents (id, workspace_id, title, body_text, visibility_role, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
      .bind(docId, req.workspaceId, draft.title, draft.body_text, draft.visibility_role),
    env.DB.prepare('UPDATE kb_drafts SET status = "published" WHERE id = ?').bind(req.params.id)
  ]);
  
  await logAudit(env, req.userId!, 'publish', 'kb_document', docId, { draft_id: req.params.id }, req.correlationId!, req.workspaceId);
  return json({ success: true, document_id: docId });
});

// --- AUDIT CHAIN VERIFICATION ---
router.get('/api/admin/audit/verify', withAuthAndWorkspace, requirePermission('audit:read'), async (req: any, env: Env) => {
  const result = await verifyAuditChain(env, req.workspaceId);
  return json(result);
});

// --- CHAT (with Quota Governor check) ---
router.post('/api/chat/messages', withAuthAndWorkspace, async (req: any, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  
  const qStatus = await QuotaGovernor.getStatus(env, req.workspaceId);
  if (qStatus.mode === 'read_only') return error(403, 'Workspace is in read-only mode due to quota limits');

  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind('msg_' + Date.now(), thread_id, 'user', content).run();
  
  const kbRaw = await env.DB.prepare(`SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') AND workspace_id = ? LIMIT 3`).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole, req.workspaceId).all();
  const kbContext = kbRaw.results as any[];

  // Adaptive routing placeholder: choose model based on task
  // Canary rollout is handled inside routeChat
  const aiRes = await routeChat(env, req.workspaceId!, [{ role: 'system', content: `Context:\n` + kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n') }, { role: 'user', content }], thread_id);
  
  let reply = aiRes.content;
  if (!reply) reply = kbContext.length > 0 ? `Policies:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 200)}...`).join('\n\n') : "No info.";

  const redactedReply = PIIGuard.redact(reply, (PERMISSIONS[req.userRole as Role] || []).includes('users:read' as any));
  
  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)').bind('msg_' + (Date.now() + 1), thread_id, 'assistant', redactedReply, JSON.stringify({ model: aiRes.model_id })).run();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: redactedReply, toolData: { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider } })}\n\n`)); controller.enqueue(encoder.encode(`data: [DONE]\n\n`)); controller.close(); } });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
});

router.get('/api/admin/audit/export.csv', withAuthAndWorkspace, requirePermission('admin:export'), requireStepUp, async (req: any, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1000').bind(req.workspaceId).all();
  let csv = 'id,user_id,action,entity,entity_id,correlation_id,prev_hash,entry_hash,created_at\n';
  results.forEach((r: any) => { csv += `${r.id},${r.user_id},${r.action},${r.entity},${r.entity_id},${r.correlation_id},${r.prev_hash},${r.entry_hash},${r.created_at}\n`; });
  return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
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
