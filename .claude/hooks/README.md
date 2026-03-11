# Hook Scripts

Husky is the active git hook system in this repo. The installed hooks live at `.husky/pre-commit` and `.husky/pre-push`.

This directory now holds helper scripts that mirror the Husky behavior for Claude Code/OpenCode integrations or manual invocation. It is not a second install path.

## Canonical Local Workflow

### `.husky/pre-commit`

- Runs `npx lint-staged` for the existing JS/TS formatting and lint fixes.
- Runs `npm run lint:infra:staged` so staged Dockerfiles, shell scripts, proto files, workflow YAML, `docker-compose.yml`, and Helm chart metadata or values get checked before commit.
- Stays intentionally fast; it does not run full-repo Rust or app test suites.

### `.husky/pre-push`

- Runs `npm run lint:infra` for the full repo infra-quality gate.
- Runs `npm run verify:rust:wsl` for the Rust gates required by `CLAUDE.md`.
- On Windows, `verify:rust:wsl` is expected to execute through WSL because native MSVC Rust verification remains unreliable on this host.

## Helper Entry Points

- `.claude/hooks/pre-commit.sh` mirrors `.husky/pre-commit`
- `.claude/hooks/pre-push.sh` mirrors `.husky/pre-push`

Use those helper scripts only when an automation entry point wants the same behavior outside Git's installed hook path.

## CI Relationship

- CI is the source of truth for deterministic repo validation.
- `.github/workflows/ci-quality-security.yml` runs the full `lint:infra` gate with installed copies of `hadolint`, `shellcheck`, `yamllint`, `buf`, and `helm`.
- Local infra-hook runs expect those same CLIs to be available when you change infra surfaces; the helper scripts fail loudly instead of silently skipping missing tools.
- Local hooks are optimized for developer feedback, not for replacing CI.

## Windows and WSL Notes

- Windows developers should have WSL available before relying on `.husky/pre-push`.
- `npm run verify:rust:wsl` prints a clear failure if `wsl.exe` is unavailable.
- Non-Windows hosts run the same Rust gates natively through `scripts/quality/rust-wsl-check.sh`.
