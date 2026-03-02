#!/bin/bash
set -e

ACTION=$1
BRANCH=$(git rev-parse --abbrev-ref HEAD | sed 's/[^a-zA-Z0-9]/-/g')
WORKSPACE_NAME="ops-${BRANCH}"

if [ "$ACTION" == "create" ]; then
  echo "Creating Quantum Workspace: $WORKSPACE_NAME..."
  
  # Create Ephemeral D1
  D1_INFO=$(npx wrangler d1 create "$WORKSPACE_NAME")
  D1_ID=$(echo "$D1_INFO" | grep "database_id =" | sed 's/database_id = "//;s/"//')
  
  # Create Ephemeral KV
  KV_INFO=$(npx wrangler kv:namespace create SESSIONS --preview false) # Simplified for branch
  KV_ID=$(echo "$KV_INFO" | grep "id =" | sed 's/id = "//;s/"//')

  echo "Workspace $WORKSPACE_NAME created."
  echo "D1_ID: $D1_ID"
  echo "KV_ID: $KV_ID"
  
  # Inject into a temporary wrangler.toml for this branch
  cp wrangler.toml "wrangler.${BRANCH}.toml"
  sed -i "s/database_id = .*/database_id = "$D1_ID"/" "wrangler.${BRANCH}.toml"
  
  # Seed with anonymized data
  echo "Seeding workspace..."
  npx wrangler d1 migrations apply "$WORKSPACE_NAME" --remote --skip-setup
  
elif [ "$ACTION" == "destroy" ]; then
  echo "Destroying Quantum Workspace: $WORKSPACE_NAME..."
  npx wrangler d1 delete "$WORKSPACE_NAME" --force || true
  rm "wrangler.${BRANCH}.toml" || true
  echo "Workspace destroyed."
else
  echo "Usage: workspace_manage.sh [create|destroy]"
  exit 1
fi
