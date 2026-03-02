import { Env } from './types';

export interface Model {
  id: string;
  display_name: string;
  provider_kind: 'DISABLED' | 'HF_ROUTED_FREE' | 'CF_WORKERS_AI_FREE';
  model_id: string;
  base_url?: string;
  enabled: number;
  priority: number;
  license?: string;
  free_policy: string;
  health_status: string;
  cooloff_until?: string;
}

const BLOCKLIST = ['jailbreak', 'uncensored', 'refusal', 'bypass', 'nsfw', 'exploit', 'illegal', 'dolphin', 'roleplay'];

export function isBlocked(name: string): boolean {
  const lower = name.toLowerCase();
  return BLOCKLIST.some(term => lower.includes(badWord => lower.includes(term)));
}

// Actually my previous implementation of isJailbreak was a bit bugged in syntax, fixing it here
export function isModelBlocked(modelId: string, displayName: string): boolean {
  const text = (modelId + ' ' + displayName).toLowerCase();
  return BLOCKLIST.some(term => text.includes(term));
}

export async function verifyHFLicense(modelId: string): Promise<string> {
  const res = await fetch(`https://huggingface.co/api/models/${modelId}`);
  if (!res.ok) throw new Error('HF model not found or API error');
  const data = await res.json() as any;
  const license = data.cardData?.license || data.tags?.find((t: string) => t.startsWith('license:'))?.split(':')[1];
  if (!license) throw new Error('No license information found for this model');
  return license.toLowerCase();
}

export const ALLOWED_LICENSES = ['apache-2.0', 'mit', 'bsd', 'openrail'];

export async function callModel(env: Env, model: Model, messages: any[]): Promise<string> {
  if (model.provider_kind === 'HF_ROUTED_FREE') {
    const hfToken = env.HF_TOKEN;
    const headers: any = { 'Content-Type': 'application/json' };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    const res = await fetch(`https://api-inference.huggingface.co/models/${model.model_id}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.model_id,
        messages,
        max_tokens: 1000,
        stream: false
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HF Error (${res.status}): ${err}`);
    }
    const data = await res.json() as any;
    return data.choices[0].message.content;
  }

  if (model.provider_kind === 'CF_WORKERS_AI_FREE') {
    if (!env.AI) throw new Error('Workers AI not configured');
    // Simplified: check if neurones left (approximate or just let it fail)
    // Cloudflare Workers AI free tier is 10,000 neurons per day.
    const res = await env.AI.run(model.model_id, {
      messages,
      max_tokens: 1000
    });
    return res.response || res.choices?.[0]?.message?.content;
  }

  throw new Error('Unsupported provider');
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

export async function routeChat(env: Env, messages: any[], preferredModelId?: string): Promise<{ content: string, model_id: string, provider: string, fallbacks: string[] }> {
  const now = new Date().toISOString();
  
  // Get candidate models
  let query = `SELECT * FROM models WHERE enabled = 1 AND free_policy = 'FREE_ONLY'`;
  const candidatesRaw = await env.DB.prepare(query).all();
  let candidates = candidatesRaw.results as unknown as Model[];

  // Filter by cooloff
  candidates = candidates.filter(m => !m.cooloff_until || m.cooloff_until < now);

  // Sort by priority (high first)
  candidates.sort((a, b) => b.priority - a.priority);

  // If preferred model exists and is healthy, put it first
  if (preferredModelId) {
    const idx = candidates.findIndex(m => m.id === preferredModelId);
    if (idx > -1) {
      const [pref] = candidates.splice(idx, 1);
      candidates.unshift(pref);
    }
  }

  const fallbacks: string[] = [];
  for (const model of candidates) {
    try {
      const content = await callModel(env, model, messages);
      // Mark healthy
      await env.DB.prepare(`UPDATE models SET health_status = 'healthy', last_ok_at = ?, last_error = NULL WHERE id = ?`).bind(now, model.id).run();
      return { content, model_id: model.model_id, provider: model.provider_kind, fallbacks };
    } catch (e: any) {
      fallbacks.push(model.model_id);
      // Mark unhealthy + cooloff 10m
      const cooloff = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await env.DB.prepare(`UPDATE models SET health_status = 'unhealthy', cooloff_until = ?, last_error = ? WHERE id = ?`)
        .bind(cooloff, e.message, model.id).run();
    }
  }

  // Final fallback: No-AI mode (handled by caller)
  return { content: '', model_id: 'NONE', provider: 'DISABLED', fallbacks };
}
