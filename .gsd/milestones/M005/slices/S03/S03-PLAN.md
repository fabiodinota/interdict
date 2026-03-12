# S03: Repo Quality Gates Infra Lint

**Goal:** Create the canonical repo-root quality commands and config files that Phase 32 CI and local hooks will build on.
**Demo:** Create the canonical repo-root quality commands and config files that Phase 32 CI and local hooks will build on.

## Must-Haves


## Tasks

- [x] **T01: 32-repo-quality-gates-infra-lint-coverage 01**
  - Create the canonical repo-root quality commands and config files that Phase 32 CI and local hooks will build on.

Purpose: satisfy the explicit-tooling direction in `HR-OPS-01` and `HR-OPS-02` before wiring those checks into CI and Husky.
Output: root configs plus reusable infra-lint and WSL-Rust verification commands.
- [x] **T02: 32-repo-quality-gates-infra-lint-coverage 02**
  - Wire the new infra-quality command surface into GitHub Actions so deployment and repo-config artifacts are merge-blocking, not best-effort.

Purpose: satisfy `HR-OPS-01` by making infra lint/validation first-class CI coverage alongside the existing Rust and JS/TS gates.
Output: a dedicated CI job that installs the required tooling and runs the repo-root infra gate.
- [x] **T03: 32-repo-quality-gates-infra-lint-coverage 03**
  - Consolidate the local quality workflow around Husky and document the honest Windows + WSL execution model.

Purpose: satisfy `HR-OPS-02` without leaving developers with two conflicting hook systems or fake native-Windows Rust promises.
Output: active Husky pre-commit/pre-push hooks plus corrected helper scripts and docs.

## Files Likely Touched

- `package.json`
- `.hadolint.yaml`
- `.yamllint.yml`
- `buf.yaml`
- `scripts/quality/infra-check.sh`
- `scripts/quality/rust-wsl-check.sh`
- `.github/workflows/ci-quality-security.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `.claude/hooks/README.md`
- `.claude/hooks/pre-commit.sh`
- `.claude/hooks/pre-push.sh`
