# Scale Runbook

## Verify Gate (Local)
1. `make deploy-check`
2. `make lint`
3. `make typecheck`
4. `make test`
5. `make migration-policy-check`
6. `make migrate-dry-run`

## Deploy (Prod)
1. `make deploy-safe WORKER_URL=<url> ADMIN_TOKEN=<token> MCP_API_KEY=<key> ROLLBACK_TAG=<tag>`
2. If `deploy-safe` fails with smoke/probe regression, rollback runs automatically when `ROLLBACK_TAG` is set.
3. If `ROLLBACK_TAG` is not set, run `bash scripts/rollback.sh <known-good-tag>`.

## Emergency Rollback
1. Rollback worker to previous deployment in Cloudflare dashboard
2. Re-run `make smoke-prod`
3. If migration caused issue, restore from latest backup and disable write endpoints

## Operational SLO Targets
- Availability: 99.9%
- p95 non-AI route latency: <500ms
- p95 AI route latency: <4s with fallback

## Burn Alert Rules
- Burn alert L1 (warning): burn rate > 1.0 for `1h`.
- Burn alert L2 (page): burn rate > 2.0 for `5m`.
- Burn alert L3 (critical): burn rate > 4.0 for `5m`.

## Alert Playbooks
- Availability burn:
  - Run `make smoke-prod WORKER_URL=<url>`.
  - Run `bash scripts/incident_collect.sh <url> <admin_token>`.
  - If failing routes involve deploy regression, run `bash scripts/rollback.sh <tag>`.
- Latency burn:
  - Run `bash scripts/synthetic_probes.sh <url> <admin_token> <mcp_key>`.
  - Check model fallback churn via D1: `npx wrangler d1 execute ops-db --remote -c apps/worker/wrangler.toml --command \"SELECT provider_kind, COUNT(*) c FROM model_call_events WHERE created_at >= datetime('now','-30 minutes') GROUP BY provider_kind;\"`.
- Error-rate burn:
  - Check compliance and readiness: `curl -s <url>/api/v1/compliance`, `curl -s <url>/readyz`.
  - Check retry queue growth: `npx wrangler d1 execute ops-db --remote -c apps/worker/wrangler.toml --command \"SELECT COUNT(*) FROM retry_queue;\"`.

## Triage Signals
- Rising `RATE_LIMITED` and `NOT_READY`
- D1 write pressure above 80%
- Model fallback spikes and cooloff churn
