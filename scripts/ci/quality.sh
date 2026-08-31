#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

export NEXTAUTH_URL="${NEXTAUTH_URL:-http://127.0.0.1:3000}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-ci-only-nextauth-secret-not-for-production}"
export AUTH_SECRET="${AUTH_SECRET:-$NEXTAUTH_SECRET}"
export AUTH_GITHUB_ID="${AUTH_GITHUB_ID:-ci-placeholder-client-id}"
export AUTH_GITHUB_SECRET="${AUTH_GITHUB_SECRET:-ci-placeholder-client-secret}"
export AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-true}"
export DATABASE_URL="${DATABASE_URL:-postgresql://ci:ci@127.0.0.1:5432/ci}"
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

cd "$REPO_ROOT/web"

npm ci --no-audit --no-fund
npm run prisma:generate
npx --no-install prisma validate
npm run lint
npx --no-install tsc --noEmit --incremental false
npm test
npm run build
