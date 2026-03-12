# T01: 33-warning-burndown-next16-project-truth 01

**Slice:** S04 — **Milestone:** M005

## Description

Burn down the remaining surfaced control-plane warning debt without widening into architectural refactors.

Purpose: satisfy `HR-MAINT-01` by fixing the production warnings first, then cleaning the specific test hotspots that currently dominate Biome output.
Output: production cursor logic without non-null assertions plus typed/refined test helpers in the current warning-heavy suites.

## Must-Haves

- [ ] Control-plane production pagination paths no longer rely on non-null assertions to build cursor filters.
- [ ] The main warning-heavy control-plane test suites no longer depend on broad `any` casts for local mocks and helpers.
- [ ] `control-plane` quality checks report materially less warning and formatting debt than the Phase 32 baseline.

## Files

- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/policies/service.ts`
- `control-plane/src/modules/vendors/service.ts`
- `control-plane/src/modules/reports/service.test.ts`
- `control-plane/src/modules/policies/service.test.ts`
- `control-plane/src/modules/vendors/service.test.ts`
- `control-plane/src/modules/audit/queries.test.ts`
- `control-plane/src/modules/audit/enrichment.test.ts`
