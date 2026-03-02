# Architecture

## Platform
- Runtime: Cloudflare Workers (`apps/worker`)
- Data: D1 (`DB`), KV (`SESSIONS`, `JAIL`), R2 (`BACKUPS`), Durable Objects (`THREAD_ROOM`)
- Frontend: Vite + React (`apps/web`)
- Shared contracts: workspace package `packages/contracts`

## Bounded API Modules
- `auth`: DB-session lifecycle, step-up grant, permission checks
- `chat`: AI prompt handling, SSE streaming, message persistence
- `fleet`: constrained upload-ticket flow and R2 media writes
- `admin`: health/readiness/compliance/SLO status
- `mcp`: versioned method registry + dry-run + RBAC map
- `audit`: forensic chain verification
- `presence`: collaborative thread presence via Durable Object
- `jobs`: scheduled retention/rollup/checkpoint tasks

## Provider Layer
- `providers/hf.ts`: HuggingFace routed inference
- `providers/cf.ts`: Cloudflare Workers AI provider
- `providers/mock.ts`: deterministic fallback provider for safe degradation/canary
- Circuit-breaker and health state persisted by model router

## Scale Principles
- Forward-only migrations after baseline policy migration `0016`
- Background compaction/retention outside request path
- KV-backed idempotency + rate limits for write routes
- Workspace-scoped policies and daily budget guards in model routing
- Optional deterministic prompt cache with policy-gated TTL
- Structured API error envelopes with correlation IDs

## Request Lifecycle
1. Correlation ID middleware assigns/propagates `x-correlation-id`
2. CORS enforces configured origin list
3. Auth middleware resolves `SessionPrincipal`
4. Endpoint runs business logic with timeout/rate/idempotency guards
5. Errors return canonical `ApiErrorEnvelope`
