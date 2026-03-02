import { Env } from './types';

export interface QuotaStatus {
  isThrottled: boolean;
  throttleReason?: string;
  cacheTTLOverride?: number;
  expensiveFeaturesDisabled: boolean;
}

export class QuotaGovernor {
  static async getStatus(env: Env, workspaceId: string): Promise<QuotaStatus> {
    const today = new Date().toISOString().split('T')[0];
    const status: QuotaStatus = {
      isThrottled: false,
      expensiveFeaturesDisabled: false
    };

    // Check D1 writes today
    const auditCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM audit_logs WHERE date(created_at) = ? AND workspace_id = ?').bind(today, workspaceId).first<{cnt: number}>();
    
    if (auditCount && auditCount.cnt > 80000) { // Near 100k D1 free limit
      status.isThrottled = true;
      status.throttleReason = 'D1 daily write quota nearing limit';
      status.cacheTTLOverride = 300; // Force 5 min cache
      status.expensiveFeaturesDisabled = true;
    }

    return status;
  }

  static async logUsage(env: Env, key: string, limit: number) {
    await env.DB.prepare(`
      INSERT INTO quota_usage (key, count, limit_threshold, reset_at)
      VALUES (?, 1, ?, datetime('now', '+1 day'))
      ON CONFLICT(key) DO UPDATE SET
        count = count + 1,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, limit).run();
  }
}

export class PIIGuard {
  static redact(text: string, hasPermission: boolean): string {
    if (hasPermission) return text;
    
    // Simple regex for emails and phones
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
      .replace(/(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, '[PHONE_REDACTED]');
  }
}
