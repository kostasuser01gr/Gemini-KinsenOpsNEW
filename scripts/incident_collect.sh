#!/bin/bash
set -euo pipefail

BASE_URL=${1:-}
ADMIN_TOKEN=${2:-}
DB_NAME=${3:-ops-db}

if [ -z "$BASE_URL" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Usage: incident_collect.sh <BASE_URL> <ADMIN_TOKEN> [DB_NAME]"
  exit 1
fi

REPORT_DIR="incident_reports"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/report_$(date +%Y%m%d_%H%M%S).json"

echo "Collecting incident data..."

HEALTH_JSON=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/healthz")
READY_JSON=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/readyz")
COMPLIANCE_JSON=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/api/v1/compliance")
SLO_JSON=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/api/v1/slo/status")
MCP_JSON=$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"method":"health.check","dry_run":true,"nonce":"incident_probe_nonce","params":{}}' \
  "$BASE_URL/api/v1/mcp")

D1_HEALTH=$(npx wrangler d1 execute "$DB_NAME" --remote -c apps/worker/wrangler.toml --json --command "SELECT datetime('now') as ts, COUNT(*) as model_events FROM model_call_events WHERE created_at >= datetime('now', '-1 hour');")

cat <<JSON | jq . > "$REPORT_FILE"
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "base_url": "$BASE_URL",
  "health": $HEALTH_JSON,
  "ready": $READY_JSON,
  "compliance": $COMPLIANCE_JSON,
  "slo": $SLO_JSON,
  "mcp": $MCP_JSON,
  "d1": $D1_HEALTH,
  "last_deploy": "$(git log -1 --format=%cd)"
}
JSON

echo "Incident report collected: $REPORT_FILE"
