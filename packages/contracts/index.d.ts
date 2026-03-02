import { z } from 'zod';

export const apiErrorCodeSchema: z.ZodEnum<[
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'AUTH_FORBIDDEN',
  'STEP_UP_REQUIRED',
  'RATE_LIMITED',
  'IDEMPOTENCY_REPLAY',
  'MCP_AUTH_FAILED',
  'MCP_METHOD_UNSUPPORTED',
  'NOT_READY',
  'BACKUPS_UNBOUND',
  'INVALID_FILE',
  'INVALID_FLEET_ID',
  'INVALID_REQUEST',
  'INTERNAL_ERROR'
]>;

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
  correlation_id: string;
  meta?: Record<string, unknown>;
}

export const apiErrorEnvelopeSchema: z.ZodObject<{
  code: typeof apiErrorCodeSchema;
  message: z.ZodString;
  correlation_id: z.ZodString;
  retry_after: z.ZodOptional<z.ZodNumber>;
  hint: z.ZodOptional<z.ZodString>;
  details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export const sessionPrincipalSchema: z.ZodObject<{
  user_id: z.ZodString;
  workspace_id: z.ZodString;
  role: z.ZodEnum<['admin', 'manager', 'agent']>;
  step_up_until: z.ZodOptional<z.ZodString>;
}>;

export type SessionPrincipal = z.infer<typeof sessionPrincipalSchema>;

export const chatMessageDTOSchema: z.ZodObject<{
  id: z.ZodString;
  thread_id: z.ZodString;
  role: z.ZodEnum<['user', 'assistant', 'system']>;
  content: z.ZodString;
  created_at: z.ZodString;
  model_id: z.ZodOptional<z.ZodString>;
}>;

export type ChatMessageDTO = z.infer<typeof chatMessageDTOSchema>;

export interface ModelInvocationResult {
  content: string;
  model_id: string;
  provider: string;
  latency_ms: number;
  fallbacks: string[];
  cache_hit: boolean;
}

export interface WorkspaceScopedEntity {
  workspace_id: string;
  created_at: string;
  updated_at?: string;
}

export const idempotencyRecordSchema: z.ZodObject<{
  key: z.ZodString;
  scope: z.ZodString;
  principal_id: z.ZodString;
  status: z.ZodEnum<['processing', 'done', 'replayed']>;
  response_hash: z.ZodOptional<z.ZodString>;
  expires_at: z.ZodString;
}>;

export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export const modelPolicySchema: z.ZodObject<{
  workspace_id: z.ZodString;
  preferred_models: z.ZodArray<z.ZodString, 'many'>;
  max_fallback_depth: z.ZodNumber;
  max_latency_ms: z.ZodNumber;
  daily_token_budget: z.ZodNumber;
}>;

export type ModelPolicy = z.infer<typeof modelPolicySchema>;

export const providerHealthSchema: z.ZodObject<{
  provider: z.ZodString;
  model_id: z.ZodString;
  state: z.ZodEnum<['healthy', 'degraded', 'cooloff', 'disabled']>;
  reason: z.ZodString;
  until: z.ZodOptional<z.ZodString>;
}>;

export type ProviderHealth = z.infer<typeof providerHealthSchema>;

export const mcpMethodContractSchema: z.ZodObject<{
  method: z.ZodString;
  version: z.ZodString;
  auth: z.ZodEnum<['required', 'optional']>;
  dry_run_supported: z.ZodBoolean;
  request_schema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  response_schema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}>;

export type McpMethodContract = z.infer<typeof mcpMethodContractSchema>;

export const offlineReplayResultSchema: z.ZodObject<{
  op_id: z.ZodString;
  status: z.ZodEnum<['applied', 'duplicate', 'failed']>;
  retry_after: z.ZodOptional<z.ZodNumber>;
  error_code: z.ZodOptional<typeof apiErrorCodeSchema>;
}>;

export type OfflineReplayResult = z.infer<typeof offlineReplayResultSchema>;

export const fleetUploadTicketSchema: z.ZodObject<{
  upload_url: z.ZodString;
  key: z.ZodString;
  content_type: z.ZodString;
  max_bytes: z.ZodNumber;
  expires_at: z.ZodString;
}>;

export type FleetUploadTicket = z.infer<typeof fleetUploadTicketSchema>;

export const sloStatusSchema: z.ZodObject<{
  service: z.ZodString;
  window: z.ZodEnum<['5m', '1h', '24h']>;
  availability: z.ZodNumber;
  latency_p95_ms: z.ZodNumber;
  error_rate: z.ZodNumber;
  burn_rate: z.ZodNumber;
}>;

export type SLOStatus = z.infer<typeof sloStatusSchema>;
