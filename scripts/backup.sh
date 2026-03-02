#!/bin/bash
# backup.sh - Call export and store artifact

TOKEN=$1
if [ -z "$TOKEN" ]; then
    echo "Usage: ./backup.sh <SESSION_TOKEN>"
    exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT="backups/ops_backup_$TIMESTAMP.json"

mkdir -p backups
./scripts/export_workspace.sh "https://car-rental-api.dataos-api.workers.dev" "$TOKEN"
mv export.json "$OUT"

echo "✅ Backup created: $OUT"
