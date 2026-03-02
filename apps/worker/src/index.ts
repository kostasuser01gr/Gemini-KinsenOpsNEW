import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, PERMISSIONS, Role } from './types';
import { withAuthAndWorkspace, withCorrelationId, requirePermission } from './middleware';
import { logAudit } from './audit';
import { getCached } from './cache';
import { routeChat, verifyHFLicense, isModelBlocked } from './modelRouter';
import { RetentionManager } from './retention';
import { QuotaGovernor, PIIGuard } from './quotaGovernor';

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

// Standard Error Envelope
const apiError = (message: string, status = 400, hint?: string) => {
  return new Response(JSON.stringify({
    error: message,
    hint: hint || 'Check system status or retry later',
    correlation_id: 'err_' + Date.now()
  }), { status, headers: { 'Content-Type': 'application/json' } });
};

// --- QUOTA & COMPLIANCE ---
router.get('/api/admin/quota/status', withAuthAndWorkspace, requirePermission('models:read'), async (req: any, env: Env) => {
  const status = await QuotaGovernor.getStatus(env, req.workspaceId);
  return json(status);
});

// --- CHAT WITH REDACTION ---
router.post('/api/chat/messages', withAuthAndWorkspace, async (req: any, env: Env) => {
  const { thread_id, content } = await req.json() as any;
  
  // Quota Check
  const qStatus = await QuotaGovernor.getStatus(env, req.workspaceId);
  if (qStatus.isThrottled) return apiError(qStatus.throttleReason || 'Quota reached', 429);

  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)').bind('msg_' + Date.now(), thread_id, 'user', content).run();
  
  const kbRaw = await env.DB.prepare(`SELECT title, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') AND workspace_id = ? LIMIT 3`).bind(content.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole, req.workspaceId).all();
  const kbContext = kbRaw.results as any[];

  // Route Chat
  const aiRes = await routeChat(env, req.workspaceId!, [{ role: 'system', content: `Context:\n` + kbContext.map(d => `[${d.title}]: ${d.body_text}`).join('\n\n') }, { role: 'user', content }], thread_id);
  
  let reply = aiRes.content;
  if (!reply) reply = kbContext.length > 0 ? `Citations:\n\n` + kbContext.map(d => `**${d.title}**: ${d.body_text.slice(0, 200)}...`).join('\n\n') : "No data.";

  // PII Redaction
  const hasPIIPermission = (PERMISSIONS[req.userRole as Role] || []).includes('users:read' as any);
  const redactedReply = PIIGuard.redact(reply, hasPIIPermission);

  await env.DB.prepare('INSERT INTO chat_messages (id, thread_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)').bind('msg_' + (Date.now() + 1), thread_id, 'assistant', redactedReply, JSON.stringify({ model: aiRes.model_id, original: hasPIIPermission ? undefined : reply })).run();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: redactedReply, toolData: { type: 'ModelStatusCard', model: aiRes.model_id, provider: aiRes.provider } })}\n\n`)); controller.enqueue(encoder.encode(`data: [DONE]\n\n`)); controller.close(); } });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
});

// PII Reveal
router.post('/api/chat/messages/:id/reveal', withAuthAndWorkspace, async (req: any, env: Env) => {
  const msg = await env.DB.prepare('SELECT content, metadata_json, thread_id FROM chat_messages WHERE id = ?').bind(req.params.id).first() as any;
  if (!msg) return error(404);
  const meta = JSON.parse(msg.metadata_json);
  
  await logAudit(env, req.userId, 'pii_reveal', 'message', req.params.id, { thread_id: msg.thread_id }, req.correlationId, req.workspaceId);
  return json({ original: meta.original || msg.content });
});

// --- REST OF ROUTES ---
router.post('/api/auth/signup', async (req: any, env: Env) => {
  const { email, password } = await req.json() as any;
  const id = 'u_' + Date.now();
  const hash = await hashPassword(password);
  await env.DB.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').bind(id, email, hash, 'agent').run();
  await env.DB.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role_in_workspace) VALUES (?, ?, ?)').bind('ws_default_public', id, 'agent').run();
  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, id).run();
  return json({ token: sessId, role: 'agent', workspace_id: 'ws_default_public' });
});

router.post('/api/auth/login', async (req: any, env: Env) => {
  const { email, password } = await req.json() as any;
  const user = await env.DB.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').bind(email).first() as any;
  if (!user || ((await hashPassword(password)) !== user.password_hash)) return error(401, 'Failed');
  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, user.id).run();
  return json({ token: sessId, role: user.role, workspace_id: 'ws_default_public' });
});

router.all('*', () => error(404));

export default {
  fetch: async (req: Request, env: Env, ctx: ExecutionContext) => {
    try {
      const response = await router.handle(req, env, ctx);
      return corsify(response || error(404));
    } catch (e: any) {
      return new Response(e.message || 'Error', { status: 500 });
    }
  }
};
