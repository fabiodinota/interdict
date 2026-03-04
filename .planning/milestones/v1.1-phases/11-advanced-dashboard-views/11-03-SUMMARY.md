---
phase: 11-advanced-dashboard-views
plan: 03
subsystem: api, ui, database
tags: [drizzle, elysia, react, tanstack-query, department-overrides, rbac, policy-management]

# Dependency graph
requires:
  - phase: 11-01
    provides: DepartmentEffectivePolicy type, sidebar nav item, Phase 11 type stubs
  - phase: 07-01
    provides: RBAC roles, userDepartments join table, role_permissions
provides:
  - department_policy_overrides Postgres table with unique (dept, policy) constraint
  - isMandatory column on policies table
  - DepartmentOverrideService with membership verification and mandatory enforcement
  - Elysia module at /api/v1/department-overrides (4 endpoints)
  - Department Policy Management page at /department-policies
  - PolicyOverrideTable with toggle switches, source badges, mandatory lock indicators
affects: [12-helm-sidecar-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [department-scoped-api-with-membership-check, optimistic-toggle-with-revert]

key-files:
  created:
    - control-plane/src/db/schema/department-overrides.ts
    - control-plane/src/modules/department-overrides/index.ts
    - control-plane/src/modules/department-overrides/service.ts
    - control-plane/src/modules/department-overrides/model.ts
    - dashboard/src/app/(dashboard)/department-policies/page.tsx
    - dashboard/src/components/department-policies/PolicyOverrideTable.tsx
    - dashboard/src/components/department-policies/MandatoryBadge.tsx
    - dashboard/src/hooks/use-department-policies.ts
  modified:
    - control-plane/src/db/schema/policies.ts
    - control-plane/src/db/schema/index.ts
    - control-plane/src/index.ts

key-decisions:
  - "Super admins and compliance officers bypass department membership check for override management"
  - "Upsert pattern (INSERT ON CONFLICT UPDATE) for override creation to simplify create/update flow"
  - "Setting mandatory=true auto-deletes existing disable-overrides to enforce policy everywhere"
  - "Optimistic toggle with revert on error for responsive UI"

patterns-established:
  - "Department-scoped API: verify membership via userDepartments before any department operation"
  - "Override upsert: unique constraint on (departmentId, policyId) with ON CONFLICT UPDATE"

requirements-completed: [DASH-09]

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 11 Plan 03: Department Policy Management Summary

**Department policy override API with mandatory enforcement and dashboard toggle UI using Drizzle upserts and optimistic TanStack Query mutations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T20:43:50Z
- **Completed:** 2026-03-03T20:48:10Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- department_policy_overrides table with unique constraint and cascade deletes
- isMandatory column on policies table with mandatory enforcement in service layer
- 4 API endpoints: effective policies, set override, remove override, toggle mandatory
- Server-side department membership verification on all department-scoped operations
- Dashboard page with toggle switches, source badges (Global/Department override), mandatory lock badges
- Compliance officer additional column to mark/unmark policies as mandatory
- Summary stats (total, overrides, mandatory) and empty states

## Task Commits

Each task was committed atomically:

1. **Task 1: Department policy overrides schema and control plane API** - `8ef6646` (feat)
2. **Task 2: Department Policy Management dashboard page** - `95fbe9e` (feat)

## Files Created/Modified
- `control-plane/src/db/schema/department-overrides.ts` - department_policy_overrides table definition
- `control-plane/src/db/schema/policies.ts` - Added isMandatory column
- `control-plane/src/db/schema/index.ts` - Export departmentPolicyOverrides
- `control-plane/src/modules/department-overrides/model.ts` - TypeBox schemas for 4 endpoints
- `control-plane/src/modules/department-overrides/service.ts` - Override CRUD with membership and mandatory checks
- `control-plane/src/modules/department-overrides/index.ts` - Elysia plugin with auth guards
- `control-plane/src/index.ts` - Wire departmentOverridesModule
- `dashboard/src/hooks/use-department-policies.ts` - TanStack Query hooks for override operations
- `dashboard/src/components/department-policies/MandatoryBadge.tsx` - Lock badge with tooltip
- `dashboard/src/components/department-policies/PolicyOverrideTable.tsx` - Policy table with toggles
- `dashboard/src/app/(dashboard)/department-policies/page.tsx` - Department Policies page

## Decisions Made
- Super admins and compliance officers bypass department membership check for flexibility
- Upsert pattern (INSERT ON CONFLICT UPDATE) simplifies create/update into single operation
- When setting mandatory=true, all existing disable-overrides for that policy are auto-deleted
- Optimistic toggle pattern: UI updates immediately, reverts on mutation error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Department override API ready for integration testing with Docker Compose
- Schema migration needed (drizzle-kit push) when deploying to actual database
- Plans 11-02 and 11-04 can proceed independently

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (8ef6646, 95fbe9e) confirmed in git history.

---
*Phase: 11-advanced-dashboard-views*
*Completed: 2026-03-03*
