import { Env } from './types';

// Simple in-memory token bucket for rate limiting (resets on Worker cold start, acceptable for basic free tier protection)
const rateLimits = new Map<string, { count: number; lastReset: number }>();
const MAX_REQUESTS_PER_MINUTE = 50;

export async function verifyLicense(modelId: string): Promise<string> {
  // Public HF API check
  const res = await fetch(`https://huggingface.co/api/models/${modelId}`);
  if (!res.ok) throw new Error('Could not fetch model metadata from Hugging Face');
  const data = await res.json() as { tags?: string[] };
  
  const licenseTag = data.tags?.find(t => t.startsWith('license:'));
  if (!licenseTag) throw new Error('No license tag found');
  
  const license = licenseTag.split(':')[1].toLowerCase();
  if (license !== 'apache-2.0' && license !== 'mit') {
    throw new Error(`License ${license} is not allowed. Only Apache-2.0 or MIT.`);
  }
  return license;
}

export function isJailbreak(name: string): boolean {
  const blocklist = ['jailbreak', 'uncensored', 'refusal', 'bypass', 'nsfw', 'dolphin', 'roleplay', 'unfiltered'];
  const lower = name.toLowerCase();
  return blocklist.some(badWord => lower.includes(badWord));
}

export async function callModelWithFallback(env: Env, messages: any[]): Promise<{ content: string; modelUsed: string | null }> {
  // 1. Fetch enabled FREE-only models ordered by priority
  const { results: models } = await env.DB.prepare(`
    SELECT * FROM models 
    WHERE enabled = 1 AND free_policy = 'FREE_ONLY' 
    ORDER BY priority DESC
  `).all();

  const now = new Date().getTime();

  for (const model of models as any[]) {
    // 2. Skip models in cooloff
    if (model.cooloff_until && new Date(model.cooloff_until).getTime() > now) {
      continue;
    }

    if (model.provider_kind === 'disabled') continue;

    try {
      // 3. Attempt model call with strict timeout (8s)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let response: Response;

      if (model.provider_kind === 'hf_routed_free') {
        const hfToken = env.HF_TOKEN || ''; // Read from wrangler secret if provided for higher free rate limits
        const headers: any = { 'Content-Type': 'application/json' };
        if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;
        
        response = await fetch(`https://api-inference.huggingface.co/models/${model.model_id}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: model.model_id,
            messages,
            max_tokens: 500
          }),
          signal: controller.signal
        });
      } else if (model.provider_kind === 'openai_compat_nonbilling') {
        response = await fetch(`${model.base_url}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.model_id,
            messages,
            max_tokens: 500
          }),
          signal: controller.signal
        });
      } else {
        clearTimeout(timeout);
        continue;
      }

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;

      if (content) {
        // 5. Mark healthy
        await env.DB.prepare(`UPDATE models SET health_status = 'healthy', last_ok_at = CURRENT_TIMESTAMP, cooloff_until = NULL WHERE id = ?`).bind(model.id).run();
        return { content, modelUsed: model.display_name };
      }
    } catch (e) {
      // 4. Mark unhealthy, set cooloff (10 minutes)
      const cooloff = new Date(now + 10 * 60 * 1000).toISOString();
      await env.DB.prepare(`UPDATE models SET health_status = 'unhealthy', cooloff_until = ? WHERE id = ?`).bind(cooloff, model.id).run();
      console.error(`Model ${model.model_id} failed:`, e);
      // Loop continues to next model
    }
  }

  // 6. Fallback to No-AI mode if all models fail or none exist
  return { content: '', modelUsed: null };
}

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