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
    // Approximate neuron usage (simple count for free tier safety)
    await logCFUsage(env, 100); 
    return res.response || res.choices?.[0]?.message?.content;
  }

  throw new Error('Unsupported');
}

export async function routeChat(env: Env, messages: any[], preferredModelId?: string): Promise<{ content: string, model_id: string, provider: string, fallbacks: string[] }> {
  const now = new Date().toISOString();
  const candidates = (await env.DB.prepare(`SELECT * FROM models WHERE enabled = 1 AND free_policy = 'FREE_ONLY' ORDER BY priority DESC`).all()).results as unknown as Model[];
  
  const healthy = candidates.filter(m => !m.cooloff_until || m.cooloff_until < now);
  if (preferredModelId) {
    const idx = healthy.findIndex(m => m.id === preferredModelId);
    if (idx > -1) { const [p] = healthy.splice(idx, 1); healthy.unshift(p); }
  }

  const fallbacks: string[] = [];
  for (const model of healthy) {
    try {
      const content = await callModel(env, model, messages);
      await env.DB.prepare(`UPDATE models SET health_status = 'healthy', last_ok_at = ?, last_error = NULL WHERE id = ?`).bind(now, model.id).run();
      return { content, model_id: model.model_id, provider: model.provider_kind, fallbacks };
    } catch (e: any) {
      fallbacks.push(model.model_id);
      const cooloff = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await env.DB.prepare(`UPDATE models SET health_status = 'unhealthy', cooloff_until = ?, last_error = ? WHERE id = ?`).bind(cooloff, e.message, model.id).run();
    }
  }

  return { content: '', model_id: 'NONE', provider: 'DISABLED', fallbacks };
}
