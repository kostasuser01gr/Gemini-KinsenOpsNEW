#!/bin/bash
# repair.sh - Auto-fix formatting and common issues

set -e

echo "=> Running safe auto-fixes..."

# Assuming eslint and prettier exist in package.json scripts
echo "=> Fixing Web..."
cd apps/web
npx eslint src --fix || true
npx prettier --write "src/**/*.{ts,tsx,css}" || true

echo "=> Fixing Worker..."
cd ../worker
npx eslint src --fix || true
npx prettier --write "src/**/*.ts" || true

echo "=> Repair complete."