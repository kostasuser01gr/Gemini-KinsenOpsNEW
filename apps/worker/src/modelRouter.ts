import type { Env, ModelInvocationResult, ProviderKind } from './types';
import { callCFModel } from './providers/cf';
import { callHFModel } from './providers/hf';
import { callMockModel } from './providers/mock';

export interface Model {
  id: string;
  workspace_id?: string;
  display_name: string;
  provider_kind: ProviderKind;
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

export interface ChatInputMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ModelPolicyRow {
  workspace_id: string;
  preferred_models: string | null;
  max_fallback_depth: number | null;
  max_latency_ms: number | null;
  daily_token_budget: number | null;
}

interface WorkspaceSpendRow {
  spent_tokens: number;
}

interface ModelKpiEvent {
  workspaceId: string;
  threadId?: string;
  preferred?: string;
  used: string;
  provider: Model['provider_kind'];
  success: boolean;
  latency: number;
  error?: string;
  fallbacks: number;
  cacheHit?: boolean;
}

const BLOCKLIST = ['jailbreak', 'uncensored', 'refusal', 'bypass', 'nsfw', 'exploit', 'illegal'];
const MAX_REQUESTS_PER_MINUTE = 50;
const MODEL_CACHE_TTL_SECONDS = 300;
const COOLOFF_TTL_SECONDS = 10 * 60;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function canPromptBeCached(messages: ChatInputMessage[]): boolean {
  const latest = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (!latest || latest.length > 320) {
    return false;
  }
  return !BLOCKLIST.some((term) => latest.includes(term));
}

async function digestString(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getModelPolicy(env: Env, workspaceId: string): Promise<{ preferredModels: string[]; maxFallbackDepth: number; maxLatencyMs: number; dailyTokenBudget: number }> {
  try {
    const row = await env.DB
      .prepare('SELECT workspace_id, preferred_models, max_fallback_depth, max_latency_ms, daily_token_budget FROM model_policies WHERE workspace_id = ?')
      .bind(workspaceId)
      .first<ModelPolicyRow>();

    const preferred = row?.preferred_models ? JSON.parse(row.preferred_models) : [];
    return {
      preferredModels: Array.isArray(preferred) ? preferred : [],
      maxFallbackDepth: row?.max_fallback_depth || 3,
      maxLatencyMs: row?.max_latency_ms || 12000,
      dailyTokenBudget: row?.daily_token_budget || 500000,
    };
  } catch {
    return {
      preferredModels: [],
      maxFallbackDepth: 3,
      maxLatencyMs: 12000,
      dailyTokenBudget: 500000,
    };
  }
}

async function isWorkspaceBudgetAvailable(env: Env, workspaceId: string, budget: number): Promise<boolean> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const row = await env.DB
      .prepare('SELECT spent_tokens FROM workspace_daily_spend WHERE workspace_id = ? AND day = ?')
      .bind(workspaceId, day)
      .first<WorkspaceSpendRow>();

    return (row?.spent_tokens || 0) < budget;
  } catch {
    return true;
  }
}

async function incrementWorkspaceSpend(env: Env, workspaceId: string, tokens: number): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    await env.DB
      .prepare(
        `INSERT INTO workspace_daily_spend (workspace_id, day, spent_tokens)
         VALUES (?, ?, ?)
         ON CONFLICT(workspace_id, day) DO UPDATE SET spent_tokens = spent_tokens + excluded.spent_tokens`,
      )
      .bind(workspaceId, day, tokens)
      .run();
  } catch {
    // best-effort accounting
  }
}

async function logModelKPI(env: Env, event: ModelKpiEvent): Promise<void> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.DB
    .prepare(
      `INSERT INTO model_call_events (id, workspace_id, thread_id, preferred_model_id, used_model_id, provider_kind, success, latency_ms, error_code, fallbacks_count, strict_free_mode, cache_hit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      event.workspaceId,
      event.threadId || null,
      event.preferred || null,
      event.used,
      event.provider,
      event.success ? 1 : 0,
      event.latency,
      event.error || null,
      event.fallbacks,
      env.STRICT_FREE_MODE === 'false' ? 0 : 1,
      event.cacheHit ? 1 : 0,
    )
    .run()
    .catch(() => Promise.resolve());
}

async function setProviderHealth(
  env: Env,
  model: Model,
  state: 'healthy' | 'degraded' | 'cooloff' | 'disabled',
  reason: string,
  until?: string,
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO provider_health (provider, model_id, state, reason, until_ts, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(provider, model_id) DO UPDATE SET
       state = excluded.state,
       reason = excluded.reason,
       until_ts = excluded.until_ts,
       updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(model.provider_kind, model.model_id, state, reason, until || null)
    .run()
    .catch(() => Promise.resolve());

  await env.DB
    .prepare('UPDATE models SET health_status = ?, cooloff_until = ?, last_error = ? WHERE id = ?')
    .bind(state, until || null, reason, model.id)
    .run()
    .catch(() => Promise.resolve());
}

async function isCircuitOpen(env: Env, provider: string, modelId: string): Promise<boolean> {
  if (!env.JAIL) {
    return false;
  }
  const value = await env.JAIL.get(`cb:${provider}:${modelId}`);
  return value === 'open';
}

async function openCircuit(env: Env, provider: string, modelId: string): Promise<void> {
  if (!env.JAIL) {
    return;
  }
  await env.JAIL.put(`cb:${provider}:${modelId}`, 'open', { expirationTtl: COOLOFF_TTL_SECONDS });
}

async function closeCircuit(env: Env, provider: string, modelId: string): Promise<void> {
  if (!env.JAIL) {
    return;
  }
  await env.JAIL.delete(`cb:${provider}:${modelId}`);
}

async function getCachedResult(env: Env, key: string): Promise<string | null> {
  if (!env.JAIL) {
    return null;
  }
  return env.JAIL.get(`model_cache:${key}`);
}

async function setCachedResult(env: Env, key: string, value: string): Promise<void> {
  if (!env.JAIL) {
    return;
  }
  await env.JAIL.put(`model_cache:${key}`, value, { expirationTtl: MODEL_CACHE_TTL_SECONDS });
}

async function callProvider(env: Env, model: Model, messages: ChatInputMessage[]): Promise<string> {
  if (model.provider_kind === 'HF_ROUTED_FREE') {
    return callHFModel(env, model, messages);
  }
  if (model.provider_kind === 'CF_WORKERS_AI_FREE') {
    return callCFModel(env, model, messages);
  }
  return callMockModel(model, messages);
}

export function isModelBlocked(modelId: string, displayName: string): boolean {
  const text = `${modelId} ${displayName}`.toLowerCase();
  return BLOCKLIST.some((term) => text.includes(term));
}

export function selectEligibleModels(
  candidates: Model[],
  strictFreeMode: boolean,
  nowIso: string,
  threadId?: string,
): Model[] {
  return candidates.filter((model) => {
    if (strictFreeMode && model.free_policy !== 'FREE_ONLY') {
      return false;
    }

    if (model.cooloff_until && model.cooloff_until > nowIso) {
      return false;
    }

    if (isModelBlocked(model.model_id, model.display_name)) {
      return false;
    }

    if (model.is_canary) {
      const hash = Array.from(threadId || '').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      return hash % 100 < (model.canary_percentage || 0);
    }

    return true;
  });
}

export function prioritizePreferredModel(models: Model[], preferredModelId?: string): Model[] {
  if (!preferredModelId) {
    return models;
  }

  const idx = models.findIndex((model) => model.id === preferredModelId || model.model_id === preferredModelId);
  if (idx < 0) {
    return models;
  }

  const copy = [...models];
  const [preferred] = copy.splice(idx, 1);
  copy.unshift(preferred);
  return copy;
}

export async function checkRateLimit(env: Env, userId: string): Promise<boolean> {
  if (!env.JAIL) {
    return true;
  }

  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `ratelimit:${userId}:${minuteBucket}`;
  const current = parseInt((await env.JAIL.get(key)) || '0', 10);

  if (current >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  await env.JAIL.put(key, String(current + 1), { expirationTtl: 90 });
  return true;
}

export async function routeChat(
  env: Env,
  workspaceId: string,
  messages: ChatInputMessage[],
  threadId?: string,
  preferredModelId?: string,
): Promise<ModelInvocationResult> {
  const start = Date.now();
  const nowIso = new Date().toISOString();
  const strictFreeMode = env.STRICT_FREE_MODE !== 'false';
  const policy = await getModelPolicy(env, workspaceId);

  if (!(await isWorkspaceBudgetAvailable(env, workspaceId, policy.dailyTokenBudget))) {
    return {
      content: 'Workspace daily budget reached. Try again tomorrow or request budget increase.',
      model_id: 'NONE',
      provider: 'DISABLED',
      latency_ms: Date.now() - start,
      fallbacks: [],
      cache_hit: false,
    };
  }

  const result = await env.DB
    .prepare('SELECT * FROM models WHERE workspace_id = ? AND enabled = 1 ORDER BY priority DESC')
    .bind(workspaceId)
    .all<Model>();

  const candidates = result.results || [];
  const selectedPreferred = preferredModelId || policy.preferredModels[0];

  const eligible = prioritizePreferredModel(
    selectEligibleModels(candidates, strictFreeMode, nowIso, threadId),
    selectedPreferred,
  ).slice(0, policy.maxFallbackDepth + 1);

  const fallbacks: string[] = [];

  for (const model of eligible) {
    if (await isCircuitOpen(env, model.provider_kind, model.model_id)) {
      fallbacks.push(`${model.model_id}:circuit_open`);
      continue;
    }

    const cacheable = canPromptBeCached(messages);
    const cacheKey = cacheable
      ? await digestString(`${workspaceId}:${model.model_id}:${messages.map((m) => `${m.role}:${m.content}`).join('|')}`)
      : '';

    if (cacheable) {
      const cached = await getCachedResult(env, cacheKey);
      if (cached) {
        await logModelKPI(env, {
          workspaceId,
          threadId,
          preferred: selectedPreferred,
          used: model.id,
          provider: model.provider_kind,
          success: true,
          latency: Date.now() - start,
          fallbacks: fallbacks.length,
          cacheHit: true,
        });

        return {
          content: cached,
          model_id: model.model_id,
          provider: model.provider_kind,
          latency_ms: Date.now() - start,
          fallbacks,
          cache_hit: true,
        };
      }
    }

    try {
      const content = await callProvider(env, model, messages);
      const latency = Date.now() - start;

      await setProviderHealth(env, model, 'healthy', 'ok');
      await closeCircuit(env, model.provider_kind, model.model_id);
      await incrementWorkspaceSpend(env, workspaceId, Math.max(200, Math.ceil(content.length * 0.8)));

      if (cacheable) {
        await setCachedResult(env, cacheKey, content);
      }

      await logModelKPI(env, {
        workspaceId,
        threadId,
        preferred: selectedPreferred,
        used: model.id,
        provider: model.provider_kind,
        success: true,
        latency,
        fallbacks: fallbacks.length,
      });

      return {
        content,
        model_id: model.model_id,
        provider: model.provider_kind,
        latency_ms: latency,
        fallbacks,
        cache_hit: false,
      };
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      const cooloffUntil = new Date(Date.now() + COOLOFF_TTL_SECONDS * 1000).toISOString();
      fallbacks.push(model.model_id);

      await setProviderHealth(env, model, 'cooloff', message, cooloffUntil);
      await openCircuit(env, model.provider_kind, model.model_id);
      await logModelKPI(env, {
        workspaceId,
        threadId,
        preferred: selectedPreferred,
        used: model.id,
        provider: model.provider_kind,
        success: false,
        latency: Date.now() - start,
        error: message,
        fallbacks: fallbacks.length,
      });
    }
  }

  return {
    content: 'No healthy model available. Please retry shortly.',
    model_id: 'NONE',
    provider: 'DISABLED',
    latency_ms: Date.now() - start,
    fallbacks,
    cache_hit: false,
  };
}
