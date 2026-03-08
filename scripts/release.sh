#!/bin/zsh
# Release script: tags current CHANGELOG version, syncs package.json, commits+tags, prepares next version header
# Usage: zsh scripts/release.sh [patch|minor]
# Keyword: "release patch" or "release minor" — Architect knows this command

set -e

CHANGELOG="CHANGELOG.md"
type="${1:-patch}"

# Read current version from CHANGELOG top ## vX.Y.Z line
current=$(grep -m1 '^## v' "$CHANGELOG" | sed 's/## v\([0-9.]*\).*/\1/')

if [[ -z "$current" ]]; then
  echo "Error: No version heading found in $CHANGELOG"
  exit 1
fi

echo "Releasing v$current..."

# Sync package.json to current version
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$current\"/" package.json

# Stage and commit the release
git add "$CHANGELOG" package.json
git commit -m "release: v$current"
git tag "v$current"

echo "Tagged v$current"

# Calculate next version
IFS='.' read -r major minor patch <<< "$current"
case "$type" in
  minor)
    next_minor=$((minor + 1))
    next="$major.$next_minor.0"
    ;;
  *)
    next_patch=$((patch + 1))
    next="$major.$minor.$next_patch"
    ;;
esac

# Prepend next version header to CHANGELOG (after "# Changelog" + blank line)
today=$(date +%Y-%m-%d)
tmp=$(mktemp)
{
  head -2 "$CHANGELOG"
  echo "## v$next — $today"
  echo ""
  tail -n +3 "$CHANGELOG"
} > "$tmp"
mv "$tmp" "$CHANGELOG"

# Sync package.json to next version
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$next\"/" package.json

git add "$CHANGELOG" package.json
git commit -m "chore: prepare v$next"

echo "Done. v$current released, v$next ready."
echo "Push with: git push && git push --tags"
