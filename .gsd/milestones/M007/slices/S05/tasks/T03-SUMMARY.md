---
id: T03
parent: S05
milestone: M007
provides:
  - TruffleHog secret scanning CI job (blocks on verified/unknown findings)
  - Criterion benchmark tracking CI job (main-only, 200% alert threshold)
  - CODEOWNERS file with path-based review routing
  - PR template with conventional commit checklist
key_files:
  - .github/workflows/ci-quality-security.yml
  - .github/CODEOWNERS
  - .github/PULL_REQUEST_TEMPLATE.md
key_decisions:
  - "D033: Benchmark CI tracking with 200% alert threshold, main-only, no PR gating"
  - "D034: TruffleHog --results=verified,unknown --fail for secret scanning"
patterns_established:
  - "Secret scanning job pattern: checkout with fetch-depth: 0 + trufflesecurity/trufflehog@main with --results=verified,unknown --fail"
  - "Benchmark tracking pattern: main-only guard via if: condition, cargo bench with bencher output, benchmark-action/github-action-benchmark@v1 with auto-push"
observability_surfaces:
  - "Secret scanning: gh run list --workflow=ci-quality-security.yml → secret-scanning job logs show TruffleHog findings"
  - "Benchmark tracking: GitHub Pages benchmark dashboard (auto-pushed); PR comments when regression >200%"
  - "CODEOWNERS: PR Reviewers section auto-populates required reviewers (requires branch protection)"
  - "PR template: New PR body auto-filled with checklist"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Add secret scanning, benchmark tracking, CODEOWNERS, and PR template

**Added TruffleHog secret scanning, Criterion benchmark tracking, CODEOWNERS review routing, and PR template to complete CI governance**

## What Happened

Added two new CI jobs to `.github/workflows/ci-quality-security.yml`:

1. **`secret-scanning` job** — Runs on all pushes and PRs. Checks out full git history (`fetch-depth: 0`), runs TruffleHog with `--results=verified,unknown --fail`. Blocks the pipeline when verified or unknown secrets are found.

2. **`benchmarks` job** — Runs only on push to main (guarded by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`). Installs Rust, runs `cargo bench --workspace -- --output-format=bencher`, feeds results to `benchmark-action/github-action-benchmark@v1` with `alert-threshold: "200%"`, `fail-on-alert: false`, `comment-on-alert: true`, and `auto-push: true` for GitHub Pages storage. Requires `contents: write` permission for auto-push.

Created two new governance files:

3. **`.github/CODEOWNERS`** — 7 path-based ownership rules all pointing to `@fabiodinota` (default `*`, `/crates/`, `/dashboard/`, `/control-plane/`, `/helm/`, `/docker/`, `/.github/`).

4. **`.github/PULL_REQUEST_TEMPLATE.md`** — Description section, Type of Change checkboxes (bug fix, feature, breaking change, docs, CI/CD, refactor), and Checklist (conventional commit title, tests, docs, no secrets, cargo clippy clean, cargo fmt clean).

Also patched T03-PLAN.md with missing `## Observability Impact` section (pre-flight fix).

## Verification

- `yamllint .github/workflows/ci-quality-security.yml` — **PASS** (clean, no warnings)
- CI workflow contains `secret-scanning` job with `trufflesecurity/trufflehog@main` action — **PASS**
- CI workflow contains `benchmarks` job with `benchmark-action/github-action-benchmark@v1` and `alert-threshold: "200%"` — **PASS**
- Benchmarks job has `if:` condition limiting to main branch push — **PASS**
- `.github/CODEOWNERS` exists and contains `@fabiodinota` (7 occurrences) — **PASS**
- `.github/PULL_REQUEST_TEMPLATE.md` exists with conventional commit and cargo clippy checklist items — **PASS**

### Slice-level Verification (cumulative)

| Check | Status |
|-------|--------|
| yamllint release.yml | ⚠️ PASS (1 cosmetic warning from T01) |
| yamllint release-please.yml | ✅ PASS |
| release.yml has 4 services + cosign + sbom | ✅ PASS |
| ci-quality-security.yml has secret-scanning + benchmarks | ✅ PASS |
| commitlint validates | ✅ PASS |
| .husky/commit-msg exists | ✅ PASS |
| release-please configs exist | ✅ PASS |
| CODEOWNERS exists with path rules | ✅ PASS |
| PR template exists | ✅ PASS |
| release.yml has explicit failure handling | ❌ FAIL (no `if: failure()` in T01's release.yml — not in T03 scope) |

All T03 must-haves are met. The release.yml failure handling gap is a T01 issue — not blocking this task.

## Diagnostics

- **Secret scanning failures:** `gh run list --workflow=ci-quality-security.yml` → click into secret-scanning job → TruffleHog output shows verified/unknown findings with file path and line
- **Benchmark regressions:** GitHub Pages benchmark chart at `https://fabiodinota.github.io/interdict/dev/bench/` (after first main push); PR comments appear when regression >200%
- **CODEOWNERS enforcement:** Only active with GitHub branch protection requiring CODEOWNERS review
- **PR template rendering:** Open new PR → description auto-fills with template

## Deviations

- Added `permissions: contents: write` to benchmarks job for `auto-push: true` (GitHub Pages storage). Task plan mentioned "GitHub Pages or artifact" — chose GitHub Pages via auto-push for persistent trend tracking.

## Known Issues

- `release.yml` missing explicit `if: failure()` handling — this is a T01 gap, not T03 scope. Noted in slice verification for follow-up.
- Benchmark job requires GitHub Pages to be enabled on the repo for `auto-push: true` to work. First run on main will create the `gh-pages` branch automatically.

## Files Created/Modified

- `.github/workflows/ci-quality-security.yml` — Added `secret-scanning` and `benchmarks` jobs
- `.github/CODEOWNERS` — Path-based review routing rules
- `.github/PULL_REQUEST_TEMPLATE.md` — PR checklist template
- `.gsd/milestones/M007/slices/S05/tasks/T03-PLAN.md` — Added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M007/slices/S05/S05-PLAN.md` — Marked T03 as `[x]`
- `.gsd/DECISIONS.md` — Added D034 (TruffleHog scanning config rationale)
