---
id: T01
parent: S01
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
# T01: Plan 01

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
