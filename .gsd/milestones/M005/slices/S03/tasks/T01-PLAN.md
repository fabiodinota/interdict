# T01: 32-repo-quality-gates-infra-lint-coverage 01

**Slice:** S03 — **Milestone:** M005

## Description

Create the canonical repo-root quality commands and config files that Phase 32 CI and local hooks will build on.

Purpose: satisfy the explicit-tooling direction in `HR-OPS-01` and `HR-OPS-02` before wiring those checks into CI and Husky.
Output: root configs plus reusable infra-lint and WSL-Rust verification commands.

## Must-Haves

- [ ] The repo has one explicit command surface for infra-quality checks instead of relying on undocumented one-off commands.
- [ ] Docker, shell, Helm, proto, and plain-YAML validation can be run from the repo root without linting Helm templates as raw YAML.
- [ ] Windows developers have an honest WSL-backed Rust verification command that matches the repo's required cargo gates.

## Files

- `package.json`
- `.hadolint.yaml`
- `.yamllint.yml`
- `buf.yaml`
- `scripts/quality/infra-check.sh`
- `scripts/quality/rust-wsl-check.sh`
