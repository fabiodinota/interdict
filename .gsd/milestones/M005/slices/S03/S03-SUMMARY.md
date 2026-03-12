---
id: S03
parent: M005
milestone: M005
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S03: Repo Quality Gates Infra Lint

**# Plan 32-01 Summary**

## What Happened

# Plan 32-01 Summary

- Added repo-owned infra tool configs in `.hadolint.yaml`, `.yamllint.yml`, and `buf.yaml` so Docker, YAML, and proto validation run from explicit checked-in settings.
- Added `scripts/quality/infra-check.sh` as the canonical repo-root infra gate, with full-repo and staged/targeted modes for Dockerfiles, shell scripts, proto files, Helm validation, and plain YAML surfaces.
- Added `scripts/quality/rust-wsl-check.sh` as the honest Windows-to-WSL Rust verification wrapper, including the required cargo gates plus a clear failure path when WSL is unavailable.
- Extended `package.json` with stable root commands: `lint:infra`, `lint:infra:staged`, and `verify:rust:wsl`.
- Verified structurally with shell syntax checks, token/assertion checks against the helper scripts, a no-op staged smoke test, and failure-path smoke tests for missing local infra tooling and unavailable WSL.

Key files:
- `scripts/quality/infra-check.sh`
- `scripts/quality/rust-wsl-check.sh`
- `package.json`
- `.hadolint.yaml`
- `.yamllint.yml`
- `buf.yaml`

# Plan 32-02 Summary

- Added an `infra-quality` job to `.github/workflows/ci-quality-security.yml` so infra and deployment artifacts now have first-class CI coverage alongside the existing Rust and JS/TS gates.
- The new job installs `shellcheck`, `yamllint`, `hadolint`, `buf`, and `helm` on `ubuntu-latest`, then runs the shared repo-root `npm run lint:infra` command instead of duplicating logic in the workflow.
- Kept the existing `quality`, `security`, `control-plane`, and `dashboard` jobs intact so Phase 32 expands coverage without widening into unrelated CI refactors.
- Verified structurally with a workflow content check for the new job name, installed toolchain, and canonical `lint:infra` invocation.

Key files:
- `.github/workflows/ci-quality-security.yml`
- `package.json`
- `scripts/quality/infra-check.sh`

# Plan 32-03 Summary

- Made Husky the single active local hook path by updating `.husky/pre-commit` to run `lint-staged` plus staged infra checks, and by adding `.husky/pre-push` for the heavier full infra and WSL-backed Rust gates.
- Reworked `.claude/hooks/pre-commit.sh` and `.claude/hooks/pre-push.sh` into helper entry points that mirror the Husky behavior instead of competing with it.
- Rewrote `.claude/hooks/README.md` so it now documents the actual Husky-first workflow, the Windows + WSL Rust expectation, and the fact that local infra hooks fail loudly when required CLIs are missing.
- Verified structurally with content checks on the Husky hooks and README, plus smoke tests that showed the staged infra command no-ops cleanly when no infra files are selected and the WSL wrapper reports an honest unavailable-WSL error on this host.

Key files:
- `.husky/pre-commit`
- `.husky/pre-push`
- `.claude/hooks/pre-commit.sh`
- `.claude/hooks/pre-push.sh`
- `.claude/hooks/README.md`
