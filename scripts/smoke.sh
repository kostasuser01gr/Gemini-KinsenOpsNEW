#!/bin/bash
set -e

BASE_URL=$1
if [ -z "$BASE_URL" ]; then
  echo "Usage: smoke.sh <BASE_URL>"
  exit 1
fi

echo "Starting Smoke Test for $BASE_URL"

# 1. Health & Compliance
echo "Checking /healthz..."
curl -s -f "$BASE_URL/healthz" | grep -q "ok"
echo "Checking /readyz..."
curl -s -f "$BASE_URL/readyz" | grep -q "ready"
echo "Checking /api/compliance..."
curl -s -f "$BASE_URL/api/compliance" | grep -q "strict_free"

# 2. MCP Metadata
echo "Checking /mcp (GET)..."
curl -s -f -H "Authorization: Bearer ${MCP_API_KEY:-test-key}" "$BASE_URL/mcp" | grep -q "mcp_version"

# 3. Functional Flow: Signup/Login (with Turnstile dummy keys)
# Note: We'll use a random email to ensure idempotency and avoid "User already exists" errors in tests if DB isn't wiped
TEST_EMAIL="smoke-$(date +%s)@example.com"
TEST_PASS="smoke-pass-123"
DUMMY_TURNSTILE="1x00000000000000000000AA"

echo "Attempting Signup ($TEST_EMAIL)..."
SIGNUP_RES=$(curl -s -i -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\", \"password\":\"$TEST_PASS\", \"turnstile_token\":\"$DUMMY_TURNSTILE\"}")

if echo "$SIGNUP_RES" | grep -q "200 OK"; then
  echo "Signup Success."
else
  echo "Signup Failed."
  echo "$SIGNUP_RES"
  exit 1
fi

# Extract session cookie
SESSION_COOKIE=$(echo "$SIGNUP_RES" | grep "Set-Cookie" | sed 's/Set-Cookie: //;s/;.*//' | tr -d '\r')

# 4. KB Search
echo "Attempting KB Search..."
curl -s -f -b "session=$SESSION_COOKIE" "$BASE_URL/api/kb/search?q=test" > /dev/null
echo "KB Search Success."

echo "Smoke Test Passed. Green."
