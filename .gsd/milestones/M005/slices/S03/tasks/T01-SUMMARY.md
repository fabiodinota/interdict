---
id: T01
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
# T01: 32-repo-quality-gates-infra-lint-coverage 01

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
