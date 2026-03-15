# S01: CI Supply Chain Hardening — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are structural CI/container config — verification is grep/lint against file contents, no runtime required.

## Preconditions

- Repository cloned with all S01 changes applied
- `cargo` and `cargo-deny` installed (for `cargo deny check`)
- Optional: `yamllint` installed (for YAML syntax check)
- Optional: Docker daemon running (for build verification of OPA checksum)

## Smoke Test

Run `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` — must return empty (no unpinned action references).

## Test Cases

### 1. All GitHub Actions are SHA-pinned in ci-quality-security.yml

1. Run: `grep -cE "@[a-f0-9]{40}" .github/workflows/ci-quality-security.yml`
2. **Expected:** Output is `30`

### 2. All GitHub Actions are SHA-pinned in release.yml

1. Run: `grep -cE "@[a-f0-9]{40}" .github/workflows/release.yml`
2. **Expected:** Output is `14`

### 3. All GitHub Actions are SHA-pinned in release-please.yml

1. Run: `grep -cE "@[a-f0-9]{40}" .github/workflows/release-please.yml`
2. **Expected:** Output is `1`

### 4. Zero mutable @main references remain

1. Run: `grep -c "@main" .github/workflows/*.yml`
2. **Expected:** Each file returns `0`

### 5. Version comments present on all pinned actions

1. Run: `grep -E "uses:.*@[a-f0-9]{40}" .github/workflows/ci-quality-security.yml | head -5`
2. **Expected:** Each line ends with a `# v<version>` or `# <version>` comment for human readability

### 6. OPA binary has SHA256 checksum verification

1. Run: `grep -A2 "sha256sum" docker/control-plane/Dockerfile`
2. **Expected:** Shows `sha256sum -c -` verification line with OPA binary path
3. Run: `grep "OPA_SHA256" docker/control-plane/Dockerfile`
4. **Expected:** Shows two ARG lines — `OPA_SHA256_AMD64` and `OPA_SHA256_ARM64` — each with 64-character hex checksums

### 7. OPA download uses curl instead of ADD

1. Run: `grep -c "^ADD.*opa" docker/control-plane/Dockerfile`
2. **Expected:** `0` — no ADD instruction for OPA
3. Run: `grep "curl.*opa" docker/control-plane/Dockerfile`
4. **Expected:** Shows `curl -fSL` download of OPA binary

### 8. All Docker base images pinned by digest

1. Run: `grep -c "@sha256:" docker/control-plane/Dockerfile`
2. **Expected:** `1`
3. Run: `grep -c "@sha256:" docker/dashboard/Dockerfile`
4. **Expected:** `3`
5. Run: `grep -c "@sha256:" docker/kernel/Dockerfile`
6. **Expected:** `2`
7. Run: `grep -c "@sha256:" docker/evidence-collector/Dockerfile`
8. **Expected:** `2`

### 9. No external FROM lines without digest pins

1. Run: `grep "^FROM" docker/*/Dockerfile | grep -v "@sha256:" | grep -v " AS "`
2. **Expected:** Empty — all external image references have digest pins. (Internal alias stages like `FROM chef AS planner` are expected without digests.)

### 10. Windows target removed from deny.toml

1. Run: `grep -c "x86_64-pc-windows-msvc" deny.toml`
2. **Expected:** `0`
3. Run: `cargo deny check`
4. **Expected:** All checks pass: `advisories ok, bans ok, licenses ok, sources ok`

### 11. Renovate configured for digest pinning

1. Run: `grep -A2 "pinDigests" renovate.json`
2. **Expected:** Shows `"pinDigests": true` in the github-actions package rule

## Edge Cases

### windows-sys crate entry preserved in deny.toml bans

1. Run: `grep "windows-sys" deny.toml`
2. **Expected:** `windows-sys` appears in `[bans].skip-tree` — this is a crate name, not a platform target. It must be preserved.

### Internal Docker alias stages are not digest-pinned

1. Run: `grep "^FROM" docker/control-plane/Dockerfile`
2. **Expected:** Lines like `FROM base AS opa-fetch` and `FROM chef AS planner` appear WITHOUT `@sha256:` — these are internal build aliases, not external images.

### OPA TARGETARCH conditional selects correct checksum

1. Open `docker/control-plane/Dockerfile` and find the `TARGETARCH` conditional block
2. **Expected:** Logic selects `OPA_SHA256_AMD64` when TARGETARCH=amd64 and `OPA_SHA256_ARM64` when TARGETARCH=arm64

### yamllint produces only warnings, not errors

1. Run: `yamllint -d relaxed .github/workflows/*.yml` (if yamllint installed)
2. **Expected:** Only `warning` level messages (line-length from long SHA digests). Zero `error` level messages.

## Failure Signals

- Any output from `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` means an action reference was not pinned
- `grep -c "@main"` returning non-zero means a high-risk mutable reference remains
- `cargo deny check` failing means the deny.toml change broke dependency scanning
- Docker build failing at `opa-fetch` stage with checksum error means OPA checksums are wrong or binary was tampered
- `grep "^FROM" docker/*/Dockerfile | grep -v "@sha256:" | grep -v " AS "` returning results means an external base image is not pinned

## Requirements Proved By This UAT

- AR-SUPPLY-01 — Every test case above collectively proves that all CI supply chain references (GitHub Actions, Docker base images, OPA binary) are pinned to immutable identifiers. No mutable tag, branch, or unverified binary reference remains.

## Not Proven By This UAT

- Runtime Docker build verification — OPA checksum validation requires Docker daemon to actually execute. CI will prove this on first build.
- Renovate actually proposing update PRs — requires a real Renovate run against the repo, proven only in production.
- SHA correctness — the SHAs point to the intended action/image versions. Verified during task execution via git ls-remote and Docker Hub API, but UAT only checks structural format.

## Notes for Tester

- The `yamllint` check requires yamllint to be installed (`pip install yamllint`). If unavailable, skip that edge case — the structural grep checks are sufficient.
- Docker daemon is not required for most checks — only the OPA checksum build test needs it. CI covers this.
- The `grep -c "windows" deny.toml` check in the slice plan returns 2 (not 0) because `windows-sys` crate name exists in skip-tree. The correct check is `grep -c "x86_64-pc-windows-msvc" deny.toml` = 0.
