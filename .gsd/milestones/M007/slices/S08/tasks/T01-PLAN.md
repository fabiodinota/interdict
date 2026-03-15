---
estimated_steps: 8
estimated_files: 8
---

# T01: Dashboard accessibility fixes + axe-core test integration

**Slice:** S08 — Documentation, Accessibility & Polish
**Milestone:** M007

## Description

Fix three icon buttons missing `aria-label` attributes, install vitest-axe and @axe-core/playwright, integrate axe-core assertions into existing component tests and the Playwright smoke test. This is the primary deliverable for PR-A11Y-01 (dashboard passes axe-core with zero critical/serious WCAG violations).

## Steps

1. Install `vitest-axe` as a devDependency in dashboard (`npm install -D vitest-axe`). Install `@axe-core/playwright` as a devDependency (`npm install -D @axe-core/playwright`).
2. Extend `dashboard/src/__tests__/setup.ts` to import and register vitest-axe matchers (`import 'vitest-axe/extend-expect'` or equivalent). Configure axe-core to disable `color-contrast` rule globally (happy-dom doesn't implement CSSOM).
3. Add `aria-label="Refresh data"` to the refresh icon button in `TimeRangeSelector.tsx` (line ~78).
4. Add `aria-label="Remove model"` to the delete icon button in `ModelList.tsx` (line ~111, the `<X>` icon button inside the DialogTrigger).
5. Add `aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}` to the collapse toggle button in `Sidebar.tsx` (line ~123).
6. Add `toHaveNoViolations()` axe-core assertions to 5–8 existing component test files. Choose simple/medium components where the DOM is real (not heavily mocked Radix portals). Good candidates: `StatusBadge.test.tsx`, `TimeRangeSelector.test.tsx`, `Sidebar.test.tsx`, `AuditFilters.test.tsx`, `PolicyRow.test.tsx`. For each, render the component and assert `expect(await axe(container)).toHaveNoViolations()`.
7. Add WCAG AA axe-core assertion to `dashboard/e2e/smoke.spec.ts`: import `AxeBuilder` from `@axe-core/playwright`, add a test case that loads the page and runs `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()`, asserting zero critical/serious violations.
8. Run `cd dashboard && npx vitest run` to verify all tests pass. Fix any a11y violations axe-core surfaces.

## Must-Haves

- [ ] Three icon buttons have explicit `aria-label` attributes
- [ ] vitest-axe matchers registered in test setup
- [ ] ≥5 component tests include `toHaveNoViolations()` assertion
- [ ] Playwright smoke test includes WCAG AA axe-core check
- [ ] `color-contrast` rule disabled in vitest-axe config (happy-dom limitation)
- [ ] All existing tests continue to pass

## Verification

- `cd dashboard && npx vitest run` — all tests pass including axe assertions
- `grep "aria-label" dashboard/src/components/dashboard/TimeRangeSelector.tsx` shows "Refresh data"
- `grep "aria-label" dashboard/src/components/vendors/ModelList.tsx` shows "Remove model"
- `grep "aria-label" dashboard/src/components/layout/Sidebar.tsx` shows "Expand sidebar" or "Collapse sidebar"
- `grep "toHaveNoViolations\|axe" dashboard/src/__tests__/components/*.test.tsx | wc -l` ≥ 5
- `grep "AxeBuilder\|axe" dashboard/e2e/smoke.spec.ts` shows axe-core integration

## Observability Impact

- **Signals added:** vitest-axe `toHaveNoViolations()` assertions produce structured axe-core violation output (rule ID, impact level, failing HTML snippet) on failure in 5–8 component tests. `@axe-core/playwright` WCAG AA check in smoke test produces similar structured output for full-page audit.
- **How to inspect:** `npx vitest run --reporter=verbose` shows per-component a11y pass/fail. On failure, axe-core prints the violating node's HTML, the WCAG rule ID (e.g., `button-name`), and severity (critical/serious/moderate/minor).
- **Failure visibility:** A missing `aria-label` surfaces as a `button-name` violation with impact=critical. A contrast issue surfaces as `color-contrast` (disabled in happy-dom, active in Playwright). Violations are not redacted — full HTML snippet is logged.

## Inputs

- `dashboard/src/__tests__/setup.ts` — current test setup to extend with vitest-axe
- `dashboard/e2e/smoke.spec.ts` — existing Playwright smoke test to add a11y check to
- `dashboard/src/components/dashboard/TimeRangeSelector.tsx` — refresh button missing aria-label (L78)
- `dashboard/src/components/vendors/ModelList.tsx` — delete button missing aria-label (L111)
- `dashboard/src/components/layout/Sidebar.tsx` — collapse toggle missing aria-label (L123)
- S04 Forward Intelligence: Radix portals don't render in happy-dom — focus axe-core on components with real DOM

## Expected Output

- `dashboard/src/components/dashboard/TimeRangeSelector.tsx` — `aria-label="Refresh data"` added to refresh button
- `dashboard/src/components/vendors/ModelList.tsx` — `aria-label="Remove model"` added to delete button
- `dashboard/src/components/layout/Sidebar.tsx` — dynamic `aria-label` added to collapse toggle
- `dashboard/src/__tests__/setup.ts` — vitest-axe matchers imported and configured
- `dashboard/src/__tests__/components/*.test.tsx` — 5–8 files with axe assertions added
- `dashboard/e2e/smoke.spec.ts` — WCAG AA axe-core test case added
- `dashboard/package.json` — vitest-axe and @axe-core/playwright devDependencies added
