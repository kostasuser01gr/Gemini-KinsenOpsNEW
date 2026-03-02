#!/bin/bash
set -e

STAGE=${1:-dev}
echo "Connecting to Cloudflare (STAGE: $STAGE, Non-interactive)..."

# Create D1 database if not exists
echo "Creating D1 database..."
npx wrangler d1 create ops-db || echo "Database might already exist"

# Create KV Namespace for sessions
echo "Creating KV SESSIONS..."
npx wrangler kv:namespace create SESSIONS || echo "KV namespace might already exist"

# Create R2 Bucket for backups
echo "Creating R2 BACKUPS..."
npx wrangler r2 bucket create ops-backups || echo "R2 bucket might already exist"

# Create Pages project if not exists
echo "Creating Pages project..."
npx wrangler pages project create ops-frontend --production-branch main || echo "Pages project might already exist"

# Put secrets (from ENV vars)
echo "Configuring secrets..."
REQUIRED_SECRETS=("SESSION_SECRET" "TURNSTILE_SECRET_KEY" "MCP_API_KEY" "CONFIRM_TOKEN")
for secret in "${REQUIRED_SECRETS[@]}"; do
  if [ ! -z "${!secret}" ]; then
    echo "Setting $secret..."
    npx wrangler secret put "$secret" <<< "${!secret}"
  else
    echo "Warning: $secret not set in env, skipping."
  fi
done

echo "Setup complete for $STAGE."
