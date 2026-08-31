#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

require_command npm
require_command jq

mode="${1:-runtime}"
case "$mode" in
  runtime) audit_args=(--omit=dev) ;;
  all) audit_args=() ;;
  *)
    echo "Usage: $0 <runtime|all>" >&2
    exit 2
    ;;
esac

report="$SECURITY_REPORTS_DIR/npm-audit-web-$mode.json"
set +e
(
  cd "$REPO_ROOT/web"
  npm audit --json --audit-level=high "${audit_args[@]}"
) > "$report"
scan_status=$?
set -e

if ! jq empty "$report" >/dev/null 2>&1; then
  echo "npm audit did not produce a valid JSON report." >&2
  exit 2
fi

if jq -e 'has("error")' "$report" >/dev/null 2>&1; then
  echo "npm audit could not complete; inspect the report for the non-secret error details." >&2
  if (( scan_status == 0 )); then
    scan_status=1
  fi
  exit "$scan_status"
fi

if ! jq -e '(.metadata.vulnerabilities | type) == "object"' "$report" >/dev/null 2>&1; then
  echo "npm audit JSON is missing vulnerability metadata." >&2
  exit 2
fi

if [[ $scan_status -ne 0 ]]; then
  if is_true "${NPM_AUDIT_ENFORCE:-true}"; then
    echo "npm audit found blocking $mode dependency vulnerabilities." >&2
    exit "$scan_status"
  fi
  echo "npm audit found $mode dependency vulnerabilities (report-only mode)." >&2
fi
