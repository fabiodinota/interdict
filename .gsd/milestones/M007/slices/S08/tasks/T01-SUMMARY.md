---
id: T01
parent: S08
milestone: M007
provides:
  - WCAG AA accessibility for 4 icon buttons (3 planned + 1 discovered)
  - vitest-axe test infrastructure with axe-core assertions on 6 components
  - Playwright smoke test WCAG AA assertion via @axe-core/playwright
key_files:
  - dashboard/src/__tests__/setup.ts
  - dashboard/src/components/dashboard/TimeRangeSelector.tsx
  - dashboard/src/components/vendors/ModelList.tsx
  - dashboard/src/components/layout/Sidebar.tsx
  - dashboard/src/components/policies/PolicyRow.tsx
  - dashboard/e2e/smoke.spec.ts
key_decisions:
  - Used expect.extend(matchers) instead of vitest-axe/extend-expect (empty dist file in v0.1.0)
  - Disabled color-contrast per-assertion via rules option rather than globally (more explicit)
  - Fixed bonus a11y violation in PolicyRow Switch (discovered by axe-core during step 8)
patterns_established:
  - axe-core assertion pattern: `const results = await axe(container, { rules: { "color-contrast": { enabled: false } } }); expect(results).toHaveNoViolations();`
  - Playwright WCAG AA pattern: `new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()` filtering critical/serious
observability_surfaces:
  - vitest-axe violations print rule ID, impact level, failing HTML snippet, and fix suggestions to test output
  - `npx vitest run --reporter=verbose` shows per-component a11y pass/fail
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Dashboard accessibility fixes + axe-core test integration

**Added aria-label to 4 icon buttons (3 planned + 1 discovered), integrated vitest-axe into 6 component tests, added WCAG AA axe-core assertion to Playwright smoke test**

## What Happened

1. Installed `vitest-axe` and `@axe-core/playwright` as devDependencies.
2. Extended `dashboard/src/__tests__/setup.ts` with vitest-axe matchers via `expect.extend(matchers)` — the `vitest-axe/extend-expect` dist file is empty in v0.1.0, so direct matcher import was necessary.
3. Added `aria-label="Refresh data"` to the refresh icon button in `TimeRangeSelector.tsx`.
4. Added `aria-label="Remove model"` to the delete icon button in `ModelList.tsx`.
5. Added `aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}` to the collapse toggle in `Sidebar.tsx`.
6. Added `toHaveNoViolations()` axe-core assertions to 6 component test files: TimeRangeSelector, Sidebar, AuditFilters, PolicyRow, RouteError, RouteLoading. Each disables `color-contrast` rule (happy-dom limitation).
7. Added WCAG AA axe-core assertion to `dashboard/e2e/smoke.spec.ts` using `AxeBuilder` from `@axe-core/playwright`.
8. First test run revealed a **bonus a11y violation**: the `<Switch>` in `PolicyRow.tsx` had no accessible label (axe-core `button-name` rule, impact=critical). Fixed by adding `aria-label={Toggle ${policy.name} active}`. Final run: 385/385 tests pass.

## Verification

- `cd dashboard && npx vitest run` — **385 tests pass** (0 failures), including 6 axe-core a11y assertions
- `grep "aria-label" dashboard/src/components/dashboard/TimeRangeSelector.tsx` → `aria-label="Refresh data"` ✅
- `grep "aria-label" dashboard/src/components/vendors/ModelList.tsx` → `aria-label="Remove model"` ✅
- `grep "aria-label" dashboard/src/components/layout/Sidebar.tsx` → `aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}` ✅
- `grep -l "toHaveNoViolations|axe" dashboard/src/__tests__/components/*.test.tsx | wc -l` → 6 ✅
- `grep "AxeBuilder" dashboard/e2e/smoke.spec.ts` → AxeBuilder import and usage present ✅
- `grep "vitest-axe" dashboard/package.json` → devDependency present ✅

### Slice-level verification (T01-relevant subset):
- ✅ `grep -c "aria-label" dashboard/src/components/dashboard/TimeRangeSelector.tsx` returns ≥1
- ✅ `grep -c "aria-label" dashboard/src/components/vendors/ModelList.tsx` returns ≥1
- ✅ `grep -c "aria-label" dashboard/src/components/layout/Sidebar.tsx` returns ≥1
- ✅ `cd dashboard && npx vitest run` — all tests pass including vitest-axe assertions
- ✅ `grep "axe" dashboard/e2e/smoke.spec.ts` — axe-core assertion present in Playwright smoke test
- ⏳ Remaining slice checks (docs, PROJECT.md, README.md) are for T02–T04

## Diagnostics

- Run `cd dashboard && npx vitest run --reporter=verbose` to see per-component a11y pass/fail
- On failure, axe-core prints: rule ID (e.g. `button-name`), impact level (critical/serious/moderate/minor), failing HTML snippet, suggested fix, and reference URL
- `color-contrast` rule is disabled per-assertion in happy-dom tests (not implemented in happy-dom CSSOM); active in Playwright smoke test

## Deviations

- Fixed a 4th a11y violation not in the original plan: `PolicyRow.tsx` Switch missing `aria-label` — discovered by axe-core during step 8. Added `aria-label={Toggle ${policy.name} active}`.
- Used `expect.extend(matchers)` in setup.ts instead of `import 'vitest-axe/extend-expect'` — the extend-expect dist file is empty in vitest-axe v0.1.0.
- Disabled `color-contrast` via per-assertion `rules` option rather than global axe configuration — more explicit and avoids masking the rule in Playwright tests.

## Known Issues

None.

## Files Created/Modified

- `dashboard/package.json` — added vitest-axe and @axe-core/playwright devDependencies
- `dashboard/src/__tests__/setup.ts` — registered vitest-axe matchers via expect.extend
- `dashboard/src/components/dashboard/TimeRangeSelector.tsx` — added `aria-label="Refresh data"` to refresh button
- `dashboard/src/components/vendors/ModelList.tsx` — added `aria-label="Remove model"` to delete button
- `dashboard/src/components/layout/Sidebar.tsx` — added dynamic `aria-label` to collapse toggle
- `dashboard/src/components/policies/PolicyRow.tsx` — added `aria-label` to Switch (bonus a11y fix)
- `dashboard/src/__tests__/components/time-range-selector.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/sidebar.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/audit-filters.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/policy-row.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/route-error.test.tsx` — added axe-core a11y assertion
- `dashboard/src/__tests__/components/route-loading.test.tsx` — added axe-core a11y assertion
- `dashboard/e2e/smoke.spec.ts` — added WCAG AA axe-core test case with AxeBuilder
- `.gsd/milestones/M007/slices/S08/S08-PLAN.md` — added diagnostic verification step (pre-flight fix)
- `.gsd/milestones/M007/slices/S08/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
