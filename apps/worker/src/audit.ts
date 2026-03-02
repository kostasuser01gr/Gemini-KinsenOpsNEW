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
  
  // Hash chain logic
  const lastEntry = await env.DB.prepare('SELECT entry_hash FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(workspaceId).first<{ entry_hash: string }>();
  
  const prevHash = lastEntry?.entry_hash || '0'.repeat(64);
  
  const canonical = JSON.stringify({
    workspaceId, userId, action, entity, entityId, metadata, correlationId, prevHash
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const entryHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  await env.DB.prepare(`
    INSERT INTO audit_logs (id, workspace_id, user_id, action, entity, entity_id, metadata_json, correlation_id, prev_hash, entry_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, workspaceId, userId, action, entity, entityId, JSON.stringify(metadata), correlationId, prevHash, entryHash).run();
}

export async function verifyAuditChain(env: Env, workspaceId: string): Promise<{ ok: boolean; failedId?: string }> {
  // Simple full chain verification for a workspace
  // In production, you'd do this in batches or per day
  const { results } = await env.DB.prepare('SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at ASC')
    .bind(workspaceId).all();
  
  let expectedPrevHash = '0'.repeat(64);
  
  for (const entry of results as any[]) {
    if (entry.prev_hash !== expectedPrevHash) {
      return { ok: false, failedId: entry.id };
    }
    
    const canonical = JSON.stringify({
      workspaceId: entry.workspace_id,
      userId: entry.user_id,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entity_id,
      metadata: JSON.parse(entry.metadata_json),
      correlationId: entry.correlation_id,
      prevHash: entry.prev_hash
    });
    
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const actualHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (actualHash !== entry.entry_hash) {
      return { ok: false, failedId: entry.id };
    }
    
    expectedPrevHash = actualHash;
  }
  
  return { ok: true };
}
