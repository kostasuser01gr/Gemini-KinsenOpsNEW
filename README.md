# Ops Assistant (Cloudflare-Only)

CLI-ONLY Deployment and Operations Workflow.

## Prerequisites
- Cloudflare Account
- `CLOUDFLARE_API_TOKEN` (Required: D1, Workers, Pages permissions)
- `CLOUDFLARE_ACCOUNT_ID`

## Quick Start (0-to-prod)
1. Configure `.env` with Cloudflare credentials and required secrets.
2. Run `make setup` to initialize.
3. Run `make full` to deploy.

## Local Quality Gate
1. `make verify`
2. Optional pre-push hook setup: `git config core.hooksPath .githooks`

## Core Makefile Targets
- `make setup`: Idempotent environment setup.
- `make verify`: Comprehensive local verification.
- `make full`: Full deployment pipeline (Deploy-check -> Verify -> Migrate -> Deploy).
- `make backup`: Create a compressed backup from production.
- `make restore FILE=... APPLY=1`: Restore from a backup file.
- `make incident-collect`: Collect a system-wide ops report.

## Directory Structure
- `apps/web`: React Frontend (Vite, Cloudflare Pages).
- `apps/worker`: Hono/Itty-router Backend (Cloudflare Workers, D1).
- `scripts/`: Operational scripts (Smoke, Backup, Restore, Connect, Rollback).
- `migrations/`: D1 SQL migrations.

## Security
- Secrets are managed via `wrangler secret put` and are NOT stored in the repo.
- Turnstile is required for signup/login (Dummy keys supported in tests).
- MCP requires Bearer Authentication and Origin validation.
