# Phase 33 Research: Warning Burn-Down, Next 16 Cleanup & Project Truth

**Phase:** 33
**Name:** Warning Burn-Down, Next 16 Cleanup & Project Truth
**Date:** 2026-03-11
**Status:** Complete

## Objective

Research how to finish v1.4 by reducing the remaining surfaced warning debt, cleaning up Next 16 migration warnings, and making the planning/docs/config state match reality.

## Current Warning / Truth Inventory

### 1. Control-plane warning debt is now concrete and sizable

Current Biome summary for `control-plane/src`:

- 61 formatting errors
- 39 warnings

Warning classes:

- `lint/suspicious/noExplicitAny` -> 29 warnings
- `lint/style/noNonNullAssertion` -> 9 warnings
- `lint/correctness/noUnusedVariables` -> 1 warning

Hotspots:

- `src/modules/reports/service.test.ts`
- `src/modules/vendors/service.test.ts`
- `src/modules/policies/service.test.ts`
- `src/modules/audit/*.test.ts`
- a few production files still use non-null assertions in cursor logic (`auth/service.ts`, `policies/service.ts`, `vendors/service.ts`)

Important nuance:

- most `any` debt is in tests, but some `noNonNullAssertion` warnings are in production code
- there is also broad formatting drift (61 files needing formatting), likely due line-ending/format normalization rather than logic bugs

### 2. Dashboard warnings are small but precise

Current dashboard state:

- ESLint: 2 warnings, 0 errors
- Next build: 2 warnings, build succeeds

Warnings:

1. TanStack Table / React Compiler incompatibility
   - `dashboard/src/components/audit/AuditTable.tsx`
   - `dashboard/src/components/reviews/ReviewQueue.tsx`

2. Next 16 migration cleanup
   - workspace-root inference warning due multiple lockfiles
   - `middleware` convention deprecation -> should move to `proxy`

These are good Phase 33 targets because they are small, visible, and currently user-facing in the tool output.

### 3. Infra gate now exposes real Dockerfile warnings

`npm run lint:infra` now runs for real and currently reports 4 `hadolint` `DL3008` warnings:

- `docker/control-plane/Dockerfile`
- `docker/evidence-collector/Dockerfile`
- `docker/kernel/Dockerfile` (2 occurrences)

These are exactly the kind of remaining surfaced warnings Phase 33 should decide to either fix or explicitly accept/document.

### 4. Project-truth drift still exists in planning files

Even after Phases 30-32 were committed, planning docs still say "completed in working tree":

- `.planning/ROADMAP.md`
- `.planning/STATE.md`

That is now inaccurate and should be corrected in Phase 33.

### 5. Local config tracking drift still exists

- `.claude/settings.local.json` remains tracked in git status

This is a straightforward project-truth / repo-hygiene fix and belongs naturally in this phase.

## Recommended Phase 33 Direction

### A. Split production-code warning cleanup from test-only cleanup

Recommended order:

1. eliminate production non-null assertions / real correctness warnings first
2. then reduce or remove test `any` debt and formatting drift

This keeps the phase focused on meaningful quality improvements before broad formatting churn.

### B. Finish Next 16 cleanup completely

Recommended changes:

- set `turbopack.root` in `dashboard/next.config.ts`
- migrate `dashboard/src/middleware.ts` to the `proxy` convention expected by Next 16
- re-run lint/build to confirm both build warnings are gone

For the TanStack Table warnings:

- either reduce them by restructuring the specific components if practical, or
- explicitly document them as accepted library-compat warnings if removal would require disproportionate UI churn

Given there are only two warnings, Phase 33 should at least attempt to isolate or resolve them.

### C. Decide whether Dockerfile warnings are Phase 33 or documented carry-forward

`DL3008` is legitimate, but pinning apt package versions can make Dockerfiles noisier and more brittle.

For Phase 33 planning, the likely options are:

1. fix all 4 warnings by pinning package versions where practical, or
2. explicitly configure/document them as accepted warnings if version pinning is not worth the maintenance cost

Because the new infra gate is now live, leaving them as raw warnings without a decision creates constant friction. Phase 33 should resolve that one way or the other.

### D. Make planning/docs reflect committed reality

Recommended cleanup:

- replace "completed in working tree" wording for Phases 30-32 with committed/completed wording
- update any stale last-updated notes that still describe pre-commit state
- untrack `.claude/settings.local.json` with `git rm --cached` and leave it ignored locally

## Likely Files To Touch

### Control-plane

- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/policies/service.ts`
- `control-plane/src/modules/vendors/service.ts`
- the main warning-heavy test files under `control-plane/src/modules/{audit,policies,reports,vendors}`
- many files may be reformatted once Phase 33 normalizes Biome output

### Dashboard

- `dashboard/next.config.ts`
- `dashboard/src/middleware.ts` -> likely rename to `dashboard/src/proxy.ts`
- `dashboard/src/components/audit/AuditTable.tsx`
- `dashboard/src/components/reviews/ReviewQueue.tsx`

### Infra / docs / repo truth

- `docker/control-plane/Dockerfile`
- `docker/evidence-collector/Dockerfile`
- `docker/kernel/Dockerfile`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.claude/settings.local.json` (untrack)

## Test / Verification Strategy

### Control-plane

- `cd control-plane && ./node_modules/.bin/biome check ./src`
- `cd control-plane && bunx tsc --noEmit`
- focused test runs if specific files are changed

### Dashboard

- `cd dashboard && npm run lint`
- `cd dashboard && npm run build`

### Infra

- `npm run lint:infra`

### Repo truth

- `git status` should no longer show `.claude/settings.local.json` as tracked dirty state
- planning docs should read as committed/completed rather than working-tree-only

## Common Pitfalls

1. **Do not let Biome formatting spill across unrelated files without intention.** If broad formatting is necessary, make it explicit in the plan.
2. **Do not “solve” Dockerfile warnings by disabling them without a clear rationale.**
3. **Do not leave the Next 16 warnings half-fixed.** `proxy` migration and `turbopack.root` should be treated as a pair.
4. **Do not forget tracked-local-config cleanup.** Repo truth is part of the phase goal, not an optional extra.
5. **Do not turn Phase 33 into a giant opportunistic sweep.** It should close the surfaced warning/truth loop, not reopen Phase 21-scale refactors.

## Planning Guidance

Phase 33 likely wants 3 plans:

1. control-plane warning/format burn-down
2. dashboard Next 16 + React-compiler warning cleanup
3. infra-warning decision + planning/doc/local-config truth cleanup

That split maps closely to the currently visible tool output and keeps the last phase easy to verify.
