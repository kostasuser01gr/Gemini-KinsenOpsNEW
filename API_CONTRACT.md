# API Contract

## Success Envelope
```json
{
  "ok": true,
  "data": {},
  "correlation_id": "req_...",
  "meta": {}
}
```

## Error Envelope
```json
{
  "code": "RATE_LIMITED | AUTH_REQUIRED | AUTH_INVALID | AUTH_FORBIDDEN | STEP_UP_REQUIRED | MCP_AUTH_FAILED | MCP_METHOD_UNSUPPORTED | NOT_READY | INVALID_REQUEST | INVALID_FILE | INVALID_FLEET_ID | BACKUPS_UNBOUND | INTERNAL_ERROR",
  "message": "Too many requests",
  "correlation_id": "req_...",
  "retry_after": 60,
  "hint": "optional",
  "details": {}
}
```

## Session Principal
```ts
interface SessionPrincipal {
  user_id: string;
  workspace_id: string;
  role: 'admin' | 'manager' | 'agent';
  name?: string;
  step_up_until?: string;
}
```

## Chat Message DTO
```ts
interface ChatMessageDTO {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  model_id?: string;
}
```

## Versioning
- Canonical API namespace: `/api/v1/*`
- Compatibility aliases are kept for existing `/api/*` routes during migration window.

## Health Endpoints
- `GET /healthz` -> process health
- `GET /readyz` -> dependency readiness

## Chat Endpoints
- `POST /api/v1/chat/message` -> non-stream response envelope
- `POST /api/v1/chat/stream` -> SSE stream (`event: token`, `event: done`)

## Fleet Endpoints
- `POST /api/v1/fleet/upload-ticket` -> signed ticket-like constrained upload metadata
- `POST /api/v1/fleet/upload/:token` -> upload using short-lived token

## MCP Endpoints
- `GET /mcp` -> tool metadata
- `POST /mcp` -> method envelope (supports `dry_run`)
- `GET /api/v1/mcp`, `POST /api/v1/mcp` -> versioned aliases
