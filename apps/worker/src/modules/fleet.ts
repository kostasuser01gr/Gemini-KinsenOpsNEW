import type { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { FleetUploadTicket } from '@gemini/contracts';
import type { AppBindings } from './common';
import { jsonError, jsonSuccess } from './common';
import { withAuth, requirePermission, requireStepUp } from './middleware/auth';
import { withIdempotency } from './middleware/idempotency';

const uploadTicketSchema = z.object({
  fleet_id: z.string().min(1),
  content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  max_bytes: z.coerce.number().min(1).max(8 * 1024 * 1024).default(5 * 1024 * 1024),
});

function generateUploadTicket(baseUrl: string, fleetId: string, contentType: string, maxBytes: number): { token: string; ticket: FleetUploadTicket } {
  const token = crypto.randomUUID();
  const key = `fleet/${fleetId}/damage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${
    contentType.split('/')[1]
  }`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    token,
    ticket: {
      upload_url: `${baseUrl}/api/v1/fleet/upload/${token}`,
      key,
      content_type: contentType,
      max_bytes: maxBytes,
      expires_at: expiresAt,
    },
  };
}

async function storeTicket(c: Context<AppBindings>, token: string, ticket: FleetUploadTicket, fleetId: string) {
  if (!c.env.JAIL) {
    return;
  }
  await c.env.JAIL.put(
    `upload_ticket:${token}`,
    JSON.stringify({ ...ticket, fleet_id: fleetId, principal_id: c.get('user').user_id }),
    { expirationTtl: 5 * 60 },
  );
}

async function uploadFromTicket(
  c: Context<AppBindings>,
  ticket: FleetUploadTicket & { fleet_id: string; principal_id: string },
  fileRaw: {
    type?: string;
    size?: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  },
) {
  if (ticket.principal_id !== c.get('user').user_id) {
    return jsonError(c.get('correlationId'), 403, 'AUTH_FORBIDDEN', 'Upload ticket belongs to another user');
  }

  const fileType = fileRaw.type || ticket.content_type;
  const fileSize = Number(fileRaw.size || 0);

  if (fileType !== ticket.content_type) {
    return jsonError(c.get('correlationId'), 400, 'INVALID_FILE', 'Invalid content type', {
      expected: ticket.content_type,
      got: fileType,
    });
  }

  if (fileSize > ticket.max_bytes) {
    return jsonError(c.get('correlationId'), 400, 'INVALID_FILE', 'File exceeds max size', {
      max_bytes: ticket.max_bytes,
      got: fileSize,
    });
  }

  if (!c.env.BACKUPS) {
    return jsonError(c.get('correlationId'), 503, 'BACKUPS_UNBOUND', 'R2 BACKUPS binding is not configured', undefined, 30);
  }

  await c.env.BACKUPS.put(ticket.key, await fileRaw.arrayBuffer(), {
    httpMetadata: {
      contentType: ticket.content_type,
    },
  });

  await c.env.DB
    .prepare('INSERT INTO fleet_media (id, fleet_id, r2_key, media_type) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), ticket.fleet_id, ticket.key, 'damage')
    .run();

  return jsonSuccess(c.get('correlationId'), {
    success: true,
    key: ticket.key,
    fleet_id: ticket.fleet_id,
  });
}

export function registerFleetRoutes(app: Hono<AppBindings>) {
  app.post(
    '/api/v1/fleet/upload-ticket',
    withAuth,
    requirePermission('fleet:write'),
    withIdempotency('fleet_upload_ticket'),
    async (c) => {
      const parsed = uploadTicketSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Invalid upload ticket request', {
          issues: parsed.error.issues,
        });
      }

      if (!c.env.BACKUPS) {
        return jsonError(c.get('correlationId'), 503, 'BACKUPS_UNBOUND', 'R2 BACKUPS binding is not configured', undefined, 30);
      }

      const baseUrl = c.env.API_BASE_URL || new URL(c.req.url).origin;
      const { fleet_id, content_type, max_bytes } = parsed.data;
      const { token, ticket } = generateUploadTicket(baseUrl, fleet_id, content_type, max_bytes);
      await storeTicket(c, token, ticket, fleet_id);

      return jsonSuccess(c.get('correlationId'), {
        token,
        ticket,
      });
    },
  );

  app.post('/api/v1/fleet/upload/:token', withAuth, requirePermission('fleet:write'), requireStepUp(), withIdempotency('fleet_upload_data'), async (c) => {
    const token = c.req.param('token');

    if (!c.env.JAIL) {
      return jsonError(c.get('correlationId'), 500, 'INTERNAL_ERROR', 'Ticket storage unavailable');
    }

    const rawTicket = await c.env.JAIL.get(`upload_ticket:${token}`);
    if (!rawTicket) {
      return jsonError(c.get('correlationId'), 401, 'AUTH_INVALID', 'Upload ticket missing or expired');
    }

    const ticket = JSON.parse(rawTicket) as FleetUploadTicket & { fleet_id: string; principal_id: string };

    const formData = await c.req.formData();
    const fileRaw = formData.get('file') as
      | string
      | null
      | {
          type?: string;
          size?: number;
          arrayBuffer: () => Promise<ArrayBuffer>;
        };

    if (!fileRaw || typeof fileRaw === 'string' || typeof fileRaw.arrayBuffer !== 'function') {
      return jsonError(c.get('correlationId'), 400, 'INVALID_FILE', 'Expected multipart field "file"');
    }

    return uploadFromTicket(c, ticket, fileRaw);
  });

  app.post('/api/fleet/upload-damage', withAuth, requirePermission('fleet:write'), withIdempotency('upload_damage'), async (c) => {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const fleetId = String(formData.get('fleet_id') || '');

    if (!fleetId || !file) {
      return jsonError(c.get('correlationId'), 400, 'INVALID_REQUEST', 'Missing file or fleet_id');
    }

    const baseUrl = c.env.API_BASE_URL || new URL(c.req.url).origin;
    const { token, ticket: generatedTicket } = generateUploadTicket(baseUrl, fleetId, 'image/jpeg', 5 * 1024 * 1024);
    const ticket = {
      ...generatedTicket,
      principal_id: c.get('user').user_id,
      fleet_id: fleetId,
    };

    await storeTicket(c, token, ticket, fleetId);

    if (typeof file === 'string' || typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== 'function') {
      return jsonError(c.get('correlationId'), 400, 'INVALID_FILE', 'Expected multipart file upload');
    }

    return uploadFromTicket(
      c,
      ticket,
      file as { type?: string; size?: number; arrayBuffer: () => Promise<ArrayBuffer> },
    );
  });
}
