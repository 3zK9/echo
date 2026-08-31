#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

export PATH="$SECURITY_TOOLS_BIN:$PATH"
require_command jq
require_command syft
export SYFT_CHECK_FOR_APP_UPDATE=false

lockfile="web/package-lock.json"
output="$SECURITY_REPORTS_DIR/gl-sbom-web-npm.cdx.json"
temporary="$SECURITY_REPORTS_DIR/.gl-sbom-web-npm.cdx.json.tmp"

syft "file:$REPO_ROOT/$lockfile" \
  -o "cyclonedx-json@1.6=$temporary"

# GitLab 18.10+ requires these properties to associate third-party SBOMs
# with their input lockfile. One SBOM is emitted per lockfile.
jq --arg lockfile "$lockfile" '
  .metadata.properties = (
    ((.metadata.properties // [])
      | map(select(.name != "gitlab:meta:schema_version"
        and .name != "gitlab:dependency_scanning:input_file:path")))
    + [
      {"name": "gitlab:meta:schema_version", "value": "1"},
      {"name": "gitlab:dependency_scanning:input_file:path", "value": $lockfile}
    ]
  )
' "$temporary" > "$output"
rm -f -- "$temporary"

echo "Wrote $output"
