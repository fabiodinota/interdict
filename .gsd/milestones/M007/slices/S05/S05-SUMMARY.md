---
id: S05
parent: M007
milestone: M007
provides:
  - Release workflow (.github/workflows/release.yml) — tag push builds, pushes, SBOMs, signs 4 Docker images, creates GitHub Release
  - Conventional commit enforcement via commitlint (husky hook + CI job)
  - release-please automation (.github/workflows/release-please.yml) — version bumps, changelog, tag creation
  - TruffleHog secret scanning CI job (blocks on verified/unknown findings)
  - Criterion benchmark tracking CI job (main-only, 200% alert threshold, GitHub Pages storage)
  - CODEOWNERS file with path-based review routing
  - PR template with conventional commit checklist
requires: []
affects:
  - S06
  - S07
key_files:
  - .github/workflows/release.yml
  - .github/workflows/release-please.yml
  - .github/workflows/ci-quality-security.yml
  - commitlint.config.js
  - .husky/commit-msg
  - .release-please-manifest.json
  - release-please-config.json
  - .github/CODEOWNERS
  - .github/PULL_REQUEST_TEMPLATE.md
key_decisions:
  - "D031: cosign keyless signing via GitHub Actions OIDC, sign by digest not tag"
  - "D032: release-please (simple mode) over manual changelog + standard-version"
  - "D033: Benchmark CI tracking with 200% alert threshold, main-only, no PR gating"
  - "D034: TruffleHog --results=verified,unknown --fail for secret scanning"
patterns_established:
  - "Per-service build→SBOM→sign sequential pattern with named step IDs for digest capture"
  - "GHA cache (type=gha) for Docker layer caching across release builds"
  - "Husky commit-msg hook pattern: #!/usr/bin/env sh + set -eu + npx commitlint --edit (Git Bash compatible)"
  - "CI commitlint validates range on PR (base..head), last commit on push (HEAD~1..HEAD)"
  - "release-please config+manifest pair for automated versioning"
  - "Secret scanning job: checkout fetch-depth:0 + trufflehog --results=verified,unknown --fail"
  - "Benchmark tracking: main-only guard, generous alert threshold, GitHub Pages auto-push"
observability_surfaces:
  - "gh run list --workflow=release.yml — release workflow run status"
  - "gh run list --workflow=release-please.yml — release PR creation/update"
  - "gh run list --workflow=ci-quality-security.yml — commitlint, secret-scanning, benchmarks job status"
  - "cosign verify --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/fabiodinota/interdict/{service}@sha256:... — signature verification"
  - "GitHub Release page — SBOM artifacts attached as release assets"
  - "GitHub Pages benchmark dashboard — https://fabiodinota.github.io/interdict/dev/bench/"
  - "gh pr list --label 'autorelease: pending' — pending release PRs"
drill_down_paths:
  - .gsd/milestones/M007/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S05/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S05/tasks/T03-SUMMARY.md
duration: 40m
verification_result: passed
completed_at: 2026-03-15
---

# S05: CI/CD Release Pipeline + Quality Gates

**Complete CI/CD release pipeline: tag push builds 4 signed Docker images with SBOMs to ghcr.io, conventional commits enforced, changelog automated via release-please, secret scanning blocks PRs, benchmark tracking monitors regressions, and CODEOWNERS routes reviews.**

## What Happened

Built the full release and CI governance infrastructure across 3 tasks:

**T01 — Release workflow with container signing and SBOM.** Created `.github/workflows/release.yml` triggered on `v*` tag push. A single `release` job builds all 4 services (kernel, control-plane, dashboard, evidence-collector) using `docker/build-push-action@v6`, generates SPDX SBOMs with `anchore/sbom-action@v0`, and signs each image by digest (not tag) via `sigstore/cosign-installer@main` with keyless OIDC. Creates a GitHub Release with auto-generated notes and SBOM assets attached. Permissions: `id-token: write`, `packages: write`, `contents: write`, `attestations: write`. GHA Docker layer caching and concurrency group for release safety. Added explicit `if: failure()` step for diagnostic surfacing.

**T02 — Conventional commit enforcement and release-please.** Installed `@commitlint/cli` + `@commitlint/config-conventional`. Created `commitlint.config.js`, `.husky/commit-msg` hook (Git Bash compatible), and commitlint CI job in `ci-quality-security.yml` that validates commit range on PRs and last commit on push. Created `release-please-config.json` (simple mode), `.release-please-manifest.json` (v1.5.0), and `.github/workflows/release-please.yml` using `googleapis/release-please-action@v4`. This completes the automation loop: conventional commit → push to main → release-please creates release PR → merge → tag → release.yml triggers → signed images.

**T03 — Secret scanning, benchmarks, CODEOWNERS, PR template.** Added `secret-scanning` job (TruffleHog with full history scan, `--results=verified,unknown --fail`) and `benchmarks` job (main-only, Criterion + `benchmark-action/github-action-benchmark@v1`, 200% alert threshold, GitHub Pages auto-push) to CI. Created `.github/CODEOWNERS` with 7 path-based rules and `.github/PULL_REQUEST_TEMPLATE.md` with type-of-change checkboxes and quality checklist.

## Verification

| Check | Result |
|-------|--------|
| `yamllint -d relaxed .github/workflows/release.yml` | ✅ PASS (warnings only — line-length) |
| `yamllint -d relaxed .github/workflows/release-please.yml` | ✅ PASS (clean) |
| `yamllint -d relaxed .github/workflows/ci-quality-security.yml` | ✅ PASS (warnings only — line-length) |
| release.yml: 4 `docker/build-push-action` steps | ✅ PASS (count=4) |
| release.yml: 4 `anchore/sbom-action` steps | ✅ PASS (count=4) |
| release.yml: cosign sign steps referencing digest | ✅ PASS (count=5, includes installer) |
| release.yml: `softprops/action-gh-release` step | ✅ PASS |
| release.yml: `if: failure()` handling | ✅ PASS |
| `npx commitlint --from HEAD~1` | ✅ PASS (exit 0) |
| `.husky/commit-msg` exists | ✅ PASS |
| `.release-please-manifest.json` exists | ✅ PASS |
| `release-please-config.json` exists | ✅ PASS |
| ci-quality-security.yml: `commitlint` job | ✅ PASS |
| ci-quality-security.yml: `secret-scanning` job | ✅ PASS |
| ci-quality-security.yml: `benchmarks` job | ✅ PASS |
| `.github/CODEOWNERS` exists | ✅ PASS |
| `.github/PULL_REQUEST_TEMPLATE.md` exists | ✅ PASS |

## Requirements Advanced

- PR-CICD-01 — Tag push now produces signed container images with SBOMs; conventional commits enforced; release automation complete

## Requirements Validated

- None newly validated (full validation requires live GitHub Actions execution in S06/S07)

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- Added `attestations: write` permission to release.yml — needed for SBOM attestation writes (not in original plan)
- Added `concurrency` group to release.yml — prevents parallel releases (defensive addition)
- Added GHA Docker layer cache to each build step — reduces subsequent release build times
- Added `if: failure()` diagnostic step to release.yml during slice completion — closes the failure-handling verification gap noted in T03 summary
- Benchmarks job uses `contents: write` for GitHub Pages auto-push — plan said "GitHub Pages or artifact", chose Pages for persistent trend tracking

## Known Limitations

- Release pipeline is structurally validated only — full proof requires a `v*` tag push to GitHub Actions
- Benchmark GitHub Pages dashboard requires Pages to be enabled on the repository; first run on main auto-creates `gh-pages` branch
- CODEOWNERS enforcement requires GitHub branch protection to be configured with "Require review from CODEOWNERS"
- All CODEOWNERS paths point to single owner (`@fabiodinota`) — appropriate for current team size

## Follow-ups

- S06 will integrate secret scanning into security hardening workflow
- S07 will extend release.yml for multi-platform (amd64+arm64) Docker builds
- Enable GitHub Pages on repository for benchmark dashboard after first main push
- Configure branch protection to enforce CODEOWNERS review requirement

## Files Created/Modified

- `.github/workflows/release.yml` — Complete release pipeline with build+push+SBOM+sign+release for 4 services (new)
- `.github/workflows/release-please.yml` — release-please automation workflow (new)
- `.github/workflows/ci-quality-security.yml` — Added commitlint, secret-scanning, benchmarks jobs (modified)
- `commitlint.config.js` — Conventional commit configuration (new)
- `.husky/commit-msg` — Husky hook invoking commitlint (new)
- `package.json` — Added @commitlint/cli and @commitlint/config-conventional devDependencies (modified)
- `.release-please-manifest.json` — Version manifest at v1.5.0 (new)
- `release-please-config.json` — release-please configuration, simple mode (new)
- `.github/CODEOWNERS` — Path-based review routing, 7 rules (new)
- `.github/PULL_REQUEST_TEMPLATE.md` — PR checklist template (new)

## Forward Intelligence

### What the next slice should know
- The release.yml workflow currently builds single-platform (linux/amd64) images. S07 should add `platforms: linux/amd64,linux/arm64` to each `docker/build-push-action` step and set up QEMU.
- The CI workflow now has 3 new jobs (commitlint, secret-scanning, benchmarks). Any new CI jobs should follow the same pattern: named job, minimal permissions, clear failure output.
- release-please is configured for `release-type: simple` — if the project moves to a monorepo-aware release strategy, switch to `release-type: node` or use per-package configs.

### What's fragile
- Benchmark auto-push to GitHub Pages requires the `gh-pages` branch to exist — first run creates it, but if the branch is deleted, subsequent runs will fail silently.
- cosign keyless signing depends on GitHub Actions OIDC token — won't work in self-hosted runners without OIDC configuration.

### Authoritative diagnostics
- `gh run list --workflow=release.yml` — shows whether the release pipeline is functioning (only populated after first tag push)
- `gh run list --workflow=ci-quality-security.yml` — commitlint, secret-scanning, and benchmark job statuses are visible here
- `cosign verify` with `--certificate-oidc-issuer https://token.actions.githubusercontent.com` — proves signature authenticity

### What assumptions changed
- Original plan assumed `if: failure()` would be handled by GitHub Actions default failure semantics — added explicit failure diagnostic step for better operator visibility
