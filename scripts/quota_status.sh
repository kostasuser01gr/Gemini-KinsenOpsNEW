#!/bin/bash
# quota_status.sh - Check current quota usage via CLI

API_URL="https://car-rental-api.dataos-api.workers.dev"
TOKEN=$1

if [ -z "$TOKEN" ]; then
    echo "Usage: ./quota_status.sh <SESSION_TOKEN>"
    exit 1
fi

echo "=> Querying Quota Governor..."
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/admin/quota/status" | npx json
