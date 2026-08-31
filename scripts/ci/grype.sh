#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

export PATH="$SECURITY_TOOLS_BIN:$PATH"
export GRYPE_DB_CACHE_DIR="${GRYPE_DB_CACHE_DIR:-$REPO_ROOT/.cache/grype/db}"
require_command grype

sbom="$SECURITY_REPORTS_DIR/gl-sbom-web-npm.cdx.json"
if [[ ! -s "$sbom" ]]; then
  echo "SBOM is missing; run scripts/ci/sbom.sh first." >&2
  exit 2
fi

args=(
  "sbom:$sbom"
  --config "$REPO_ROOT/security/grype.yaml"
  --output "json=$SECURITY_REPORTS_DIR/grype-web.json"
  --output "table=$SECURITY_REPORTS_DIR/grype-web.txt"
)

if is_true "${GRYPE_ENFORCE:-false}"; then
  args+=(--fail-on "${GRYPE_FAIL_ON:-high}")
fi

grype "${args[@]}"
