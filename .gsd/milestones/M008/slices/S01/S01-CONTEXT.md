---
id: S01
milestone: M008
status: ready
---

# S01: CI Supply Chain Hardening — Context

## Goal

Pin all GitHub Actions to immutable SHA digests, verify OPA binary by checksum, and pin Docker base images by digest — eliminating all supply chain attack vectors in CI/CD.

## Why this Slice

H-01 is the highest-risk finding: `cosign-installer@main` in the release workflow has `id-token: write` + `packages: write` + `contents: write` permissions. A compromised `@main` reference could exfiltrate the OIDC token or tamper with signed container images. H-05 (OPA binary without checksum) is a similar supply chain vector for the policy engine. Both are fast fixes with outsized security impact.

## Scope

### In Scope

- Pin all 38 GitHub Actions references across 3 workflow files to SHA digests
- Add SHA256 checksum verification for OPA binary download in control-plane Dockerfile
- Pin all 4 Dockerfile base images by digest
- Update renovate.json to track digest updates for pinned actions
- Remove Windows target from deny.toml (L-07, quick fix co-located here)

### Out of Scope

- Changing CI workflow logic or job structure
- Adding new CI jobs
- Changing Docker build logic beyond pinning

## Constraints

- Must look up current SHA digests for each action version — use `gh api` or GitHub web UI
- Must look up current OPA release SHA256 checksums for both amd64 and arm64
- Docker digest pinning requires `docker manifest inspect` for each base image
- Renovate must be configured to propose digest updates via PR

## Integration Points

### Consumes

- `.github/workflows/ci-quality-security.yml` — 28 action references
- `.github/workflows/release.yml` — 14 action references
- `.github/workflows/release-please.yml` — 1 action reference
- `docker/control-plane/Dockerfile` — OPA binary download
- All 4 Dockerfiles — base image tags
- `deny.toml` — target graph config

### Produces

- SHA-pinned workflow files (immutable action references)
- Checksum-verified OPA download
- Digest-pinned Dockerfiles
- Updated renovate.json with action digest tracking
