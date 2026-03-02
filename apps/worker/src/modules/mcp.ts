import type { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppBindings } from './common';
import { jsonError, jsonSuccess } from './common';
import { MCP_METHOD_REGISTRY, MCP_RBAC, getMethodContract } from './mcpRegistry';
import { withAuth, requirePermission } from './middleware/auth';

const mcpEnvelopeSchema = z.object({
  method: z.string().min(1),
  dry_run: z.boolean().optional(),
  nonce: z.string().min(8),
  params: z.record(z.unknown()).optional(),
});

function verifyMcpKey(provided: string | null, expected?: string): boolean {
  if (!expected) {
    return true;
  }
  return provided === expected;
}

export function registerMcpRoutes(app: Hono<AppBindings>) {
  const getRegistry = (c: Context<AppBindings>) => {
    const provided = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim() || null;
    if (!verifyMcpKey(provided, c.env.MCP_API_KEY)) {
      return jsonError(c.get('correlationId'), 401, 'MCP_AUTH_FAILED', 'Invalid MCP API key');
    }

    return jsonSuccess(c.get('correlationId'), {
      mcp_version: '2.0',
      strict_free_mode: c.env.STRICT_FREE_MODE !== 'false',
      methods: MCP_METHOD_REGISTRY,
    });
  };

  app.get('/mcp', getRegistry);
  app.get('/api/v1/mcp', getRegistry);

  const postHandler = async (c: Context<AppBindings>) => {
    const parsed = mcpEnvelopeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid MCP request', {
        issues: parsed.error.issues,
      });
    }

    const body = parsed.data;
    const methodContract = getMethodContract(body.method);
    if (!methodContract) {
      return jsonError(c.get('correlationId'), 400, 'MCP_METHOD_UNSUPPORTED', `Unsupported method: ${body.method}`);
    }

    const action = MCP_RBAC[body.method];
    if (action && action !== 'mcp:invoke') {
      const guard = requirePermission(action);
      await guard(c, async () => Promise.resolve());
      if (c.res.status >= 400) {
        return c.res;
      }
    }

    if (body.dry_run) {
      return jsonSuccess(c.get('correlationId'), {
        method: body.method,
        dry_run: true,
        status: 'validated',
      });
    }

    return jsonError(c.get('correlationId'), 400, 'MCP_METHOD_UNSUPPORTED', `Method ${body.method} requires dedicated endpoint`);
  };

  app.post('/mcp', withAuth, requirePermission('mcp:invoke'), postHandler);
  app.post('/api/v1/mcp', withAuth, requirePermission('mcp:invoke'), postHandler);
}
