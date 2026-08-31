#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

export PATH="$SECURITY_TOOLS_BIN:$PATH"
require_command jq
require_command trufflehog

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT
raw_report="$tmp_dir/trufflehog-raw.jsonl"
scan_log="$tmp_dir/trufflehog.log"
sanitized_report="$SECURITY_REPORTS_DIR/trufflehog-history.sanitized.jsonl"

set +e
trufflehog git "file://$REPO_ROOT" \
  --results=verified,unknown \
  --json \
  --no-update \
  --fail-on-scan-errors \
  > "$raw_report" 2> "$scan_log"
scan_status=$?
set -e

# TruffleHog JSON contains raw credential fields. Only this allowlisted,
# sanitized representation may leave the ephemeral job workspace.
if [[ -s "$raw_report" ]]; then
  jq -c -f "$REPO_ROOT/security/trufflehog-sanitize.jq" \
    "$raw_report" > "$sanitized_report"
else
  : > "$sanitized_report"
fi

if [[ $scan_status -ne 0 ]]; then
  echo "TruffleHog could not complete the scan; raw output was withheld." >&2
  exit "$scan_status"
fi

verified_count="$(jq -s '[.[] | select(.Verified == true)] | length' "$raw_report")"
total_count="$(jq -s 'length' "$raw_report")"
unknown_count=$((total_count - verified_count))
echo "TruffleHog results: verified=$verified_count unknown=$unknown_count"

if (( verified_count > 0 )) && is_true "${TRUFFLEHOG_ENFORCE:-true}"; then
  echo "Verified credentials were detected. Revoke them before reviewing the sanitized report." >&2
  exit 1
fi

if (( unknown_count > 0 )) && is_true "${TRUFFLEHOG_FAIL_UNKNOWN:-false}"; then
  echo "Credential verification returned unknown results." >&2
  exit 1
fi
