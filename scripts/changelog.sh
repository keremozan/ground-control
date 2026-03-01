#!/bin/bash
# Generate CHANGELOG.md from git tags + commit messages
# Commits use conventional format with scope: feat(crew): message, fix(chat): message
# Commits without scope go under "General"
# Usage: bash scripts/changelog.sh

FILE="CHANGELOG.md"

# Map scopes to display names
scope_name() {
  case "$1" in
    crew)      echo "Crew" ;;
    chat)      echo "Chat" ;;
    tasks)     echo "Tasks" ;;
    inbox)     echo "Inbox" ;;
    calendar)  echo "Calendar" ;;
    status)    echo "Status Bar" ;;
    schedule)  echo "Schedule" ;;
    pipeline)  echo "Pipeline" ;;
    config)    echo "Config" ;;
    changelog) echo "Changelog" ;;
    core)      echo "Core" ;;
    *)         echo "$1" ;;
  esac
}

# Process commits into area-grouped format
# Input: newline-separated commit messages
# Output: markdown sections grouped by area
group_by_area() {
  local commits="$1"
  declare -A areas  # area -> items

  while IFS= read -r msg; do
    [ -z "$msg" ] && continue
    [[ "$msg" == docs:\ update\ changelog* ]] && continue
    [[ "$msg" == *"Co-Authored-By"* ]] && continue

    # Extract type and optional scope: feat(crew): message
    local type="" scope="" clean=""
    if [[ "$msg" =~ ^([a-z]+)\(([^)]+)\):\ (.*) ]]; then
      type="${BASH_REMATCH[1]}"
      scope="${BASH_REMATCH[2]}"
      clean="${BASH_REMATCH[3]}"
    elif [[ "$msg" =~ ^([a-z]+):\ (.*) ]]; then
      type="${BASH_REMATCH[1]}"
      scope="general"
      clean="${BASH_REMATCH[2]}"
    else
      type="other"
      scope="general"
      clean="$msg"
    fi

    # Skip docs/style/chore
    [[ "$type" =~ ^(docs|style|chore|ci|test)$ ]] && continue

    # Map type to tag
    local tag=""
    case "$type" in
      feat)     tag="[new]" ;;
      fix)      tag="[fix]" ;;
      refactor) tag="[improved]" ;;
      *)        tag="" ;;
    esac

    local area
    area=$(scope_name "$scope")
    local line="- ${tag:+$tag }$clean"

    if [ -n "${areas[$area]+x}" ]; then
      areas[$area]+=$'\n'"$line"
    else
      areas[$area]="$line"
    fi
  done <<< "$commits"

  # Output sorted areas (General last)
  for area in $(echo "${!areas[@]}" | tr ' ' '\n' | grep -v '^General$' | sort); do
    printf '### %s\n%s\n\n' "$area" "${areas[$area]}"
  done
  if [ -n "${areas[General]+x}" ]; then
    printf '### General\n%s\n\n' "${areas[General]}"
  fi
}

echo "# Changelog" > "$FILE"
echo "" >> "$FILE"

tags=($(git tag --sort=-creatordate 2>/dev/null))

if [ ${#tags[@]} -gt 0 ]; then
  latest_tag="${tags[0]}"
  unreleased=$(git log "$latest_tag"..HEAD --pretty=format:"%s" --no-merges 2>/dev/null)
  if [ -n "$unreleased" ]; then
    section=$(group_by_area "$unreleased")
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
    group_by_area "$commits" >> "$FILE"
  done
else
  echo "## v1.0.0 — $(date +%Y-%m-%d)" >> "$FILE"
  echo "" >> "$FILE"
  commits=$(git log --pretty=format:"%s" --no-merges)
  group_by_area "$commits" >> "$FILE"
fi

echo "Generated $FILE"
