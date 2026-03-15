---
estimated_steps: 5
estimated_files: 10
---

# T01: Dashboard simple component tests — 10 presentational components

**Slice:** S04 — Expanded Test Coverage
**Milestone:** M007

## Description

Add vitest + @testing-library/react tests for the 10 simplest presentational dashboard components (≤80 lines each). These are mostly render-prop-and-assert tests following the established kpi-cards.test.tsx pattern. Each test file includes at least one happy-path and one negative/adversarial case (empty data, missing props, error states).

Components: MandatoryBadge, RouteLoading, RouteError, theme-toggle, AnomalyList, BaselineChart, TemplatePicker, FrameworkCard, CompilationStatus, VendorCard.

## Steps

1. Read each of the 10 component source files to identify props, imports, and conditional rendering paths
2. Create test files following the kpi-cards.test.tsx pattern: import from vitest, render with @testing-library/react, assert with screen queries
3. For BaselineChart: mock `recharts` entirely (`vi.mock('recharts', () => ({ ... })`) since happy-dom can't render SVG
4. For theme-toggle: mock `next-themes` (`vi.mock('next-themes', ...)`) to control theme state
5. For CompilationStatus: mock the compilation hook it depends on (`vi.mock('@/hooks/...')`)
6. For each component: write a happy-path test (render with valid props, assert key text/elements), and a negative test (empty array, missing optional prop, error state, or boundary value)

## Must-Haves

- [ ] All 10 test files exist and pass `npx vitest run`
- [ ] Each test file has ≥2 test cases (happy path + negative/adversarial case)
- [ ] recharts mocked for BaselineChart — no SVG rendering attempted
- [ ] next-themes mocked for theme-toggle
- [ ] Tests use `screen.getByText`, `screen.getByRole`, `screen.queryByText` — not DOM traversal

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — all 10 new test files pass
- Each test file contains `describe(` and at least two `it(` or `test(` blocks

## Observability Impact

- **No runtime signals changed** — this task adds test files only; no production code is modified.
- **Future agent inspection**: Run `cd dashboard && npx vitest run --reporter=verbose` and grep for the 10 test file names to confirm they pass. Each file has ≥2 `it(` blocks.
- **Failure visibility**: If a component's API changes, the corresponding test file will fail with a clear assertion error showing expected vs received DOM content. Vitest verbose output includes the full component name and test case title.

## Inputs

- `dashboard/src/__tests__/components/kpi-cards.test.tsx` — canonical test pattern to follow
- `dashboard/src/__tests__/components/sidebar.test.tsx` — pattern for navigation/theme mocks
- Component source files in `dashboard/src/components/` — props and rendering logic

## Expected Output

- `dashboard/src/__tests__/components/mandatory-badge.test.tsx` — tests conditional badge rendering + tooltip
- `dashboard/src/__tests__/components/route-loading.test.tsx` — tests skeleton layout rendering
- `dashboard/src/__tests__/components/route-error.test.tsx` — tests error display + retry button click
- `dashboard/src/__tests__/components/theme-toggle.test.tsx` — tests theme switching with next-themes mock
- `dashboard/src/__tests__/components/anomaly-list.test.tsx` — tests alert list rendering + empty state
- `dashboard/src/__tests__/components/baseline-chart.test.tsx` — tests chart rendering with recharts mock
- `dashboard/src/__tests__/components/template-picker.test.tsx` — tests card grid selection + empty state
- `dashboard/src/__tests__/components/framework-card.test.tsx` — tests card display with various props
- `dashboard/src/__tests__/components/compilation-status.test.tsx` — tests status badge states with hook mock
- `dashboard/src/__tests__/components/vendor-card.test.tsx` — tests card rendering + status badge
