# S04: Dashboard Quality & Accessibility — UAT

**Milestone:** M009
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are client-side React patterns (useEffect, ARIA attributes, shared intervals) testable entirely via vitest with happy-dom. No running server, database, or browser needed.

## Preconditions

- Working directory is the M009 worktree (or main branch after merge)
- Node.js and npm/npx available
- `cd dashboard && npm install` has been run (dependencies installed)

## Smoke Test

```bash
cd dashboard && npx vitest run
```
Expected: 55 files, 415+ tests, zero failures.

## Test Cases

### 1. HomePage render-phase side effect eliminated

1. Run `cd dashboard && npx vitest run home-page`
2. **Expected:** 2 tests pass:
   - "sets lastUpdated when violations data arrives" — verifies `lastUpdated` is set after query data arrives via `useEffect`, not during render
   - "does not cause render-phase side effects" — verifies no React `console.error` warnings during render

### 2. ReviewQueue render-phase side effect eliminated

1. Run `cd dashboard && npx vitest run review-queue-simple`
2. **Expected:** 4 tests pass including:
   - "calls onStatsUpdate via effect when data arrives" — verifies callback fires with correct stats data, fires exactly once (not doubled by strict mode), and no render-phase console warnings

### 3. SlaTimer uses single shared interval

1. Run `cd dashboard && npx vitest run sla-timer`
2. **Expected:** 10 tests pass including:
   - "uses a single setInterval for multiple instances" — mounts 3 SlaTimer instances, verifies `setInterval` called exactly once (not 3 times)
   - "clears interval when all instances unmount" — unmounts all instances, verifies `clearInterval` called
   - "all instances advance in sync" — advances fake timers by 1 second, verifies all 3 timers update

### 4. SAML callback uses shared cookie options

1. Run `cd dashboard && npx vitest run auth-saml-callback`
2. **Expected:** 9 tests pass including:
   - "uses getSessionCookieOptions for cookie configuration" — verifies `getSessionCookieOptions()` is called during cookie set
   - "cookie attributes match shared options" — verifies the cookie attributes match the mock return value of `getSessionCookieOptions()`

### 5. BatchVerifyTable checkboxes have aria-labels

1. Run `cd dashboard && npx vitest run batch-verify`
2. **Expected:** 13 tests pass including:
   - "header checkbox has aria-label 'Select all bundles'" — uses `getByRole("checkbox", { name: "Select all bundles" })`
   - "row checkboxes have aria-label with bundle id" — uses `getByRole("checkbox", { name: /Select bundle/ })`

### 6. VendorCard toggle has aria-expanded

1. Run `cd dashboard && npx vitest run vendor-card`
2. **Expected:** 6 tests pass including:
   - "toggle button has aria-expanded" — verifies `aria-expanded="false"` before click, `aria-expanded="true"` after click

### 7. Anomaly severity tabs have ARIA roles

1. Run `cd dashboard && npx vitest run anomalies-page`
2. **Expected:** 4 tests pass:
   - "renders severity tabs with tablist role" — `getByRole("tablist")` succeeds
   - "renders correct number of tab elements" — `getAllByRole("tab")` returns expected count
   - "first tab is selected by default" — first tab has `aria-selected="true"`, others have `aria-selected="false"`
   - "clicking a tab updates aria-selected" — after click, target tab has `aria-selected="true"`, previous deselected

## Edge Cases

### SlaTimer interval cleanup on partial unmount

1. Mount 3 SlaTimer instances
2. Unmount 1 instance
3. **Expected:** Interval still running (2 subscribers remain). Only after all 3 unmount does `clearInterval` fire.

### ReviewQueue with changing parent callback identity

1. Mount ReviewQueue with `onStatsUpdate` prop as an inline function
2. Re-render parent (new function identity on each render)
3. **Expected:** Effect does not re-trigger on callback identity change — `useRef` stabilizes it. Callback fires only when `data.stats` changes.

### BatchVerifyTable with no bundles

1. Render BatchVerifyTable with empty bundle array
2. **Expected:** Header checkbox with `aria-label="Select all bundles"` still renders. No row checkboxes present.

## Failure Signals

- Any test in `npx vitest run` fails → regression in one of the 7 components
- `console.error` spy fires during render in home-page or review-queue tests → render-phase side effect reintroduced
- `setInterval` call count > 1 in sla-timer test → per-instance interval regression
- `getByRole("checkbox", { name: "Select all bundles" })` throws → aria-label removed from BatchVerifyTable
- `getByRole("tablist")` throws → role attribute removed from anomaly tabs container

## Requirements Proved By This UAT

- FH-QUALITY-01 (partial) — Render-phase side effects replaced with `useEffect`, SlaTimer uses shared interval, ARIA attributes added to BatchVerifyTable, VendorCard, and anomaly tabs. Full validation requires S06 (flaky kernel test, vitest mock warning).

## Not Proven By This UAT

- FH-QUALITY-01 remaining items: flaky kernel test determinism (S06), dead code removal (completed in S03), vitest mock hoisting warning fix (S06)
- Live screen reader validation of ARIA attributes — covered by M007's Playwright axe-core WCAG AA check
- Runtime behavior under React concurrent mode — tested only with strict mode double-rendering via vitest/happy-dom

## Notes for Tester

- The vitest `vi.mock("next/headers")` hoisting warning still appears in test output — this is pre-existing and not a failure. It's addressed in S06.
- The `route-error.test.tsx` stderr output (`[dashboard] route segment failed`) is intentional — those tests verify error boundary rendering.
- All 12 new tests are additive — they don't modify existing test assertions, only extend test files with new cases.
