#!/bin/bash
# release.sh - Create a new release tag and update changelog

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Usage: ./release.sh <VERSION>"
    exit 1
fi

echo "=> Creating release $VERSION..."

# Update app version in database via metadata if needed, or just tag
# For now, we tag the repo
git tag -a "v$VERSION" -m "Release v$VERSION"

echo "=> Updating CHANGELOG.md..."
echo -e "## v$VERSION - $(date +%Y-%m-%d)

$(git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --oneline)

$(cat CHANGELOG.md 2>/dev/null)" > CHANGELOG.md

echo "=> Pushing tags..."
git push origin "v$VERSION"
git add CHANGELOG.md
git commit -m "chore: release v$VERSION"
git push origin main

echo "✅ Release v$VERSION pushed."
