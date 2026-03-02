import { IRequest, Router, error, json, cors } from 'itty-router';
import { Env, Role, Action, PERMISSIONS } from './types';
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
router.get('/api/meta/version', () => json({ version: '11.0.0' }));

router.all('*', preflight);
router.all('*', withCorrelationId);

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- AUTH ---
router.post('/api/auth/signup', async (req: any, env: Env) => {
  const { email, password } = await req.json() as any;
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
  const { email, password } = await req.json() as any;
  const user = await env.DB.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').bind(email).first() as any;
  if (!user || ((await hashPassword(password)) !== user.password_hash)) return error(401, 'Failed');
  const sessId = 'sess_' + Math.random().toString(36).slice(2);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))').bind(sessId, user.id).run();
  return json({ token: sessId, role: user.role, workspace_id: 'ws_default_public' });
});

// --- VAULT ENDPOINTS (Ciphertext Only) ---
router.post('/api/vault/bootstrap', withAuthAndWorkspace, requirePermission('vault:use'), async (req: any, env: Env) => {
  const { wrapped_dek, kdf_params } = await req.json() as any;
  await env.DB.prepare(`
    INSERT INTO vault_keys (workspace_id, user_id, wrapped_dek_by_passphrase, kdf_params_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id, user_id) DO UPDATE SET 
      wrapped_dek_by_passphrase = excluded.wrapped_dek_by_passphrase,
      kdf_params_json = excluded.kdf_params_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(req.workspaceId, req.userId, wrapped_dek, JSON.stringify(kdf_params)).run();
  
  await logAudit(env, req.userId!, 'vault_bootstrap', 'vault_keys', null, {}, req.correlationId!, req.workspaceId);
  return json({ success: true });
});

router.get('/api/vault/key', withAuthAndWorkspace, requirePermission('vault:use'), async (req: any, env: Env) => {
  const key = await env.DB.prepare('SELECT wrapped_dek_by_passphrase, kdf_params_json FROM vault_keys WHERE workspace_id = ? AND user_id = ?').bind(req.workspaceId, req.userId).first() as any;
  if (!key) return error(404, 'Vault not bootstrapped');
  return json({
    wrapped_dek: key.wrapped_dek_by_passphrase,
    kdf_params: JSON.parse(key.kdf_params_json)
  });
});

router.get('/api/vault/items', withAuthAndWorkspace, requirePermission('vault:use'), async (req: any, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM vault_items WHERE workspace_id = ? AND owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC').bind(req.workspaceId, req.userId).all();
  return json(results.map((r: any) => ({ ...r, iv: JSON.parse(r.iv_json) })));
});

router.post('/api/vault/items', withAuthAndWorkspace, requirePermission('vault:use'), async (req: any, env: Env) => {
  const data = await req.json() as any;
  const id = 'vitem_' + Date.now() + Math.random().toString(36).slice(2, 5);
  await env.DB.prepare(`
    INSERT INTO vault_items (id, workspace_id, owner_user_id, title_enc, username_enc, password_enc, url_enc, notes_enc, tags_enc, iv_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, req.workspaceId, req.userId, data.title_enc, data.username_enc, data.password_enc, data.url_enc, data.notes_enc, data.tags_enc, JSON.stringify(data.iv)).run();
  
  await logAudit(env, req.userId!, 'vault_item_create', 'vault_item', id, {}, req.correlationId!, req.workspaceId);
  return json({ id });
});

router.patch('/api/vault/items/:id', withAuthAndWorkspace, requirePermission('vault:use'), async (req: any, env: Env) => {
  const data = await req.json() as any;
  await env.DB.prepare(`
    UPDATE vault_items SET 
      title_enc = COALESCE(?, title_enc),
      username_enc = COALESCE(?, username_enc),
      password_enc = COALESCE(?, password_enc),
      url_enc = COALESCE(?, url_enc),
      notes_enc = COALESCE(?, notes_enc),
      tags_enc = COALESCE(?, tags_enc),
      iv_json = COALESCE(?, iv_json),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND owner_user_id = ? AND workspace_id = ?
  `).bind(data.title_enc, data.username_enc, data.password_enc, data.url_enc, data.notes_enc, data.tags_enc, data.iv ? JSON.stringify(data.iv) : null, req.params.id, req.userId, req.workspaceId).run();
  
  await logAudit(env, req.userId!, 'vault_item_update', 'vault_item', req.params.id, {}, req.correlationId!, req.workspaceId);
  return json({ success: true });
});

router.delete('/api/vault/items/:id', withAuthAndWorkspace, requirePermission('vault:use'), async (req: any, env: Env) => {
  await env.DB.prepare('UPDATE vault_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND workspace_id = ?').bind(req.params.id, req.userId, req.workspaceId).run();
  await logAudit(env, req.userId!, 'vault_item_delete', 'vault_item', req.params.id, {}, req.correlationId!, req.workspaceId);
  return json({ success: true });
});

// --- REMAINING ENDPOINTS ---
router.get('/api/me/preferences', withAuthAndWorkspace, async (req: any, env: Env) => {
  const prefs = await env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(req.userId).first();
  return json(prefs || { language: 'en', theme: 'light' });
});

router.get('/api/kb/search', withAuthAndWorkspace, async (req: any, env: Env) => {
  const q = req.query.q as string;
  if (!q) return json([]);
  return await getCached(req as any, async () => {
    const { results } = await env.DB.prepare(`SELECT title, snippet(kb_fts, -1, '**', '**', '...', 64) as snippet, body_text FROM kb_fts JOIN kb_documents ON kb_documents.rowid = kb_fts.rowid WHERE kb_fts MATCH ? AND visibility_role IN (?, 'agent') AND workspace_id = ? LIMIT 10`).bind(q.replace(/[^a-zA-Z0-9 ]/g, ' '), req.userRole, req.workspaceId).all();
    return json(results) as any;
  });
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
