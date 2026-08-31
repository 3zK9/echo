#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

export PATH="$SECURITY_TOOLS_BIN:$PATH"
require_command gitleaks

mode="${1:-full}"
requested_range="${2:-}"
report="$SECURITY_REPORTS_DIR/gitleaks-$mode.sarif"
log_opts="--all"

case "$mode" in
  diff)
    if [[ -n "$requested_range" ]]; then
      range_start="${requested_range%%..*}"
      range_end="${requested_range##*..}"
      if [[ "$range_start" != "$requested_range" ]] && \
        git -C "$REPO_ROOT" cat-file -e "$range_start^{commit}" 2>/dev/null && \
        git -C "$REPO_ROOT" cat-file -e "$range_end^{commit}" 2>/dev/null; then
        log_opts="$requested_range"
      else
        echo "Gitleaks range is unavailable; falling back to all history." >&2
      fi
    else
      echo "Gitleaks range was not supplied; falling back to all history." >&2
    fi
    ;;
  full) ;;
  *)
    echo "Usage: $0 <diff|full> [base..head]" >&2
    exit 2
    ;;
esac

set +e
gitleaks git "$REPO_ROOT" \
  --config "$REPO_ROOT/security/gitleaks.toml" \
  --log-opts "$log_opts" \
  --redact=100 \
  --no-banner \
  --report-format sarif \
  --report-path "$report"
scan_status=$?
set -e

if [[ $scan_status -eq 1 ]] && ! is_true "${GITLEAKS_ENFORCE:-true}"; then
  echo "Gitleaks reported findings (report-only mode)." >&2
  exit 0
fi

exit "$scan_status"
