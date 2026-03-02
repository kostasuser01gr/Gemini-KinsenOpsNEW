import type { MiddlewareHandler } from 'hono';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { extractSessionCookie, isStepUpValid } from '../../auth';
import { hashPasswordArgon2id, verifyPassword } from '../../security/hash';
import type { Action, Role } from '../../types';
import { PERMISSIONS } from '../../types';
import type { AppBindings } from '../common';
import { jsonError, jsonSuccess } from '../common';

interface SessionJoinRow {
  user_id: string;
  role?: string;
}

interface UserSchemaColumn {
  name: string;
}

interface UserAuthRow {
  id: string;
  role?: string;
  password_hash?: string;
  pin_hash?: string;
}

export const STEP_UP_POLICY: Record<Action, boolean> = {
  'kb:read': false,
  'kb:write': false,
  'models:read': false,
  'models:write': true,
  'audit:read': true,
  'macros:read': false,
  'macros:write': false,
  'threads:read': false,
  'threads:write': false,
  'users:read': false,
  'users:write': true,
  'admin:export': true,
  'admin:import': true,
  'admin:retention': true,
  'vault:use': false,
  'vault:admin': true,
  'fleet:read': false,
  'fleet:write': false,
  'mcp:invoke': false,
};

function normalizeRole(value?: string): Role {
  if (value === 'admin' || value === 'manager') {
    return value;
  }
  return 'agent';
}

function getSessionToken(authHeader?: string | null, cookieHeader?: string | null): string | null {
  const sessionCookie = extractSessionCookie(cookieHeader);
  if (sessionCookie) {
    return sessionCookie;
  }

  const bearer = authHeader?.replace(/^Bearer\s+/i, '').trim();
  return bearer || null;
}

export const withAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = getSessionToken(c.req.header('Authorization'), c.req.header('Cookie'));
  if (!token) {
    c.res = jsonError(c.get('correlationId'), 401, 'AUTH_REQUIRED', 'Unauthorized');
    return;
  }

  const row = await c.env.DB
    .prepare(
      'SELECT s.user_id as user_id, u.role as role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP',
    )
    .bind(token)
    .first<SessionJoinRow>();

  if (!row?.user_id) {
    c.res = jsonError(c.get('correlationId'), 401, 'AUTH_INVALID', 'Unauthorized');
    return;
  }

  c.set('sessionId', token);
  c.set('user', {
    user_id: row.user_id,
    workspace_id: 'ws_default_public',
    role: normalizeRole(row.role),
  });

  await next();
};

export function requirePermission(action: Action): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const principal = c.get('user');
    const allowed = PERMISSIONS[principal.role].includes(action);
    if (!allowed) {
      c.res = jsonError(c.get('correlationId'), 403, 'AUTH_FORBIDDEN', 'Permission denied', { action });
      return;
    }

    if (STEP_UP_POLICY[action]) {
      const sessionId = c.get('sessionId');
      if (!sessionId || !c.env.JAIL) {
        c.res = jsonError(c.get('correlationId'), 403, 'STEP_UP_REQUIRED', 'Step-up authentication required');
        return;
      }
      const value = await c.env.JAIL.get(`stepup:${sessionId}`);
      if (!isStepUpValid(value)) {
        c.res = jsonError(c.get('correlationId'), 403, 'STEP_UP_REQUIRED', 'Step-up authentication required');
        return;
      }
    }

    await next();
  };
}

export function requireStepUp(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const sessionId = c.get('sessionId');
    if (!sessionId || !c.env.JAIL) {
      c.res = jsonError(c.get('correlationId'), 403, 'STEP_UP_REQUIRED', 'Step-up authentication required');
      return;
    }

    const value = await c.env.JAIL.get(`stepup:${sessionId}`);
    if (!isStepUpValid(value)) {
      c.res = jsonError(c.get('correlationId'), 403, 'STEP_UP_REQUIRED', 'Step-up authentication required');
      return;
    }

    await next();
  };
}

const signupSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).max(64).optional(),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const stepUpSchema = z.object({
  password: z.string().min(1),
});

async function detectUserSchemaColumns(c: Context<AppBindings>): Promise<Set<string>> {
  const cols = await c.env.DB.prepare('PRAGMA table_info(users)').all<UserSchemaColumn>();
  return new Set((cols.results || []).map((item) => item.name));
}

export function registerAuthRoutes(app: Hono<AppBindings>) {
  const signupHandler = async (c: Context<AppBindings>) => {
    const parsed = signupSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid signup payload', {
        issues: parsed.error.issues,
      });
    }
    const body = parsed.data;
    const columns = await detectUserSchemaColumns(c);

    const userId = crypto.randomUUID();
    const passwordHash = await hashPasswordArgon2id(body.password);

    if (columns.has('email') && columns.has('password_hash')) {
      const email = body.email || `${userId}@local.invalid`;
      await c.env.DB
        .prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .bind(userId, email, passwordHash, 'agent')
        .run();
    } else if (columns.has('name') && columns.has('pin_hash')) {
      const name = body.name || body.email?.split('@')[0] || `user_${Date.now()}`;
      await c.env.DB
        .prepare('INSERT INTO users (id, name, pin_hash, role) VALUES (?, ?, ?, ?)')
        .bind(userId, name, passwordHash, 'agent')
        .run();
    } else {
      return jsonError(c.get('correlationId'), 500, 'INTERNAL_ERROR', 'Unsupported users schema');
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await c.env.DB
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, userId, expiresAt)
      .run();

    c.header('Set-Cookie', `session=${sessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);
    return jsonSuccess(c.get('correlationId'), { user_id: userId, strategy: 'db_sessions', session_token: sessionId });
  };

  app.post('/api/v1/auth/signup', signupHandler);

  app.post('/api/auth/signup', signupHandler);

  const loginHandler = async (c: Context<AppBindings>) => {
    const parsed = loginSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid login payload', {
        issues: parsed.error.issues,
      });
    }
    const { identifier, password } = parsed.data;
    const columns = await detectUserSchemaColumns(c);

    let user: UserAuthRow | null = null;
    if (columns.has('email') && columns.has('password_hash')) {
      user = await c.env.DB
        .prepare('SELECT id, role, password_hash FROM users WHERE email = ? LIMIT 1')
        .bind(identifier)
        .first<UserAuthRow>();
    } else if (columns.has('name') && columns.has('pin_hash')) {
      user = await c.env.DB
        .prepare('SELECT id, role, pin_hash FROM users WHERE name = ? LIMIT 1')
        .bind(identifier)
        .first<UserAuthRow>();
    }

    const hash = user?.password_hash || user?.pin_hash;
    if (!user || !hash || !(await verifyPassword(password, hash))) {
      return jsonError(c.get('correlationId'), 401, 'AUTH_INVALID', 'Invalid credentials');
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await c.env.DB
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, user.id, expiresAt)
      .run();

    c.header('Set-Cookie', `session=${sessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);
    return jsonSuccess(c.get('correlationId'), {
      user_id: user.id,
      role: normalizeRole(user.role),
      strategy: 'db_sessions',
      session_token: sessionId,
    });
  };

  app.post('/api/v1/auth/login', loginHandler);
  app.post('/api/auth/login', loginHandler);

  app.post('/api/v1/auth/refresh', withAuth, async (c) => {
    const sessionId = c.get('sessionId');
    if (!sessionId) {
      return jsonError(c.get('correlationId'), 401, 'AUTH_INVALID', 'Missing session');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await c.env.DB
      .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(expiresAt, sessionId)
      .run();

    c.header('Set-Cookie', `session=${sessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);
    return jsonSuccess(c.get('correlationId'), { expires_at: expiresAt, session_token: sessionId });
  });

  app.post('/api/v1/auth/step-up', withAuth, async (c) => {
    const parsed = stepUpSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid step-up payload', {
        issues: parsed.error.issues,
      });
    }
    const sessionId = c.get('sessionId');
    if (!sessionId || !c.env.JAIL) {
      return jsonError(c.get('correlationId'), 500, 'INTERNAL_ERROR', 'Step-up storage unavailable');
    }

    const userId = c.get('user').user_id;
    const columns = await detectUserSchemaColumns(c);
    let user: UserAuthRow | null = null;

    if (columns.has('password_hash')) {
      user = await c.env.DB
        .prepare('SELECT id, password_hash FROM users WHERE id = ? LIMIT 1')
        .bind(userId)
        .first<UserAuthRow>();
    } else {
      user = await c.env.DB
        .prepare('SELECT id, pin_hash FROM users WHERE id = ? LIMIT 1')
        .bind(userId)
        .first<UserAuthRow>();
    }

    const hash = user?.password_hash || user?.pin_hash;
    if (!hash || !(await verifyPassword(parsed.data.password, hash))) {
      return jsonError(c.get('correlationId'), 401, 'AUTH_INVALID', 'Invalid credentials');
    }

    const grantedAt = new Date().toISOString();
    await c.env.JAIL.put(`stepup:${sessionId}`, grantedAt, { expirationTtl: 15 * 60 });

    return jsonSuccess(c.get('correlationId'), { step_up_until: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  });
}
