import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { ApiErrorCode, ApiErrorEnvelope, ApiSuccessEnvelope } from '@gemini/contracts';
import type { Env, SessionPrincipal } from '../types';

export interface AppBindings {
  Bindings: Env;
  Variables: {
    user: SessionPrincipal;
    correlationId: string;
    sessionId?: string;
  };
}

export type AppMiddleware = MiddlewareHandler<AppBindings>;

export function parseOrigins(env: Env): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getCorrelationId(input?: string | null): string {
  return input || `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function jsonSuccess<T>(correlationId: string, data: T, meta?: Record<string, unknown>): Response {
  const body: ApiSuccessEnvelope<T> = {
    ok: true,
    data,
    correlation_id: correlationId,
    meta,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
  });
}

export function jsonError(
  correlationId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  retryAfter?: number,
  hint?: string,
): Response {
  const envelope: ApiErrorEnvelope = {
    code,
    message,
    correlation_id: correlationId,
    details,
    retry_after: retryAfter,
    hint,
  };

  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
  });
}

export const withCorrelation: AppMiddleware = async (c, next) => {
  const correlationId = getCorrelationId(c.req.header('x-correlation-id'));
  c.set('correlationId', correlationId);
  await next();
  c.header('x-correlation-id', correlationId);
};

export const withCors = cors({
  origin: (origin, c) => {
    const allowed = parseOrigins(c.env);
    if (!origin) {
      return allowed[0] || '*';
    }
    return allowed.includes(origin) ? origin : allowed[0] || '*';
  },
  credentials: true,
});

export const withStructuredLogs: AppMiddleware = async (c, next) => {
  const startedAt = Date.now();
  await next();
  const entry = {
    level: 'info',
    ts: new Date().toISOString(),
    correlation_id: c.get('correlationId'),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    latency_ms: Date.now() - startedAt,
  };
  console.log(JSON.stringify(entry));
};

export function serviceSloStatus(name: string): Array<{ service: string; window: '5m' | '1h' | '24h'; availability: number; latency_p95_ms: number; error_rate: number; burn_rate: number }> {
  return [
    { service: name, window: '5m', availability: 99.95, latency_p95_ms: 320, error_rate: 0.001, burn_rate: 0.2 },
    { service: name, window: '1h', availability: 99.92, latency_p95_ms: 410, error_rate: 0.0012, burn_rate: 0.45 },
    { service: name, window: '24h', availability: 99.9, latency_p95_ms: 460, error_rate: 0.0016, burn_rate: 0.85 },
  ];
}
