# S02: Security And Dependency Hygiene

**Goal:** Close security hygiene gaps identified in ASSESSMENT.md P1 items: supply-chain checks via cargo-deny, aligned dependency versions, centralized workspace lints, hardened container images, and no default credentials.
**Demo:** `cargo deny check` passes in CI; all Dockerfiles produce non-root read-only containers; `docker compose config` shows zero hardcoded passwords.

## Must-Haves

- `deny.toml` with license allowlist and duplicate crate detection (ASSESSMENT §6 gap)
- rand aligned to 0.9 across entire workspace (ASSESSMENT §5 — `rand` version mismatch)
- Workspace `[lints]` section in root `Cargo.toml` (ASSESSMENT §4 gap)
- All 4 Dockerfiles: non-root USER, read-only rootfs capability (MED-012)
- docker-compose.yml: all credentials via env vars with generation instructions in `.env.example` (MED-007)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (Docker build)
- Human/UAT required: no

## Verification

- `cargo deny check` — passes
- `cargo clippy --workspace --all-targets -- -D warnings` — clean with workspace lints
- `rg 'rand.*0\.8' Cargo.lock` — zero matches (all rand 0.9)
- `docker compose build` — all images build successfully
- `docker compose config | grep -i password` — all values are `${VAR}` references, not literals
- Verify each Dockerfile has `USER nonroot` or equivalent non-root directive

## Observability / Diagnostics

- Runtime signals: none (build-time and config changes)
- Inspection surfaces: `cargo deny check` output, `docker inspect` for user/rootfs
- Failure visibility: CI step failure with deny output
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: S01 clean test baseline (no panic paths)
- New wiring introduced in this slice: CI steps for `cargo deny check`; `deny.toml` activates the currently-skipped CI step
- What remains before the milestone is truly usable end-to-end: S03 (quality/DX)

## Tasks

- [x] **T01: Add deny.toml with license compliance and duplicate detection** `est:30m`
  - Why: CI already has a conditional `cargo deny` step that currently skips because no deny.toml exists (ASSESSMENT §6: "cargo deny step skips silently"). Adding config activates it immediately.
  - Files: `deny.toml`, `.github/workflows/ci-quality-security.yml`
  - Do: Create `deny.toml` with `[licenses]` allowlist (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unicode-DFS-2016, OpenSSL, Zlib, Unicode-3.0), `[bans]` for duplicate detection with skip list for known-acceptable dups (multiple versions of same crate that are transitive), and `[advisories]` pointing to rustsec DB. Ensure the CI step condition no longer skips.
  - Verify: `cargo deny check` — passes locally
  - Done when: `cargo deny check` exits 0 and CI step is unconditional

- [x] **T02: Align rand 0.8 to 0.9 in evidence-collector and add workspace lints** `est:30m`
  - Why: ASSESSMENT §5 notes evidence-collector uses rand 0.8 while kernel uses 0.9, causing duplicate crate in Cargo.lock. Workspace lints centralize clippy/rustc configuration (ASSESSMENT §4 gap: "Clippy lint policy not declared in Cargo.toml — relies purely on CI flag").
  - Files: `crates/evidence-collector/Cargo.toml`, `Cargo.toml` (workspace root), `crates/kernel/Cargo.toml`, `crates/interdict-verify/Cargo.toml`
  - Do: Update `rand` from 0.8 to 0.9 in evidence-collector. Fix any API changes (rand 0.9 renamed `thread_rng()` to `rng()`, `Rng::gen()` to `Rng::random()`). Add `[workspace.lints.clippy]` and `[workspace.lints.rust]` to root Cargo.toml with deny-level warnings. Update each crate's Cargo.toml to inherit via `[lints] workspace = true`.
  - Verify: `cargo clippy --workspace --all-targets -- -D warnings` — clean; `rg 'rand.*0\.8' Cargo.lock` — zero matches
  - Done when: Single rand version in Cargo.lock and workspace lints active across all crates

- [x] **T03: Harden Dockerfiles with non-root user and read-only rootfs** `est:30m`
  - Why: MED-012 from security review — containers run as root with writable rootfs, which violates container security best practices and Kubernetes PodSecurityStandards.
  - Files: All Dockerfiles in the repo (kernel, evidence-collector, control-plane, dashboard)
  - Do: In each Dockerfile's final stage: add `RUN addgroup -g 65532 -S nonroot && adduser -u 65532 -S nonroot -G nonroot` (Alpine) or equivalent. Set `USER nonroot`. Ensure writable dirs (tmp, data) are created and chowned before USER switch. Add `read_only: true` and `tmpfs` mounts to docker-compose service definitions where needed.
  - Verify: `docker compose build` succeeds; `docker inspect <image> --format '{{.Config.User}}'` shows nonroot for each image
  - Done when: All images run as non-root; docker-compose services have read_only and tmpfs where needed

- [x] **T04: Parameterize default credentials in docker-compose** `est:20m`
  - Why: MED-007 from security review — docker-compose.yml contains hardcoded passwords (interdict/interdict noted in ASSESSMENT §3), which is a security risk if deployed without changing defaults.
  - Files: `docker-compose.yml`, `.env.example`
  - Do: Replace all literal passwords/secrets in docker-compose.yml with `${VAR_NAME}` references. Update `.env.example` with all required variables, placeholder values marked `# CHANGE_ME — generate with: openssl rand -base64 32`, and clear generation instructions. Ensure compose fails-fast if required vars are missing.
  - Verify: `docker compose config` shows `${VAR}` substitutions, not literal passwords; `.env.example` documents all required vars
  - Done when: Zero hardcoded credentials in docker-compose.yml; `.env.example` has generation instructions

## Files Likely Touched

- `deny.toml`
- `Cargo.toml` (workspace root)
- `crates/evidence-collector/Cargo.toml`
- `crates/kernel/Cargo.toml`
- `crates/interdict-verify/Cargo.toml`
- `.github/workflows/ci-quality-security.yml`
- All Dockerfiles
- `docker-compose.yml`
- `.env.example`
