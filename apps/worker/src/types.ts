export type Role = 'admin' | 'manager' | 'agent';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Env {
  DB: D1Database;
  AI?: any; 
  JWT_SECRET?: string;
  ENABLE_CF_ACCESS?: string;
  CF_ACCESS_JWKS_URL?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_ALLOWLIST_EMAILS?: string;
  HF_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export type Action = 
  | 'fleet:read' | 'fleet:write'
  | 'kb:read' | 'kb:write'
  | 'models:read' | 'models:write'
  | 'audit:read'
  | 'macros:read' | 'macros:write'
  | 'threads:read' | 'threads:write';

export const PERMISSIONS: Record<Role, Action[]> = {
  admin: [
    'fleet:read', 'fleet:write',
    'kb:read', 'kb:write',
    'models:read', 'models:write',
    'audit:read',
    'macros:read', 'macros:write',
    'threads:read', 'threads:write'
  ],
  manager: [
    'fleet:read', 'fleet:write',
    'kb:read', 'kb:write',
    'models:read',
    'macros:read', 'macros:write',
    'threads:read', 'threads:write'
  ],
  agent: [
    'fleet:read',
    'kb:read',
    'macros:read',
    'threads:read', 'threads:write'
  ]
};
