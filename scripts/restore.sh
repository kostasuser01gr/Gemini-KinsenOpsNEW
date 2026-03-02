#!/bin/bash
# restore.sh - Import JSON bundle with dry-run support

API_URL=$1
TOKEN=$2
FILE=$3
DRY_RUN=${4:-0}

if [ -z "$API_URL" ] || [ -z "$TOKEN" ] || [ -z "$FILE" ]; then
    echo "Usage: ./restore.sh <API_URL> <SESSION_TOKEN> <JSON_FILE> [DRY_RUN=1|0]"
    exit 1
fi

if [ "$DRY_RUN" == "1" ]; then
    echo "=> DRY RUN: Validating schema for $FILE..."
    # Basic validation: check if it's valid JSON and has expected keys
    if ! jq -e '.kb and .users' "$FILE" > /dev/null; then
        echo "❌ Validation failed: Missing required keys (kb, users)."
        exit 1
    fi
    echo "✅ Schema valid. Ready for restore."
    exit 0
fi

echo "=> Restoring data from $FILE to $API_URL..."
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @"$FILE" "$API_URL/api/admin/import"
echo "✅ Restore completed."
