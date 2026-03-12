---
id: T02
parent: S03
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
# T02: 32-repo-quality-gates-infra-lint-coverage 02

**# Plan 32-02 Summary**

## What Happened

# Plan 32-02 Summary

- Added an `infra-quality` job to `.github/workflows/ci-quality-security.yml` so infra and deployment artifacts now have first-class CI coverage alongside the existing Rust and JS/TS gates.
- The new job installs `shellcheck`, `yamllint`, `hadolint`, `buf`, and `helm` on `ubuntu-latest`, then runs the shared repo-root `npm run lint:infra` command instead of duplicating logic in the workflow.
- Kept the existing `quality`, `security`, `control-plane`, and `dashboard` jobs intact so Phase 32 expands coverage without widening into unrelated CI refactors.
- Verified structurally with a workflow content check for the new job name, installed toolchain, and canonical `lint:infra` invocation.

Key files:
- `.github/workflows/ci-quality-security.yml`
- `package.json`
- `scripts/quality/infra-check.sh`
