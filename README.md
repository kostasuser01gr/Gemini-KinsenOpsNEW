# Car Rental Ops Copilot (V8 Ultra)

## The CLI-Only Enterprise Ops Platform
This is a production-grade Knowledge Base, SOP Copilot, and Admin platform designed for strict Cloudflare Free Tier constraints (`STRICT_FREE_MODE=true`).

### Core Features
- **Never-Bill-By-Design**: Strictly enforces free-only model providers (Hugging Face Routed Free, Workers AI). 
- **Auto-Fallback Circuit Breaker**: Gracefully degrades through models; falls back to pure FTS5 No-AI mode upon exhaustion.
- **Enterprise Controls**: Public Signups + Cloudflare Turnstile, RBAC, Data Retention cron, and correlation-id Audit logs.
- **PWA & Portability**: Fully offline-capable (threads & KB); JSON Workspace Import/Export.

## 🚀 0 to Prod (CLI-Only Setup)

Ensure you have installed: `gh`, `wrangler`, `node`, `curl`, and `make`.

### 1. Authenticate
```bash
gh auth login
wrangler login
```

### 2. Scaffold and Connect
```bash
# Provision D1, Pages project, and apply migrations
./scripts/cloudflare_connect.sh
```

### 3. Configure Secrets
Execute these via Wrangler to secure the platform:
```bash
echo "your-strong-random-secret" | wrangler secret put SESSION_SECRET --name car-rental-api
echo "true" | wrangler secret put STRICT_FREE_MODE --name car-rental-api
echo "admin@yourdomain.com" | wrangler secret put ADMIN_ALLOWLIST_EMAILS --name car-rental-api

# Optional Turnstile (Bot Protection)
echo "your-turnstile-secret" | wrangler secret put TURNSTILE_SECRET_KEY --name car-rental-api
```

### 4. Deploy & Verify
We use a unified `Makefile` that guarantees a "fail-closed" green build pipeline.

```bash
# Lints, Typechecks, Audits, Builds, Migrates, Deploys, and Smoke-Tests
make full
```

### 5. GitHub CI/CD setup
```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```
*Any push to `main` will automatically trigger the robust Verification and CD workflows.*

## Diagnostics & Recovery
- **Check Status**: `./scripts/cloudflare_status.sh`
- **Auto-Fix Code**: `./scripts/repair.sh`
- **Diagnose Config**: `./scripts/doctor.sh`
- **Workspace Backup**: `./scripts/export.sh --token <ADMIN_SESSION> --out backup.json`
