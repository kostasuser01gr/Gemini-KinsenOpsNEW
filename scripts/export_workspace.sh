#!/bin/bash
# export_workspace.sh - Export Ops Copilot data via CLI

API_URL=$1
TOKEN=$2
OUT="export.json"

if [ -z "$API_URL" ] || [ -z "$TOKEN" ]; then
    echo "Usage: ./export_workspace.sh <API_URL> <SESSION_TOKEN>"
    exit 1
fi

echo "=> Exporting workspace data from $API_URL..."
curl -H "Authorization: Bearer $TOKEN" "$API_URL/api/admin/export" -o "$OUT"
echo "✅ Export saved to $OUT"
