#!/bin/bash
# cloudflare_status.sh - Print infrastructure state

echo "=== Cloudflare Infrastructure Status ==="
echo "=> D1 Databases:"
npx wrangler d1 list

echo "=> Worker Status:"
cd apps/worker && npx wrangler deployments list

echo "=> Pages Project:"
cd ../web && npx wrangler pages deployment list --project-name car-rental-copilot

echo "========================================"