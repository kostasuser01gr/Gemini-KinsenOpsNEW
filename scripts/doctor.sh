#!/bin/bash
# doctor.sh - Detect common failure causes

echo "=> Running Doctor checks..."

ERRORS=0

# Check Node
if ! command -v node &> /dev/null; then
    echo "[!] Node.js is not installed."
    ERRORS=1
fi

# Check Wrangler
if ! npx wrangler --version &> /dev/null; then
    echo "[!] Wrangler is not installed."
    ERRORS=1
fi

# Check Wrangler.toml Database Binding
if ! grep -q "database_id = " apps/worker/wrangler.toml; then
    echo "[!] Missing database_id in apps/worker/wrangler.toml"
    echo "Fix: Run 'npx wrangler d1 create car-rental-db' and update wrangler.toml."
    ERRORS=1
fi

# Check for secrets (best effort)
if ! npx wrangler secret list --name car-rental-api 2>/dev/null | grep -q "STRICT_FREE_MODE"; then
    echo "[!] STRICT_FREE_MODE secret may be missing on Cloudflare."
fi

if [ $ERRORS -eq 0 ]; then
    echo "=> Everything looks good! Run 'make full' to deploy."
else
    echo "=> Doctor found issues."
    exit 1
fi
