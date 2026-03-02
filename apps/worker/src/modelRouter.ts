import { Env } from './types';

export interface Model {
  id: string;
  display_name: string;
  provider_kind: 'DISABLED' | 'HF_ROUTED_FREE' | 'CF_WORKERS_AI_FREE';
  model_id: string;
  enabled: number;
  priority: number;
  license?: string;
  free_policy: string;
  health_status: string;
  cooloff_until?: string;
  is_canary?: number;
  canary_percentage?: number;
}

const BLOCKLIST = ['jailbreak', 'uncensored', 'refusal', 'bypass', 'nsfw', 'exploit', 'illegal', 'dolphin', 'roleplay'];
const CF_FREE_NEURON_LIMIT = 10000;

export function isModelBlocked(modelId: string, displayName: string): boolean {
  const text = (modelId + ' ' + displayName).toLowerCase();
  return BLOCKLIST.some(term => text.includes(term));
}

export async function verifyHFLicense(modelId: string): Promise<string> {
  const res = await fetch(`https://huggingface.co/api/models/${modelId}`);
  if (!res.ok) throw new Error('HF model not found');
  const data = await res.json() as any;
  const license = data.cardData?.license || data.tags?.find((t: string) => t.startsWith('license:'))?.split(':')[1];
  if (!license) throw new Error('No license info');
  return license.toLowerCase();
}

async function checkCFUsage(env: Env): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const usage = await env.DB.prepare('SELECT neurons_used FROM ai_usage_log WHERE day = ?').bind(today).first<{neurons_used: number}>();
  return (usage?.neurons_used || 0) < CF_FREE_NEURON_LIMIT;
}

async function logCFUsage(env: Env, neurons: number) {
  const today = new Date().toISOString().split('T')[0];
  await env.DB.prepare(`
    INSERT INTO ai_usage_log (day, neurons_used) VALUES (?, ?)
    ON CONFLICT(day) DO UPDATE SET neurons_used = neurons_used + ?
  `).bind(today, neurons, neurons).run();
}

async function logModelKPI(env: Env, event: any) {
  const id = 'evt_' + Date.now() + Math.random().toString(36).slice(2, 5);
  const today = new Date().toISOString().split('T')[0];
  
  await env.DB.prepare(`
    INSERT INTO model_call_events (id, workspace_id, thread_id, preferred_model_id, used_model_id, provider_kind, success, latency_ms, error_code, fallbacks_count, strict_free_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, event.workspaceId, event.threadId, event.preferred, event.used, event.provider, event.success ? 1 : 0, event.latency, event.error, event.fallbacks, env.STRICT_FREE_MODE === 'false' ? 0 : 1).run();

  // Incremental rollup
  await env.DB.prepare(`
    INSERT INTO model_kpis_daily (date, workspace_id, model_id, provider_kind, calls, success_calls, fail_calls, latency_lt1s, latency_lt2s, latency_lt5s, latency_gte5s, fallback_used_calls)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, model_id) DO UPDATE SET
      calls = calls + 1,
      success_calls = success_calls + excluded.success_calls,
      fail_calls = fail_calls + excluded.fail_calls,
      latency_lt1s = latency_lt1s + excluded.latency_lt1s,
      latency_lt2s = latency_lt2s + excluded.latency_lt2s,
      latency_lt5s = latency_lt5s + excluded.latency_lt5s,
      latency_gte5s = latency_gte5s + excluded.latency_gte5s,
      fallback_used_calls = fallback_used_calls + excluded.fallback_used_calls
  `).bind(
    today, 
    event.workspaceId,
    event.used, 
    event.provider, 
    event.success ? 1 : 0, 
    event.success ? 0 : 1,
    event.latency < 1000 ? 1 : 0,
    (event.latency >= 1000 && event.latency < 2000) ? 1 : 0,
    (event.latency >= 2000 && event.latency < 5000) ? 1 : 0,
    event.latency >= 5000 ? 1 : 0,
    event.fallbacks > 0 ? 1 : 0
  ).run();
}

const rateLimits = new Map<string, { count: number; lastReset: number }>();
const MAX_REQUESTS_PER_MINUTE = 50;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  let limit = rateLimits.get(userId);
  if (!limit || now - limit.lastReset > 60000) {
    limit = { count: 0, lastReset: now };
  }
  limit.count++;
  rateLimits.set(userId, limit);
  return limit.count <= MAX_REQUESTS_PER_MINUTE;
}

export async function callModel(env: Env, model: Model, messages: any[]): Promise<string> {
  // STRICT FREE MODE Check
  if (env.STRICT_FREE_MODE !== 'false' && model.free_policy !== 'FREE_ONLY') {
    throw new Error('STRICT_FREE_MODE violation: Model is not flagged as FREE_ONLY');
  }

  if (model.provider_kind === 'HF_ROUTED_FREE') {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model.model_id}/v1/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(env.HF_TOKEN ? { 'Authorization': `Bearer ${env.HF_TOKEN}` } : {})
      },
      body: JSON.stringify({ model: model.model_id, messages, max_tokens: 800 }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HF Error ${res.status}`);
    const data = await res.json() as any;
    return data.choices[0].message.content;
  }

  if (model.provider_kind === 'CF_WORKERS_AI_FREE') {
    if (!env.AI) throw new Error('AI not bound');
    if (!(await checkCFUsage(env))) throw new Error('CF Neuron limit reached');
    const res = await env.AI.run(model.model_id, { messages, max_tokens: 800 });
    await logCFUsage(env, 100); 
    return res.response || res.choices?.[0]?.message?.content;
  }

  throw new Error('Unsupported');
}

export async function routeChat(env: Env, workspaceId: string, messages: any[], threadId?: string, preferredModelId?: string): Promise<{ content: string, model_id: string, provider: string, fallbacks: string[] }> {
  const start = Date.now();
  const nowStr = new Date().toISOString();
  const candidates = (await env.DB.prepare(`SELECT * FROM models WHERE workspace_id = ? AND enabled = 1 ORDER BY priority DESC`).bind(workspaceId).all()).results as unknown as Model[] & any[];
  
  const eligible = candidates.filter(m => {
    if (env.STRICT_FREE_MODE !== 'false' && m.free_policy !== 'FREE_ONLY') return false;
    if (m.cooloff_until && m.cooloff_until > nowStr) return false;
    
    // Canary Logic
    if (m.is_canary) {
      const hash = Array.from(threadId || '').reduce((a, b) => a + b.charCodeAt(0), 0);
      if (hash % 100 >= (m.canary_percentage || 0)) return false;
    }
    
    return true;
  });

  if (preferredModelId) {
    const idx = eligible.findIndex(m => m.id === preferredModelId);
    if (idx > -1) { const [p] = eligible.splice(idx, 1); eligible.unshift(p); }
  }

  const fallbacks: string[] = [];
  for (const model of eligible) {
    try {
      const content = await callModel(env, model, messages);
      const latency = Date.now() - start;
      
      await env.DB.prepare(`UPDATE models SET health_status = 'healthy', last_ok_at = ?, last_error = NULL WHERE id = ?`).bind(nowStr, model.id).run();
      
      await logModelKPI(env, { workspaceId, threadId, preferred: preferredModelId, used: model.id, provider: model.provider_kind, success: true, latency, fallbacks: fallbacks.length });
      
      return { content, model_id: model.model_id, provider: model.provider_kind, fallbacks };
    } catch (e: any) {
      fallbacks.push(model.model_id);
      const cooloff = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await env.DB.prepare(`UPDATE models SET health_status = 'unhealthy', cooloff_until = ?, last_error = ? WHERE id = ?`).bind(cooloff, e.message, model.id).run();
      
      await logModelKPI(env, { workspaceId, threadId, preferred: preferredModelId, used: model.id, provider: model.provider_kind, success: false, latency: Date.now() - start, error: e.message, fallbacks: fallbacks.length });
    }
  }

  return { content: '', model_id: 'NONE', provider: 'DISABLED', fallbacks };
}
