# T03: 11-advanced-dashboard-views 03

**Slice:** S05 — **Milestone:** M002

## Description

Department Policy Management UI -- enables department managers to view inherited policies and toggle non-mandatory ones on/off for their department, with clear visual distinction between global and overridden policies.

Purpose: Satisfies DASH-09 -- department managers need autonomy to adapt policy enforcement for their team while maintaining centralized control over critical regulatory policies.
Output: Postgres schema for overrides, control plane override API with department scoping, dashboard Department Policies page with toggle switches and mandatory lock indicators.

## Must-Haves

- [ ] "Department Manager can view all policies with their department's effective status (enabled/disabled)"
- [ ] "Department Manager can toggle non-mandatory inherited policies on/off for their department"
- [ ] "Mandatory policies show a lock indicator and cannot be disabled by department managers"
- [ ] "Policy list shows source labels distinguishing Global vs Department override"
- [ ] "Department managers cannot access other departments' overrides (server-side enforcement)"

## Files

- `control-plane/src/db/schema/department-overrides.ts`
- `control-plane/src/db/schema/index.ts`
- `control-plane/src/db/schema/policies.ts`
- `control-plane/src/modules/department-overrides/index.ts`
- `control-plane/src/modules/department-overrides/service.ts`
- `control-plane/src/modules/department-overrides/model.ts`
- `control-plane/src/index.ts`
- `dashboard/src/app/(dashboard)/department-policies/page.tsx`
- `dashboard/src/components/department-policies/PolicyOverrideTable.tsx`
- `dashboard/src/components/department-policies/MandatoryBadge.tsx`
- `dashboard/src/hooks/use-department-policies.ts`
