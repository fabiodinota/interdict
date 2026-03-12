# T04: 33-warning-burndown-next16-project-truth 04

**Slice:** S04 — **Milestone:** M005

## Description

Close the remaining `control-plane` repo-wide check failure by normalizing the broad formatting drift that remained outside the original hotspot warning plan.

Purpose: finish the last unclosed `HR-MAINT-01` control-plane gap so the full `bun run check` command passes, not just the targeted hotspot files.
Output: Biome-normalized `control-plane` config and schema modules with the full repo check gate green.

## Must-Haves

- [ ] The remaining repo-wide `control-plane` formatting drift is normalized so `bun run check` succeeds instead of failing outside the original warning-hotspot files.
- [ ] Database schema and config modules still typecheck after the format cleanup, proving the gap closure did not regress imports or exports.
- [ ] Phase 33 warning cleanup remains additive: previously fixed hotspot warnings stay closed while the full repo gate now passes.

## Files

- `control-plane/src/config.ts`
- `control-plane/src/db/clickhouse.ts`
- `control-plane/src/db/postgres.ts`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/src/db/schema/department-overrides.ts`
- `control-plane/src/db/schema/index.ts`
- `control-plane/src/db/schema/organization.ts`
- `control-plane/src/db/schema/policies.ts`
- `control-plane/src/db/schema/regulatory.ts`
- `control-plane/src/db/schema/reviews.ts`
- `control-plane/src/db/schema/vendors.ts`
