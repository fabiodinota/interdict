---
id: S05
parent: M009
milestone: M009
provides:
  - Docker Compose cert-init runs non-root (1000:1000) with read-only rootfs, no-new-privileges, tmpfs-backed apk, and network isolation from application services
  - SHA256 integrity verification on hadolint v2.12.0 and kube-score v1.18.0 CI downloads
  - Complete securityContext on Helm minio-init (readOnlyRootFilesystem, drop ALL, seccompProfile RuntimeDefault)
  - Complete securityContext on Helm sidecar-init (drop ALL + add NET_ADMIN, allowPrivilegeEscalation false, seccompProfile RuntimeDefault)
  - Workspace unsafe_code lint set to deny with per-crate allow exceptions
  - Two-phase bun install in control-plane Dockerfile for layer caching
  - lint-staged Rust handler with cargo fmt --check and graceful fallback
  - Stale 10-year cert comment corrected to 1-year
requires:
  - slice: none
    provides: independent slice
affects:
  - S06 (no hard dependency — S06 consumes S01 outputs, not S05)
key_files:
  - Cargo.toml
  - docker-compose.yml
  - helm/interdict/templates/minio-init-job.yaml
  - helm/interdict/templates/sidecar/_sidecar-init.tpl
  - .github/workflows/ci-quality-security.yml
  - docker/control-plane/Dockerfile
  - docker/certs/generate-internal-ca.sh
  - package.json
key_decisions:
  - none — all changes were plan-prescribed using existing patterns (D053 apk-root, D046 SHA256 verification)
patterns_established:
  - none (reused existing D053 apk --root pattern and D046 sha256sum -c pattern)
observability_surfaces:
  - "cargo clippy fails loudly on unattributed unsafe usage (compile-time enforcement)"
  - "CI sha256sum verification lines — mismatch prints WARNING and fails the step"
  - "docker compose config | grep -A 30 cert-init — shows all hardening properties"
  - "helm template output shows complete securityContext on minio-init and sidecar-init"
  - "lint-staged prints '[lint-staged] cargo not found' when cargo is absent"
drill_down_paths:
  - .gsd/milestones/M009/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M009/slices/S05/tasks/T02-SUMMARY.md
  - .gsd/milestones/M009/slices/S05/tasks/T03-SUMMARY.md
  - .gsd/milestones/M009/slices/S05/tasks/T04-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-16
---

# S05: Infrastructure & CI Hardening

**Closed all FH-INFRA-01 findings — Docker Compose cert-init hardened to non-root with read-only rootfs and network isolation, CI tool downloads SHA256-verified, Helm init containers fully hardened, workspace unsafe_code lint set to deny, and Dockerfile layer caching improved.**

## What Happened

Four tasks, each targeting a different infrastructure surface:

**T01 (config fixes):** Promoted `unsafe_code` from `warn` to `deny` in workspace `Cargo.toml`. All five existing `#[allow(unsafe_code)]` sites across kernel, evidence-collector, and interdict-verify were already in place — clippy passes clean. Fixed the stale "10-year validity" comment in `generate-internal-ca.sh` to "1-year validity" (matching actual `--days 365` and D059). Replaced the lint-staged Rust no-op echo with `cargo fmt -- --check` plus a graceful fallback message when cargo isn't in PATH.

**T02 (Docker Compose cert-init):** Hardened the cert-init service with `user: "1000:1000"`, `read_only: true`, `security_opt: [no-new-privileges:true]`, and `tmpfs: [/tmp]`. Used the D053 `apk --root /tmp/apkroot` pattern to install openssl on the tmpfs while keeping the rootfs read-only. Removed cert-init from the `data` network entirely — it now uses only the default bridge (internet for apk, no access to Postgres/ClickHouse/MinIO). The `certs:/certs` volume mount remains writable (volumes are exempt from rootfs restriction).

**T03 (Helm init containers):** Added `readOnlyRootFilesystem: true`, `capabilities: { drop: [ALL] }`, and `seccompProfile: { type: RuntimeDefault }` to minio-init (which already had runAsNonRoot, runAsUser/Group, allowPrivilegeEscalation). Restructured sidecar-init from just `add: [NET_ADMIN]` to `drop: [ALL]` + `add: [NET_ADMIN]` with `allowPrivilegeEscalation: false` and seccompProfile. Deliberately omitted readOnlyRootFilesystem on sidecar-init (iptables writes to `/run/xtables.lock`) and runAsNonRoot (conflicts with required `runAsUser: 0`).

**T04 (CI checksums + Dockerfile):** Added real SHA256 checksums from official release assets for hadolint v2.12.0 and kube-score v1.18.0, with `sha256sum -c` verification after download — matching the D046 OPA verification pattern. Split the control-plane Dockerfile's single `bun install` into two phases: production deps first (cached layer), then source copy, then full install (adds devDeps for drizzle-kit). Source-only changes no longer invalidate the production dependency cache.

## Verification

All slice-level checks pass:

| Check | Result |
|-------|--------|
| `cargo clippy --workspace --all-targets -- -D warnings` | ✅ clean (unsafe_code=deny works) |
| `docker compose config` cert-init properties | ✅ read_only, user 1000:1000, no-new-privileges, tmpfs, default network only |
| `helm lint helm/interdict` | ✅ 0 charts failed |
| `grep -c "10-year" docker/certs/generate-internal-ca.sh` = 0 | ✅ stale comment gone |
| CI workflow SHA256 variables + `sha256sum -c` on hadolint and kube-score | ✅ 4 matching lines |
| `grep -c "bun install" docker/control-plane/Dockerfile` = 2 | ✅ two-phase install |
| `grep "unsafe_code" Cargo.toml` shows deny | ✅ |

## Requirements Advanced

- FH-INFRA-01 — All 10 assessment findings (M-07, M-08, L-14, L-15, L-16, L-17, L-18, L-19, L-22, L-25) addressed with structural verification. Docker Compose cert-init matches Helm security posture, CI supply chain integrity verified, Helm init containers fully hardened, unsafe_code enforced at workspace level.

## Requirements Validated

- FH-INFRA-01 — All deliverables proven: cert-init non-root with read-only rootfs and network isolation (docker compose config), SHA256-verified CI downloads (workflow inspection), minio-init and sidecar-init fully hardened (helm lint + helm template), unsafe_code deny (cargo clippy clean), Dockerfile layer caching (two-phase bun install), stale comment fixed, lint-staged improved. Moved to validated.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None — all four tasks matched the plan exactly.

## Known Limitations

- Helm v4.1.1 on Windows with git worktrees requires `--dependency-update` flag for `helm template` — appears to be a Helm bug with Windows path resolution, not a code issue.
- `docker compose config` (with interpolation) fails due to missing `.env` variables — pre-existing infrastructure issue, not caused by this slice. `--no-interpolate` confirms YAML validity.
- Sidecar-init deliberately omits `readOnlyRootFilesystem` (iptables needs `/run/xtables.lock`) and `runAsNonRoot` (iptables requires root). These are intentional, documented in T03.

## Follow-ups

- none

## Files Created/Modified

- `Cargo.toml` — unsafe_code lint changed from warn to deny
- `docker/certs/generate-internal-ca.sh` — comment corrected from 10-year to 1-year
- `package.json` — lint-staged Rust handler replaced with cargo fmt --check + fallback
- `docker-compose.yml` — cert-init hardened with user, read_only, security_opt, tmpfs, apk-root command, network isolation
- `helm/interdict/templates/minio-init-job.yaml` — added readOnlyRootFilesystem, capabilities drop ALL, seccompProfile
- `helm/interdict/templates/sidecar/_sidecar-init.tpl` — restructured securityContext with drop ALL + add NET_ADMIN, allowPrivilegeEscalation false, seccompProfile
- `.github/workflows/ci-quality-security.yml` — added SHA256 variables and sha256sum -c to hadolint and kube-score steps
- `docker/control-plane/Dockerfile` — split bun install into two-phase (production first, then full)

## Forward Intelligence

### What the next slice should know
- S06 has no dependency on S05 — it depends on S01's `MerkleAnchor.chain_hashes` and `WriterHealth` counters. All infrastructure S05 touched (CI workflow, Docker Compose, Helm templates, Cargo.toml) is stable and shouldn't need further edits in S06.
- The `cargo clippy --workspace --all-targets -- -D warnings` verification now also enforces `unsafe_code = "deny"` — any new `unsafe` block requires an explicit `#[allow(unsafe_code)]` attribute or clippy will fail.

### What's fragile
- The SHA256 checksums for hadolint (v2.12.0) and kube-score (v1.18.0) are pinned in the CI workflow. If these tools are upgraded, the checksums must be updated simultaneously or CI will fail with a sha256sum mismatch. This is intentional fail-closed behavior.
- Helm `--dependency-update` workaround on Windows worktrees — if Helm fixes their path resolution bug, the flag becomes unnecessary but harmless.

### Authoritative diagnostics
- `cargo clippy --workspace --all-targets -- -D warnings` — the single most comprehensive check; proves unsafe_code deny, all lints, and compilation health.
- `docker compose config --no-interpolate` — proves Docker Compose YAML validity including all cert-init hardening properties.
- `helm lint helm/interdict` + `helm template interdict helm/interdict --dependency-update --set postgresql.auth.password=test --set minio.auth.rootPassword=test` — proves Helm template validity and security context content.

### What assumptions changed
- No assumptions changed — this slice was straightforward infrastructure hardening with no surprises.
