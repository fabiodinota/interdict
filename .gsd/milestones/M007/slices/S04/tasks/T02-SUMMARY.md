---
id: T02
parent: S04
milestone: M007
provides:
  - 10 vitest component test files for medium-complexity stateful/interactive dashboard components
  - 63 test cases covering hooks, timers, navigation, dialogs, and user interactions
key_files:
  - dashboard/src/__tests__/components/category-picker.test.tsx
  - dashboard/src/__tests__/components/sla-timer.test.tsx
  - dashboard/src/__tests__/components/report-progress.test.tsx
  - dashboard/src/__tests__/components/signing-key-table.test.tsx
  - dashboard/src/__tests__/components/policy-row.test.tsx
  - dashboard/src/__tests__/components/top-bar.test.tsx
  - dashboard/src/__tests__/components/bundle-detail-panel.test.tsx
  - dashboard/src/__tests__/components/activity-feed.test.tsx
  - dashboard/src/__tests__/components/rotate-key-dialog.test.tsx
  - dashboard/src/__tests__/components/time-range-selector.test.tsx
key_decisions:
  - Mock radix Sheet primitives with simple div stubs for BundleDetailPanel (radix portals don't work in happy-dom)
  - Use scoped fake timers for timer tests (SlaTimer, TimeRangeSelector lastUpdated) but real timers for userEvent click tests to avoid timeout deadlocks
  - Mock child components (CompilationStatus, PolicyVersionHistory, VerificationStepper) to isolate unit boundaries
patterns_established:
  - Scoped fake timers pattern: vi.useFakeTimers() + vi.setSystemTime() in beforeEach, real timers for interaction tests
  - Dialog confirmation flow pattern: click trigger → assert dialog text → click confirm/cancel → verify mutation called/not-called
  - Dropdown menu interaction pattern: click avatar → assert dropdown content → click action → verify callback
  - Sheet mock pattern: vi.mock("@/components/ui/sheet") with open-conditional div stubs for radix Sheet components
observability_surfaces:
  - none — test-only task, no runtime surfaces
duration: 25min
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Dashboard medium component tests — 10 stateful/interactive components

**Added 10 vitest test files covering CategoryPicker, SlaTimer, ReportProgress, SigningKeyTable, PolicyRow, TopBar, BundleDetailPanel, ActivityFeed, RotateKeyDialog, and TimeRangeSelector with 63 test cases total.**

## What Happened

Read all 10 component sources plus their hook/type dependencies (useAuth, useSSE, use-policies, api types) to understand mocking requirements. Created all 10 test files following patterns established in sidebar.test.tsx and review-queue-simple.test.tsx.

First run had 5 failures across 4 files:
1. **BundleDetailPanel**: VerificationStepper mock used relative path `./VerificationStepper` instead of aliased `@/components/evidence/VerificationStepper` — the real component rendered instead of the mock stub.
2. **SigningKeyTable**: `getByRole("rowgroup")` matched both `<thead>` and `<tbody>` — switched to `getAllByRole("row")` count assertion.
3. **SlaTimer**: Badge className contained "destructive" in the `aria-invalid` utility class even for non-destructive variants — changed assertion to check `bg-destructive` specifically.
4. **TimeRangeSelector**: `userEvent.setup({ advanceTimers })` with fake timers caused infinite-loop timeout — switched interactive tests to real timers and scoped fake timers only to the lastUpdated display and getDateRange utility tests.

All fixed in one pass — second run: 10/10 files pass, 63/63 test cases green.

## Verification

- `cd dashboard && npx vitest run` — all 10 new test files pass (63 test cases, 0 failures)
- SlaTimer test completes in <50ms total (confirms fake timers, no real delays)
- Each test file has ≥2 test cases including interaction tests
- Hook mocks return complete objects (mutate, isPending, data shapes)
- Navigation mocks follow established `vi.mock("next/navigation")` pattern

### Slice-level verification (intermediate — T02 of 6):
- Dashboard component test files: 28 (8 existing + 10 T01 + 10 T02) — on track for ≥40
- Control-plane tests: not yet addressed (T05)
- Playwright smoke test: not yet created (T06)
- CI coverage gate: not yet hardened (T06)

## Diagnostics

- Run `cd dashboard && npx vitest run --reporter=verbose` to see per-test-case pass/fail
- SlaTimer fake-timer tests: if they start timing out, a real setInterval leaked — check that `vi.useFakeTimers()` is in `beforeEach` and `vi.useRealTimers()` in `afterEach`
- BundleDetailPanel: uses Sheet mock stubs — if Sheet component changes, update the mock in `bundle-detail-panel.test.tsx`

## Deviations

- TimeRangeSelector interactive tests use real timers instead of fake timers (plan suggested fake timers for all timer components) — fake timers cause deadlock with userEvent's internal setTimeout. Only the lastUpdated display test uses fake timers.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/__tests__/components/category-picker.test.tsx` — Tests grid rendering, selection highlighting, click callbacks (5 cases)
- `dashboard/src/__tests__/components/sla-timer.test.tsx` — Tests countdown display, color transitions at SLA thresholds, fake timer advancement (7 cases)
- `dashboard/src/__tests__/components/report-progress.test.tsx` — Tests generating/success/error states, null render, state priority (7 cases)
- `dashboard/src/__tests__/components/signing-key-table.test.tsx` — Tests table headers, active/retired badges, empty state, truncated IDs (6 cases)
- `dashboard/src/__tests__/components/policy-row.test.tsx` — Tests expand/collapse, delete dialog flow, edit navigation, active/inactive switch (7 cases)
- `dashboard/src/__tests__/components/top-bar.test.tsx` — Tests breadcrumbs, user initials, dropdown menu, logout action (7 cases)
- `dashboard/src/__tests__/components/bundle-detail-panel.test.tsx` — Tests open/close, metadata display, crypto data, verification stepper (6 cases)
- `dashboard/src/__tests__/components/activity-feed.test.tsx` — Tests empty state, Clear button, title rendering (4 cases)
- `dashboard/src/__tests__/components/rotate-key-dialog.test.tsx` — Tests open/close, confirm/cancel, pending state (6 cases)
- `dashboard/src/__tests__/components/time-range-selector.test.tsx` — Tests range buttons, refresh, lastUpdated, getDateRange utility (8 cases)
- `.gsd/milestones/M007/slices/S04/tasks/T02-PLAN.md` — Added Observability Impact section
- `.gsd/milestones/M007/slices/S04/S04-PLAN.md` — Marked T02 as done
