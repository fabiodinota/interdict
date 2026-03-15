---
estimated_steps: 5
estimated_files: 3
---

# T01: Harden .dockerignore and enable multi-platform Docker builds

**Slice:** S07 — DevOps & Deployment Maturity
**Milestone:** M007

## Description

The root `.dockerignore` sends ~500KB of non-build files (docs, helm, scripts, CI config, markdown) to the Docker daemon on every build. The release pipeline builds only linux/amd64 but arm64 is needed for Apple Silicon dev environments and ARM cloud instances. The control-plane Dockerfile hardcodes `opa_linux_amd64_static` which will fail on arm64 builds. This task fixes all three: trims build context, enables multi-platform, and makes OPA download architecture-aware.

## Steps

1. **Harden root `.dockerignore`** — Add exclusions for `docs/`, `helm/`, `scripts/`, `.github/`, `.husky/`, `.gsd/`, `.claude/`, `.pi/`, `*.md` (except proto needs, which aren't .md), `commitlint.config.js`, `release-please-config.json`, `.release-please-manifest.json`, `renovate.json`, `.hadolint.yaml`, `.yamllint.yml`, `buf.yaml`, `dashboard/` (control-plane and kernel don't need it), `CHANGELOG.md`, `LICENSE`. Add allowlist entries: `!proto/` (gRPC), `!control-plane/` (needed by control-plane build), `!crates/` (needed by Rust builds), `!Cargo.toml`, `!Cargo.lock`. Verify no existing Dockerfile COPY is broken by testing `docker build --no-cache -f docker/kernel/Dockerfile . --target planner` (or equivalent quick stage).

2. **Fix control-plane Dockerfile OPA download** — Replace `ADD https://...opa_linux_amd64_static` with `TARGETARCH`-based download. Use the Buildx automatic platform arg: `ARG TARGETARCH` and `ADD https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_${TARGETARCH}_static /tmp/opa`. Note: OPA uses `amd64`/`arm64` which matches Docker's `TARGETARCH` values exactly.

3. **Add QEMU to release.yml** — Insert `docker/setup-qemu-action@v3` step after `docker/setup-buildx-action@v3` and before the first `docker/build-push-action` step.

4. **Add platforms to all 4 build-push-action steps** — Add `platforms: linux/amd64,linux/arm64` to each of the 4 `docker/build-push-action@v6` `with:` blocks. Update cache key scope if needed (GHA cache handles multi-platform by default with `mode=max`).

5. **Validate YAML structure** — Run `yamllint -d relaxed .github/workflows/release.yml` to catch syntax errors. Count `platforms:` occurrences to confirm all 4 steps updated.

## Must-Haves

- [ ] Root `.dockerignore` excludes non-build files without breaking any Dockerfile COPY
- [ ] `!proto/` allowlist in `.dockerignore` preserves gRPC proto files for control-plane
- [ ] `TARGETARCH` used for OPA binary download in control-plane Dockerfile
- [ ] QEMU action added to release.yml
- [ ] All 4 build-push-action steps have `platforms: linux/amd64,linux/arm64`

## Verification

- `grep -c "platforms:" .github/workflows/release.yml` returns 4
- `grep "TARGETARCH" docker/control-plane/Dockerfile` finds architecture variable
- `yamllint -d relaxed .github/workflows/release.yml` passes
- `.dockerignore` includes `docs/`, `helm/`, `scripts/`, `.github/`, `*.md` entries
- `.dockerignore` includes `!proto/` allowlist

## Inputs

- `.github/workflows/release.yml` — S05-created release pipeline, single-platform builds
- `.dockerignore` — current exclusions (artifacts, IDE, secrets, runtime data)
- `docker/control-plane/Dockerfile` — hardcoded `opa_linux_amd64_static` in opa-fetch stage
- S05 Forward Intelligence: "S07 should add `platforms: linux/amd64,linux/arm64` to each `docker/build-push-action` step and set up QEMU"

## Expected Output

- `.dockerignore` — expanded with ~20 new exclusions and `!proto/` allowlist
- `docker/control-plane/Dockerfile` — `TARGETARCH`-based OPA download
- `.github/workflows/release.yml` — QEMU setup + multi-platform builds for all 4 services

## Observability Impact

- **Build context size:** Docker daemon log shows reduced context transfer size (~500KB savings). Visible during `docker build` output as "sending build context to Docker daemon" line.
- **Multi-platform manifest:** After release pipeline runs, `docker manifest inspect ghcr.io/fabiodinota/interdict/<service>:<tag>` shows both `linux/amd64` and `linux/arm64` entries.
- **OPA architecture:** Control-plane build log shows `ADD https://...opa_linux_arm64_static` or `opa_linux_amd64_static` depending on the target platform, confirming architecture-aware download.
- **Failure visibility:** If OPA release lacks an arm64 binary for a given version, the `opa-fetch` stage fails immediately with a 404 download error — no silent fallback to wrong architecture.

