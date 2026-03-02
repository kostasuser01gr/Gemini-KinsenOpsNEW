import type {
  ApiErrorCode,
  ApiErrorEnvelope,
  ChatMessageDTO,
  IdempotencyRecord,
  McpMethodContract,
  ModelPolicy,
  ModelInvocationResult,
  ProviderHealth,
  SessionPrincipal,
  SLOStatus,
} from '@gemini/contracts';

export type {
  ApiErrorCode,
  ApiErrorEnvelope,
  ChatMessageDTO,
  IdempotencyRecord,
  McpMethodContract,
  ModelPolicy,
  ModelInvocationResult,
  ProviderHealth,
  SessionPrincipal,
  SLOStatus,
};

export type Role = 'admin' | 'manager' | 'agent';

export interface User {
  id: string;
  email?: string;
  name?: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role_in_workspace: Role;
}

export interface WorkerAIResponse {
  response?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

export interface WorkerAI {
  run(model: string, payload: Record<string, unknown>): Promise<WorkerAIResponse>;
}

export type ProviderKind = 'DISABLED' | 'HF_ROUTED_FREE' | 'CF_WORKERS_AI_FREE' | 'MOCK';

export interface Env {
  DB: D1Database;
  SESSIONS?: KVNamespace;
  JAIL?: KVNamespace;
  BACKUPS?: R2Bucket;
  AI?: WorkerAI;
  THREAD_ROOM?: DurableObjectNamespace;
  SESSION_SECRET?: string;
  JWT_SECRET?: string;
  ENABLE_CF_ACCESS?: string;
  CF_ACCESS_JWKS_URL?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_ALLOWLIST_EMAILS?: string;
  HF_API_TOKEN?: string;
  HF_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  REQUIRE_INVITE_CODE?: string;
  STRICT_FREE_MODE?: string;
  THREAD_ARCHIVE_DAYS?: string;
  AUDIT_ARCHIVE_DAYS?: string;
  MCP_API_KEY?: string;
  CORS_ALLOWED_ORIGINS?: string;
  API_BASE_URL?: string;
  ENABLE_CANARY_DEPLOY?: string;
  CANARY_PERCENTAGE?: string;
  MIGRATION_GUARD_ENABLED?: string;
}

export type Action =
  | 'kb:read'
  | 'kb:write'
  | 'models:read'
  | 'models:write'
  | 'audit:read'
  | 'macros:read'
  | 'macros:write'
  | 'threads:read'
  | 'threads:write'
  | 'users:read'
  | 'users:write'
  | 'admin:export'
  | 'admin:import'
  | 'admin:retention'
  | 'vault:use'
  | 'vault:admin'
  | 'fleet:read'
  | 'fleet:write'
  | 'mcp:invoke';

export const PERMISSIONS: Record<Role, Action[]> = {
  admin: [
    'kb:read',
    'kb:write',
    'models:read',
    'models:write',
    'audit:read',
    'macros:read',
    'macros:write',
    'threads:read',
    'threads:write',
    'users:read',
    'users:write',
    'admin:export',
    'admin:import',
    'admin:retention',
    'vault:use',
    'vault:admin',
    'fleet:read',
    'fleet:write',
    'mcp:invoke',
  ],
  manager: [
    'kb:read',
    'kb:write',
    'models:read',
    'macros:read',
    'macros:write',
    'threads:read',
    'threads:write',
    'users:read',
    'vault:use',
    'fleet:read',
    'fleet:write',
    'mcp:invoke',
  ],
  agent: ['kb:read', 'macros:read', 'threads:read', 'threads:write', 'vault:use', 'fleet:read'],
};
