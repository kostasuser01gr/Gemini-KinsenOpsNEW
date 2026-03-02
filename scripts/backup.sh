#!/bin/bash
# backup.sh - Call export and store artifact with checksum

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

# Generate checksum
sha256sum "$OUT" > "$OUT.sha256"

echo "✅ Backup created: $OUT"
echo "✅ Checksum generated: $OUT.sha256"

# Cleanup old backups (keep last 5)
ls -t backups/*.json | tail -n +6 | xargs rm -f -- 2>/dev/null || true
