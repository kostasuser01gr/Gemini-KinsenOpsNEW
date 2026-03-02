#!/bin/bash
# rollback.sh - Redeploy a prior worker version

VERSION_ID=$1

if [ -z "$VERSION_ID" ]; then
    echo "Usage: ./rollback.sh <VERSION_ID>"
    echo "Check available versions with: npx wrangler deployments list"
    exit 1
fi

echo "=> Rolling back Worker to $VERSION_ID..."
cd apps/worker
npx wrangler rollback "$VERSION_ID"

echo "✅ Rollback complete."
