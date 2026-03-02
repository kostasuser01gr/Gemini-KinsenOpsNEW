export type Role = 'admin' | 'manager' | 'agent';

export interface User {
  id: string;
  email: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role_in_workspace: Role;
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
  REQUIRE_INVITE_CODE?: string;
  STRICT_FREE_MODE?: string; // "true" | "false"
  THREAD_ARCHIVE_DAYS?: string;
  AUDIT_ARCHIVE_DAYS?: string;
}

export type Action = 
  | 'kb:read' | 'kb:write'
  | 'models:read' | 'models:write'
  | 'audit:read'
  | 'macros:read' | 'macros:write'
  | 'threads:read' | 'threads:write'
  | 'users:read' | 'users:write'
  | 'admin:export' | 'admin:import'
  | 'admin:retention';

export const PERMISSIONS: Record<Role, Action[]> = {
  admin: [
    'kb:read', 'kb:write',
    'models:read', 'models:write',
    'audit:read',
    'macros:read', 'macros:write',
    'threads:read', 'threads:write',
    'users:read', 'users:write',
    'admin:export', 'admin:import',
    'admin:retention'
  ],
  manager: [
    'kb:read', 'kb:write',
    'models:read',
    'macros:read', 'macros:write',
    'threads:read', 'threads:write',
    'users:read'
  ],
  agent: [
    'kb:read',
    'macros:read',
    'threads:read', 'threads:write'
  ]
};

// Extension for request type to handle workspace context
declare module 'itty-router' {
  interface IRequest {
    userId?: string;
    workspaceId?: string;
    userRole?: Role;
    correlationId?: string;
    waitUntil?: (promise: Promise<any>) => void;
  }
}
