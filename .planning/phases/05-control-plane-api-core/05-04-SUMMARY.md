---
phase: 05-control-plane-api-core
plan: 04
subsystem: api
tags: [clickhouse, audit-trail, cursor-pagination, sse, materialized-views, batch-enrichment, typebox]

# Dependency graph
requires:
  - phase: 05-control-plane-api-core
    provides: Elysia server scaffold, PostgreSQL schemas (users, vendors, policies), ClickHouse client, shared utilities (pagination, envelope)
provides:
  - ClickHouse query builders with parameterized queries and cursor pagination
  - Batch enrichment of audit records with PostgreSQL metadata
  - Audit trail search REST endpoint with filtering and pagination
  - SSE streaming endpoint for real-time audit events
  - Aggregate stats endpoints (violations, vendor usage, department summary) from materialized views
affects: [05-05, 08-dashboard-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [clickhouse-parameterized-queries, cursor-pagination-with-date-pruning, batch-enrichment-no-n+1, sse-polling-generator, materialized-view-aggregates]

key-files:
  created:
    - control-plane/src/modules/audit/model.ts
    - control-plane/src/modules/audit/queries.ts
    - control-plane/src/modules/audit/queries.test.ts
    - control-plane/src/modules/audit/enrichment.ts
    - control-plane/src/modules/audit/enrichment.test.ts
    - control-plane/src/modules/audit/service.ts
    - control-plane/src/modules/audit/index.ts
  modified: []

key-decisions:
  - "Explicit column list in ClickHouse queries excludes prompt_text and response_text per Invariant 6"
  - "Default 7-day date range filter when no from_date specified for partition pruning"
  - "Batch enrichment with 3 parallel PostgreSQL queries (users, vendors, policies) per page"
  - "SSE polling at 2.5-second intervals against ClickHouse for near-real-time events"
  - "Generator function pattern with typed any for SSE context to avoid Elysia generic complexity"

patterns-established:
  - "ClickHouse queries: always parameterized ({param:Type} syntax), always date-bounded, never SELECT *"
  - "Batch enrichment: collect unique IDs from result set, batch-query PostgreSQL, map back (no N+1)"
  - "Cursor pagination: encode(timestamp|bundle_id) as base64url, fetch limit+1 for hasMore detection"
  - "SSE streaming: async generator function yielding { event, data } objects, Elysia auto-detects as SSE"
  - "Materialized view queries: direct queries against mv_hourly_violations, mv_vendor_usage, mv_department_summary"

requirements-completed: [CTRL-07]

# Metrics
duration: 4m49s
completed: 2026-03-01
---

# Phase 5 Plan 04: Audit Trail Query API Summary

**ClickHouse audit trail search with cursor pagination, PostgreSQL batch enrichment, SSE real-time streaming, and materialized view aggregate endpoints**

## Performance

- **Duration:** 4m 49s
- **Started:** 2026-03-01T04:16:47Z
- **Completed:** 2026-03-01T04:21:36Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Audit trail search with 7 filter dimensions (vendor, department, actor, policy_action, date range, kernel_id) and cursor-based pagination across millions of records
- All ClickHouse queries use parameterized syntax with explicit column lists (excluding prompt_text and response_text per Invariant 6)
- Batch enrichment resolves user display names, vendor display names, and policy names from PostgreSQL without N+1 queries
- SSE streaming endpoint delivers real-time audit events by polling ClickHouse every 2.5 seconds
- Aggregate endpoints query existing materialized views for violations, vendor usage, and department summaries
- 15 tests covering query construction, cursor pagination, filter combinations, enrichment correctness, and missing reference handling

## Task Commits

Each task was committed atomically:

1. **Task 1: ClickHouse query builders and batch enrichment (TDD)** - RED: `edd90d2` (test), GREEN: `594ae78` (feat)
2. **Task 2: Audit trail REST endpoints and SSE streaming** - `d81538c` (feat)

## Files Created/Modified
- `control-plane/src/modules/audit/model.ts` - TypeBox schemas for audit filters, query params, and record types
- `control-plane/src/modules/audit/queries.ts` - ClickHouse parameterized query builders with cursor pagination
- `control-plane/src/modules/audit/queries.test.ts` - 11 tests for query builders and materialized view queries
- `control-plane/src/modules/audit/enrichment.ts` - Batch PostgreSQL enrichment for user, vendor, and policy names
- `control-plane/src/modules/audit/enrichment.test.ts` - 4 tests for enrichment correctness and edge cases
- `control-plane/src/modules/audit/service.ts` - AuditService business logic combining queries and enrichment
- `control-plane/src/modules/audit/index.ts` - Elysia plugin with search, stream, and stats endpoints

## Decisions Made
- **Invariant 6 compliance:** ClickHouse queries use an explicit 21-column list that excludes `prompt_text` and `response_text` to never expose plaintext prompts/responses through the API layer.
- **Default date range:** When no `from_date` filter is provided, queries default to the last 7 days to ensure partition pruning (Pitfall 3 mitigation).
- **SSE polling interval:** 2.5 seconds chosen as a balance between near-real-time updates and ClickHouse query load. Adjustable via constant.
- **Generator function `any` type annotation:** The SSE generator uses `({ query, auditService }: any)` to avoid deep Elysia generic inference complexity. Type safety is maintained through the service layer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Module is exported but not wired into the main app (wiring handled by Plan 05-05).

## Next Phase Readiness
- Audit module exports `auditModule` Elysia plugin ready for `.use()` wiring in Plan 05-05
- All query builders and enrichment functions are independently importable for testing
- SSE streaming endpoint ready for dashboard integration in Phase 8

## Self-Check: PASSED

All 7 created files verified present on disk. All 3 task commits (edd90d2, 594ae78, d81538c) verified in git log.

---
*Phase: 05-control-plane-api-core*
*Completed: 2026-03-01*
