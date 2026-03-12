# T02: 33-warning-burndown-next16-project-truth 02

**Slice:** S04 — **Milestone:** M005

## Description

Finish the dashboard cleanup that Next 16 and the current React Compiler warnings are still surfacing.

Purpose: satisfy the framework-cleanup half of `HR-MAINT-01` by closing the visible Next 16 warnings and tightening the two remaining TanStack Table warning hotspots.
Output: Next 16-compliant proxy wiring, explicit Turbopack root config, and cleaned-up audit/review tables.

## Must-Haves

- [ ] The dashboard no longer emits the known Next 16 migration warnings during build.
- [ ] Session gating still redirects anonymous users away from protected pages after the `middleware` to `proxy` migration.
- [ ] The two surfaced TanStack Table / React Compiler warnings are either removed or reduced by targeted component cleanup without changing page behavior.

## Files

- `dashboard/next.config.ts`
- `dashboard/src/middleware.ts`
- `dashboard/src/proxy.ts`
- `dashboard/src/__tests__/middleware.test.ts`
- `dashboard/src/components/audit/AuditTable.tsx`
- `dashboard/src/components/reviews/ReviewQueue.tsx`
