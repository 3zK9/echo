#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
source "$REPO_ROOT/security/versions.env"

TOOLS_ROOT="${SECURITY_TOOLS_ROOT:-$REPO_ROOT/.cache/security-tools}"
BIN_DIR="${SECURITY_TOOLS_BIN:-$TOOLS_ROOT/bin}"
mkdir -p "$BIN_DIR"

if [[ "${1:-}" == "--print-bin-dir" ]]; then
  printf '%s\n' "$BIN_DIR"
  exit 0
fi

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Pinned scanner archives currently support Linux x86_64 only." >&2
  exit 2
fi

for command_name in curl sha256sum tar install cut; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required bootstrap command not found: $command_name" >&2
    exit 127
  fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

install_release() {
  local tool="$1"
  local version="$2"
  local checksum="$3"
  local repository="$4"
  local tag="$5"
  local asset="$6"
  local destination="$BIN_DIR/$tool"
  local marker="$TOOLS_ROOT/$tool.version"

  if [[ -x "$destination" && -f "$marker" ]]; then
    local installed_version installed_archive_checksum installed_binary_checksum
    IFS='|' read -r installed_version installed_archive_checksum installed_binary_checksum < "$marker"
    if [[ "$installed_version" == "$version" && \
      "$installed_archive_checksum" == "$checksum" && \
      "$(sha256sum "$destination" | cut -d ' ' -f 1)" == "$installed_binary_checksum" ]]; then
      echo "$tool $version is already installed and verified"
      return
    fi
  fi

  local archive="$tmp_dir/$asset"
  local extract_dir="$tmp_dir/$tool"
  mkdir -p "$extract_dir"
  curl --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 \
    "https://github.com/$repository/releases/download/$tag/$asset" \
    --output "$archive"
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
  tar -xzf "$archive" -C "$extract_dir"
  install -m 0755 "$extract_dir/$tool" "$destination"
  local binary_checksum
  binary_checksum="$(sha256sum "$destination" | cut -d ' ' -f 1)"
  printf '%s|%s|%s\n' "$version" "$checksum" "$binary_checksum" > "$marker"
  echo "Installed $tool $version"
}

install_tool() {
  case "$1" in
    gitleaks)
      install_release gitleaks "$GITLEAKS_VERSION" "$GITLEAKS_SHA256" \
        gitleaks/gitleaks "v$GITLEAKS_VERSION" \
        "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
      ;;
    trufflehog)
      install_release trufflehog "$TRUFFLEHOG_VERSION" "$TRUFFLEHOG_SHA256" \
        trufflesecurity/trufflehog "v$TRUFFLEHOG_VERSION" \
        "trufflehog_${TRUFFLEHOG_VERSION}_linux_amd64.tar.gz"
      ;;
    syft)
      install_release syft "$SYFT_VERSION" "$SYFT_SHA256" \
        anchore/syft "v$SYFT_VERSION" \
        "syft_${SYFT_VERSION}_linux_amd64.tar.gz"
      ;;
    grype)
      install_release grype "$GRYPE_VERSION" "$GRYPE_SHA256" \
        anchore/grype "v$GRYPE_VERSION" \
        "grype_${GRYPE_VERSION}_linux_amd64.tar.gz"
      ;;
    *)
      echo "Unknown security tool: $1" >&2
      exit 2
      ;;
  esac
}

tools=("$@")
if [[ ${#tools[@]} -eq 0 ]]; then
  tools=(gitleaks trufflehog syft grype)
fi

for tool in "${tools[@]}"; do
  install_tool "$tool"
done

printf 'Add this directory to PATH: %s\n' "$BIN_DIR"
