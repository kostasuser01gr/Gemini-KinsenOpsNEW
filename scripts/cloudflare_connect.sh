#!/bin/bash
# cloudflare_connect.sh - Provision infrastructure via CLI

set -e

PROJECT_NAME="car-rental-copilot"
DB_NAME="car-rental-db"

echo "=> Ensuring authentication..."
npx wrangler whoami || npx wrangler login

echo "=> Checking D1 Database..."
# We try to create it, if it already exists it will fail but we'll extract the ID from the list if so
D1_CREATE_OUT=$(npx wrangler d1 create $DB_NAME 2>&1 || true)
DB_ID=$(echo "$D1_CREATE_OUT" | grep "database_id" | awk -F'"' '{print $4}')

if [ -z "$DB_ID" ]; then
    echo "=> Database might already exist, fetching ID..."
    DB_ID=$(npx wrangler d1 list --format json | jq -r ".[] | select(.name == \"$DB_NAME\") | .uuid")
fi

if [ -n "$DB_ID" ]; then
    echo "=> Updating wrangler.toml with DB ID: $DB_ID"
    sed -i '' "s/database_id = \".*\"/database_id = \"$DB_ID\"/g" apps/worker/wrangler.toml
else
    echo "❌ ERROR: Could not find or create D1 database '$DB_NAME'."
    exit 1
fi

echo "=> Applying Migrations..."
cd apps/worker
npx wrangler d1 migrations apply $DB_NAME --remote
cd ../..

echo "=> Ensuring Pages Project..."
npx wrangler pages project create $PROJECT_NAME --production-branch main || echo "=> Pages project already exists."

echo "=> Deployment Environment Connected."
