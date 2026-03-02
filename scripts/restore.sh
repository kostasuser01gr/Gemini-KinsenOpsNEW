#!/bin/bash
# restore.sh - Import JSON bundle with conflict strategies

API_URL=$1
TOKEN=$2
FILE=$3

if [ -z "$API_URL" ] || [ -z "$TOKEN" ] || [ -z "$FILE" ]; then
    echo "Usage: ./restore.sh <API_URL> <SESSION_TOKEN> <JSON_FILE>"
    exit 1
fi

echo "=> Restoring data from $FILE to $API_URL..."
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @"$FILE" "$API_URL/api/admin/import"
echo "✅ Restore completed."
