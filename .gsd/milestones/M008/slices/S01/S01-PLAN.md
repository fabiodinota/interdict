# S01: CI Supply Chain Hardening

**Goal:** Pin all GitHub Actions to SHA digests, verify OPA binary by checksum, pin Docker base images by digest.
**Demo:** `grep -c "@main" .github/workflows/*.yml` returns 0. `grep "sha256" docker/control-plane/Dockerfile` shows OPA checksum verification. All action references contain 40-char SHA hashes.

## Must-Haves

- All GitHub Actions across all 3 workflow files pinned to SHA digests with version comment
- OPA binary download includes SHA256 checksum verification for both amd64 and arm64
- All 4 Dockerfile base images pinned by digest
- Renovate config updated to track digest updates
- Windows target removed from deny.toml

## Proof Level

- This slice proves: contract
- Real runtime required: no (structural verification via grep and yamllint)
- Human/UAT required: no

## Observability / Diagnostics

- **Inspection surface:** `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` — returns empty when all actions are SHA-pinned. Any output indicates a regression.
- **Failure visibility:** yamllint warnings on long lines are expected (SHA digests are 40 chars). Errors (not warnings) indicate broken YAML syntax.
- **Diagnostic command:** `grep -cE '@[a-f0-9]{40}' .github/workflows/*.yml` — returns per-file counts of pinned actions. Compare against expected totals (30/14/1) to detect drift.
- **Redaction:** No secrets or credentials are involved in this slice — all changes are structural CI config.

## Verification

- `grep -cE "@[a-f0-9]{40}" .github/workflows/ci-quality-security.yml` returns count matching total action uses (30)
- `grep -cE "@[a-f0-9]{40}" .github/workflows/release.yml` returns count matching total action uses (14)
- `grep -cE "@[a-f0-9]{40}" .github/workflows/release-please.yml` returns 1
- `grep -c "@main" .github/workflows/*.yml` returns 0
- `grep "sha256" docker/control-plane/Dockerfile` shows checksum verification
- `grep -c "@sha256:" docker/*/Dockerfile` returns ≥4 (base image digests)
- `yamllint -d relaxed .github/workflows/*.yml` passes
- `grep -c "windows" deny.toml` returns 0
- `cargo deny check` passes after Windows target removal
- `grep -n 'uses:' .github/workflows/*.yml | grep -v '@[a-f0-9]\{40\}'` returns empty (no unpinned actions — diagnostic check)

## Tasks

- [x] **T01: Pin all GitHub Actions to SHA digests** `est:30m`
  - Why: H-01 — `cosign-installer@main` and `trufflehog@main` are the highest supply chain risk. All other `@v4`/`@v2` tags are also mutable.
  - Files: `.github/workflows/ci-quality-security.yml`, `.github/workflows/release.yml`, `.github/workflows/release-please.yml`
  - Do: For each `uses:` line, look up the current commit SHA for the specified version tag using `web_search` (e.g., "actions/checkout v4 commit sha"). Replace `@main` and `@vN` with `@<40-char-sha>` and add a `# vN` comment suffix for readability. Prioritize cosign-installer and trufflehog first. Format: `uses: actions/checkout@<sha> # v4`. Update renovate.json to include a `github-actions` group with `pinDigests: true` if not already present.
  - Verify: `grep -c "@main" .github/workflows/*.yml` returns 0. `yamllint -d relaxed .github/workflows/*.yml` passes.
  - Done when: Zero mutable branch/tag references remain in any workflow file.

- [x] **T02: Add OPA binary checksum verification** `est:20m`
  - Why: H-05 — OPA binary downloaded via `ADD` without verification. MITM or compromised GitHub release could inject malicious policy engine.
  - Files: `docker/control-plane/Dockerfile`
  - Do: Replace `ADD` with `curl -fSL` for the OPA download. Add SHA256 checksum verification for both amd64 and arm64 architectures using a conditional or multi-arch approach. Look up current OPA v1.4.2 release checksums from the official OPA GitHub release page. Use pattern: `RUN curl -fSL -o /tmp/opa "https://..." && echo "${OPA_SHA256_AMD64}  /tmp/opa" | sha256sum -c && chmod +x /tmp/opa` with TARGETARCH-conditional checksums.
  - Verify: `docker build docker/control-plane/ --target=base` succeeds with checksum verification. `grep "sha256" docker/control-plane/Dockerfile` shows verification step.
  - Done when: OPA binary download fails if checksum doesn't match.

- [x] **T03: Pin Docker base images by digest and clean deny.toml** `est:20m`
  - Why: L-06 — Mutable base image tags could be compromised. L-07 — Windows target adds noise to advisory scanning.
  - Files: `docker/kernel/Dockerfile`, `docker/evidence-collector/Dockerfile`, `docker/control-plane/Dockerfile`, `docker/dashboard/Dockerfile`, `deny.toml`
  - Do: For each Dockerfile, look up the current digest for each base image tag using `web_search` (e.g., "docker hub node:20-slim digest"). Pin format: `FROM node:20-slim@sha256:<digest>`. Keep the tag for readability. Add a comment with the date of pinning. In `deny.toml`, remove the `x86_64-pc-windows-msvc` entry from `[graph].targets`. Verify `cargo deny check` still passes.
  - Verify: `grep -c "@sha256:" docker/*/Dockerfile` returns ≥4. `grep "windows" deny.toml` returns nothing. `cargo deny check` passes.
  - Done when: All Dockerfile base images are pinned by digest and deny.toml has no Windows target.

## Files Likely Touched

- `.github/workflows/ci-quality-security.yml`
- `.github/workflows/release.yml`
- `.github/workflows/release-please.yml`
- `docker/control-plane/Dockerfile`
- `docker/kernel/Dockerfile`
- `docker/evidence-collector/Dockerfile`
- `docker/dashboard/Dockerfile`
- `deny.toml`
- `renovate.json`
