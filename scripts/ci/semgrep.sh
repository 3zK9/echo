#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

require_command semgrep

mode="${1:-full}"
baseline="${2:-}"
report_prefix="$SECURITY_REPORTS_DIR/semgrep-$mode"

args=(
  scan
  --config "$REPO_ROOT/security/semgrep.yml"
  --metrics off
  --disable-version-check
  --strict
  --timeout 60
  --max-target-bytes 1000000
  --exclude node_modules
  --exclude .next
  --exclude security-reports
  --json-output "$report_prefix.json"
  --sarif-output "$report_prefix.sarif"
  --gitlab-sast-output "$report_prefix.gitlab-sast.json"
)

if [[ -n "${SEMGREP_EXTRA_CONFIGS:-}" ]]; then
  IFS=',' read -r -a extra_configs <<< "$SEMGREP_EXTRA_CONFIGS"
  for config in "${extra_configs[@]}"; do
    [[ -n "$config" ]] && args+=(--config "$config")
  done
fi

case "$mode" in
  diff)
    if [[ -z "$baseline" ]] || ! git -C "$REPO_ROOT" cat-file -e "$baseline^{commit}" 2>/dev/null; then
      echo "Semgrep baseline is unavailable; falling back to a full scan." >&2
    else
      args+=(--baseline-commit "$baseline")
    fi
    ;;
  full) ;;
  *)
    echo "Usage: $0 <diff|full> [baseline-commit]" >&2
    exit 2
    ;;
esac

if is_true "${SEMGREP_ENFORCE:-true}"; then
  args+=(--error)
else
  args+=(--no-error)
fi

cd "$REPO_ROOT"
semgrep "${args[@]}" web
