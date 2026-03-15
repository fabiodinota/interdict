# S05: CI/CD Release Pipeline + Quality Gates — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: CI/CD workflows are YAML configuration files validated structurally. Full runtime proof requires GitHub Actions execution, which is inherently non-local. Structural validation (YAML syntax, required keys, step ordering, permission declarations) provides high confidence.

## Preconditions

- Repository cloned with all S05 changes applied
- Node.js 22+ and npm/npx available
- Python yamllint installed (`pip install yamllint`)
- `bun install` completed (commitlint dependencies installed)

## Smoke Test

Run `yamllint -d relaxed .github/workflows/release.yml && npx commitlint --from HEAD~1 && test -f .github/CODEOWNERS` — all three commands should exit 0, confirming the release workflow is valid YAML, the latest commit is conventional, and CODEOWNERS exists.

## Test Cases

### 1. Release workflow structure

1. Open `.github/workflows/release.yml`
2. Verify trigger is `on: push: tags: ['v*']`
3. Verify `permissions` includes `id-token: write`, `packages: write`, `contents: write`
4. Count `docker/build-push-action@v6` steps — expect exactly 4 (kernel, control-plane, dashboard, evidence-collector)
5. Count `anchore/sbom-action@v0` steps — expect exactly 4
6. Count `cosign sign` commands — expect exactly 4
7. Verify each cosign sign references the digest output (`@${{ steps.build-{service}.outputs.digest }}`)
8. Verify `softprops/action-gh-release@v2` step exists with `generate_release_notes: true`
9. Verify `files:` in gh-release lists all 4 SBOM JSON filenames
10. **Expected:** All counts match, signing is by digest not tag, SBOM files listed in release

### 2. Release workflow failure handling

1. Search `.github/workflows/release.yml` for `if: failure()`
2. Verify the failure step writes to `$GITHUB_STEP_SUMMARY`
3. **Expected:** At least one step with `if: failure()` exists, providing diagnostic output on pipeline failure

### 3. Release workflow build ordering

1. For each service in release.yml, verify step order is: Build and push → Generate SBOM → Sign image
2. Verify SBOM step references the build step's digest output
3. Verify sign step references the same digest
4. **Expected:** SBOM is generated before signing so the signature covers metadata; both reference the same digest

### 4. Conventional commit validation (local)

1. Run `npx commitlint --from HEAD~1`
2. **Expected:** Exit code 0 — last commit follows conventional format

### 5. Conventional commit validation (rejection)

1. Run `echo "bad commit message" | npx commitlint`
2. **Expected:** Exit code 1 with error about subject format or type

### 6. Husky commit-msg hook

1. Verify `.husky/commit-msg` exists
2. Verify it contains `npx commitlint --edit`
3. Verify it has shebang `#!/usr/bin/env sh` and `set -eu`
4. **Expected:** Hook file exists, is executable (on Unix), invokes commitlint

### 7. release-please configuration

1. Verify `.release-please-manifest.json` exists and contains `"1.5.0"` for path `"."`
2. Verify `release-please-config.json` exists with `release-type: "simple"`
3. Verify `.github/workflows/release-please.yml` exists
4. Run `yamllint -d relaxed .github/workflows/release-please.yml`
5. Verify workflow triggers on `push: branches: [main]`
6. Verify it uses `googleapis/release-please-action@v4`
7. **Expected:** All configs valid, workflow targets main branch, uses release-please-action v4

### 8. Commitlint CI job

1. Open `.github/workflows/ci-quality-security.yml`
2. Find `commitlint` job
3. Verify it checks out with `fetch-depth: 0`
4. Verify it runs commitlint validation
5. **Expected:** Job exists with full history checkout for commit range validation

### 9. Secret scanning CI job

1. Open `.github/workflows/ci-quality-security.yml`
2. Find `secret-scanning` job
3. Verify it uses `trufflesecurity/trufflehog@main`
4. Verify checkout has `fetch-depth: 0` (full history)
5. Verify TruffleHog args include `--results=verified,unknown` and `--fail`
6. **Expected:** Job scans full git history with TruffleHog, fails on verified/unknown secrets

### 10. Benchmark tracking CI job

1. Open `.github/workflows/ci-quality-security.yml`
2. Find `benchmarks` job
3. Verify it has `if:` condition limiting to push on main branch
4. Verify it runs `cargo bench`
5. Verify it uses `benchmark-action/github-action-benchmark@v1`
6. Verify `alert-threshold` is set (expect `"200%"`)
7. **Expected:** Job runs only on main push, tracks benchmarks with generous threshold

### 11. CODEOWNERS file

1. Open `.github/CODEOWNERS`
2. Verify it contains path rules for at least: `*`, `/crates/`, `/dashboard/`, `/control-plane/`, `/helm/`
3. Verify all rules point to `@fabiodinota`
4. **Expected:** CODEOWNERS routes reviews for all major directories

### 12. PR template

1. Open `.github/PULL_REQUEST_TEMPLATE.md`
2. Verify it contains a checklist with items for: conventional commit, tests, docs
3. Verify it has type-of-change section (bug fix, feature, breaking change)
4. **Expected:** Template provides structured PR description format

### 13. CI workflow YAML validity

1. Run `yamllint -d relaxed .github/workflows/release.yml`
2. Run `yamllint -d relaxed .github/workflows/release-please.yml`
3. Run `yamllint -d relaxed .github/workflows/ci-quality-security.yml`
4. **Expected:** All three pass (warnings acceptable, no errors)

## Edge Cases

### Concurrency protection

1. In `.github/workflows/release.yml`, verify `concurrency` block exists
2. Verify `cancel-in-progress: false` (releases should not be cancelled)
3. **Expected:** Concurrent tag pushes queue rather than cancel each other

### cosign keyless signing requirements

1. Verify `sigstore/cosign-installer@main` step exists before any `cosign sign` step
2. Verify `id-token: write` permission is set (required for OIDC keyless)
3. **Expected:** cosign is installed before signing; OIDC permission enables keyless flow

### Docker layer caching

1. For each `docker/build-push-action` step, verify `cache-from: type=gha` and `cache-to: type=gha,mode=max`
2. **Expected:** Subsequent release builds benefit from layer caching

### Benchmark job does not run on PRs

1. Verify benchmarks job has `if:` condition that excludes pull_request events
2. **Expected:** Benchmark noise is limited to main branch pushes only

## Failure Signals

- `yamllint` exits non-zero with errors (not warnings) — workflow YAML is malformed
- `npx commitlint --from HEAD~1` exits non-zero — recent commit violates conventional format
- Missing files: `.husky/commit-msg`, `.release-please-manifest.json`, `release-please-config.json`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`
- release.yml has fewer than 4 build-push-action steps or cosign sign commands
- release.yml signs by tag instead of digest — creates tag mutation vulnerability
- Secret scanning job missing `--fail` flag — would allow leaked secrets through
- No `if: failure()` step in release.yml — build failures may not produce actionable diagnostics

## Requirements Proved By This UAT

- PR-CICD-01 (structural) — Release pipeline configuration validated; full runtime proof requires GitHub Actions execution with an actual `v*` tag push

## Not Proven By This UAT

- Actual container images pushed to ghcr.io (requires GitHub Actions runtime)
- cosign signature verification against real images (requires published images)
- TruffleHog finding a real secret and blocking (requires a commit with a leaked secret)
- release-please creating a release PR (requires push to main on GitHub)
- Benchmark trend tracking on GitHub Pages (requires benchmark runs on main)
- CODEOWNERS enforcement (requires GitHub branch protection configuration)

## Notes for Tester

- All verification is structural — these are CI/CD configuration files. Runtime proof happens when `git tag v1.5.0 && git push origin v1.5.0` executes on GitHub.
- The `yamllint` warnings about line-length (>80 chars) are cosmetic and expected — GitHub Actions YAML frequently exceeds 80 columns.
- If commitlint fails, check whether the most recent commit message follows `type(scope): description` format (e.g., `feat(ci): add release pipeline`).
- The benchmark job requires GitHub Pages to be enabled on the repository for `auto-push: true`. First run creates the `gh-pages` branch automatically.
