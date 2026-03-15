---
id: T01
parent: S04
milestone: M007
provides:
  - 10 vitest component test files for simple presentational dashboard components
  - Established patterns for recharts mocking, next-themes mocking, and hook mocking
key_files:
  - dashboard/src/__tests__/components/mandatory-badge.test.tsx
  - dashboard/src/__tests__/components/route-loading.test.tsx
  - dashboard/src/__tests__/components/route-error.test.tsx
  - dashboard/src/__tests__/components/theme-toggle.test.tsx
  - dashboard/src/__tests__/components/anomaly-list.test.tsx
  - dashboard/src/__tests__/components/baseline-chart.test.tsx
  - dashboard/src/__tests__/components/template-picker.test.tsx
  - dashboard/src/__tests__/components/framework-card.test.tsx
  - dashboard/src/__tests__/components/compilation-status.test.tsx
  - dashboard/src/__tests__/components/vendor-card.test.tsx
key_decisions:
  - Mock recharts with div-based stubs exposing data via data-attributes for assertion
  - Mock child components (AnomalyCard, ModelList) to isolate container logic
  - Use data-slot selectors for shadcn/ui Skeleton components instead of class-name matching
patterns_established:
  - recharts mock pattern: vi.mock('recharts') with div stubs + data-testid + data-attributes for value assertions
  - Hook mock pattern: vi.mock('@/hooks/...') returning { mutate, isPending } shape for mutation hooks
  - Child component isolation: vi.mock('@/components/...') with minimal stub returning data-testid elements
  - Radix tooltip: don't assert tooltip content text (lazily rendered); assert tooltip trigger presence instead
observability_surfaces:
  - none
duration: 18min
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Dashboard simple component tests — 10 presentational components

**Added 10 vitest test files covering MandatoryBadge, RouteLoading, RouteError, ThemeToggle, AnomalyList, BaselineChart, TemplatePicker, FrameworkCard, CompilationStatus, and VendorCard with 31 test cases total**

## What Happened

Created 10 test files following the established kpi-cards.test.tsx pattern. Each file has ≥2 test cases covering happy path and negative/adversarial scenarios.

Key mocking strategies applied:
- **recharts** (BaselineChart): Full mock replacing all chart components with div stubs that expose data via `data-testid` and `data-*` attributes, enabling value assertions without SVG rendering.
- **next-themes** (ThemeToggle): Mocked `useTheme` returning a controlled `setTheme` spy; verified dropdown options render and call setTheme correctly.
- **use-compilation-status hook** (CompilationStatus): Mocked to return controlled status data; tested all 4 states (pending, compiling, compiled, failed) plus error expand/collapse interaction.
- **use-regulatory hooks** (FrameworkCard): Mocked `useActivateFramework`/`useDeactivateFramework` returning mutation spies.
- **use-vendors hook** (VendorCard): Mocked `useUpdateVendor`; also mocked child `ModelList` component to isolate card logic.
- **AnomalyCard child** (AnomalyList): Mocked to a div stub with data-testid for counting rendered cards.

Two test fixes during initial run:
1. MandatoryBadge: Radix tooltip content is lazily rendered (not in DOM until hover), so switched to asserting tooltip trigger presence via `data-slot` attribute.
2. RouteLoading: shadcn/ui Skeleton uses `data-slot="skeleton"` not a CSS class containing "skeleton", so updated selector.

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — **25 test files pass, 164 test cases pass, 0 failures**
- All 10 new test files have `describe(` and ≥2 `it(` blocks (range: 2–5 per file, 31 total across 10 files)
- recharts mocked for BaselineChart ✓
- next-themes mocked for ThemeToggle ✓
- Compilation hook mocked for CompilationStatus ✓
- All assertions use `screen.getByText`, `screen.getByRole`, `screen.queryByText`, `screen.getAllByTestId` — no raw DOM traversal

### Slice-level verification (partial — T01 is first of 6 tasks):
- `cd dashboard && npx vitest run` — 25 test files pass (18 component + 7 other). Target ≥40 component test files by end of slice. ✅ on track
- Control-plane, Playwright, CI gate checks — not applicable to this task, deferred to T05/T06

## Diagnostics

None — test-only task, no runtime surfaces.

## Deviations

1. MandatoryBadge test: Changed from asserting tooltip text content to asserting tooltip trigger `data-slot` attribute, because Radix UI tooltips lazily render content.
2. RouteLoading test: Changed skeleton selector from `[class*='skeleton']` to `[data-slot='skeleton']` matching shadcn/ui v2 convention.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/__tests__/components/mandatory-badge.test.tsx` — tests conditional badge rendering + tooltip trigger
- `dashboard/src/__tests__/components/route-loading.test.tsx` — tests skeleton layout rendering + aria attributes
- `dashboard/src/__tests__/components/route-error.test.tsx` — tests error display + retry click + empty message fallback
- `dashboard/src/__tests__/components/theme-toggle.test.tsx` — tests theme switching with next-themes mock
- `dashboard/src/__tests__/components/anomaly-list.test.tsx` — tests alert card rendering + empty state
- `dashboard/src/__tests__/components/baseline-chart.test.tsx` — tests chart data/colors with recharts mock
- `dashboard/src/__tests__/components/template-picker.test.tsx` — tests card grid + selection + empty category
- `dashboard/src/__tests__/components/framework-card.test.tsx` — tests card display + active/inactive + toggle
- `dashboard/src/__tests__/components/compilation-status.test.tsx` — tests all 4 status states + error expand
- `dashboard/src/__tests__/components/vendor-card.test.tsx` — tests card rendering + status toggle + model expand
- `.gsd/milestones/M007/slices/S04/S04-PLAN.md` — added Observability/Diagnostics section, marked T01 done
- `.gsd/milestones/M007/slices/S04/tasks/T01-PLAN.md` — added Observability Impact section
