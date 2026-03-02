#!/bin/bash
set -euo pipefail

MIGRATIONS_DIR=${1:-apps/worker/migrations}
BASELINE_ALLOW_UNTIL=${2:-15}

violations=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  base=$(basename "$file")
  prefix=${base%%_*}
  if ! [[ "$prefix" =~ ^[0-9]+$ ]]; then
    continue
  fi

  num=$((10#$prefix))
  if [ "$num" -le "$BASELINE_ALLOW_UNTIL" ]; then
    continue
  fi

  if grep -Eiq "\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b" "$file"; then
    echo "[migration-policy] destructive statement found in $file"
    violations=1
  fi
done

if [ "$violations" -ne 0 ]; then
  echo "[migration-policy] violation detected"
  exit 1
fi

echo "[migration-policy] ok"
