#!/bin/bash
# smoke.sh - Simple CURL-based verification

API_URL=$1

if [ -z "$API_URL" ]; then
    echo "Usage: ./smoke.sh <API_URL>"
    exit 1
fi

echo "=> Smoke Testing: $API_URL"

# 1. Health check
echo "=> Checking basic reachability..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")

if [ "$HTTP_STATUS" == "200" ]; then
    echo "✅ API reachable (Status $HTTP_STATUS)"
else
    echo "❌ API unreachable or unexpected status: $HTTP_STATUS"
    exit 1
fi

echo "=> Smoke Test Passed."