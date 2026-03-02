# Ops Runbook

## Rotate Secrets
1. Set the new secret value in your environment.
2. Run `make setup` (it will use `wrangler secret put` for all configured secrets).
3. If only rotating one secret: `npx wrangler secret put SECRET_NAME <<< "NEW_VALUE"`.

## Retention Run (via MCP)
1. Use a tool like `retention.run_now`.
2. First call with `dry_run: true` to see the plan.
3. Second call with `dry_run: false` and the matching `CONFIRM_TOKEN`.

## Backup & Restore
- **Backup**: `make backup` (Creates `backups/backup_TIMESTAMP.json.gz`).
- **Restore**:
  1. `make restore FILE=backups/backup_TIMESTAMP.json.gz` (Dry-run).
  2. Review the summary.
  3. `make restore FILE=backups/backup_TIMESTAMP.json.gz APPLY=1` (Execute).

## Rollback
1. Identify the stable git tag.
2. Run `bash scripts/rollback.sh <GIT_TAG>`.
3. Verify production with `make smoke-prod`.

## Incident Collection
1. Run `make incident-collect`.
2. Share the generated JSON report with the team.
3. Check Cloudflare Dashboard only if D1 or Workers show global outages.
