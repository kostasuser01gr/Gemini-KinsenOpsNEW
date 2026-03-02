#!/bin/bash
set -e

# Usage: bash rollback.sh <GIT_TAG>
TAG=$1

if [ -z "$TAG" ]; then
  echo "Usage: rollback.sh <GIT_TAG>"
  exit 1
fi

echo "Rolling back to tag: $TAG..."

# Check out the tag
git checkout "$TAG"

# Redeploy (CLI-only, assumes Makefile exists in that tag)
echo "Redeploying worker..."
make deploy-worker

echo "Redeploying pages..."
make deploy-pages

echo "Rollback to $TAG complete."

# Switch back to previous branch if needed, but usually on CI/Ops we stay on the tag/branch we rolled to
