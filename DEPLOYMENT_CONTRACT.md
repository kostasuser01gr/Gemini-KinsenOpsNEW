# Deployment Contract

## Invariants
1. **Cloudflare-Only**: Frontend on Pages (Direct Upload), Backend on Workers, DB on D1.
2. **CLI-Only**: No manual dashboard actions required.
3. **Strict Free Mode**: `STRICT_FREE_MODE=true` is the default and enforced.
4. **Billing Guard**: Paid paths blocked via `withBillingGuard` middleware.
5. **Secure MCP**: `/mcp` validates Origin, requires Bearer auth, and supports `dry_run`.
6. **Automated Migrations**: D1 migrations applied via `wrangler d1 migrations apply`.
7. **Idempotent Setup**: `scripts/cloudflare_connect.sh` can be run multiple times.

## CLI Commands
- `make setup`: Install dependencies and configure Cloudflare.
- `make verify`: Lint, typecheck, audit, test, build, and local smoke test.
- `make full`: Preflight, verify, migrate, and deploy to production.
- `make backup`: Export data from production.
- `make restore FILE=... APPLY=1`: Restore data to production.
- `make incident-collect`: Gather system health and quota info.

## Hard Gates
- `deploy-check` (via `scripts/preflight.sh`) must pass before any deployment.
- `smoke-prod` must pass after deployment to consider it successful.
- Turnstile validation is required for all auth endpoints.
