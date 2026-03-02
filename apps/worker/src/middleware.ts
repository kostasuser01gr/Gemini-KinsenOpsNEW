import { IRequest, error } from 'itty-router';
import { Env, Action, Role } from './types';
import { hasPermission } from './rbac';
import * as jose from 'jose';

export const withCorrelationId = (req: IRequest) => {
  req.correlationId = req.headers.get('x-correlation-id') || ('req_' + Date.now() + Math.random().toString(36).substring(2));
};

export const withAuth = async (req: IRequest, env: Env) => {
  if (env.ENABLE_CF_ACCESS === 'true') {
    const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
    if (!jwt) return error(401, 'Missing CF Access JWT');
    
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(env.CF_ACCESS_JWKS_URL!));
      const { payload } = await jose.jwtVerify(jwt, JWKS, {
        audience: env.CF_ACCESS_AUD
      });
      const email = payload.email as string;
      
      let user = await env.DB.prepare('SELECT id, role FROM users WHERE email = ?').bind(email).first();
      
      if (!user) {
        const allowlist = (env.ADMIN_ALLOWLIST_EMAILS || '').split(',').map(e => e.trim());
        const role = allowlist.includes(email) ? 'admin' : 'agent';
        const id = 'u_' + Date.now();
        await env.DB.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
          .bind(id, email, 'cf_access', role).run();
        user = { id, role };
      }
      
      req.userId = user.id;
      req.userRole = user.role;
      return;
    } catch (e) {
      return error(401, 'Invalid CF Access JWT');
    }
  }

  // Fallback simple token auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return error(401, 'Unauthorized');
  
  const user = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(token).first();
  if (!user) return error(401, 'Unauthorized');
  
  req.userId = user.id;
  req.userRole = user.role;
};

export const requirePermission = (action: Action) => {
  return (req: IRequest) => {
    if (!hasPermission(req.userRole as Role, action)) {
      return error(403, `Forbidden: requires ${action}`);
    }
  };
};
