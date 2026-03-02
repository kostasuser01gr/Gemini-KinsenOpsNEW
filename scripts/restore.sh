#!/bin/bash
set -e

# Usage: bash restore.sh <BASE_URL> <ADMIN_TOKEN> <FILE> [APPLY=1]
BASE_URL=$1
ADMIN_TOKEN=$2
FILE=$3
APPLY=$4

if [ -z "$FILE" ]; then
  echo "Usage: restore.sh <BASE_URL> <ADMIN_TOKEN> <FILE> [APPLY=1]"
  exit 1
fi

echo "Verifying checksum for $FILE..."
sha256sum -c "$FILE.sha256"

echo "Extracting backup..."
zcat "$FILE" > tmp_restore.json

if [ "$APPLY" == "1" ]; then
  echo "APPLY=1: Restoring to $BASE_URL..."
  curl -s -f -X POST "$BASE_URL/api/admin/import" \
    -H "Cookie: session=$ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d @tmp_restore.json
  echo "Restore complete."
else
  echo "DRY RUN (APPLY=0): Use APPLY=1 to actually import."
  echo "File content summary:"
  jq '. | {users: (.users | length), kb_documents: (.kb_documents | length)}' tmp_restore.json
fi

rm tmp_restore.json
