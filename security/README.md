# Security automation

The application in `web/` is the repository's only supported Node.js project.
The root-level legacy manifest is intentionally not an input to these jobs.

All scanner versions are centralized in [`versions.env`](versions.env). Release
archives are downloaded over HTTPS and checked against a committed SHA-256
digest by `scripts/ci/install-tools.sh`. Semgrep runs from a digest-pinned
container image. Generated reports and downloaded tools stay in ignored local
directories.

## Local commands

Run the same entry points used by GitHub and GitLab CI:

```bash
scripts/ci/quality.sh
scripts/ci/install-tools.sh gitleaks syft grype trufflehog
PATH="$PWD/.cache/security-tools/bin:$PATH" scripts/ci/gitleaks.sh full
PATH="$PWD/.cache/security-tools/bin:$PATH" scripts/ci/npm-audit.sh runtime
PATH="$PWD/.cache/security-tools/bin:$PATH" scripts/ci/sbom.sh
PATH="$PWD/.cache/security-tools/bin:$PATH" scripts/ci/grype.sh
PATH="$PWD/.cache/security-tools/bin:$PATH" scripts/ci/trufflehog.sh
```

Run Semgrep with the pinned image:

```bash
source security/versions.env
docker run --rm --volume "$PWD:/src" --workdir /src \
  --entrypoint /bin/bash "$SEMGREP_IMAGE" \
  -lc 'git config --global --add safe.directory /src && scripts/ci/semgrep.sh full'
```

Reports are written to `security-reports/`. Do not upload any other scanner
scratch files.

## Enforcement policy

Fast merge-request/pull-request pipelines enforce tests and quality, the reviewed local
Semgrep rules, Gitleaks, npm audit at high severity, and Grype at high severity.
Syft always emits a CycloneDX 1.6 SBOM. The current `web/` lockfile is clean in
both npm audit and Grype, so future high or critical findings block the gate:

- `NPM_AUDIT_ENFORCE=false` is available for an explicitly report-only npm
  investigation; enforcement is on by default.
- `GRYPE_ENFORCE=false` disables the `GRYPE_FAIL_ON` gate (default: `high`) for
  an explicitly report-only investigation.
- `GITLEAKS_ENFORCE=false` and `SEMGREP_ENFORCE=false` are available only for
  explicitly report-only investigations.
- TruffleHog fails on verified credentials. Unknown verification results are
  reported unless `TRUFFLEHOG_FAIL_UNKNOWN=true` is set.

The scheduled full-history scan intentionally treats TruffleHog's unknown
verification results as report-only. The repository contains four known
placeholder PostgreSQL examples; verified results still fail immediately.

TruffleHog's raw JSON can contain live credential material. The script writes
that output only to a mode-0600 temporary directory, deletes it on exit, and
exports only `trufflehog-history.sanitized.jsonl`. CI must never archive console
logs, the temporary directory, or an unsanitized TruffleHog result.

Any Grype exception added to `grype.yaml` must identify an exact vulnerability
and package and record an owner, tracking issue, rationale, and expiry here.

## Pipeline shape

- GitHub `quality / gate` and `security / gate` are the intended required checks
  for `main`. Configuring branch rules remains an administrator action.
- GitHub runs fast diff-aware scans for pull requests and pushes. The full
  workflow scans the whole tree/history nightly and adds TruffleHog weekly.
- GitLab runs the same scripts for merge requests and its default branch. A
  schedule with `RUN_TRUFFLEHOG=true` enables the weekly history scan.
- The local GitLab project is a downstream mirror of GitHub. Mirror credentials,
  runner registration tokens, deploy credentials, and production secrets belong
  in protected platform settings, never in this repository.

No workflow deploys the application or requires production application secrets.
