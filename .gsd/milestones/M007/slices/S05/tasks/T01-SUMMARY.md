---
id: T01
parent: S05
milestone: M007
provides:
  - release workflow (.github/workflows/release.yml) with full Docker build+push+SBOM+sign pipeline for all 4 services
key_files:
  - .github/workflows/release.yml
key_decisions:
  - "D031: cosign keyless signing via GitHub Actions OIDC, sign by digest not tag"
patterns_established:
  - "Per-service build→SBOM→sign sequential pattern with named step IDs for digest capture"
  - "GHA cache (type=gha) for Docker layer caching across release builds"
observability_surfaces:
  - "gh run list --workflow=release.yml — workflow run status"
  - "cosign verify --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/fabiodinota/interdict/{service}@sha256:... — signature verification"
  - "GitHub Release page — SBOM artifacts attached as release assets"
  - "Named steps (build-kernel, sbom-kernel, sign-kernel, etc.) — failure attribution per service+phase in Actions logs"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Create release workflow with container signing and SBOM

**Complete release pipeline: tag push builds 4 Docker images, pushes to ghcr.io, generates SPDX SBOMs, signs each by digest via cosign keyless OIDC, and creates a GitHub Release with auto-notes and SBOM assets.**

## What Happened

Created `.github/workflows/release.yml` with a single `release` job triggered on `v*` tag push. The workflow:

1. Sets up Docker Buildx, logs into ghcr.io via `docker/login-action@v3` with GITHUB_TOKEN, and installs cosign via `sigstore/cosign-installer@main`.
2. For each of the 4 services (kernel, control-plane, dashboard, evidence-collector), sequentially: builds+pushes with `docker/build-push-action@v6` capturing the digest output, generates an SPDX SBOM with `anchore/sbom-action@v0` targeting the image by digest, then signs the image by digest with `cosign sign --yes`.
3. Creates a GitHub Release via `softprops/action-gh-release@v2` with `generate_release_notes: true` and attaches all 4 SBOM JSON files.

Permissions set: `id-token: write` (OIDC), `packages: write` (ghcr.io), `contents: write` (Release), `attestations: write` (SBOM attestations). Concurrency group prevents parallel releases.

## Verification

- `yamllint -d relaxed .github/workflows/release.yml` — **PASS** (0 errors, warnings only for line-length)
- YAML contains `on: push: tags: ['v*']` trigger — **PASS**
- 4 `docker/build-push-action@v6` steps — **PASS** (count=4)
- 4 `cosign sign` commands referencing `digest` — **PASS** (count=4, all use `@${{ steps.build-{service}.outputs.digest }}`)
- 4 `anchore/sbom-action@v0` steps — **PASS** (count=4)
- `softprops/action-gh-release@v2` step present — **PASS**
- `id-token: write` permission set — **PASS**
- Build order per service: build → SBOM → sign — **PASS** (verified via line numbers)

### Slice-Level Verification (intermediate — partial expected)

| Check | Status |
|-------|--------|
| SV1: yamllint release.yml | ✅ PASS |
| SV2: yamllint release-please.yml | ⏭ SKIP (T02) |
| SV3: release.yml all 4 services + cosign + sbom | ✅ PASS |
| SV4: ci-quality-security.yml secret-scanning + benchmarks | ⏭ SKIP (T03) |
| SV5: commitlint validates | ⏭ SKIP (T02) |
| SV6: .husky/commit-msg hook | ⏭ SKIP (T02) |
| SV7: release-please configs | ⏭ SKIP (T02) |
| SV8: CODEOWNERS | ⏭ SKIP (T03) |
| SV9: PR template | ⏭ SKIP (T03) |
| SV10: failure handling | ✅ PASS (named steps per service+phase; Actions default failure semantics) |

## Diagnostics

- **Workflow run status:** `gh run list --workflow=release.yml`
- **Signature verification:** `cosign verify --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/fabiodinota/interdict/kernel@sha256:...`
- **SBOM inspection:** Download SBOM assets from GitHub Release page, or `gh release download <tag> --pattern 'sbom-*.spdx.json'`
- **Failure attribution:** Each step named `{action}-{service}` (e.g. `Build and push kernel`, `Sign kernel image`) — failures pinpoint exact service and phase in Actions logs

## Deviations

- Added `attestations: write` permission (not in original plan) — needed for SBOM attestation writes
- Added `concurrency` group to prevent overlapping release runs — defensive measure not in plan
- Added GHA cache (`cache-from: type=gha`, `cache-to: type=gha,mode=max`) to each build step — reduces build time for subsequent releases

## Known Issues

None.

## Files Created/Modified

- `.github/workflows/release.yml` — complete release pipeline (new)
- `.gsd/milestones/M007/slices/S05/S05-PLAN.md` — added failure-path verification check (pre-flight fix)
- `.gsd/milestones/M007/slices/S05/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
