---
id: T01
parent: S07
milestone: M007
provides:
  - Hardened .dockerignore excluding ~20 non-build file categories
  - Multi-platform Docker builds (linux/amd64 + linux/arm64) for all 4 services
  - Architecture-aware OPA binary download via TARGETARCH
key_files:
  - .dockerignore
  - docker/control-plane/Dockerfile
  - .github/workflows/release.yml
key_decisions:
  - Kept dashboard/ in .dockerignore allowlist — dashboard Dockerfile needs COPY dashboard/
  - Used allowlist pattern (exclude broadly, re-include essentials) for .dockerignore safety
patterns_established:
  - TARGETARCH ARG pattern for architecture-dependent binary downloads in Dockerfiles
  - QEMU + Buildx multi-platform build pattern in release pipeline
observability_surfaces:
  - docker manifest inspect shows amd64+arm64 entries after release pipeline runs
  - Build logs show architecture-specific OPA download URL
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Harden .dockerignore and enable multi-platform Docker builds

**Expanded .dockerignore with ~25 exclusions + allowlist, added QEMU/TARGETARCH for arm64 builds across all 4 services**

## What Happened

1. **Hardened `.dockerignore`** — Added exclusions for `docs/`, `helm/`, `scripts/`, `.github/`, `.husky/`, `.gsd/`, `.pi/`, `*.md`, CI config files (`commitlint.config.js`, `renovate.json`, etc.), `docker-compose*.yml`, and root package manager files. Added allowlist entries: `!proto/`, `!crates/`, `!Cargo.toml`, `!Cargo.lock`, `!control-plane/`, `!dashboard/`, `!docker/` to protect files needed by Dockerfiles.

2. **Fixed OPA download** — Replaced hardcoded `opa_linux_amd64_static` with `ARG TARGETARCH` + `opa_linux_${TARGETARCH}_static` in the `opa-fetch` stage. OPA release naming matches Docker's `TARGETARCH` values exactly (amd64/arm64).

3. **Added QEMU** — Inserted `docker/setup-qemu-action@v3` step after Buildx setup in release.yml for arm64 emulation on amd64 runners.

4. **Added platforms** — Added `platforms: linux/amd64,linux/arm64` to all 4 `docker/build-push-action@v6` steps (kernel, control-plane, dashboard, evidence-collector).

## Verification

- `grep -c "platforms:" .github/workflows/release.yml` → **4** ✅
- `grep "TARGETARCH" docker/control-plane/Dockerfile` → found `ARG TARGETARCH` and interpolated URL ✅
- `yamllint -d relaxed .github/workflows/release.yml` → exit 0 (warnings only: line-length) ✅
- `.dockerignore` contains `docs/`, `helm/`, `scripts/`, `.github/`, `*.md` exclusions ✅
- `.dockerignore` contains `!proto/` allowlist ✅
- YAML parse validation passes ✅
- QEMU action `docker/setup-qemu-action@v3` present in release.yml ✅

### Slice-level verification (T01 scope)

| Check | Result |
|-------|--------|
| yamllint release.yml | ✅ PASS |
| platforms count = 4 | ✅ PASS |
| TARGETARCH in Dockerfile | ✅ PASS |
| startupProbe count = 4 | ⏳ T02 scope |
| max-size in compose ≥4 | ⏳ T03 scope |
| monitoring profile exists | ⏳ T03 scope |
| prometheus config exists | ⏳ T03 scope |
| backup.sh exists | ⏳ T03 scope |
| validate-env.sh exists | ⏳ T04 scope |

## Diagnostics

- **Build context size:** `docker build` output shows "sending build context" line — should be significantly smaller with new exclusions.
- **Multi-platform manifest:** After release, `docker manifest inspect ghcr.io/fabiodinota/interdict/<service>:<tag>` shows both amd64 and arm64 entries.
- **OPA fetch failure:** If OPA release lacks arm64 binary, `opa-fetch` stage fails with HTTP 404 — no silent wrong-arch fallback.

## Deviations

- **Kept `dashboard/` in allowlist:** Task plan said to exclude `dashboard/` but the dashboard Dockerfile does `COPY dashboard/ .` from the build context. Excluding it would break the dashboard build. Added `!dashboard/` to the allowlist instead.

## Known Issues

None.

## Files Created/Modified

- `.dockerignore` — Expanded with ~25 exclusions and 7 allowlist entries for build-essential paths
- `docker/control-plane/Dockerfile` — `TARGETARCH`-based OPA binary download replacing hardcoded amd64
- `.github/workflows/release.yml` — Added QEMU setup step + `platforms: linux/amd64,linux/arm64` to all 4 build-push-action steps
- `.gsd/milestones/M007/slices/S07/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
