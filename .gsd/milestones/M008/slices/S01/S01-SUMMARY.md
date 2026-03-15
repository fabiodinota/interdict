---
id: S01
parent: M008
milestone: M008
provides:
  - All 45 GitHub Actions uses: references pinned to SHA digests across 3 workflow files
  - OPA binary download with SHA256 checksum verification for amd64 and arm64
  - All 8 Docker base image FROM lines pinned by sha256 manifest-list digest across 4 Dockerfiles
  - Renovate configured with pinDigests:true for github-actions and docker
  - Windows target removed from deny.toml [graph].targets
requires:
  - slice: none
    provides: independent slice
affects:
  - S08
key_files:
  - .github/workflows/ci-quality-security.yml
  - .github/workflows/release.yml
  - .github/workflows/release-please.yml
  - docker/control-plane/Dockerfile
  - docker/kernel/Dockerfile
  - docker/evidence-collector/Dockerfile
  - docker/dashboard/Dockerfile
  - deny.toml
  - renovate.json
key_decisions:
  - "D045: GitHub Actions pinned to SHA digests with version comments — eliminates mutable tag/branch supply chain risk. Renovate pinDigests tracks updates."
  - "D044: Docker base images pinned by manifest-list digest (already recorded)"
  - "Per-architecture ARG checksums with TARGETARCH conditional for OPA binary verification"
  - "Kept windows-sys skip-tree in deny.toml bans (crate name, not platform target) while removing x86_64-pc-windows-msvc from graph targets"
patterns_established:
  - "GitHub Actions format: uses: owner/action@<sha> # <version-tag>"
  - "Docker FROM format: FROM image:tag@sha256:<digest> AS stage"
  - "Binary verification: ARG-based checksums with TARGETARCH conditional + sha256sum -c"
  - "Renovate pinDigests:true ensures automated update PRs for both actions and Docker images"
observability_surfaces:
  - "Diagnostic: grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\\{40\\}' — empty means fully pinned"
  - "Diagnostic: grep -cE '@[a-f0-9]{40}' .github/workflows/*.yml — expect 30/14/1"
  - "Diagnostic: grep -c '@sha256:' docker/*/Dockerfile — returns 1/3/2/2 = 8 total"
  - "Build failure: sha256sum -c exits non-zero if OPA binary is tampered — Docker build fails at opa-fetch stage"
drill_down_paths:
  - .gsd/milestones/M008/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M008/slices/S01/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-15
---

# S01: CI Supply Chain Hardening

**Pinned all GitHub Actions (45 refs), Docker base images (8 FROM lines), and OPA binary to immutable SHA/digest references, eliminating all mutable supply chain references across CI and container builds.**

## What Happened

Three tasks hardened the CI supply chain across three surfaces:

**T01 — GitHub Actions SHA Pinning.** Resolved commit SHAs for 19 unique actions via `git ls-remote` and replaced all 45 mutable references (`@main`, `@vN`, `@0.28.0`-style tags) with `@<40-char-sha> # <version>` format across three workflow files: `ci-quality-security.yml` (30 refs), `release.yml` (14 refs), and `release-please.yml` (1 ref). The two highest-risk references — `cosign-installer@main` and `trufflehog@main` — were prioritized. Updated `renovate.json` to add `pinDigests: true` to the github-actions package rule so Renovate proposes PRs when new action versions are released even with digest pinning.

**T02 — OPA Binary Checksum Verification.** Replaced the unverified `ADD` instruction in the control-plane Dockerfile's `opa-fetch` stage with `curl -fSL` download plus SHA256 checksum verification. Checksums are pinned as build ARGs for both amd64 (`2c0ccdbbe0...`) and arm64 (`facd6a9ea3...`), with `TARGETARCH` conditional selection. Build fails immediately on checksum mismatch — fail-closed by design.

**T03 — Docker Base Image Digest Pinning + deny.toml Cleanup.** Looked up manifest-list (multi-arch) digests for all 5 distinct base images via Docker Hub API and appended `@sha256:<digest>` to each of the 8 external FROM lines across 4 Dockerfiles. Tags preserved alongside digests for human readability. Removed `x86_64-pc-windows-msvc` from deny.toml `[graph].targets` while preserving the `windows-sys` skip-tree entry (crate name, not platform target). `cargo deny check` passes cleanly.

## Verification

| Check | Result | Notes |
|-------|--------|-------|
| `grep -cE "@[a-f0-9]{40}" ci-quality-security.yml` = 30 | ✅ PASS | All action uses SHA-pinned |
| `grep -cE "@[a-f0-9]{40}" release.yml` = 14 | ✅ PASS | |
| `grep -cE "@[a-f0-9]{40}" release-please.yml` = 1 | ✅ PASS | |
| `grep -c "@main" .github/workflows/*.yml` = 0 | ✅ PASS | Zero mutable branch refs |
| `grep "sha256" docker/control-plane/Dockerfile` | ✅ PASS | Shows sha256sum verification |
| `grep -c "@sha256:" docker/*/Dockerfile` ≥ 4 | ✅ PASS | 8 total (1+3+2+2) |
| Unpinned actions diagnostic = empty | ✅ PASS | No unpinned action references |
| `grep -c "x86_64-pc-windows-msvc" deny.toml` = 0 | ✅ PASS | Windows target removed |
| `cargo deny check` | ✅ PASS | advisories ok, bans ok, licenses ok, sources ok |
| `yamllint -d relaxed .github/workflows/*.yml` | ✅ PASS | Warnings only (line-length from SHA hashes) |

## Requirements Advanced

- AR-SUPPLY-01 — All GitHub Actions, Docker base images, and binary downloads now use immutable SHA/digest references. This fully satisfies the supply chain pinning requirement.

## Requirements Validated

- AR-SUPPLY-01 — Structural verification proves zero mutable references remain: grep counts match expected totals (30/14/1 for actions, 8 for Docker digests), OPA checksum verification in Dockerfile, cargo deny check passes.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Slice plan originally stated 28 action uses in ci-quality-security.yml — actual count is 30. Plan updated to match reality.
- `grep -c "windows" deny.toml` returns 2 (not 0) because `windows-sys` crate name appears in `[bans].skip-tree`. The correct check is `grep -c "x86_64-pc-windows-msvc" deny.toml` = 0 (Windows *target* removed, crate skip-tree preserved).
- Docker daemon not running on host — full Docker build verification of OPA checksum deferred to CI. Pattern is well-established and checksums verified against official release artifacts.

## Known Limitations

- OPA binary checksums are pinned to v1.4.2 — version bumps require updating both `OPA_VERSION` and both architecture checksums.
- Docker base image digests are pinned to a point-in-time — Renovate's `pinDigests: true` handles automated update proposals.
- yamllint warnings on line-length are expected (SHA digests make lines long) — only errors would indicate broken YAML.

## Follow-ups

- S08 will document all M008 changes including these supply chain hardening patterns in the operator guide.
- Renovate will propose PRs for action and Docker digest updates — first PR will validate the pinDigests workflow.

## Files Created/Modified

- `.github/workflows/ci-quality-security.yml` — Pinned 30 action references to SHA digests
- `.github/workflows/release.yml` — Pinned 14 action references to SHA digests
- `.github/workflows/release-please.yml` — Pinned 1 action reference to SHA digest
- `docker/control-plane/Dockerfile` — Pinned base image by digest; replaced ADD with curl + SHA256 checksum for OPA
- `docker/kernel/Dockerfile` — Pinned 2 base images (cargo-chef, debian) by digest
- `docker/evidence-collector/Dockerfile` — Pinned 2 base images (cargo-chef, debian) by digest
- `docker/dashboard/Dockerfile` — Pinned 3 base images (bun x2, node) by digest
- `deny.toml` — Removed x86_64-pc-windows-msvc from [graph].targets
- `renovate.json` — Added pinDigests:true to github-actions package rule

## Forward Intelligence

### What the next slice should know
- All CI workflows now use SHA-pinned actions — any new action added to workflows must follow the `@<sha> # <version>` pattern.
- Renovate `pinDigests: true` is configured for both github-actions and docker groups — new image/action additions get automatic update PRs.
- OPA checksum update procedure: change `OPA_VERSION`, `OPA_SHA256_AMD64`, and `OPA_SHA256_ARM64` ARGs. Checksums at `https://github.com/open-policy-agent/opa/releases/download/<version>/opa_linux_<arch>_static.sha256`.

### What's fragile
- OPA checksums are hard-coded ARGs — if OPA releases a security patch, both checksums must be updated simultaneously or builds break on one architecture.
- Docker manifest-list digests change whenever any platform image in the multi-arch set is rebuilt — Renovate should catch this but manual builds against stale digests will pull the pinned version.

### Authoritative diagnostics
- `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` — empty confirms all actions pinned. Any output is a regression.
- `grep "^FROM" docker/*/Dockerfile | grep -v "@sha256:" | grep -v "AS "` — should return only internal alias stages, never external images.
- `cargo deny check` — passes cleanly after Windows target removal.

### What assumptions changed
- Plan assumed 28 action uses in ci-quality-security.yml — actual count is 30. All plans updated to reflect reality.
- Plan assumed `grep -c "windows" deny.toml` = 0 — windows-sys crate name legitimately remains in skip-tree. Correct check uses the full target triple.
