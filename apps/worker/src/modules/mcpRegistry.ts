import type { McpMethodContract } from '@gemini/contracts';

export const MCP_METHOD_REGISTRY: McpMethodContract[] = [
  {
    method: 'health.check',
    version: '1.0.0',
    auth: 'optional',
    dry_run_supported: true,
    request_schema: {},
    response_schema: { status: 'ok' },
  },
  {
    method: 'chat.send',
    version: '1.0.0',
    auth: 'required',
    dry_run_supported: true,
    request_schema: { thread_id: 'string', content: 'string' },
    response_schema: { response: 'string', model_id: 'string' },
  },
  {
    method: 'fleet.uploadDamage',
    version: '1.0.0',
    auth: 'required',
    dry_run_supported: true,
    request_schema: { fleet_id: 'string', content_type: 'image/jpeg|image/png|image/webp' },
    response_schema: { token: 'string', ticket: 'FleetUploadTicket' },
  },
];

export const MCP_RBAC: Record<string, 'mcp:invoke' | 'fleet:write' | 'threads:write'> = {
  'health.check': 'mcp:invoke',
  'chat.send': 'threads:write',
  'fleet.uploadDamage': 'fleet:write',
};

export function getMethodContract(method: string): McpMethodContract | undefined {
  return MCP_METHOD_REGISTRY.find((entry) => entry.method === method);
}
