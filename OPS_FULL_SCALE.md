# Full-Scale Operations Manual

## Advanced Infrastructure
1. **D1 Database**: Primary relational storage for users, KB, and audit logs.
2. **KV Sessions**: High-speed session storage and verification (`session:<userId>`).
3. **R2 Backups**: Immutable storage for JSON exports, managed via `/api/admin/backup/r2`.
4. **Billing Guard**: Strict path-based blocking when `STRICT_FREE_MODE=true`.

## Advanced CLI Commands
- `make provision`: Full idempotent setup of D1, KV, R2, and Pages.
- `make deploy-staging`: Deploy to a isolated staging environment.
- `make backup-r2`: Trigger an server-side backup directly to R2.
- `make anonymize IN=... OUT=...`: Create a PII-masked version of a local backup.
- `make logs`: Real-time streaming of production logs via `wrangler tail`.

## MCP 2.0
- **GET /mcp**: Returns dynamic tool list including R2 and Retention tools.
- **POST /mcp**: Executes RPC methods with Bearer Auth and Origin validation.
- **Dry-run Protocol**: Mandatory for data-modifying tools.

## Security Controls
- **JWT + KV**: Two-layer session validation.
- **mTLS Ready**: Infrastructure supports client certificate validation if enabled.
- **Turnstile Dummy Bypass**: Standardized `1x00...AA` token for CI/CD smoke tests.
