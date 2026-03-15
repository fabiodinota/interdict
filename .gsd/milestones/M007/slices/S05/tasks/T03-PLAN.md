---
estimated_steps: 6
estimated_files: 3
---

# T03: Add secret scanning, benchmark tracking, CODEOWNERS, and PR template

**Slice:** S05 — CI/CD Release Pipeline + Quality Gates
**Milestone:** M007

## Description

Complete CI governance by adding TruffleHog secret scanning (blocks on verified findings), Criterion benchmark tracking (generous threshold, main-only), CODEOWNERS for review routing, and a PR template for consistent contributions.

## Steps

1. Add `secret-scanning` job to `.github/workflows/ci-quality-security.yml`: checkout with `fetch-depth: 0`, run `trufflesecurity/trufflehog@main` action with `--results=verified,unknown --fail`. Runs on all pushes and PRs.
2. Add `benchmarks` job to `.github/workflows/ci-quality-security.yml`: runs only on push to main (use `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`). Install Rust, run `cargo bench --workspace -- --output-format=bencher` (Criterion bencher output), feed to `benchmark-action/github-action-benchmark@v1` with `tool: cargo`, `alert-threshold: '200%'`, `fail-on-alert: false`, `comment-on-alert: true`, `github-token: ${{ secrets.GITHUB_TOKEN }}`. Store results via GitHub Pages or artifact.
3. Create `.github/CODEOWNERS` with ownership rules: `* @fabiodinota`, `/crates/ @fabiodinota`, `/dashboard/ @fabiodinota`, `/control-plane/ @fabiodinota`, `/helm/ @fabiodinota`, `/docker/ @fabiodinota`, `/.github/ @fabiodinota`
4. Create `.github/PULL_REQUEST_TEMPLATE.md` with sections: Description, Type of Change (checkboxes: bug fix, feature, breaking change, docs, CI/CD, refactor), Checklist (conventional commit title, tests added/updated, docs updated, no secrets committed, `cargo clippy` clean)
5. Validate updated CI workflow with `yamllint`
6. Verify CODEOWNERS and PR template are well-formed

## Must-Haves

- [ ] TruffleHog secret scanning runs on every push/PR and blocks on verified findings
- [ ] Benchmark tracking runs only on main push (not PRs) with ≥200% alert threshold
- [ ] CODEOWNERS file exists with path-based ownership
- [ ] PR template exists with conventional commit checklist

## Verification

- `yamllint .github/workflows/ci-quality-security.yml` passes
- CI workflow contains `secret-scanning` job with `trufflehog` action
- CI workflow contains `benchmarks` job with `github-action-benchmark` action and `alert-threshold: '200%'`
- Benchmarks job has `if:` condition limiting to main branch push
- `.github/CODEOWNERS` exists and contains `@fabiodinota`
- `.github/PULL_REQUEST_TEMPLATE.md` exists with checklist items

## Observability Impact

- **Secret scanning:** TruffleHog job surfaces verified/unknown secret findings in CI logs; blocks pipeline on detection. Inspect via `gh run list --workflow=ci-quality-security.yml` → secret-scanning job logs.
- **Benchmark tracking:** `github-action-benchmark` stores results and comments on PRs when regression >200%. Inspect via GitHub Pages benchmark dashboard or artifact download. Only runs on main push — no PR noise.
- **CODEOWNERS:** GitHub enforces review routing when branch protection requires CODEOWNERS review. Inspect via PR "Reviewers" section — required reviewers auto-assigned.
- **PR template:** Auto-populates PR body with checklist. Inspect by opening a new PR — template renders in description field.
- **Failure shapes:** Secret scanning failure = workflow blocked with TruffleHog findings in logs. Benchmark alert = PR comment with regression percentage. Missing CODEOWNERS review = PR merge blocked (if branch protection configured).

## Inputs

- `.github/workflows/ci-quality-security.yml` — existing CI workflow (will be modified by T02, extend further here)
- `crates/kernel/benches/proxy_latency.rs` — existing Criterion benchmark (benchmark job will run these)
- `crates/kernel/benches/pattern_matching.rs` — existing Criterion benchmark
- S05-RESEARCH.md — TruffleHog `--results=verified,unknown` to reduce noise; benchmark alert-threshold ≥200% due to VM noise; CODEOWNERS only enforced if branch protection is configured

## Expected Output

- `.github/workflows/ci-quality-security.yml` — modified with secret-scanning and benchmarks jobs
- `.github/CODEOWNERS` — review routing rules
- `.github/PULL_REQUEST_TEMPLATE.md` — PR checklist template
