#!/bin/bash
# Generate CHANGELOG.md from git tags + commit messages
# Commits must use conventional format: feat:, fix:, refactor:, docs:, etc.
# Usage: bash scripts/changelog.sh
# Tip: tag a release first with: git tag v1.0.0

FILE="CHANGELOG.md"

categorize() {
  local commits="$1"
  local has_feat="" has_fix="" has_refactor="" has_other=""
  local feat="" fix="" refactor="" other=""

  while IFS= read -r msg; do
    [ -z "$msg" ] && continue
    # Skip meta commits
    [[ "$msg" == docs:\ update\ changelog* ]] && continue
    [[ "$msg" == *"Co-Authored-By"* ]] && continue

    # Strip scope: "feat(chat): X" → "X"
    clean=$(echo "$msg" | sed -E 's/^[a-z]+(\([^)]+\))?:\s*//')

    if [[ "$msg" =~ ^feat ]]; then
      feat+="- $clean"$'\n'; has_feat=1
    elif [[ "$msg" =~ ^fix ]]; then
      fix+="- $clean"$'\n'; has_fix=1
    elif [[ "$msg" =~ ^refactor ]]; then
      refactor+="- $clean"$'\n'; has_refactor=1
    elif [[ "$msg" =~ ^(docs|style|chore|ci|test) ]]; then
      : # skip docs/style/chore commits from changelog
    else
      other+="- $msg"$'\n'; has_other=1
    fi
  done <<< "$commits"

  [ -n "$has_feat" ] && printf '### ![New](https://img.shields.io/badge/New-22c55e)\n%s\n' "$feat"
  [ -n "$has_fix" ] && printf '### ![Fixed](https://img.shields.io/badge/Fixed-ef4444)\n%s\n' "$fix"
  [ -n "$has_refactor" ] && printf '### ![Improved](https://img.shields.io/badge/Improved-3b82f6)\n%s\n' "$refactor"
  [ -n "$has_other" ] && printf '### ![Other](https://img.shields.io/badge/Other-94a3b8)\n%s\n' "$other"
}

echo "# Changelog" > "$FILE"
echo "" >> "$FILE"

tags=($(git tag --sort=-creatordate 2>/dev/null))

if [ ${#tags[@]} -gt 0 ]; then
  latest_tag="${tags[0]}"
  unreleased=$(git log "$latest_tag"..HEAD --pretty=format:"%s" --no-merges 2>/dev/null)
  if [ -n "$unreleased" ]; then
    section=$(categorize "$unreleased")
    if [ -n "$section" ]; then
      echo "## Unreleased" >> "$FILE"
      echo "" >> "$FILE"
      echo "$section" >> "$FILE"
    fi
  fi

  for i in "${!tags[@]}"; do
    tag="${tags[$i]}"
    tag_date=$(git log -1 --format=%ai "$tag" | cut -d' ' -f1)

    if [ $((i + 1)) -lt ${#tags[@]} ]; then
      prev_tag="${tags[$((i + 1))]}"
      commits=$(git log "$prev_tag".."$tag" --pretty=format:"%s" --no-merges 2>/dev/null)
    else
      commits=$(git log "$tag" --pretty=format:"%s" --no-merges 2>/dev/null)
    fi

    echo "## $tag — $tag_date" >> "$FILE"
    echo "" >> "$FILE"
    categorize "$commits" >> "$FILE"
  done
else
  # No tags — all commits as v1.0.0
  echo "## v1.0.0 — $(date +%Y-%m-%d)" >> "$FILE"
  echo "" >> "$FILE"
  commits=$(git log --pretty=format:"%s" --no-merges)
  categorize "$commits" >> "$FILE"
fi

echo "Generated $FILE"
