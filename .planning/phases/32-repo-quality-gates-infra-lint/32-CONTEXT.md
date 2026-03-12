# Phase 32: Repo Quality Gates & Infra Lint Coverage - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Source:** Default v1.4 split approved by the user during post-assessment planning

<domain>
## Phase Boundary

Phase 32 focuses only on extending quality gates from app code into the rest of the repository:

- Dockerfiles and shell entrypoints/scripts
- Helm chart and YAML deployment/config artifacts
- proto definitions and generation/lint surfaces
- local developer hook workflows, especially across Windows + WSL Rust and JS/TS surfaces

This phase is process/deployability hardening only. No new end-user product features.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Use the approved default v1.4 phase split.
- Phase 32 covers repo quality gates and infra lint coverage only.
- Extend CI and local hook coverage to infra/deployment artifacts rather than further app-code lint work.
- Respect the current Windows host constraint: Rust verification is reliable in WSL2, not native MSVC.
- Prefer explicit, reproducible tooling over undocumented manual expectations.

### Claude's Discretion
- Choose the exact lint/validation toolchain for Docker, shell, Helm, proto, and YAML.
- Decide whether to centralize local checks into Husky/root scripts, `.claude/hooks`, or both, as long as the final workflow is coherent.
- Decide which checks should run pre-commit vs pre-push vs CI-only to keep local feedback usable.

</decisions>

<specifics>
## Specific Ideas

- Active git hook path is `.husky/_`; `.claude/hooks/` exists but is not the active git hook directory.
- Root `package.json` currently runs `lint-staged` for JS/TS, but Rust staged files only emit a reminder.
- CI currently covers Rust, cargo-audit/Trivy, control-plane Biome/type/tests, and dashboard format/lint/test/build.
- CI currently does **not** run `hadolint`, `shellcheck`, `helm lint/template`, `yamllint`, or `buf lint`.
- Repo surfaces in scope:
  - `docker/*/Dockerfile`
  - `docker/**/*.sh`, `scripts/**/*.sh`
  - `helm/interdict/**/*.{yaml,yml,tpl}`
  - `proto/**/*.proto`

</specifics>

<deferred>
## Deferred Ideas

- Control-plane/dashboard warning burn-down
- Next 16 `middleware` -> `proxy` cleanup
- Planning/state doc synchronization and untracking local settings
- Additional deployment-mode E2E proof beyond lint/render validation

</deferred>

---

*Phase: 32-repo-quality-gates-infra-lint-coverage*
*Context gathered: 2026-03-11 via direct user approval of default v1.4 split*
