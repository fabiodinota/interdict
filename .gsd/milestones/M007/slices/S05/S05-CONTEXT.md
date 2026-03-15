---
id: S05
milestone: M007
status: ready
---

# S05: CI/CD Release Pipeline + Quality Gates — Context

## Goal

Automate the entire release process from tag push to published, signed container images with changelog, and establish all missing CI quality gates.

## Why this Slice

The assessment graded Release Process at D — the most severe non-test gap. There is no release pipeline, cargo-audit is non-blocking, there's no CODEOWNERS file, no commit message linting, no secret scanning, and no performance regression gates. This slice can run in parallel with S01-S03 since it has no code dependencies.

## Scope

### In Scope

- **T01: Release workflow** — `.github/workflows/release.yml`: trigger on tag `v*`, build 4 Docker images, push to `ghcr.io/fabiodinota/interdict/*` with tags (latest, vX.Y.Z, sha-XXXXXX), generate SBOM (syft/trivy), sign with cosign (SLSA provenance), create GitHub Release with auto-generated notes
- **T02: Semantic versioning + conventional commits** — commitlint config (`.commitlintrc.yml`), commit-msg hook (`.husky/commit-msg`), release-please or standard-version for changelog, CHANGELOG.md auto-update on release
- **T03: Make cargo-audit blocking** — remove `continue-on-error` from CI cargo-audit step, make it a required check for PR merge
- **T04: Add secret scanning** — truffleHog or detect-secrets in CI, scan all files, block PR merge on detection
- **T05: Performance regression gates** — Criterion benchmark CI step, store baseline benchmarks (proxy_latency, pattern_matching), fail CI if latency regresses >10%
- **T06: CODEOWNERS + PR template** — `.github/CODEOWNERS` routing Rust→kernel reviewers, TS→control-plane reviewers. `.github/pull_request_template.md` with checklist

### Out of Scope

- Multi-platform Docker builds (covered in S07)
- Helm chart changes (covered in S07)
- Coverage threshold enforcement (covered in S04)

## Constraints

- Release workflow must work with GitHub Actions free tier (or document requirements)
- cosign signing requires OIDC keyless signing or a stored key
- Benchmark baselines must be stored as CI artifacts (not committed to repo)
- commitlint must not break existing development workflow

## Integration Points

### Consumes

- `.github/workflows/ci-quality-security.yml` — existing CI pipeline to modify
- `docker/` — existing Dockerfiles for image builds
- `Cargo.toml` workspace — for cargo-audit and benchmark configuration
- `.husky/` — existing hook infrastructure

### Produces

- `.github/workflows/release.yml` — automated release pipeline
- `.commitlintrc.yml` — commit message validation config
- `.husky/commit-msg` — commit message hook
- `.github/CODEOWNERS` — code ownership routing
- `.github/pull_request_template.md` — PR checklist template
- Updated `.github/workflows/ci-quality-security.yml` — blocking cargo-audit, secret scanning, benchmarks
- Signed container images in ghcr.io (on tag push)

## Open Questions

- cosign signing method — OIDC keyless (GitHub Actions native) vs stored key; keyless is simpler but requires GitHub Actions OIDC
- SBOM tool — syft vs trivy; need to evaluate which integrates better with the release workflow
- release-please vs standard-version — release-please is more automated but adds a bot; standard-version is simpler but manual
- Benchmark baseline storage — GitHub Actions cache vs artifact vs committed file
