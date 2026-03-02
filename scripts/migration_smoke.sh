#!/bin/bash
set -euo pipefail

DB_NAME=${1:-ops-db}
STATE_DIR=${2:-.wrangler/state-migration-smoke}
CONFIG=${3:-apps/worker/wrangler.toml}

rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"

echo "[migration-smoke] applying migrations locally to $DB_NAME"
npx wrangler d1 migrations apply "$DB_NAME" --local --persist-to "$STATE_DIR" -c "$CONFIG"

echo "[migration-smoke] validating sqlite tables exist"
npx wrangler d1 execute "$DB_NAME" --local --persist-to "$STATE_DIR" --command "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table';" -c "$CONFIG"

echo "[migration-smoke] success"
