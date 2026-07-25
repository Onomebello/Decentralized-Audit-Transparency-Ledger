#!/usr/bin/env bash
set -euo pipefail

# === AuditLedger Version Management Script ===
# Bumps versions across all SDK packages and the contract crate.
#
# Usage:
#   ./scripts/version.sh bump <major|minor|patch> [--component <component>]
#   ./scripts/version.sh set <version> [--component <component>]
#   ./scripts/version.sh show
#
# Components: contract, js-sdk, python-sdk, all (default)

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CARGO_TOML="$SCRIPT_DIR/Cargo.toml"
JS_PACKAGE="$SCRIPT_DIR/sdk/js/package.json"
PY_PROJECT="$SCRIPT_DIR/sdk/python/pyproject.toml"

get_current_version() {
  local file="$1"
  case "$file" in
    *.toml)
      grep '^version = ' "$file" | head -1 | sed 's/version = "\(.*\)"/\1/'
      ;;
    *.json)
      grep '"version":' "$file" | head -1 | sed 's/.*"version": "\(.*\)",/\1/'
      ;;
  esac
}

bump_version() {
  local current="$1"
  local part="$2"

  IFS='.' read -r major minor patch <<< "$current"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
    *) echo "ERROR: unknown bump part '$part'" >&2; exit 1 ;;
  esac
}

set_version() {
  local file="$1"
  local new_ver="$2"
  case "$file" in
    *.toml)
      sed -i "s/^version = \".*\"/version = \"$new_ver\"/" "$file"
      ;;
    *.json)
      sed -i "s/\"version\": \".*\"/\"version\": \"$new_ver\"/" "$file"
      ;;
  esac
}

update_component() {
  local component="$1"
  local action="$2"
  local value="$3"

  case "$component" in
    contract)
      FILE="$CARGO_TOML"
      NAME="contract crate"
      ;;
    js-sdk)
      FILE="$JS_PACKAGE"
      NAME="JS SDK"
      ;;
    python-sdk)
      FILE="$PY_PROJECT"
      NAME="Python SDK"
      ;;
    *)
      echo "ERROR: unknown component '$component'" >&2
      exit 1
      ;;
  esac

  local current
  current=$(get_current_version "$FILE")
  local new_ver

  if [ "$action" = "bump" ]; then
    new_ver=$(bump_version "$current" "$value")
  elif [ "$action" = "set" ]; then
    new_ver="$value"
  fi

  set_version "$FILE" "$new_ver"
  echo "$NAME: $current -> $new_ver"
}

COMPONENT="all"
ACTION=""
VALUE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    bump|set|show)
      ACTION="$1"
      shift
      if [ "$ACTION" != "show" ]; then
        VALUE="${1:-}"
        [ "$ACTION" = "set" ] && [ -z "$VALUE" ] && { echo "ERROR: version required for set"; exit 1; }
        [ "$ACTION" = "bump" ] && [ -z "$VALUE" ] && VALUE="patch"
        [ "$ACTION" != "show" ] && shift
      fi
      ;;
    --component|-c)
      COMPONENT="$2"; shift 2 ;;
    *)
      echo "Usage: $0 bump <major|minor|patch> [--component <c>]"
      echo "       $0 set <version> [--component <c>]"
      echo "       $0 show"
      exit 1
      ;;
  esac
done

if [ "$ACTION" = "show" ]; then
  echo "contract crate:  $(get_current_version "$CARGO_TOML")"
  echo "JS SDK:          $(get_current_version "$JS_PACKAGE")"
  echo "Python SDK:      $(get_current_version "$PY_PROJECT")"
  exit 0
fi

if [ "$COMPONENT" = "all" ]; then
  for comp in contract js-sdk python-sdk; do
    update_component "$comp" "$ACTION" "$VALUE"
  done
else
  update_component "$COMPONENT" "$ACTION" "$VALUE"
fi
