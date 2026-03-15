---
estimated_steps: 5
estimated_files: 10
---

# T02: Dashboard medium component tests — 10 stateful/interactive components

**Slice:** S04 — Expanded Test Coverage
**Milestone:** M007

## Description

Add vitest + @testing-library/react tests for 10 medium-complexity dashboard components (60-210 lines). These components use hooks, timers, or Next.js navigation — requiring `vi.mock()`, `vi.useFakeTimers()`, and `userEvent.setup()` patterns established in sidebar.test.tsx and review-queue-simple.test.tsx.

Components: CategoryPicker, SlaTimer, ReportProgress, SigningKeyTable, PolicyRow, TopBar, BundleDetailPanel, ActivityFeed, RotateKeyDialog, TimeRangeSelector.

## Steps

1. Read each component source to identify hooks, timers, navigation dependencies, and interaction handlers
2. Create test files following sidebar.test.tsx pattern for components needing navigation mocks, review-queue-simple.test.tsx for components needing hook mocks
3. For SlaTimer: use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to test color transitions at SLA thresholds — assert warning/critical color classes at boundary values
4. For TopBar: mock `next/navigation` (`usePathname`, `useRouter`) and auth state; test layout rendering and navigation highlighting
5. For each component: write at least one interaction test using `userEvent.setup()` (click, select, toggle) and one negative case (empty data, error state, disabled state)

## Must-Haves

- [ ] All 10 test files exist and pass `npx vitest run`
- [ ] Each test file has ≥2 test cases including at least one interaction test
- [ ] SlaTimer test uses fake timers — no real setTimeout delays
- [ ] Hook mocks return complete objects (both data and mutation functions like `mutateAsync`, `isPending`)
- [ ] Navigation mocks follow the established `vi.mock("next/navigation")` pattern

## Verification

- `cd dashboard && npx vitest run --reporter=verbose` — all 10 new test files pass
- SlaTimer test completes in <1s (proves fake timers work, not real delays)

## Inputs

- `dashboard/src/__tests__/components/sidebar.test.tsx` — pattern for navigation mocks + userEvent
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — pattern for hook mocking
- T01 test files — established mock patterns for recharts and next-themes (reuse if needed)

## Expected Output

- `dashboard/src/__tests__/components/category-picker.test.tsx` — tests grid selection + empty categories
- `dashboard/src/__tests__/components/sla-timer.test.tsx` — tests timer display + color transitions with fake timers
- `dashboard/src/__tests__/components/report-progress.test.tsx` — tests progress display states
- `dashboard/src/__tests__/components/signing-key-table.test.tsx` — tests table rendering + empty state
- `dashboard/src/__tests__/components/policy-row.test.tsx` — tests row status indicators + click handler
- `dashboard/src/__tests__/components/top-bar.test.tsx` — tests layout + auth state + navigation
- `dashboard/src/__tests__/components/bundle-detail-panel.test.tsx` — tests detail display + missing data
- `dashboard/src/__tests__/components/activity-feed.test.tsx` — tests feed list + empty state
- `dashboard/src/__tests__/components/rotate-key-dialog.test.tsx` — tests dialog open/close + form
- `dashboard/src/__tests__/components/time-range-selector.test.tsx` — tests date picker interaction

## Observability Impact

- **Test results**: `cd dashboard && npx vitest run --reporter=verbose` — the 10 new test files report pass/fail per-case. Grep for `FAIL` to spot regressions.
- **Coverage delta**: These 10 components add line/branch coverage for CategoryPicker, SlaTimer, ReportProgress, SigningKeyTable, PolicyRow, TopBar, BundleDetailPanel, ActivityFeed, RotateKeyDialog, and TimeRangeSelector. Run `npx vitest run --coverage` to inspect per-file coverage.
- **Failure shapes**: Vitest verbose reporter prints expected vs received values and component render output for each failed assertion. SlaTimer uses fake timers — timeout failures indicate real delays leaked in.
