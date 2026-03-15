---
estimated_steps: 8
estimated_files: 1
---

# T01: Create release workflow with container signing and SBOM

**Slice:** S05 — CI/CD Release Pipeline + Quality Gates
**Milestone:** M007

## Description

Create `.github/workflows/release.yml` — a complete release pipeline triggered on `v*` tag push. Builds all 4 service Docker images, pushes to ghcr.io, generates SBOMs, signs images by digest using cosign keyless (GitHub Actions OIDC), and creates a GitHub Release with auto-generated notes.

This is the core deliverable of S05. The project currently has zero release automation — all Docker images must be built manually.

## Steps

1. Create `.github/workflows/release.yml` with `on: push: tags: ['v*']` trigger
2. Set permissions: `id-token: write` (cosign OIDC), `packages: write` (ghcr.io push), `contents: write` (GitHub Release)
3. Add shared setup steps: checkout, Docker buildx setup, ghcr.io login via `docker/login-action@v3` using `GITHUB_TOKEN`
4. Add build+push job for each service (kernel, control-plane, dashboard, evidence-collector) using `docker/build-push-action@v6` with context `.`, correct Dockerfile path, and tags `ghcr.io/fabiodinota/interdict/{service}:${{ github.ref_name }}` + `:latest`. Capture digest output from each build step.
5. Add `anchore/sbom-action@v0` step per image to generate and attach SPDX SBOM, using the image digest
6. Install cosign via `sigstore/cosign-installer@main`, then `cosign sign --yes ghcr.io/fabiodinota/interdict/{service}@${{ steps.build-{service}.outputs.digest }}` per service — signing by digest, never by tag
7. Create GitHub Release using `softprops/action-gh-release@v2` with `generate_release_notes: true`
8. Validate with `yamllint` — ensure YAML is well-formed and all 4 services are covered

## Must-Haves

- [ ] Workflow triggers only on `v*` tag push (not branches, not PRs)
- [ ] All 4 services built: kernel, control-plane, dashboard, evidence-collector
- [ ] Images pushed to `ghcr.io/fabiodinota/interdict/{service}`
- [ ] Each image signed by digest using cosign keyless (not by tag)
- [ ] SBOM generated per image and attached
- [ ] GitHub Release created with auto-generated notes
- [ ] `id-token: write` permission set for OIDC signing
- [ ] Build order: build → push → SBOM → sign

## Verification

- `yamllint .github/workflows/release.yml` passes
- YAML contains `on: push: tags:` trigger with `v*` pattern
- YAML contains 4 `docker/build-push-action` steps (one per service)
- YAML contains 4 `cosign sign` commands referencing digests (not tags)
- YAML contains 4 `anchore/sbom-action` steps
- YAML contains `softprops/action-gh-release` step

## Inputs

- `docker/kernel/Dockerfile` — existing multi-stage Dockerfile for kernel service
- `docker/control-plane/Dockerfile` — existing multi-stage Dockerfile for control-plane
- `docker/dashboard/Dockerfile` — existing multi-stage Dockerfile for dashboard
- `docker/evidence-collector/Dockerfile` — existing multi-stage Dockerfile for evidence-collector
- `.dockerignore` — existing exclusions for build context
- S05-RESEARCH.md — cosign keyless signing requires OIDC, sign by digest not tag, SBOM before sign

## Observability Impact

- **New signals:** GitHub Actions workflow run status for `release.yml` — visible via `gh run list --workflow=release.yml`
- **Inspection:** `cosign verify --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/fabiodinota/interdict/{service}@sha256:...` confirms image signatures; SBOM attestations visible in ghcr.io package UI
- **Failure visibility:** Each step (build, SBOM, sign, release) fails independently with clear step names in Actions logs. Docker build failures show Dockerfile context; cosign OIDC errors show token acquisition failure; SBOM failures show syft scan errors
- **Diagnostics:** Workflow uses named steps (`build-kernel`, `sbom-kernel`, `sign-kernel`, etc.) so failures are immediately attributable to a specific service and phase

## Expected Output

- `.github/workflows/release.yml` — complete release pipeline workflow
