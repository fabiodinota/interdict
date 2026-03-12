# Phase 30: Secret, Session, and Seed Hardening - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Source:** Direct user approval of the default v1.4 split during post-assessment planning

<domain>
## Phase Boundary

Phase 30 focuses only on the remaining auth- and secret-handling gaps from the latest codebase assessment:

- plaintext API key exposure in the control-plane seed/bootstrap flow
- weak request validation at the dashboard login boundary
- the dashboard's current practice of persisting the raw API key in the session cookie

This phase is hardening only. No new end-user product features.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Use the default v1.4 phase split approved by the user.
- Phase 30 covers secret, session, and seed hardening only.
- Prioritize the current High finding in seeding and the auth/session boundary hardening work identified in the dashboard.
- Preserve the BFF + httpOnly-cookie architecture; improve it rather than moving auth credentials client-side.
- Do not widen scope into deployment TLS, ClickHouse scaling, infra linting, or generic warning cleanup in this phase.

### Claude's Discretion
- Choose the schema validation library/pattern for the dashboard login route.
- Choose the safest session-token mechanism that fits the existing dashboard/control-plane architecture.
- Decide how much seed/bootstrap UX to preserve while removing plaintext secret output.

</decisions>

<specifics>
## Specific Ideas

- Likely files: `control-plane/src/seed/run-seed.ts`, `dashboard/src/app/api/auth/login/route.ts`, `dashboard/src/lib/auth.ts`, related dashboard auth tests.
- Prefer changes that keep existing operator workflows understandable while removing raw-secret handling.
- The latest assessment explicitly called out the session cookie storing the raw API key as a medium-priority weakness.

</specifics>

<deferred>
## Deferred Ideas

- Configurable kernel distribution TLS server name
- ClickHouse `event_date` partition-pruning fixes
- Repo-wide infra lint coverage (`hadolint`, `helm lint`, `buf lint`, `shellcheck`, `yamllint`)
- Control-plane warning burn-down
- Next 16 `middleware` -> `proxy` cleanup
- Planning/state doc synchronization and untracking local settings

</deferred>

---

*Phase: 30-secret-session-seed-hardening*
*Context gathered: 2026-03-11 via direct user approval of default v1.4 split*
