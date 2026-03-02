import { Env } from './types';

export async function logAudit(
  env: Env,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: any,
  correlationId: string,
  workspaceId: string = 'ws_default_public'
) {
  const id = 'aud_' + Date.now() + Math.random().toString(36).substring(2, 6);
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, workspace_id, user_id, action, entity, entity_id, metadata_json, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, workspaceId, userId, action, entity, entityId, JSON.stringify(metadata), correlationId).run();
}
