import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
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
  'INTERNAL_ERROR',
]);

export const apiErrorEnvelopeSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  correlation_id: z.string(),
  retry_after: z.number().optional(),
  hint: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const sessionPrincipalSchema = z.object({
  user_id: z.string(),
  workspace_id: z.string(),
  role: z.enum(['admin', 'manager', 'agent']),
  step_up_until: z.string().optional(),
});

export const chatMessageDTOSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  created_at: z.string(),
  model_id: z.string().optional(),
});

export const idempotencyRecordSchema = z.object({
  key: z.string(),
  scope: z.string(),
  principal_id: z.string(),
  status: z.enum(['processing', 'done', 'replayed']),
  response_hash: z.string().optional(),
  expires_at: z.string(),
});

export const modelPolicySchema = z.object({
  workspace_id: z.string(),
  preferred_models: z.array(z.string()),
  max_fallback_depth: z.number(),
  max_latency_ms: z.number(),
  daily_token_budget: z.number(),
});

export const providerHealthSchema = z.object({
  provider: z.string(),
  model_id: z.string(),
  state: z.enum(['healthy', 'degraded', 'cooloff', 'disabled']),
  reason: z.string(),
  until: z.string().optional(),
});

export const mcpMethodContractSchema = z.object({
  method: z.string(),
  version: z.string(),
  auth: z.enum(['required', 'optional']),
  dry_run_supported: z.boolean(),
  request_schema: z.record(z.unknown()),
  response_schema: z.record(z.unknown()),
});

export const offlineReplayResultSchema = z.object({
  op_id: z.string(),
  status: z.enum(['applied', 'duplicate', 'failed']),
  retry_after: z.number().optional(),
  error_code: apiErrorCodeSchema.optional(),
});

export const fleetUploadTicketSchema = z.object({
  upload_url: z.string(),
  key: z.string(),
  content_type: z.string(),
  max_bytes: z.number(),
  expires_at: z.string(),
});

export const sloStatusSchema = z.object({
  service: z.string(),
  window: z.enum(['5m', '1h', '24h']),
  availability: z.number(),
  latency_p95_ms: z.number(),
  error_rate: z.number(),
  burn_rate: z.number(),
});
