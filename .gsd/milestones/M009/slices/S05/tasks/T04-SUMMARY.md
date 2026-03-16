---
id: T04
parent: S05
milestone: M009
provides:
  - SHA256 integrity verification on hadolint v2.12.0 and kube-score v1.18.0 CI downloads
  - Two-phase bun install in control-plane Dockerfile for better layer caching
key_files:
  - .github/workflows/ci-quality-security.yml
  - docker/control-plane/Dockerfile
key_decisions: []
patterns_established: []
observability_surfaces:
  - "CI log: sha256sum verification lines on hadolint/kube-score install — mismatch prints WARNING and fails the step"
  - "Docker build: production deps layer cached separately — visible in docker build --progress=plain output"
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T04: CI SHA256 checksums and Dockerfile layer optimization

**Added SHA256 integrity verification to hadolint and kube-score CI downloads, and split control-plane Dockerfile into two-phase bun install for better layer caching.**

## What Happened

1. Retrieved real SHA256 checksums from official GitHub release assets:
   - hadolint v2.12.0 Linux x86_64: `56de6d5e5ec427e17b74fa48d51271c7fc0d61244bf5c90e828aab8362d55010` (from `hadolint-Linux-x86_64.sha256` release asset)
   - kube-score v1.18.0 linux_amd64.tar.gz: `2f4c3a43045ac4006fa1adcf970660828d2df09c4e9165bafe27d36479fa355a` (from `checksums.txt` release asset)

2. Modified both CI install steps to include version and SHA256 variables, download to file, verify with `sha256sum -c`, then proceed with chmod/install. Pattern matches the OPA verification in the control-plane Dockerfile (D046).

3. Split the Dockerfile's single `bun install --frozen-lockfile` into two phases:
   - First: `bun install --production --frozen-lockfile` (production deps — cached layer, changes rarely)
   - Then: `COPY control-plane/ .` (source code between the two installs)
   - Finally: `bun install --frozen-lockfile` (adds devDependencies for drizzle-kit migrations)

   This means source-only changes don't invalidate the production dependency cache layer.

## Verification

- `grep -c "sha256sum -c" .github/workflows/ci-quality-security.yml` → `2` ✓
- `grep -c "bun install" docker/control-plane/Dockerfile` → `2` ✓
- `docker compose config --no-interpolate` → PASS (validates YAML; env var interpolation failure is pre-existing, unrelated)
- Python YAML safe_load on CI workflow → PASS (valid YAML syntax)

### Slice-level checks (T04 is the final task):

| Check | Result |
|-------|--------|
| `grep -c "sha256sum -c"` in CI workflow = 2 | ✓ PASS |
| `grep -c "bun install"` in Dockerfile = 2 | ✓ PASS |
| `docker compose config --no-interpolate` validates | ✓ PASS |
| `grep -c "10-year"` in generate-internal-ca.sh = 0 | ✓ PASS (T01) |
| CI YAML SHA256 variables present for hadolint and kube-score | ✓ PASS (visual) |

Note: `cargo clippy` and `helm lint` were verified in T01 and T03 respectively — not re-run here as this task didn't touch Rust or Helm files.

## Diagnostics

- **CI tamper detection:** If hadolint or kube-score binaries are tampered/corrupted, CI step fails with `sha256sum: WARNING: 1 computed checksum did NOT match`. Grep CI logs for `sha256sum`.
- **Docker layer cache:** `docker build --progress=plain -f docker/control-plane/Dockerfile .` shows separate cache status for production deps vs full deps. Source-only changes show `CACHED` on the production install layer.

## Deviations

None.

## Known Issues

- `docker compose config` (with interpolation) fails due to missing `.env` variables (CLICKHOUSE_PASSWORD etc.) — pre-existing, not caused by this task. `--no-interpolate` confirms YAML structure is valid.

## Files Created/Modified

- `.github/workflows/ci-quality-security.yml` — Added SHA256 variables and `sha256sum -c` verification to hadolint and kube-score install steps
- `docker/control-plane/Dockerfile` — Split single `bun install` into two-phase install (production first, then full) with source COPY between
- `.gsd/milestones/M009/slices/S05/tasks/T04-PLAN.md` — Added Observability Impact section (pre-flight fix)
