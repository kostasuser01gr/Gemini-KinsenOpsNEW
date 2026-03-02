#!/bin/bash
set -e

WORKER_URL=$1
echo "Executing Atomic Deployment for $WORKER_URL..."

# Step 1: Deploy
npx wrangler deploy -c apps/worker/wrangler.toml

# Step 2: Smoke Test
echo "Verifying deployment..."
if bash scripts/smoke.sh "$WORKER_URL"; then
  echo "Deployment SUCCESS. Monitoring Canary..."
  bash scripts/canary_monitor.sh "$WORKER_URL"
else
  echo "SMOKE TEST FAILED! Triggering instant rollback..."
  # Fetch the previous version ID
  PREV_VERSION=$(npx wrangler deployments list | grep "ID:" | sed -n '2p' | awk '{print $2}')
  if [ ! -z "$PREV_VERSION" ]; then
    echo "Rolling back to version: $PREV_VERSION"
    npx wrangler rollback "$PREV_VERSION"
  else
    echo "No previous version found to rollback to."
  fi
  exit 1
fi
