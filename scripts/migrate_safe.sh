#!/bin/bash
set -e

# Usage: bash migrate_safe.sh <BASE_URL> <ADMIN_TOKEN>
BASE_URL=$1
ADMIN_TOKEN=$2

if [ -z "$BASE_URL" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Usage: migrate_safe.sh <BASE_URL> <ADMIN_TOKEN>"
  exit 1
fi

echo "--- Safe-Migrate: START ---"

# Step 1: Pre-migration backup
echo "Step 1: Taking pre-migration snapshot..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/pre_migrate_$TIMESTAMP.json"
mkdir -p backups
curl -s -f -H "Cookie: session=$ADMIN_TOKEN" "$BASE_URL/api/admin/export" > "$BACKUP_FILE"
echo "Snapshot saved to $BACKUP_FILE"

# Step 2: Apply Migrations
echo "Step 2: Applying D1 migrations..."
if npx wrangler d1 migrations apply ops-db --remote; then
  echo "Migrations applied successfully."
else
  echo "CRITICAL: Migrations FAILED. Rollback manual snapshot required from $BACKUP_FILE"
  exit 1
fi

echo "--- Safe-Migrate: COMPLETE ---"
