import { Env } from './types';

export interface QuotaStatus {
  workspaceId: string;
  mode: 'normal' | 'degraded' | 'read_only';
  reason?: string;
  usageEstimates: {
    modelCallsToday: number;
    d1WritesToday: number;
  };
}

export class QuotaGovernor {
  static async getStatus(env: Env, workspaceId: string): Promise<QuotaStatus> {
    const today = new Date().toISOString().split('T')[0];
    const config = await env.DB.prepare('SELECT mode FROM quota_config WHERE workspace_id = ?').bind(workspaceId).first<{ mode: string }>();
    const modelCallsRes = await env.DB.prepare('SELECT SUM(model_calls) as total FROM daily_usage_stats WHERE day = ? AND workspace_id = ?').bind(today, workspaceId).first<{ total: number }>();
    const d1WritesRes = await env.DB.prepare('SELECT COUNT(*) as total FROM audit_logs WHERE date(created_at) = ? AND workspace_id = ?').bind(today, workspaceId).first<{ total: number }>();
    const modelCallsToday = modelCallsRes?.total || 0;
    const d1WritesToday = d1WritesRes?.total || 0;
    let mode = (config?.mode as any) || 'normal';
    let reason = '';
    if (mode === 'normal') {
      if (d1WritesToday > 90000) { mode = 'degraded'; reason = 'D1 daily write quota nearing limit.'; }
      if (modelCallsToday > 4000) { mode = 'degraded'; reason = 'High model call volume.'; }
    }
    return { workspaceId, mode, reason, usageEstimates: { modelCallsToday, d1WritesToday } };
  }
  static async setMode(env: Env, workspaceId: string, mode: string) {
    await env.DB.prepare('INSERT INTO quota_config (workspace_id, mode) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET mode = excluded.mode, updated_at = CURRENT_TIMESTAMP').bind(workspaceId, mode).run();
  }
}

export class PIIGuard {
  static redact(text: string, hasPermission: boolean): string {
    if (hasPermission) return text;
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
      .replace(/(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, '[PHONE_REDACTED]');
  }
}
