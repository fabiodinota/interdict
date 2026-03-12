---
id: S01
parent: M002
milestone: M002
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
# S01: Identity Foundation

**# Phase 7 Plan 1: Schema, Permissions Model, and Identity Seed Summary**

## What Happened

# Phase 7 Plan 1: Schema, Permissions Model, and Identity Seed Summary

**Drizzle auth schema (api_keys, user_departments, role_permissions), 5-role RBAC permission module with hierarchy + wildcard support, and idempotent identity seed bootstrapping 5 user roles, 2 service accounts, and SHA-256 hashed API keys**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T23:04:31Z
- **Completed:** 2026-03-01T23:08:26Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Three new Drizzle schema tables (api_keys, user_departments, role_permissions) with correct FKs, indexes, and constraints
- Permission module with 5-role hierarchy, 14 permission constants, DEFAULT_PERMISSIONS matrix, and three helper functions -- 27 unit tests passing
- Identity seed script bootstrapping 4 departments, 5 users covering all roles, 2 service accounts, API keys (SHA-256 hashed), and default role permissions
- Drizzle migration generated (0001_white_dust.sql) adding all new tables and is_service column

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth schema tables and permission model** (TDD)
   - `366b81d` (test) -- Failing permission model tests (RED phase)
   - `a584c54` (feat) -- Auth schema, permissions implementation, migration (GREEN phase)
2. **Task 2: Create identity seed script and JSON data** - `a3322ae` (feat)

_Note: Task 1 followed TDD with test -> feat commits_

## Files Created/Modified
- `control-plane/src/db/schema/auth.ts` -- api_keys, userDepartments, rolePermissions table definitions
- `control-plane/src/db/schema/organization.ts` -- Added is_service boolean to users table
- `control-plane/src/db/schema/index.ts` -- Re-export of new auth tables
- `control-plane/src/modules/auth/permissions.ts` -- Role hierarchy, permission constants, hasPermission helper
- `control-plane/src/modules/auth/permissions.test.ts` -- 27 unit tests for permission model
- `control-plane/src/seed/identity-seed.json` -- Bootstrap data for departments, users, service accounts, permissions
- `control-plane/src/seed/run-seed.ts` -- Added seedIdentity() before existing regulatory seed
- `control-plane/src/db/migrations/0001_white_dust.sql` -- SQL migration for new tables and columns

## Decisions Made
- Used flat role_permissions table (role, permission, is_granted) instead of JSON column -- more queryable and supports per-permission granularity
- Permissions do not auto-inherit via the default map; hierarchy is only for role-level comparisons (e.g., "does user have at least Policy Admin level?")
- Kept existing department_id FK on users as primary/display department; user_departments join table is the authoritative source for access scope
- Service accounts assigned super_admin role with is_service=true for internal system identification
- API key prefix stored as first 16 chars ("ik_live_XXXXXXXX") for dashboard display without revealing full key

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in src/index.ts (Elysia error handler types) are unrelated to this plan's changes and were left untouched

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Auth schema tables ready for Plan 02 (auth middleware macro and API key management endpoints)
- Permission module exports ready for route guard integration in Plan 03
- Seed script ready to bootstrap identity data on first deployment
- Migration ready to apply with `bun run db:migrate` when database is available

---
*Phase: 07-identity-foundation*
*Completed: 2026-03-02*

# Phase 7 Plan 2: Auth Middleware and API Key Endpoints Summary

**Elysia auth macro plugin with Bearer token validation, SHA-256 key lookup, role hierarchy enforcement, and 4 API key management endpoints (create/list/revoke/whoAmI)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T23:11:21Z
- **Completed:** 2026-03-01T23:15:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AuthError (401) and ForbiddenError (403) error classes added to shared utilities
- Auth service with authenticateByApiKey (SHA-256 hash lookup + user/department fetch), createApiKey (ik_live_ prefixed, plaintext returned once), revokeApiKey (soft delete), listApiKeys (cursor pagination, never exposes hash), and whoAmI methods
- Auth macro plugin using Elysia named macro pattern with resolve for per-route Bearer token extraction, key validation, and role hierarchy check
- Four protected API endpoints: GET /me, POST /keys (201), GET /keys (paginated), DELETE /keys/:keyId (204)
- TypeBox validation schemas for all auth endpoint inputs and responses
- 12 unit tests for hashApiKey and generateApiKey passing (39 total across auth module)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth error classes, service, and model** - `3ad9074` (feat)
2. **Task 2: Create auth middleware macro and API endpoints** - `96e174b` (feat)

## Files Created/Modified
- `control-plane/src/shared/utilities.ts` -- Added AuthError (401) and ForbiddenError (403) classes
- `control-plane/src/modules/auth/service.ts` -- Auth business logic: key gen/hash, authenticate, CRUD, whoAmI
- `control-plane/src/modules/auth/service.test.ts` -- 12 unit tests for hashApiKey and generateApiKey
- `control-plane/src/modules/auth/model.ts` -- TypeBox schemas for auth endpoint validation
- `control-plane/src/modules/auth/middleware.ts` -- Elysia auth macro plugin with resolve-based user injection
- `control-plane/src/modules/auth/index.ts` -- Auth API endpoints (4 routes under /api/v1/auth)

## Decisions Made
- Used Elysia named macro `.macro("auth", ...)` with resolve pattern per CONTEXT.md locked decision -- this injects the authenticated user into route context
- Handler parameters typed as `ctx: any` because Elysia macro resolve types don't fully propagate through TypeScript's type system to handler context
- Auth service created inside resolve/derive (not at plugin level) to use the decorated `store.db` instance -- follows existing policiesModule and auditModule patterns
- Super Admins can revoke any key and list all keys via `?all=true`; other roles scoped to their own keys only
- `lastUsedAt` on API keys updated fire-and-forget (not awaited) to avoid adding latency to the authentication hot path

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `src/index.ts` (Elysia error handler types) remain unrelated to this plan's changes and were left untouched (documented in 07-01-SUMMARY)

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Auth middleware ready for Plan 03 to apply route guards to all existing modules (policies, vendors, regulatory, audit)
- authModule ready to be wired into `src/index.ts` in Plan 03
- AuthenticatedUser type ready for department-scoped data filtering in Plan 03

## Self-Check: PASSED

All 6 created/modified files verified present on disk. Both task commits (3ad9074, 96e174b) verified in git log.

---
*Phase: 07-identity-foundation*
*Completed: 2026-03-02*

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
