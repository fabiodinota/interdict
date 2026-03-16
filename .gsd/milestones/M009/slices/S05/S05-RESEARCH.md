# S05: Infrastructure & CI Hardening — Research

**Date:** 2026-03-16
**Depth:** Light

## Summary

S05 addresses FH-INFRA-01 with seven independent hardening changes across Docker Compose, Helm templates, CI workflow, Cargo workspace lints, and lint-staged config. Every change follows patterns already established in the codebase — sidecar container template already has full securityContext, cert-init in Helm already runs non-root, CI workflow already pins actions by SHA. This is applying the same patterns to the places that were missed.

No new libraries, no architecture changes, no risky integration. Verification is structural: `docker compose config` validates YAML, `helm lint` passes, `cargo clippy --workspace -- -D warnings` passes, and CI workflow syntax is valid.

## Recommendation

Execute all seven changes in parallel-safe tasks since there are zero cross-dependencies. Group by target file to minimize merge conflicts. The only ordering consideration: `unsafe_code = "deny"` must add per-crate `allow` attributes **before** changing the workspace lint, or clippy will fail mid-sequence.

## Implementation Landscape

### Key Files

- `docker-compose.yml` (cert-init service, ~lines 13-31) — needs `user: "1000:1000"`, `read_only: true`, `network_mode: "none"`, `tmpfs` for apk install, and `security_opt: [no-new-privileges:true]`. D053 documents the `apk --root /tmp/apkroot` pattern for read-only rootfs with runtime package install.
- `.github/workflows/ci-quality-security.yml` (lines 104-128) — hadolint and kube-score downloads need `sha256sum -c` verification after `curl`. Download the checksum or hardcode known SHA256 as a variable. Pattern: `echo "${SHA256}  filename" | sha256sum -c -` (already used for OPA in control-plane Dockerfile, see D046).
- `helm/interdict/templates/minio-init-job.yaml` (lines 56-64) — securityContext missing `readOnlyRootFilesystem: true`, `capabilities: { drop: [ALL] }`, `seccompProfile: { type: RuntimeDefault }`. The sidecar container template (`_sidecar-container.tpl` line 82-90) is the reference pattern.
- `helm/interdict/templates/sidecar/_sidecar-init.tpl` (lines 40-43) — has `capabilities: { add: ["NET_ADMIN"] }` but no `drop: [ALL]`. Needs `drop: [ALL]` with `add: [NET_ADMIN]` re-added. Also needs `allowPrivilegeEscalation: false` set to `true` for NET_ADMIN (iptables requires it) or kept `false` if the runtime grants it via capabilities alone.
- `docker/control-plane/Dockerfile` (lines 33-34) — single `bun install --frozen-lockfile` installs all deps. Separate into: (1) copy package.json+bun.lock, install production only; (2) copy source + run migrations if needed; (3) install devDependencies in a separate stage or accept current approach if drizzle-kit is used at runtime for migrations. The entrypoint.sh runs `bunx drizzle-kit migrate` — so drizzle-kit IS needed at runtime. The separation would be: install prod deps first (cache layer), then install all (dev included). This gives better Docker layer caching but doesn't reduce image size. The real fix is a multi-stage build that copies only runtime artifacts.
- `Cargo.toml` (workspace root, line 10) — change `unsafe_code = "warn"` to `unsafe_code = "deny"`. Per-crate exceptions needed in:
  - `crates/kernel/build.rs` — `#[allow(unsafe_code)]` already present (set_var for PROTOC)
  - `crates/evidence-collector/build.rs` — already has `#[allow(unsafe_code)]`
  - `crates/interdict-verify/build.rs` — already has `#[allow(unsafe_code)]`
  - `crates/kernel/src/policy/wasm_engine.rs` — already has `#[allow(unsafe_code)]` on both fns
  - `crates/evidence-collector/src/config.rs` — already has `#[allow(unsafe_code)]` on test helper
- `docker/certs/generate-internal-ca.sh` (line 35) — stale comment says "10-year validity" but code uses `-days 365`. Comment already has correct text on line 36 — the section header on line 35 (`# 1. Internal CA (10-year validity, ECDSA P-256)`) is the stale reference.
- `package.json` (lint-staged config, lines 18-30) — Rust handler currently echoes a no-op message. Improve to at least run `cargo fmt -- --check` on staged files, or validate that the files are formatted. Since lint-staged runs on Windows (not WSL), and cargo may not be in PATH, the handler should check for cargo availability first.

### Build Order

1. **Workspace unsafe_code → deny** — all per-fn `#[allow(unsafe_code)]` are already in place, so flipping `"warn"` to `"deny"` should pass immediately. Verify with `cargo clippy --workspace --all-targets -- -D warnings`. Do this first because it's the fastest to verify and proves the existing allowlist is complete.
2. **Docker Compose cert-init hardening** — add security properties to `docker-compose.yml` cert-init service. Script modification needed: cert-init command must use `apk --root /tmp/apkroot` pattern (D053) since `read_only: true` prevents writing to `/usr`. Verify with `docker compose config`.
3. **CI SHA256 verification** — add checksums to hadolint and kube-score download steps. No runtime verification possible locally; validate YAML syntax only.
4. **Helm minio-init + sidecar-init hardening** — add missing securityContext fields. Verify with `helm lint helm/interdict`.
5. **Control-plane Dockerfile devDependencies** — restructure install to separate prod/dev layers. Since `drizzle-kit` runs at entrypoint (migrations), this is a layer-caching optimization, not a size reduction.
6. **Stale cert comment** — one-line fix.
7. **lint-staged Rust handler** — improve from no-op echo to a useful check.

### Verification Approach

- `cargo clippy --workspace --all-targets -- -D warnings` — proves unsafe_code deny + allow works
- `docker compose config` (from repo root) — proves cert-init YAML is valid with new security properties
- `helm lint helm/interdict` — proves Helm templates render with updated securityContext
- `cargo fmt --all -- --check` — unchanged baseline
- Visual inspection of CI workflow YAML for correct SHA256 variable + verification command structure
- `grep -n "10-year" docker/certs/generate-internal-ca.sh` returns zero matches after fix

## Constraints

- `allowPrivilegeEscalation` on sidecar-init: iptables requires NET_ADMIN. On most runtimes, `allowPrivilegeEscalation: false` + `capabilities.add: [NET_ADMIN]` works because the capability is granted at container start, not via privilege escalation. Keep `false` unless testing shows iptables fails.
- cert-init `apk --root /tmp/apkroot` requires tmpfs mount at `/tmp` — the `read_only: true` + `tmpfs: [/tmp]` combination enables this (same pattern as all other services in docker-compose.yml).
- Docker Compose cert-init with `network_mode: "none"` cannot pull packages from internet. The alpine image ships without openssl — `apk add openssl` requires network. **Resolution:** Use a pre-built image with openssl, or use `network_mode: "none"` only if openssl is pre-installed. The roadmap says "no network access" but the script needs to `apk add openssl`. Options: (a) build a custom init image with openssl baked in, (b) use a different base that includes openssl, (c) accept network access but restrict to only the cert volume. Option (b) is simplest — Alpine's `openssl` package is ~3MB. But `network_mode: "none"` literally prevents all network. So either: bake openssl into the image at build time, or drop the `network_mode: "none"` requirement. Given D053's `apk --root /tmp/apkroot` pattern, it seems we're expected to keep the network for package install. Check if the roadmap's "no network access" means "no access to other services" (which `networks: []` achieves) vs "literally zero network" (which `network_mode: none` achieves). The Helm cert-init runs from a pre-built image that already has openssl — Docker Compose uses raw alpine. Safest approach: keep alpine but remove it from the `data` network (so it can't reach other services) while keeping default bridge for apk. Or switch to an alpine image with openssl pre-installed.
- lint-staged Rust handler on Windows: `cargo fmt` may not be in PATH if user uses WSL-only Rust. The handler should be best-effort with a fallback.

## Common Pitfalls

- **cert-init network vs package install conflict** — `network_mode: "none"` breaks `apk add`. Either use a base image with openssl pre-installed, or remove cert-init from the `data` network without setting `network_mode: none`. The D053 `apk --root` pattern solves the rootfs-readonly problem but not the network problem.
- **sidecar-init allowPrivilegeEscalation** — Setting to `false` with NET_ADMIN capability may fail on some Kubernetes versions. Test the combination; if iptables fails, set `allowPrivilegeEscalation: true` only on the init container (not the sidecar itself, which already has `false`).
- **SHA256 checksums for hadolint/kube-score** — checksums must be pinned to the exact version. If the version changes, the checksum must change too. Use ARG-style variables like the OPA pattern in the Dockerfile.
