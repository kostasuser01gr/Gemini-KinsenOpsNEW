import type { AppMiddleware } from '../common';
import { jsonError } from '../common';

const DEFAULT_TTL_SECONDS = 300;

export function withIdempotency(scope: string, ttlSeconds = DEFAULT_TTL_SECONDS): AppMiddleware {
  return async (c, next) => {
    const key = c.req.header('Idempotency-Key')?.trim();
    const principal = c.get('user');

    if (!key || !c.env.JAIL || !principal) {
      await next();
      return;
    }

    const storageKey = `idem:${scope}:${principal.user_id}:${key}`;
    const existing = await c.env.JAIL.get(storageKey);
    if (existing) {
      c.res = jsonError(
        c.get('correlationId'),
        409,
        'IDEMPOTENCY_REPLAY',
        'Duplicate idempotency key',
        { scope, key },
      );
      return;
    }

    await c.env.JAIL.put(
      storageKey,
      JSON.stringify({
        key,
        scope,
        principal_id: principal.user_id,
        status: 'processing',
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      }),
      { expirationTtl: ttlSeconds },
    );

    await next();

    await c.env.JAIL.put(
      storageKey,
      JSON.stringify({
        key,
        scope,
        principal_id: principal.user_id,
        status: 'done',
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      }),
      { expirationTtl: ttlSeconds },
    );
  };
}
