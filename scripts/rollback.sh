#!/bin/bash
# rollback.sh - Redeploy a prior worker version + pages artifact

VERSION_ID=$1
PAGES_DEPLOYMENT_ID=$2

if [ -z "$VERSION_ID" ]; then
    echo "Usage: ./rollback.sh <WORKER_VERSION_ID> [PAGES_DEPLOYMENT_ID]"
    echo "Worker versions: npx wrangler deployments list"
    echo "Pages versions: npx wrangler pages deployment list --project-name car-rental-copilot"
    exit 1
fi

echo "=> Rolling back Worker to $VERSION_ID..."
cd apps/worker
npx wrangler rollback "$VERSION_ID"

if [ -n "$PAGES_DEPLOYMENT_ID" ]; then
    echo "=> Rolling back Pages to $PAGES_DEPLOYMENT_ID..."
    npx wrangler pages deployment rollback "$PAGES_DEPLOYMENT_ID" --project-name car-rental-copilot
fi

echo "✅ Rollback complete."
