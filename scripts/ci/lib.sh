#!/usr/bin/env bash

set -euo pipefail

CI_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$CI_SCRIPT_DIR/../.." && pwd)"
SECURITY_REPORTS_DIR="${SECURITY_REPORTS_DIR:-$REPO_ROOT/security-reports}"
SECURITY_TOOLS_BIN="${SECURITY_TOOLS_BIN:-$REPO_ROOT/.cache/security-tools/bin}"

export REPO_ROOT SECURITY_REPORTS_DIR SECURITY_TOOLS_BIN

mkdir -p "$SECURITY_REPORTS_DIR"

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    return 127
  fi
}

safe_name() {
  printf '%s' "$1" | tr -cs 'A-Za-z0-9._-' '_'
}
