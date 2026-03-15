# S05: CI/CD Release Pipeline + Quality Gates

**Goal:** Tag push produces signed container images in ghcr.io with SBOM and SLSA provenance. Conventional commits enforced, changelog auto-generated, cargo-audit blocks PRs (already done), secret scanning runs on every PR, performance benchmarks have regression gates, and CODEOWNERS routes reviews.

**Demo:** `git tag v1.5.0 && git push origin v1.5.0` triggers a release workflow that builds 4 Docker images, pushes them to `ghcr.io/fabiodinota/interdict/*`, signs each by digest with cosign keyless, attaches SBOMs, and creates a GitHub Release with auto-generated notes. PRs are validated by commitlint, TruffleHog secret scanning, and benchmark tracking. CODEOWNERS enforces review routing.

## Must-Haves

- Release workflow triggered on `v*` tag push builds and pushes 4 Docker images to ghcr.io
- Each image signed by digest using cosign keyless (GitHub Actions OIDC)
- SBOM generated per image using anchore/sbom-action (syft)
- GitHub Release created automatically with release notes
- commitlint enforces conventional commits via husky commit-msg hook and CI job
- release-please automates version bumps, changelog, and tag creation
- TruffleHog secret scanning runs on every push/PR and blocks on verified findings
- Criterion benchmark tracking with generous alert threshold (≥200%)
- CODEOWNERS file routes PR reviews
- PR template standardizes review process

## Proof Level

- This slice proves: integration (CI pipeline configuration validated structurally; full proof requires GitHub Actions execution)
- Real runtime required: yes (GitHub Actions) — local validation is structural only
- Human/UAT required: no

## Verification

- `yamllint .github/workflows/release.yml` passes (valid YAML)
- `yamllint .github/workflows/release-please.yml` passes (valid YAML)
- `.github/workflows/release.yml` contains jobs for all 4 services (kernel, control-plane, dashboard, evidence-collector), cosign signing steps, and sbom-action steps
- `.github/workflows/ci-quality-security.yml` contains `secret-scanning` and `benchmarks` jobs
- `npx commitlint --from HEAD~1` validates the most recent commit
- `.husky/commit-msg` hook exists and invokes commitlint
- `.release-please-manifest.json` and `release-please-config.json` exist
- `.github/CODEOWNERS` exists with path-based ownership rules
- `.github/PULL_REQUEST_TEMPLATE.md` exists
- `.github/workflows/release.yml` contains explicit failure handling: `if: failure()` or equivalent conditional step that surfaces build/sign/SBOM failures in workflow logs

## Observability / Diagnostics

- Runtime signals: GitHub Actions workflow run status, cosign verification logs, SBOM attestation in ghcr.io
- Inspection surfaces: `gh run list --workflow=release.yml`, `cosign verify ghcr.io/fabiodinota/interdict/kernel@sha256:...`, GitHub Release page
- Failure visibility: workflow step failure with logs, cosign OIDC token errors, Docker build failures
- Redaction constraints: no secrets in workflow files (OIDC-based, uses GITHUB_TOKEN)

## Integration Closure

- Upstream surfaces consumed: 4 Dockerfiles (`docker/*/Dockerfile`), existing CI workflow, Criterion benchmarks (`crates/kernel/benches/`)
- New wiring introduced in this slice: release.yml (new workflow), release-please.yml (new workflow), commitlint CI job, secret-scanning CI job, benchmarks CI job
- What remains before the milestone is truly usable end-to-end: S06 (security hardening integrates into this pipeline), S07 (multi-platform Docker builds extend release workflow), S08 (documentation)

## Tasks

- [x] **T01: Create release workflow with container signing and SBOM** `est:1h`
  - Why: Core deliverable — the project has no release pipeline. Tag push must produce signed, SBOM-annotated container images in ghcr.io and a GitHub Release.
  - Files: `.github/workflows/release.yml`
  - Do: Create workflow triggered on `v*` tag push. `id-token: write` + `packages: write` + `contents: write` permissions. Login to ghcr.io via `docker/login-action@v3`. Build each of the 4 services with `docker/build-push-action@v6` (context `.`, file `docker/{service}/Dockerfile`, tags `ghcr.io/fabiodinota/interdict/{service}:{tag},ghcr.io/fabiodinota/interdict/{service}:latest`). Generate SBOM per image with `anchore/sbom-action@v0`. Sign each image by digest (NOT tag) using `sigstore/cosign-installer@main` + `cosign sign --yes`. Create GitHub Release with `softprops/action-gh-release@v2` and auto-generated notes. Order: build → push → SBOM → sign (SBOM before sign so signature covers metadata).
  - Verify: `yamllint .github/workflows/release.yml` passes; workflow YAML contains all 4 service build jobs, cosign sign steps, sbom-action steps, and gh-release step
  - Done when: `.github/workflows/release.yml` exists with complete release pipeline for all 4 services

- [x] **T02: Add conventional commit enforcement and release-please automation** `est:45m`
  - Why: Conventional commits are required for automated changelog generation. release-please creates/updates release PRs that, when merged, tag the release — triggering T01's workflow.
  - Files: `commitlint.config.js`, `.husky/commit-msg`, `package.json`, `.release-please-manifest.json`, `release-please-config.json`, `.github/workflows/release-please.yml`
  - Do: Install `@commitlint/cli` + `@commitlint/config-conventional` as root devDeps. Create `commitlint.config.js` extending conventional config. Create `.husky/commit-msg` hook running `npx commitlint --edit`. Create release-please config with `release-type: simple`, initial version matching current state. Create `release-please.yml` workflow using `googleapis/release-please-action@v4` on push to main. Add `commitlint` CI job to `ci-quality-security.yml` that validates commit messages on push/PR.
  - Verify: `npx commitlint --from HEAD~1` passes; `.husky/commit-msg` exists; `yamllint .github/workflows/release-please.yml` passes; commitlint job present in CI workflow
  - Done when: Conventional commit messages are validated locally (husky) and in CI, and release-please workflow automates versioning

- [x] **T03: Add secret scanning, benchmark tracking, CODEOWNERS, and PR template** `est:45m`
  - Why: Completes CI governance: TruffleHog catches leaked secrets, benchmark tracking detects performance regressions, CODEOWNERS routes reviews, PR template standardizes contributions.
  - Files: `.github/workflows/ci-quality-security.yml`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`
  - Do: Add `secret-scanning` job to CI using `trufflesecurity/trufflehog@main` with `--results=verified,unknown --fail`. Full git history scan (`fetch-depth: 0`). Add `benchmarks` job running on push to main only (not PRs — too noisy). Use `benchmark-action/github-action-benchmark@v1` with Criterion JSON output, `alert-threshold: '200%'`, `fail-on-alert: false`. Create CODEOWNERS with path rules (`/crates/` → `@fabiodinota`, `/dashboard/` → `@fabiodinota`, `/control-plane/` → `@fabiodinota`, `/helm/` → `@fabiodinota`). Create PR template with checklist (tests, conventional commit, description, breaking changes).
  - Verify: `yamllint .github/workflows/ci-quality-security.yml` passes; CI workflow contains `secret-scanning` and `benchmarks` jobs; `.github/CODEOWNERS` exists; `.github/PULL_REQUEST_TEMPLATE.md` exists
  - Done when: Secret scanning job added to CI, benchmark tracking job added, CODEOWNERS and PR template exist

## Files Likely Touched

- `.github/workflows/release.yml` (new)
- `.github/workflows/release-please.yml` (new)
- `.github/workflows/ci-quality-security.yml` (modified — add commitlint, secret-scanning, benchmarks jobs)
- `commitlint.config.js` (new)
- `.husky/commit-msg` (new)
- `package.json` (add devDeps)
- `.release-please-manifest.json` (new)
- `release-please-config.json` (new)
- `.github/CODEOWNERS` (new)
- `.github/PULL_REQUEST_TEMPLATE.md` (new)
