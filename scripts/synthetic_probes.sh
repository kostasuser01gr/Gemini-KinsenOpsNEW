#!/bin/bash
set -euo pipefail

BASE_URL=${1:-}
ADMIN_TOKEN=${2:-}
MCP_API_KEY=${3:-}

if [ -z "$BASE_URL" ]; then
  echo "Usage: synthetic_probes.sh <BASE_URL> [ADMIN_TOKEN] [MCP_API_KEY]"
  exit 1
fi

echo "[probe] healthz"
curl -sSf "$BASE_URL/healthz" >/dev/null

echo "[probe] readyz"
curl -sSf "$BASE_URL/readyz" >/dev/null

echo "[probe] compliance"
curl -sSf "$BASE_URL/api/v1/compliance" >/dev/null

echo "[probe] mcp registry"
if [ -n "$MCP_API_KEY" ]; then
  curl -sSf -H "Authorization: Bearer $MCP_API_KEY" "$BASE_URL/api/v1/mcp" >/dev/null
else
  curl -sSf "$BASE_URL/api/v1/mcp" >/dev/null
fi

if [ -n "$ADMIN_TOKEN" ]; then
  AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")

  echo "[probe] chat send"
  curl -sSf "${AUTH[@]}" -H "Content-Type: application/json" \
    -H "Idempotency-Key: probe-chat-$(date +%s)" \
    -d '{"thread_id":"probe-thread","content":"synthetic probe message"}' \
    "$BASE_URL/api/v1/chat/message" >/dev/null

  echo "[probe] fleet upload ticket"
  TICKET=$(curl -sSf "${AUTH[@]}" -H "Content-Type: application/json" \
    -H "Idempotency-Key: probe-ticket-$(date +%s)" \
    -d '{"fleet_id":"probe-fleet","content_type":"image/jpeg","max_bytes":10240}' \
    "$BASE_URL/api/v1/fleet/upload-ticket")
  echo "$TICKET" | jq -e '.ok == true and .data.token != null' >/dev/null

  echo "[probe] mcp post dry-run"
  curl -sSf "${AUTH[@]}" -H "Content-Type: application/json" \
    -d '{"method":"chat.send","dry_run":true,"nonce":"probe_nonce_12345678","params":{"thread_id":"probe-thread","content":"hello"}}' \
    "$BASE_URL/api/v1/mcp" >/dev/null
else
  echo "[probe] skipping authenticated probes (ADMIN_TOKEN not set)"
fi

echo "[probe] success"
