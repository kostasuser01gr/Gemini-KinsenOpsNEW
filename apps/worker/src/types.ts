export type Role = 'admin' | 'manager' | 'agent';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ENABLE_CF_ACCESS?: string;
  CF_ACCESS_JWKS_URL?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_ALLOWLIST_EMAILS?: string;
  HF_TOKEN?: string;
}

export type Action = 
  | 'fleet:read' | 'fleet:write'
  | 'bookings:read' | 'bookings:write'
  | 'kb:read' | 'kb:write'
  | 'models:read' | 'models:write'
  | 'audit:read'
  | 'macros:read' | 'macros:write'
  | 'kpis:read' | 'kpis:write';
