#!/bin/bash
set -e

echo "Running Full-Scale Preflight Checks..."

# STRICT_FREE_MODE=true check
if [ "${STRICT_FREE_MODE}" != "true" ]; then
  echo "Error: STRICT_FREE_MODE must be true."
  exit 1
fi

# Required env vars
REQUIRED_VARS=("CLOUDFLARE_API_TOKEN" "CLOUDFLARE_ACCOUNT_ID")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "Error: Missing $var"
    exit 1
  fi
done

# Build output directory check
if [ ! -d "apps/web/dist" ]; then
  echo "Error: apps/web/dist missing. Run 'make build' first."
  exit 1
fi

# Wrangler configuration bindings (D1, KV, R2)
WRANGLER_CONFIG="apps/worker/wrangler.toml"
BINDINGS=("DB" "SESSIONS" "BACKUPS")
for binding in "${BINDINGS[@]}"; do
  if ! grep -q "binding = \"$binding\"" "$WRANGLER_CONFIG"; then
    echo "Error: Missing $binding binding in $WRANGLER_CONFIG."
    exit 1
  fi
done

echo "Preflight complete. Full-scale ready."
