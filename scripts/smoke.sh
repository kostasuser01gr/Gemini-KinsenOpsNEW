#!/bin/bash
set -euo pipefail

BASE_URL=${1:-}
if [ -z "$BASE_URL" ]; then
  echo "Usage: smoke.sh <BASE_URL>"
  exit 1
fi

echo "Starting smoke test for $BASE_URL"

echo "Checking /healthz"
curl -sSf "$BASE_URL/healthz" | jq -e '.ok == true and .data.status == "ok"' >/dev/null

echo "Checking /readyz"
curl -sSf "$BASE_URL/readyz" | jq -e '.ok == true' >/dev/null

echo "Checking /api/v1/compliance"
curl -sSf "$BASE_URL/api/v1/compliance" | jq -e '.ok == true and .data.strict_free_mode != null' >/dev/null

echo "Checking /mcp"
if [ -n "${MCP_API_KEY:-}" ]; then
  curl -sSf -H "Authorization: Bearer ${MCP_API_KEY}" "$BASE_URL/mcp" | jq -e '.ok == true and .data.mcp_version != null' >/dev/null
else
  curl -sSf "$BASE_URL/mcp" | jq -e '.ok == true and .data.mcp_version != null' >/dev/null
fi

echo "Checking chat auth guard"
CHAT_GUARD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/chat/message" \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"t-1","content":"ping"}')
if [ "$CHAT_GUARD" -ne 401 ]; then
  echo "Expected 401 from /api/v1/chat/message without auth, got $CHAT_GUARD"
  exit 1
fi

TEST_IDENTIFIER="smoke-$(date +%s)@example.com"
TEST_PASS="smoke-pass-123"

echo "Attempting signup"
SIGNUP_RES=$(curl -sS -i -X POST "$BASE_URL/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_IDENTIFIER\",\"password\":\"$TEST_PASS\"}")

echo "$SIGNUP_RES" | grep -q "200 OK"
SESSION_COOKIE=$(echo "$SIGNUP_RES" | grep "Set-Cookie" | sed 's/Set-Cookie: //;s/;.*//' | tr -d '\r')
if [ -z "$SESSION_COOKIE" ]; then
  echo "Missing session cookie from signup response"
  echo "$SIGNUP_RES"
  exit 1
fi

AUTH_HEADER=( -H "Authorization: Bearer ${SESSION_COOKIE#session=}" )

echo "KB search"
curl -sSf "${AUTH_HEADER[@]}" "$BASE_URL/api/v1/kb/search?q=test" | jq -e '.ok == true' >/dev/null

echo "SSE pulse"
curl -s --max-time 8 -f "$BASE_URL/api/v1/sync/pulse" | grep -q "event: pulse"

echo "Smoke test passed"
