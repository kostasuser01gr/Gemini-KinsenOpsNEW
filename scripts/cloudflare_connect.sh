#!/bin/bash
# cloudflare_connect.sh - Provision infrastructure via CLI

set -e

PROJECT_NAME="car-rental-copilot"
DB_NAME="car-rental-db"

echo "=> Ensuring authentication..."
# If wrangler whoami fails, it will prompt login (interactive)
npx wrangler whoami || npx wrangler login

echo "=> Setting up D1 Database..."
# Try to create, if it exists this might fail, so we capture output
D1_OUT=$(npx wrangler d1 create $DB_NAME 2>&1 || true)
echo "$D1_OUT"

# Extract database_id if created or exists
DB_ID=$(echo "$D1_OUT" | grep "database_id" | awk -F'"' '{print $4}')

if [ -n "$DB_ID" ]; then
    echo "=> Updating wrangler.toml with new DB ID: $DB_ID"
    # Basic sed replace for macOS/Linux compatibility
    sed -i.bak "s/database_id = ".*"/database_id = "$DB_ID"/g" apps/worker/wrangler.toml
    rm -f apps/worker/wrangler.toml.bak
else
    echo "=> D1 Database likely already exists. Assuming wrangler.toml is configured."
fi

echo "=> Applying Migrations..."
cd apps/worker
npx wrangler d1 migrations apply $DB_NAME --remote
cd ../..

echo "=> Setting up Pages Project..."
# Ensure pages project exists (will fail safely if already exists)
npx wrangler pages project create $PROJECT_NAME --production-branch main || true

echo "=> Checking Secrets (Interactive inputs skipped for automation, use 'echo val | wrangler secret put KEY')..."
echo "Ensure you set SESSION_SECRET, TURNSTILE_SECRET_KEY, STRICT_FREE_MODE."

echo "=> Connection provisioned."
