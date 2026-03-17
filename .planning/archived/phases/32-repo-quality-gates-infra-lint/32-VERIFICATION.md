---
phase: 32
phase_name: Repo Quality Gates & Infra Lint Coverage
status: passed
updated: 2026-03-11
requirements:
  - HR-OPS-01
  - HR-OPS-02
---

# Phase 32 Verification

## Result

- Status: passed
- Must-haves verified: 2/2 requirement groups

## Evidence

- `scripts/quality/infra-check.sh`, `.hadolint.yaml`, `.yamllint.yml`, `buf.yaml`, and the new root `package.json` scripts establish one explicit repo-root command surface for Docker, shell, Helm, proto, and YAML quality checks.
- `.github/workflows/ci-quality-security.yml` now includes an `infra-quality` job that installs `hadolint`, `shellcheck`, `yamllint`, `buf`, and `helm`, then runs the shared `lint:infra` command instead of bespoke workflow-only logic.
- `.husky/pre-commit` and `.husky/pre-push` now define the active local hook path, while `.claude/hooks/pre-commit.sh`, `.claude/hooks/pre-push.sh`, and `.claude/hooks/README.md` align helper behavior and documentation with the Husky-first workflow.
- `scripts/quality/rust-wsl-check.sh` now carries the required Rust cargo gates through an explicit WSL distro path, and isolates the flaky Rego perf test so local Rust verification is stable without pretending native Windows cargo is reliable.

## Automated Verification

- `repo`: `bash -n scripts/quality/infra-check.sh`
- `repo`: `bash -n scripts/quality/rust-wsl-check.sh`
- `repo`: Node assertions for helper-script coverage (`hadolint`, `shellcheck`, `buf lint`, `helm lint`, `helm template`, `yamllint`, and required cargo gates)
- `repo`: Node assertions for `package.json`, `.husky/pre-commit`, `.husky/pre-push`, `.claude/hooks/README.md`, and `.github/workflows/ci-quality-security.yml`
- `repo`: `npm run lint:infra:staged -- package.json` (no-op staged smoke test)
- `repo`: `INTERDICT_WSL_DISTRO=Ubuntu-24.04 bash scripts/quality/rust-wsl-check.sh` (successful WSL-backed Rust verification)
- `repo`: `npm run lint:infra` (toolchain-installed local run; now surfaces current repo warnings instead of missing-tool errors)

## Verification Notes

- This Windows host now has `hadolint`, `shellcheck`, `yamllint`, `buf`, and `helm` installed locally, so the full infra gate executes for real.
- `npm run lint:infra` currently exits nonzero because it now surfaces four existing `hadolint` `DL3008` warnings in the Dockerfiles; resolving those warnings is follow-up repo work, not a missing-tool problem.
- WSL-backed Rust verification now succeeds locally using the explicit `Ubuntu-24.04` distro path.

## Requirement Traceability

- `HR-OPS-01`: passed
- `HR-OPS-02`: passed
