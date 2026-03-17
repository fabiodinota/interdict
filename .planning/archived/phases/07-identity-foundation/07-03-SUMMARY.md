---
phase: 07-identity-foundation
plan: 03
subsystem: auth
tags: [elysia, rbac, route-guards, department-scoping, clickhouse, middleware, api-key]

# Dependency graph
requires:
  - phase: 07-identity-foundation
    plan: 01
    provides: "users/departments/rolePermissions Drizzle tables, ROLE_HIERARCHY, roleHierarchyLevel/roleInheritsFrom helpers"
  - phase: 07-identity-foundation
    plan: 02
    provides: "authPlugin macro with resolve-based user injection, authModule with API key endpoints, AuthenticatedUser type with departmentIds"
  - phase: 05-control-plane-api-core
    provides: "Elysia server with policiesModule/vendorsModule/regulatoryModule/auditModule, shared utilities"
provides:
  - "All HTTP API routes (policies, vendors, regulatory, audit) protected by auth macro with role-based guards"
  - "Department-scoped audit data filtering via applyDepartmentScope helper"
  - "Multi-department IN clause support in ClickHouse queries (AuditTrailFilters.department_ids)"
  - "queryDepartmentSummary with departmentIds parameter for scoped summary views"
  - "Health endpoint remains public (no auth)"
affects: [08-docker-compose, 09-dashboard, 11-advanced-views]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Per-route auth macro options { auth: ['role_name'] }", "ctx: any handler pattern for macro-injected context", "Department scope injection at ClickHouse query level (WHERE IN clause)", "applyDepartmentScope private helper for scope enforcement"]

key-files:
  created: []
  modified:
    - "control-plane/src/index.ts"
    - "control-plane/src/modules/policies/index.ts"
    - "control-plane/src/modules/vendors/index.ts"
    - "control-plane/src/modules/regulatory/index.ts"
    - "control-plane/src/modules/audit/index.ts"
    - "control-plane/src/modules/audit/service.ts"
    - "control-plane/src/modules/audit/queries.ts"

key-decisions:
  - "Auth guards use role hierarchy: write operations require policy_admin+, read operations require read_only_auditor+"
  - "Department scoping applied at ClickHouse query level (WHERE IN clause) not post-fetch filtering per Research guidance"
  - "Stats violations and vendor-usage endpoints not department-scoped -- deferred to Phase 11 advanced views"
  - "Out-of-scope department filter requests yield zero results via __no_access__ sentinel value"

patterns-established:
  - "Route guard pattern: { auth: ['role_name'] } on each route options object"
  - "Department scope helper: applyDepartmentScope handles empty (full access), single, multi, and out-of-scope cases"
  - "ClickHouse Array parameter: department IN {dept_ids:Array(String)} for multi-department filtering"

requirements-completed: [IDENT-03, IDENT-04]

# Metrics
duration: 7min
completed: 2026-03-02
---

# Phase 7 Plan 3: Route Guards and Department-Scoped Audit Filtering Summary

**RBAC route guards on all API modules (read=auditor+, write=policy_admin+) with ClickHouse department-scoped IN clause filtering for audit search, stream, and department summary**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-01T23:19:47Z
- **Completed:** 2026-03-01T23:27:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- authPlugin and authModule wired into Elysia app in index.ts; health endpoint remains public
- All policy, vendor, and regulatory routes guarded with role-based auth (read=read_only_auditor+, write=policy_admin+)
- All audit routes guarded with read_only_auditor+; search, stream, and department-summary pass user.departmentIds for scope filtering
- AuditService.applyDepartmentScope handles full-visibility (empty departmentIds), single department, multi-department IN clause, and out-of-scope validation
- AuditTrailFilters extended with department_ids field; ClickHouse parameterized Array(String) IN clause for multi-department filtering
- queryDepartmentSummary accepts departmentIds for scoped summary views
- All 94 existing tests pass; no new TypeScript errors (only pre-existing Elysia error handler types)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire auth module and apply auth guards to all existing modules** - `9e5070a` (feat)
2. **Task 2: Implement department-scoped data filtering in audit queries** - `7a88296` (feat)

## Files Created/Modified
- `control-plane/src/index.ts` -- Added authPlugin and authModule imports/registration; added "auth" to MODULES array
- `control-plane/src/modules/policies/index.ts` -- Added authPlugin, auth guards on all 7 routes (read=read_only_auditor, write=policy_admin)
- `control-plane/src/modules/vendors/index.ts` -- Added authPlugin, auth guards on all 8 routes (read=read_only_auditor, write=policy_admin)
- `control-plane/src/modules/regulatory/index.ts` -- Added authPlugin, auth guards on all 6 routes (read=read_only_auditor, write=policy_admin)
- `control-plane/src/modules/audit/index.ts` -- Added authPlugin, auth guards on all 5 routes; pass user.departmentIds to search, stream, department-summary
- `control-plane/src/modules/audit/service.ts` -- Added applyDepartmentScope helper; updated search/streamEvents/getDepartmentSummary signatures
- `control-plane/src/modules/audit/queries.ts` -- Added department_ids to AuditTrailFilters; IN clause in queryAuditTrail and queryDepartmentSummary

## Decisions Made
- Auth guards use role hierarchy for minimum role checks: write operations require `policy_admin` (level 3+), read operations require `read_only_auditor` (level 1+ = any authenticated user)
- Department scoping applied at the ClickHouse query level via parameterized IN clause, not by filtering TypeScript arrays after fetching all records (per Research anti-pattern guidance)
- Stats violations and vendor-usage aggregate endpoints are NOT department-scoped in Phase 7 -- documented as known limitation for Phase 11 advanced views
- Out-of-scope department filter requests (user asks for a department they don't have access to) return zero results via an impossible `__no_access__` sentinel value rather than throwing an error

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `src/index.ts` (Elysia error handler types) remain unrelated to this plan's changes (documented in 07-01-SUMMARY, 07-02-SUMMARY)

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Full identity system operational: API key auth -> RBAC route guards -> department-scoped data filtering
- Phase 7 complete: all 3 plans delivered (schema+permissions, auth middleware+endpoints, route guards+scoping)
- Ready for Phase 8 (Docker Compose) -- all API endpoints now protected, seed file bootstrapping available
- Dashboard (Phase 9) can rely on auth infrastructure for login flows and role-based UI rendering
- Phase 11 advanced views will add department scoping to violations and vendor-usage aggregate endpoints

## Self-Check: PASSED

All 7 modified files verified present on disk. Both task commits (9e5070a, 7a88296) verified in git log.

---
*Phase: 07-identity-foundation*
*Completed: 2026-03-02*
