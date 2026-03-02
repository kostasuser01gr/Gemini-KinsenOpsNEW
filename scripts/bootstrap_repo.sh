#!/bin/bash
# bootstrap_repo.sh - Install deps and check CLIs

set -e

echo "=> Checking required CLIs..."
for cmd in gh wrangler curl npm npx; do
  if ! command -v $cmd &> /dev/null; then
    echo "ERROR: $cmd is not installed."
    exit 1
  fi
done

echo "=> Installing Root Dependencies..."
npm install

echo "=> Installing Worker Dependencies..."
cd apps/worker && npm install

echo "=> Installing Web Dependencies..."
cd ../web && npm install

echo "=> Bootstrap complete. Ready for 'make full'."
