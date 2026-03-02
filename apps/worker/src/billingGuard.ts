import { Env } from './types';

export interface ComplianceReport {
  strictFreeMode: boolean;
  allowedProviders: string[];
  blockedSecrets: string[];
  status: 'compliant' | 'non-compliant';
  reasons: string[];
}

export function checkCompliance(env: Env): ComplianceReport {
  const strict = env.STRICT_FREE_MODE !== 'false';
  const report: ComplianceReport = {
    strictFreeMode: strict,
    allowedProviders: ['DISABLED', 'HF_ROUTED_FREE'],
    blockedSecrets: [],
    status: 'compliant',
    reasons: []
  };

  if (env.AI) {
    report.allowedProviders.push('CF_WORKERS_AI_FREE');
  }

  if (strict) {
    // Block billing-capable secrets
    const suspicious = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_AI_KEY', 'PROVIDER_KEY'];
    suspicious.forEach(key => {
      if ((env as any)[key]) {
        report.blockedSecrets.push(key);
        report.status = 'non-compliant';
        report.reasons.push(`Suspicious secret found: ${key}. Billing-capable secrets are prohibited in STRICT_FREE_MODE.`);
      }
    });

    // Check if any enabled model violates policy
    // Note: This check usually happens during runtime or admin save, 
    // but we can check the general environment here.
  }

  return report;
}

export const billingGuardMiddleware = (req: any, env: Env) => {
  const report = checkCompliance(env);
  if (report.status === 'non-compliant' && env.STRICT_FREE_MODE !== 'false') {
    // We don't necessarily block the whole worker, but we could block admin changes or certain calls.
    // For now, let's just make the report available.
  }
};
