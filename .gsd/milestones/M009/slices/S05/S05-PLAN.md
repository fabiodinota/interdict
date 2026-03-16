# S05: Infrastructure & CI Hardening

**Goal:** Close all FH-INFRA-01 findings — Docker Compose cert-init runs non-root with read-only rootfs and network isolation, CI tool downloads are SHA256-verified, Helm init containers have full security contexts, workspace `unsafe_code` lint is `deny`, and minor infra hygiene items (stale comment, lint-staged Rust handler, Dockerfile layer caching) are resolved.

**Demo:** `docker compose config` shows cert-init with `user`, `read_only`, `security_opt`, `tmpfs`, and no application network. `helm lint helm/interdict` passes with minio-init and sidecar-init having complete `securityContext`. `cargo clippy --workspace --all-targets -- -D warnings` passes with `unsafe_code = "deny"`. CI workflow YAML shows `sha256sum -c` verification on hadolint and kube-score downloads.

## Must-Haves

- Docker Compose cert-init: `user: "1000:1000"`, `read_only: true`, `security_opt: [no-new-privileges:true]`, `tmpfs: [/tmp]`, removed from `data` network, `apk --root /tmp/apkroot` pattern (D053)
- CI workflow: SHA256 checksums on hadolint v2.12.0 and kube-score v1.18.0 downloads with `sha256sum -c` verification
- Helm minio-init: add `readOnlyRootFilesystem: true`, `capabilities: { drop: [ALL] }`, `seccompProfile: { type: RuntimeDefault }`
- Helm sidecar-init: add `capabilities: { drop: [ALL] }` while keeping `add: [NET_ADMIN]`, add `seccompProfile: { type: RuntimeDefault }`, add `allowPrivilegeEscalation: false`
- Workspace `Cargo.toml`: `unsafe_code = "deny"` (per-crate `#[allow(unsafe_code)]` already in place)
- Stale cert comment on line 35 of `generate-internal-ca.sh` fixed
- lint-staged Rust handler improved from no-op echo to useful check
- Control-plane Dockerfile: separate prod dependency install for layer caching

## Proof Level

- This slice proves: contract (structural verification — valid config files, passing lints)
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cargo clippy --workspace --all-targets -- -D warnings` — proves unsafe_code deny works with existing per-crate allows
- `docker compose config` — proves cert-init YAML is valid with security properties and no `data` network
- `helm lint helm/interdict` — proves Helm templates render with updated securityContexts
- `grep -c "10-year" docker/certs/generate-internal-ca.sh` returns `0` — stale comment fixed
- Visual inspection of `.github/workflows/ci-quality-security.yml` for SHA256 variables and `sha256sum -c` commands on hadolint and kube-score steps

## Tasks

- [x] **T01: Workspace unsafe_code deny, cert comment fix, lint-staged improvement** `est:20m`
  - Why: Three independent quick config fixes that close L-25 (unsafe_code), L-22 (stale comment), and improve developer workflow (lint-staged). Grouped because each is a single-line or small-block edit in a different file with no cross-dependencies.
  - Files: `Cargo.toml`, `docker/certs/generate-internal-ca.sh`, `package.json`
  - Do: (1) Change `unsafe_code = "warn"` to `unsafe_code = "deny"` on line 11 of root `Cargo.toml`. Per-crate `#[allow(unsafe_code)]` attributes already exist on all unsafe sites — no new allows needed. (2) Fix line 35 of `generate-internal-ca.sh`: change `# 1. Internal CA (10-year validity, ECDSA P-256)` to `# 1. Internal CA (1-year validity, ECDSA P-256)` (D059 already reduced validity to 1 year). (3) Replace the lint-staged Rust echo no-op in `package.json` with a handler that runs `cargo fmt -- --check` on staged files, with a fallback message if `cargo` is not in PATH. Since this runs on Windows where cargo may not be available, use `sh -c 'command -v cargo >/dev/null 2>&1 && cargo fmt -- --check || echo "cargo not found — skipping Rust format check"'`.
  - Verify: `cargo clippy --workspace --all-targets -- -D warnings` passes; `grep -c "10-year" docker/certs/generate-internal-ca.sh` returns `0`; `grep "cargo fmt" package.json` matches new handler
  - Done when: all three verifications pass

- [x] **T02: Docker Compose cert-init hardening** `est:30m`
  - Why: Closes M-07 and L-14 — cert-init currently runs as root with full network access and writable rootfs. Must match Helm cert-init's security posture. The tricky part: `read_only: true` prevents `apk add openssl`, solved by D053's `apk --root /tmp/apkroot` pattern. Network isolation: remove from `data` network entirely (gets default bridge for internet/apk, can't reach app services).
  - Files: `docker-compose.yml`
  - Do: Edit the cert-init service block (lines 126-144) to add: `user: "1000:1000"`, `read_only: true`, `security_opt: ["no-new-privileges:true"]`, `tmpfs: ["/tmp"]`. Remove `networks: - data` entirely so cert-init is not on any named network (gets default bridge for apk internet access). Modify the `command` to use the `apk --root /tmp/apkroot` pattern: `apk --root /tmp/apkroot --initdb add --no-cache openssl && /tmp/apkroot/usr/bin/openssl version && sh /scripts/generate-internal-ca.sh`. The openssl binary path changes because it's installed under `/tmp/apkroot/usr/bin/`. The generate-internal-ca.sh script calls `openssl` directly — either add `/tmp/apkroot/usr/bin` to PATH in the command, or set `PATH=/tmp/apkroot/usr/bin:$PATH` before invoking the script. Preferred approach: `PATH=/tmp/apkroot/usr/bin:$PATH sh /scripts/generate-internal-ca.sh`.
  - Verify: `docker compose config` (from repo root) succeeds and output shows cert-init with `read_only: true`, `user: "1000:1000"`, no `data` network listed under cert-init's networks
  - Done when: `docker compose config` validates; cert-init has `user`, `read_only`, `security_opt`, `tmpfs`, and does NOT appear on the `data` network

- [ ] **T03: Helm minio-init and sidecar-init security contexts** `est:30m`
  - Why: Closes M-08 (minio-init missing security fields) and L-15 (sidecar-init missing `drop: [ALL]`). The sidecar container template (`_sidecar-container.tpl` lines 84-92) is the reference pattern for full securityContext.
  - Files: `helm/interdict/templates/minio-init-job.yaml`, `helm/interdict/templates/sidecar/_sidecar-init.tpl`
  - Do: (1) In `minio-init-job.yaml`, add to the existing securityContext block (currently lines 61-65: `runAsNonRoot: true`, `runAsUser: 1000`, `runAsGroup: 1000`, `allowPrivilegeEscalation: false`): add `readOnlyRootFilesystem: true`, `capabilities: { drop: [ALL] }`, `seccompProfile: { type: RuntimeDefault }`. (2) In `_sidecar-init.tpl`, the current securityContext (lines 40-43) has only `capabilities: { add: ["NET_ADMIN"] }` and `runAsUser: 0`. Replace with: `capabilities: { drop: [ALL], add: [NET_ADMIN] }`, add `allowPrivilegeEscalation: false` (NET_ADMIN is granted at container start via capabilities, not via privilege escalation — works on standard runtimes), add `seccompProfile: { type: RuntimeDefault }`. Keep `runAsUser: 0` (iptables requires root).
  - Verify: `helm lint helm/interdict` passes; `helm template interdict helm/interdict` output shows minio-init with `readOnlyRootFilesystem: true` and `drop: [ALL]`; sidecar-init shows `drop: [ALL]` and `add: [NET_ADMIN]`
  - Done when: `helm lint` passes and `helm template` output contains the expected securityContext fields on both init containers

- [ ] **T04: CI SHA256 checksums and Dockerfile layer optimization** `est:30m`
  - Why: Closes L-16 and L-17 (unverified CI tool downloads) and L-18 (Dockerfile layer caching). hadolint and kube-score are downloaded without integrity verification — a supply chain risk. The OPA download in control-plane Dockerfile (lines 14-27) is the reference pattern: pin version + SHA256 as variables, `sha256sum -c` after download.
  - Files: `.github/workflows/ci-quality-security.yml`, `docker/control-plane/Dockerfile`
  - Do: (1) In the CI workflow, modify the "Install hadolint" step (around line 106): add `HADOLINT_SHA256` variable with the SHA256 for hadolint v2.12.0 Linux x86_64. After `curl`, add `echo "${HADOLINT_SHA256}  hadolint" | sha256sum -c -`. Pattern matches OPA verification in the Dockerfile. (2) Modify the "Install kube-score" step (around line 122): add `KUBESCORE_SHA256` variable with SHA256 for kube-score v1.18.0 linux_amd64 tarball. After `curl` and before `tar`, add `echo "${KUBESCORE_SHA256}  kube-score.tar.gz" | sha256sum -c -`. (3) In control-plane Dockerfile, improve layer caching by separating the dependency install: first `COPY control-plane/package.json control-plane/bun.lock ./` then `RUN bun install --production --frozen-lockfile` (prod deps, cached), then `COPY control-plane/ .` (source), then `RUN bun install --frozen-lockfile` (adds dev deps needed for drizzle-kit migrations). This way source changes don't invalidate the prod dependency layer. Note: look up the exact SHA256 checksums from the official release pages for hadolint v2.12.0 and kube-score v1.18.0 — do NOT guess them. Use `curl -fsSL <release-url> | sha256sum` or find them in the release notes.
  - Verify: CI workflow YAML has `sha256sum -c` in both hadolint and kube-score install steps; Dockerfile has two separate `bun install` commands (production first, then full); `docker compose config` still validates
  - Done when: Both CI tool download steps include SHA256 verification variables and `sha256sum -c` commands; Dockerfile has separated dependency layers

## Observability / Diagnostics

- **Compile-time enforcement:** `cargo clippy --workspace --all-targets -- -D warnings` will fail loudly if any crate uses `unsafe` without an explicit `#[allow(unsafe_code)]` — no silent pass-through.
- **CI signal:** hadolint and kube-score steps will fail with a SHA256 mismatch line in the CI log if binaries are tampered — grep for `sha256sum` in workflow run output.
- **Container startup:** cert-init logs `[cert-init]` prefixed messages to stdout; failures surface via container exit code and Docker Compose `--abort-on-container-exit`.
- **Helm validation:** `helm lint` and `helm template` are the inspection surfaces for securityContext correctness — no runtime signal needed since these are declarative manifests.
- **lint-staged:** When `cargo` is absent, the handler prints `[lint-staged] cargo not found` to the commit hook output — visible to the developer, not silent.

## Files Likely Touched

- `Cargo.toml`
- `docker/certs/generate-internal-ca.sh`
- `package.json`
- `docker-compose.yml`
- `helm/interdict/templates/minio-init-job.yaml`
- `helm/interdict/templates/sidecar/_sidecar-init.tpl`
- `.github/workflows/ci-quality-security.yml`
- `docker/control-plane/Dockerfile`
