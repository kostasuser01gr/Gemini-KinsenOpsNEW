#!/bin/bash
set -e

# Usage: bash backup.sh <BASE_URL> <ADMIN_TOKEN>
BASE_URL=$1
ADMIN_TOKEN=$2

if [ -z "$BASE_URL" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Usage: backup.sh <BASE_URL> <ADMIN_TOKEN>"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"
OUT_FILE="$BACKUP_DIR/backup_$TIMESTAMP.json"

echo "Exporting data from $BASE_URL..."
curl -s -f -H "Cookie: session=$ADMIN_TOKEN" "$BASE_URL/api/admin/export" > "$OUT_FILE"

echo "Compressing and hashing..."
gzip "$OUT_FILE"
GZ_FILE="$OUT_FILE.gz"
sha256sum "$GZ_FILE" > "$GZ_FILE.sha256"

# Rotate (keep last 7)
ls -dt $BACKUP_DIR/*.gz | tail -n +8 | xargs rm -f || true

echo "Backup complete: $GZ_FILE"
