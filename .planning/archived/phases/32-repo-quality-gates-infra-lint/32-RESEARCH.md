# Phase 32 Research: Repo Quality Gates & Infra Lint Coverage

**Phase:** 32
**Name:** Repo Quality Gates & Infra Lint Coverage
**Date:** 2026-03-11
**Status:** Complete

## Objective

Research how to implement Phase 32 well within the approved boundary:

- extend formatter/linter/validation coverage to infra and deployment artifacts
- make local hook behavior coherent with the actual Windows + WSL workflow
- avoid widening scope into app-code warning burn-down or framework cleanup

## Current State

### What is already covered

#### CI

` .github/workflows/ci-quality-security.yml ` already covers:

- Rust: `cargo fmt`, `cargo clippy`, workspace tests, content inspection gate
- security: `cargo audit`, optional `cargo deny`, Trivy filesystem scan
- control-plane: Biome check, typecheck, tests
- dashboard: Prettier check, ESLint, tests, build

#### Local hooks

Active git hook path:

- `git config --get core.hooksPath` -> `.husky/_`

Current active hook:

- `.husky/pre-commit` -> `npx lint-staged`

Current root `lint-staged` behavior:

- JS/TS changes: runs control-plane Biome and dashboard Prettier/ESLint
- Rust changes: only prints a reminder; does not actually run Rust checks

### What is not covered yet

The repo has artifact surfaces with no explicit CI validation today:

- Dockerfiles: `docker/*/Dockerfile`
- shell scripts: `docker/**/*.sh`, `scripts/**/*.sh`
- Helm chart: `helm/interdict/**/*.{yaml,yml,tpl}`
- proto definitions: `proto/**/*.proto`
- generic YAML linting: none in CI today

The workflow grep confirmed there is no:

- `hadolint`
- `shellcheck`
- `yamllint`
- `buf lint`
- `helm lint`

## Important Structural Finding

`.claude/hooks/` exists but is not the active git-hook directory.

Examples:

- `.claude/hooks/pre-commit.sh`
- `.claude/hooks/pre-push.sh`
- `.claude/hooks/README.md`

But the active hooks path is Husky, not `.claude/hooks`.

So today you effectively have **two hook systems**:

1. active Husky + lint-staged
2. inactive `.claude/hooks` scripts and docs describing a different pre-commit/pre-push model

This is exactly the kind of workflow drift Phase 32 should fix.

## Recommended Direction

### 1. Treat CI as the source of truth for full infra validation

Recommended CI additions:

- Dockerfiles -> `hadolint`
- shell scripts -> `shellcheck`
- Helm -> `helm lint` and/or `helm template` smoke validation
- proto -> `buf lint` (plus optional breaking check later)
- YAML -> scoped `yamllint` for repo YAML that is not Helm-templated

This keeps the strongest checks in the environment where required tools can be installed deterministically.

### 2. Keep local hooks fast and realistic for this host

Because Rust native Windows is still broken for full verification, local hooks should not pretend otherwise.

Best-fit local model:

- pre-commit: fast staged-file checks only
  - control-plane Biome
  - dashboard Prettier/ESLint
  - maybe shell/Docker/YAML checks on changed files if the tools are easy to run locally
- pre-push or explicit local script: heavier/full validation
  - WSL-backed Rust checks
  - full app tests where practical

The key is honesty: no fake local Rust gate that users can’t actually run on this machine without WSL.

### 3. Collapse to one local-hook story

Phase 32 should choose one of these approaches and align docs/scripts accordingly:

#### Option A — Husky is canonical
- keep Husky/lint-staged as the active system
- convert `.claude/hooks` into helper scripts called by Husky or document them as optional automation helpers
- update `.claude/hooks/README.md` so it stops describing an inactive `pre-commit` Python-based install flow

#### Option B — `.claude/hooks` is canonical
- rewire git hooks to call `.claude/hooks` scripts directly
- remove or minimize Husky duplication

Given current reality, **Option A is the least disruptive** because Husky is already active.

### 4. Be careful with Helm/YAML overlap

Not all YAML should go through the same linter rules:

- Helm templates (`helm/interdict/templates/**/*.yaml`, `*.tpl`) should primarily be validated by `helm lint` / `helm template`
- plain workflow/config YAML can use `yamllint`
- avoid naïvely yamllinting Helm template files as raw YAML if templating syntax will produce noise

### 5. Proto linting likely needs a `buf` config file

There are only two proto files now:

- `proto/interdict/policy/v1/policy_distribution.proto`
- `proto/interdict/evidence/v1/evidence.proto`

There is currently no `buf.yaml`. Phase 32 likely needs to introduce one if `buf lint` becomes the proto gate.

## Likely Files To Touch

### Root / workflow

- `package.json`
- `.husky/pre-commit`
- possibly a new `.husky/pre-push`
- `.github/workflows/ci-quality-security.yml`

### New tool config files (likely)

- `.hadolint.yaml` or equivalent
- `.shellcheckrc` if needed
- `buf.yaml`
- `yamllint` config if scoped YAML lint is added

### Existing helper/docs likely needing alignment

- `.claude/hooks/README.md`
- `.claude/hooks/pre-commit.sh`
- `.claude/hooks/pre-push.sh`

## Test / Verification Strategy

### CI-side verification

- prove new jobs or steps run on representative repo artifacts
- for Helm, prefer `helm lint` plus a `helm template` smoke render
- for Dockerfiles and shell scripts, ensure at least one intentional file is exercised by the new commands

### Local workflow verification

- `npx lint-staged --allow-empty` or equivalent sanity check for staged-hook config
- verify Husky pre-commit does not fail on unrelated repo-wide files when only staged-file checks are intended
- if adding a WSL-backed Rust script, verify the exact command works from Windows root on this machine

## Common Pitfalls

1. **Do not make pre-commit too heavy.** Full workspace tests on every commit will make local use miserable.
2. **Do not pretend `.claude/hooks` is active if Husky is actually active.** Pick a canonical path.
3. **Do not yamllint Helm templates as plain YAML without accounting for templating syntax.**
4. **Do not add Rust local gates that only work on Linux but document them as generic local hooks.** They must explicitly account for WSL on this host.
5. **Do not widen into Phase 33 doc-truth cleanup beyond the hook/docs directly needed to make the Phase 32 workflow coherent.**

## Planning Guidance

This phase should probably be split into 2 plans:

1. CI infra/deployment lint coverage (Docker, shell, Helm, proto, YAML)
2. local hook/workflow consolidation around Husky + staged checks + WSL-aware heavier validation

Those can likely execute in parallel, then verify together.
