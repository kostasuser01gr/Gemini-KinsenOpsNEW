#!/bin/bash
set -euo pipefail

WORKER_URL=${1:-}
ADMIN_TOKEN=${2:-}
MCP_API_KEY=${3:-}
ROLLBACK_TAG=${4:-}

if [ -z "$WORKER_URL" ]; then
  echo "Usage: deploy_safe.sh <WORKER_URL> [ADMIN_TOKEN] [MCP_API_KEY] [ROLLBACK_TAG]"
  exit 1
fi

echo "[deploy-safe] migration stop condition check"
if [ "${MIGRATION_GUARD_ENABLED:-true}" = "true" ]; then
  make migration-policy-check
  make migrate
fi

echo "[deploy-safe] deploying worker"
make deploy-worker

echo "[deploy-safe] deploying pages"
make deploy-pages

echo "[deploy-safe] running smoke + synthetic probes"
if make smoke-prod && make synthetic-probes WORKER_URL="$WORKER_URL" ADMIN_TOKEN="$ADMIN_TOKEN" MCP_API_KEY="$MCP_API_KEY"; then
  echo "[deploy-safe] deployment checks passed"
  exit 0
fi

echo "[deploy-safe] deployment checks failed"
if [ -n "$ROLLBACK_TAG" ]; then
  echo "[deploy-safe] auto-rollback with tag: $ROLLBACK_TAG"
  bash scripts/rollback.sh "$ROLLBACK_TAG"
  exit 1
fi

echo "[deploy-safe] rollback not executed (ROLLBACK_TAG missing)"
echo "Run: bash scripts/rollback.sh <known-good-git-tag>"
exit 1
