# S05: CI/CD Release Pipeline + Quality Gates — Research

**Date:** 2026-03-15

## Summary

The project has a solid CI quality pipeline (`ci-quality-security.yml`) covering Rust (fmt, clippy, tests across 3 deployment modes), TypeScript (biome, tsc, bun test), dashboard (prettier, eslint, vitest, build), infra linting, coverage, and security (cargo-audit, cargo-deny, Trivy). What's entirely missing is a **release pipeline** — there is no workflow to build Docker images, push to a registry, sign them, or create GitHub Releases. There is also no conventional commit enforcement, no secret scanning, no performance regression gates in CI, and no CODEOWNERS file.

The good news: the existing infrastructure is well-organized and provides clear extension points. Dockerfiles for all 4 services exist and follow multi-stage build patterns. Criterion benchmarks for `proxy_latency` and `pattern_matching` are already written. Husky hooks are configured. The gap is purely in CI/CD automation and governance tooling.

**Primary recommendation:** Build a separate `release.yml` workflow triggered on `v*` tags using Docker `buildx`, `cosign` keyless signing (GitHub Actions OIDC), and `anchore/syft` for SBOM generation. Use `release-please` for automated versioning/changelog since it integrates natively with GitHub Actions and conventional commits. Add TruffleHog as a new CI job. For benchmarks, use `benchmark-action/github-action-benchmark` with a generous alert threshold (≥20%) to account for VM noise.

## Recommendation

### Approach: Layered CI/CD Enhancement

1. **New `release.yml` workflow** — Separate from `ci-quality-security.yml`. Triggers only on tag push `v*`. Builds 4 Docker images via `docker/build-push-action`, pushes to `ghcr.io/fabiodinota/interdict/{kernel,control-plane,dashboard,evidence-collector}`, signs with cosign keyless, generates SBOM with `anchore/sbom-action` (syft-based), creates GitHub Release with auto-generated notes.

2. **Conventional commits via commitlint** — Add `@commitlint/cli` + `@commitlint/config-conventional` as root devDeps. Husky `commit-msg` hook already has infrastructure (`.husky/` exists, `prepare` script runs husky). Add `commitlint` CI job to `ci-quality-security.yml`.

3. **release-please for automated changelog** — `googleapis/release-please-action@v4` on push to main. Creates/updates a release PR with bumped version and changelog. When merged, tags the release, triggering the release workflow. Replaces manual `CHANGELOG.md` maintenance.

4. **TruffleHog secret scanning** — New `secret-scanning` job in `ci-quality-security.yml`. Uses `trufflesecurity/trufflehog@main` with `--results=verified,unknown` and `--fail` flag. Runs on push and PR.

5. **Benchmark tracking** — New `benchmarks` job using `benchmark-action/github-action-benchmark@v1` with Criterion JSON output. Store baselines as GitHub Pages or artifacts. Alert threshold ≥20% due to GitHub Actions VM noise. Run only on push to main (not PRs) to avoid flaky PR checks.

6. **CODEOWNERS + PR template** — Straightforward file creation.

### Why this approach

- **cosign keyless (OIDC)** avoids managing signing keys — the GitHub Actions OIDC token is the identity. No secrets to manage.
- **release-please** is more automated than `standard-version` — it creates/updates release PRs automatically, and is the Google-maintained standard for this pattern.
- **TruffleHog** over `detect-secrets` because it can verify credentials are live (reducing false positives) and has 800+ detectors.
- **Benchmark tracking over gating** because Criterion's own docs warn that GitHub Actions VMs introduce too much noise for reliable regression detection. Tracking trends with generous thresholds is the pragmatic choice.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Docker image build+push | `docker/build-push-action@v6` | Handles buildx, caching, multi-platform, digest output |
| Container signing | `sigstore/cosign-installer@main` + keyless | OIDC-based, no key management, SLSA provenance |
| SBOM generation | `anchore/sbom-action@v0` (wraps syft) | Generates SPDX/CycloneDX, attaches to image |
| Conventional commit lint | `@commitlint/cli` + `@commitlint/config-conventional` | Standard, well-maintained, integrates with husky |
| Automated changelog + versioning | `googleapis/release-please-action@v4` | Creates release PRs, bumps versions, updates CHANGELOG |
| Secret scanning | `trufflesecurity/trufflehog@main` | 800+ detectors, credential verification, low false positives |
| Benchmark tracking | `benchmark-action/github-action-benchmark@v1` | Parses Criterion output, stores history, alerts on regression |
| GitHub Container Registry login | `docker/login-action@v3` | Handles GHCR auth with GITHUB_TOKEN |

## Existing Code and Patterns

- `.github/workflows/ci-quality-security.yml` — Well-structured multi-job CI with `infra-quality`, `quality` (matrix: 3 deployment modes), `coverage`, `security`, `control-plane`, `dashboard`. All jobs run independently. New jobs should follow the same pattern.
- `docker/kernel/Dockerfile`, `docker/control-plane/Dockerfile`, `docker/dashboard/Dockerfile`, `docker/evidence-collector/Dockerfile` — All 4 Dockerfiles exist with multi-stage builds, non-root users, and read-only root filesystem. Build context is repository root for all. These are the images the release workflow will build.
- `.dockerignore` (root) — Already excludes build artifacts, node_modules, .env, secrets, IDE files.
- `crates/kernel/benches/proxy_latency.rs` — Criterion benchmark measuring <10ms p99 latency, >10K req/s, <128MB memory. Uses shared runtime to avoid port exhaustion.
- `crates/kernel/benches/pattern_matching.rs` — Criterion benchmark for PII pattern detection within <2ms budget.
- `.husky/pre-commit`, `.husky/pre-push` — Existing hooks. No `commit-msg` hook yet — must create it for commitlint.
- `CHANGELOG.md` — Manually maintained, follows Keep a Changelog format with `[Unreleased]` section. release-please will take over management.
- `renovate.json` — Already configured with `:semanticCommits` extension, meaning Renovate already creates conventional commit messages. commitlint will validate human commits match.
- `codecov.yml` — Coverage targets: project 70%, patch 80%. Flags for rust, dashboard, control-plane with carryforward.
- `deny.toml` — cargo-deny configured for license compliance, duplicate detection, source restrictions.
- `.gsd/hooks/benchmark.sh` — Existing benchmark hook that runs content_inspection_test and optionally full criterion benches.
- `helm/interdict/Chart.yaml` — `appVersion: "1.1.0"` — will need updating as part of release process.

## Constraints

- **GitHub Actions OIDC requires `id-token: write` permission** — Cannot be granted during pull request workflows from forks. Release workflow must trigger on tag push (not PR).
- **cosign keyless signs by digest, not tag** — Must capture image digest from `docker/build-push-action` output and sign `$IMAGE@sha256:...`. Signing by tag is a security anti-pattern (tags are mutable).
- **GitHub Actions VM noise for benchmarks** — Criterion's FAQ explicitly states: "The virtualization used by Cloud-CI providers like GitHub Actions introduces a great deal of noise." Use generous thresholds (≥20%) or consider `iai-callgrind` for instruction-count-based benchmarking.
- **cargo-audit is already blocking** — The security job in CI does not use `continue-on-error`. T03 (make cargo-audit blocking) is already done at the workflow level. The remaining work is ensuring it's a **required status check** on the GitHub repo (branch protection settings).
- **Existing benchmarks use criterion 0.5** — The project pins `criterion = { version = "0.5", features = ["async_tokio"] }`. The `benchmark-action/github-action-benchmark` supports Criterion output format.
- **Windows + WSL dev environment** — commitlint runs in Node.js (cross-platform), but husky hooks must work on Windows. The existing hooks use `#!/usr/bin/env sh` which works with Git Bash on Windows.
- **Docker build context is repository root** — All Dockerfiles use `docker build -f docker/X/Dockerfile .` pattern. The release workflow must set `context: .` for all builds.
- **ghcr.io namespace** — Git remote is `github.com/fabiodinota/interdict`, so images go to `ghcr.io/fabiodinota/interdict/{service}`.

## Common Pitfalls

- **Signing by tag instead of digest** — Tags are mutable. If you sign `ghcr.io/org/image:v1.0.0`, an attacker who pushes a new image to the same tag would have a signed malicious image. Always sign by digest: `ghcr.io/org/image@sha256:abc...`. The `docker/build-push-action` outputs `digest` for this purpose.

- **Criterion benchmark flakiness in CI** — GitHub Actions runners share physical hardware. Criterion reports can show ±15% noise. Set `alert-threshold: '200%'` (2x) in github-action-benchmark to avoid false positives. Consider running benchmarks only on `main` push, not on PRs.

- **release-please + manual CHANGELOG conflict** — release-please manages `CHANGELOG.md` automatically. If the existing manually-maintained changelog has a different format, the first release-please PR may look messy. Solution: clean up `CHANGELOG.md` format before enabling release-please, or start with a fresh changelog section.

- **commitlint breaking existing workflow** — If commitlint is too strict initially, it blocks developers. Start with `@commitlint/config-conventional` defaults which allow `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `style`, `perf`, `build`, `revert`. Ensure the team knows the format.

- **TruffleHog false positives on test fixtures** — The project contains test certificates, mock keys, and example tokens in test files. Use `--results=verified,unknown` (not `unverified`) to reduce noise. If needed, add a `.trufflehog-ignore` file for known test fixtures.

- **SBOM attachment to signed images** — The SBOM must be generated and attached before signing (cosign signs the final image+metadata). If you sign first and then attach the SBOM, the signature becomes invalid. Order: build → push → generate SBOM → attach SBOM → sign.

## Open Risks

- **GitHub Actions OIDC availability** — Keyless signing depends on GitHub's OIDC token endpoint. If GitHub changes the OIDC token format or Sigstore's Fulcio certificate authority is unavailable, signing will fail. Mitigation: the release workflow should treat signing as a separate step that can be retried.

- **release-please bootstrap complexity** — release-please needs a `.release-please-manifest.json` and `release-please-config.json`. Getting the initial version right for a monorepo with separate Cargo.toml + package.json versions requires careful setup. The project is not a publishable monorepo (no npm publish), so use `release-type: simple` with `release-as` for initial version.

- **Benchmark baseline cold start** — The first run of `benchmark-action/github-action-benchmark` has no baseline to compare against. It will simply store results. Regressions can only be detected from the second run onward.

- **CODEOWNERS enforcement** — CODEOWNERS only works if branch protection is enabled with "Require review from Code Owners". This is a GitHub repo setting, not something configurable in code. Document this requirement.

- **TruffleHog scanning depth on first run** — With `fetch-depth: 0`, TruffleHog scans the entire git history. The first run may surface secrets from very old commits that have already been rotated. This is expected behavior but may require initial triage.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GitHub Actions CI/CD | `github-workflows` (project) | installed ✓ |
| GitHub Actions CI/CD | `bobmatnyc/claude-mpm-skills@github-actions` | available (210 installs) |
| Container signing | `melodic-software/claude-code-plugins@supply-chain-security` | available (10 installs) |
| SBOM management | `melodic-software/claude-code-plugins@sbom-management` | available (8 installs) |
| Rust benchmarks | `mohitmishra786/low-level-dev-skills@rust-profiling` | available (34 installs) |

**Recommendation:** The installed `github-workflows` skill covers the core CI/CD patterns needed. The external skills have low install counts and the work here is more about composing well-documented GitHub Actions than needing specialized knowledge. No additional skill installs recommended.

## Sources

- Cosign keyless signing in GitHub Actions requires `id-token: write` permission and uses Fulcio certificates (source: [Chainguard Academy](https://edu.chainguard.dev/open-source/sigstore/how-to-keyless-sign-a-container-with-sigstore/))
- TruffleHog GitHub Action scans code changes in referenced commits with verified/unknown result filtering (source: [TruffleHog README](https://github.com/trufflesecurity/trufflehog))
- Criterion.rs FAQ warns against CI benchmarking on GitHub Actions due to virtualization noise (source: [Criterion FAQ](https://bheisler.github.io/criterion.rs/book/faq.html))
- release-please-action v4 supports manifest-based configuration for monorepos (source: [release-please-action README](https://github.com/googleapis/release-please-action))
- commitlint CI setup validates last commit on push, PR range on pull_request (source: [commitlint CI guide](https://github.com/conventional-changelog/commitlint/blob/master/docs/guides/ci-setup.md))
- `benchmark-action/github-action-benchmark` supports Criterion output format for trend tracking (source: [GitHub issue #8](https://github.com/rhysd/github-action-benchmark/issues/8))
- `boa-dev/criterion-compare-action` compares Criterion benchmarks between PR and base branch (source: [criterion-compare-action](https://github.com/boa-dev/criterion-compare-action))

## Task Inventory (from S05-CONTEXT.md, refined by research)

| Task | Status | Notes |
|------|--------|-------|
| T01: Release workflow | TODO | New `.github/workflows/release.yml` — largest task |
| T02: Conventional commits + changelog | TODO | commitlint + husky hook + release-please |
| T03: Make cargo-audit blocking | **DONE** | Already blocking in CI (no continue-on-error). Verify required status check in GitHub. |
| T04: Secret scanning | TODO | TruffleHog job in `ci-quality-security.yml` |
| T05: Performance regression gates | TODO | `benchmark-action/github-action-benchmark` with Criterion |
| T06: CODEOWNERS + PR template | TODO | Simple file creation |

## Forward Intelligence

- **cargo-audit is already blocking** — T03 was listed as a task but the security job already fails the pipeline on audit findings. The only remaining action is ensuring branch protection requires this status check. This should be documented but not over-engineered.
- **cosign must sign by digest** — The `docker/build-push-action` outputs a `digest` field. Use `${{ steps.build-kernel.outputs.digest }}` pattern. Do NOT sign by tag.
- **release-please vs existing CHANGELOG.md** — The existing `CHANGELOG.md` follows Keep a Changelog format with versioned sections. release-please uses Conventional Commits format. Consider keeping the existing changelog as-is and letting release-please manage the `[Unreleased]` section going forward, or do a one-time migration.
- **Benchmark CI noise** — Set `alert-threshold: '200%'` (2x) and `fail-on-alert: false` initially. This provides tracking without false CI failures. Can tighten later with dedicated runners.
- **TruffleHog first-run triage** — Expect old secrets in git history to surface. Plan to triage and create `.trufflehog-ignore` entries for test fixtures before marking T04 complete.
- **Windows hook compatibility** — commitlint runs via `npx commitlint --edit` in the commit-msg hook. This works on Windows with Git Bash. Test locally before merging.
