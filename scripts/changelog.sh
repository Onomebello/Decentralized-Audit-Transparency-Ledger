#!/usr/bin/env bash
set -euo pipefail

# === AuditLedger Changelog Generator ===
# Reads git log since the last tag and generates a CHANGELOG.md entry.
#
# Usage:
#   ./scripts/changelog.sh [--from <tag>] [--to <ref>] [--output CHANGELOG.md]
#   ./scripts/changelog.sh --release v0.2.0 [--from v0.1.0]

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_OUTPUT="$SCRIPT_DIR/CHANGELOG.md"

FROM_TAG=""
TO_REF="HEAD"
OUTPUT_FILE="$DEFAULT_OUTPUT"
RELEASE_TAG=""
RELEASE_DATE=$(date +%Y-%m-%d)

usage() {
  echo "Usage: $0 [--from <tag>] [--to <ref>] [--output <file>]"
  echo "       $0 --release <tag> [--from <tag>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM_TAG="$2"; shift 2 ;;
    --to) TO_REF="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    --release) RELEASE_TAG="$2"; shift 2 ;;
    *) usage ;;
  esac
done

if [ -z "$FROM_TAG" ]; then
  FROM_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
fi

if [ -n "$RELEASE_TAG" ]; then
  FROM_TAG="${FROM_TAG:-$(git rev-list --max-parents=0 HEAD)}"
fi

if [ -z "$FROM_TAG" ]; then
  echo "No previous tag found. Generating changelog from beginning of history."
  FROM_TAG=$(git rev-list --max-parents=0 HEAD)
fi

echo "Generating changelog from $FROM_TAG to $TO_REF..."

# Generate changelog entries categorized by conventional commit type
generate_entries() {
  local range="$FROM_TAG..$TO_REF"

  echo "## [$RELEASE_TAG] - $RELEASE_DATE"
  echo ""

  local sections="Features Bug Fixes Performance Improvements Documentation Deprecations Breaking Changes"
  local patterns="feat|fix|perf|docs|deprecat|breaking|!"

  for section in $sections; do
    local pattern=""
    case "$section" in
      Features) pattern="^feat" ;;
      "Bug Fixes") pattern="^fix" ;;
      "Performance Improvements") pattern="^perf" ;;
      Documentation) pattern="^docs" ;;
      Deprecations) pattern="^deprecat" ;;
      "Breaking Changes") pattern="breaking|!" ;;
    esac

    local commits
    commits=$(git log "$range" --oneline --grep="$pattern" --reverse 2>/dev/null || true)
    if [ -n "$commits" ]; then
      echo "### $section"
      echo "$commits" | while read -r hash msg; do
        local short_hash
        short_hash=$(echo "$hash" | cut -c1-7)
        echo "- $msg ($short_hash)"
      done
      echo ""
    fi
  done

  # Uncategorized commits
  local categorized
  categorized=$(git log "$range" --oneline --grep="^feat\|^fix\|^perf\|^docs\|^deprecat\|^breaking\|!" --format="%H" 2>/dev/null || true)
  local all_commits
  all_commits=$(git log "$range" --oneline --reverse 2>/dev/null || true)

  local uncategorized=""
  while read -r line; do
    local hash
    hash=$(echo "$line" | awk '{print $1}')
    if ! echo "$categorized" | grep -q "$hash"; then
      uncategorized="$uncategorized$line"$'\n'
    fi
  done <<< "$all_commits"

  if [ -n "$uncategorized" ]; then
    echo "### Other"
    echo "$uncategorized" | while read -r line; do
      [ -z "$line" ] && continue
      local short_hash
      short_hash=$(echo "$line" | awk '{print $1}' | cut -c1-7)
      local msg
      msg=$(echo "$line" | cut -d' ' -f2-)
      echo "- $msg ($short_hash)"
    done
    echo ""
  fi
}

NEW_ENTRIES=$(generate_entries)

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "# Changelog" > "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  echo "All notable changes to the AuditLedger project are documented in this file." >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
fi

# Prepend new entries to existing changelog
TMP_FILE=$(mktemp)
{
  echo "$NEW_ENTRIES"
  # Skip existing header and first blank lines if present
  if [ -s "$OUTPUT_FILE" ]; then
    tail -n +4 "$OUTPUT_FILE" 2>/dev/null || true
  fi
} > "$TMP_FILE"

mv "$TMP_FILE" "$OUTPUT_FILE"
echo "Changelog written to $OUTPUT_FILE"
