---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Pilot Ready
status: in-progress
stopped_at: Completed 09-02 (Dashboard Home Screen & Real-Time Charts)
last_updated: "2026-03-03T04:52:00Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 9
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model
**Current focus:** v1.1 Pilot Ready -- Phase 9 in progress (Dashboard Core Views)

## Current Position

Phase: 9 of 12 (Dashboard Core Views) -- IN PROGRESS
Plan: 3 of 4 (next: Policy List & Visual Policy Builder)
Status: Plan 09-02 complete
Last activity: 2026-03-03 -- Completed 09-02 (Dashboard Home Screen & Real-Time Charts)

Progress: [#####-----] 50% (2/4 plans in Phase 9)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 28 (v1.0)
- Total execution time: ~4 days
- Average: ~7 plans/day

**v1.1:**
- Plans completed: 7
- Plans remaining: 2 (Phase 9: 2 remaining)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 07    | 01   | 4min     | 2     | 8     |
| 07    | 02   | 4min     | 2     | 6     |
| 07    | 03   | 7min     | 2     | 7     |
| 08    | 01   | 3min     | 2     | 11    |
| 08    | 02   | 3min     | 2     | 3     |
| 09    | 01   | 7min     | 2     | 56    |
| 09    | 02   | 6min     | 2     | 8     |

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0 decisions archived in PROJECT.md Key Decisions table (12 decisions).

v1.1 decisions:
- Roadmap: 6-phase structure derived from 21 requirements across 4 categories (Identity, Dashboard Core, Dashboard Advanced, Deployment)
- Roadmap: API key auth + RBAC first (Phase 7) because all dashboard routes and deployment artifacts depend on auth
- Roadmap: Docker Compose (Phase 8) before dashboard (Phase 9) so every UI feature can be smoke-tested end-to-end
- Roadmap: SAML/mTLS/key-rotation (Phase 10) deferred from identity foundation because law firm pilot uses API keys; bank pilot needs SAML
- Roadmap: Helm/sidecar/CA-cert (Phase 12) last because chart needs stable images and stable mTLS config
- 07-01: Used flat role_permissions table (role, permission, is_granted) instead of JSON column for queryability
- 07-01: Permissions do not auto-inherit via the default map; hierarchy is only for role-level comparisons
- 07-01: Kept existing department_id FK on users as primary department; user_departments join table is authoritative for access scope
- 07-01: Service accounts assigned super_admin role with is_service flag for internal identification
- 07-02: Used Elysia named macro .macro("auth", ...) with resolve pattern for per-route auth injection
- 07-02: Handler ctx typed as any because macro resolve types don't propagate through TS type system
- 07-02: Auth service created inside resolve/derive (not plugin level) to use decorated store.db
- 07-02: lastUsedAt updated fire-and-forget to avoid adding latency to auth hot path
- 07-03: Auth guards use role hierarchy: write=policy_admin+, read=read_only_auditor+
- 07-03: Department scoping at ClickHouse query level (WHERE IN clause) not post-fetch filtering
- 07-03: Stats violations and vendor-usage not department-scoped -- deferred to Phase 11
- 07-03: Out-of-scope department filter requests yield zero results via __no_access__ sentinel
- 08-01: Bare ${VAR} in TOML template with shell defaults in entrypoint before envsubst (envsubst ignores :-default syntax)
- 08-01: Control plane runs as default user (not non-root) to simplify volume permissions; Helm chart (Phase 12) enforces securityContext
- 08-01: Proto files at /proto/ in control plane image matching ../../../../proto/ relative path from gRPC module __dirname
- 08-01: OPA pinned to v1.4.2 via Dockerfile ARG for reproducible builds
- 08-01: No HEALTHCHECK in Rust Dockerfiles (TLS proxy/gRPC); health checks at compose level only
- 08-01: cmake installed in kernel builder stage for aws-lc-rs compilation
- 08-02: Removed env_file from kernel service -- explicit environment block prevents unexpected variable leaking
- 08-02: Rust 2024 edition requires unsafe blocks for env var mutation in tests; run with --test-threads=1
- 08-02: Dashboard exposed on port 8080 for dev convenience; minio-init uses $$ shell escaping for runtime vars
- 09-01: BFF proxy pattern -- all client API calls route through /api/proxy/[...path] which injects Bearer token from httpOnly cookie
- 09-01: Next.js 15 (not 16) for production reliability; standalone output for Docker
- 09-01: Dashboard port 3001 internal / 8080 external to avoid conflict with control plane on 3000
- 09-01: class-variance-authority added as shadcn/ui dependency (required by generated badge component)
- 09-02: KPI data derived from violations stats endpoint (sum all for requests, block+redact for violations) to avoid new API endpoints
- 09-02: useSSE hook uses module-level counter for event IDs to avoid SSR hydration mismatch with crypto.randomUUID
- 09-02: SSE hook reconnects after 5s on error with mountedRef guard to prevent state updates after unmount
- 09-02: Violation chart pivots flat records into per-hour rows; vendor chart aggregates per-hour-per-model into per-vendor totals

### Research Flags

- Phase 10: samlify on Bun runtime needs isolated PoC before implementation
- Phase 10: mTLS cert bootstrap automation needs spike
- Phase 11: Anomaly detection ClickHouse query patterns need prototyping
- Phase 9: Policy Builder Rego generation from visual inputs needs focused spike

### Pending Todos

None yet.

### Blockers/Concerns

None -- Phase 9 in progress.

## Session Continuity

**Last session:** 2026-03-03T04:52:00Z
**Stopped at:** Completed 09-02 (Dashboard Home Screen & Real-Time Charts)
**Resume file:** .planning/phases/09-dashboard-core-views/09-02-SUMMARY.md
**Next action:** Execute 09-03 (Policy List & Visual Policy Builder)
