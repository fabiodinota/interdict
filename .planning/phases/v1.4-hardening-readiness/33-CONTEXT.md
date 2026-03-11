# Phase 33: Warning Burn-Down, Next 16 Cleanup & Project Truth - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Source:** Default v1.4 split approved by the user during post-assessment planning, updated with current post-Phase-32 repo state

<domain>
## Phase Boundary

Phase 33 focuses only on the remaining post-Phase-32 cleanup work:

- burn down remaining warning and formatter debt that is now clearly surfaced by the local/CI quality gates
- finish the Next 16 cleanup work still producing warnings
- align planning/tracking docs and local-config hygiene with the repo's actual committed state

This phase is maintenance/truth hardening only. No new end-user product features.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Use the approved default v1.4 phase split.
- Phase 33 covers warning burn-down, Next 16 cleanup, and project-truth cleanup only.
- Prioritize production-code and actively surfaced warnings over speculative cleanup.
- Treat tracked local-only config (`.claude/settings.local.json`) as repo-truth drift to resolve in this phase.
- Do not widen scope into new infra lint tooling, auth redesign, or deployment architecture changes.

### Claude's Discretion
- Choose the best plan split between control-plane warning debt, dashboard/Next 16 cleanup, and planning-doc/local-config truth updates.
- Decide how aggressively to reduce test-only warnings versus production-code warnings, as long as the phase materially improves the surfaced debt.
- Decide whether to eliminate or explicitly document any warning that is intentionally accepted.

</decisions>

<specifics>
## Specific Ideas

- Control-plane Biome summary currently reports:
  - 61 formatting errors
  - 39 warnings
  - warning classes: `noExplicitAny`, `noNonNullAssertion`, `noUnusedVariables`
- Dashboard currently reports:
  - 2 React Compiler warnings from TanStack Table usage
  - Next build warnings for `middleware` deprecation and incorrect `turbopack.root` inference
- Infra lint currently surfaces 4 `hadolint` `DL3008` warnings in Dockerfiles
- Planning/state truth gaps still present:
  - `.planning/ROADMAP.md` says Phases 30-32 completed "in working tree" even though they are committed
  - `.planning/STATE.md` uses the same wording
  - `.claude/settings.local.json` is still tracked despite being local-only config

</specifics>

<deferred>
## Deferred Ideas

- New feature work
- Additional deployment-mode E2E proof beyond the now-installed infra toolchain
- Broader architecture changes outside warning/truth cleanup

</deferred>

---

*Phase: 33-warning-burndown-next16-project-truth*
*Context gathered: 2026-03-11 via direct user approval of default v1.4 split and current post-Phase-32 repo state*
