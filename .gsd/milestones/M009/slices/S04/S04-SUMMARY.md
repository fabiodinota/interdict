---
id: S04
parent: M009
milestone: M009
provides:
  - Render-phase side effects eliminated from HomePage and ReviewQueue via useEffect
  - Shared module-level tick manager for SlaTimer (one setInterval for N instances)
  - SAML callback cookie options consolidated via getSessionCookieOptions() (D057)
  - ARIA attributes on BatchVerifyTable checkboxes, VendorCard toggle, anomaly severity tabs
requires: []
affects:
  - S06
key_files:
  - dashboard/src/app/(dashboard)/page.tsx
  - dashboard/src/components/reviews/ReviewQueue.tsx
  - dashboard/src/components/reviews/SlaTimer.tsx
  - dashboard/src/app/api/auth/saml-callback/route.ts
  - dashboard/src/components/evidence/BatchVerifyTable.tsx
  - dashboard/src/components/vendors/VendorCard.tsx
  - dashboard/src/app/(dashboard)/anomalies/page.tsx
  - dashboard/src/__tests__/pages/home-page.test.tsx
  - dashboard/src/__tests__/pages/anomalies-page.test.tsx
  - dashboard/src/__tests__/components/review-queue-simple.test.tsx
  - dashboard/src/__tests__/components/sla-timer.test.tsx
  - dashboard/src/__tests__/api/auth-saml-callback.test.ts
  - dashboard/src/__tests__/components/batch-verify-table.test.tsx
  - dashboard/src/__tests__/components/vendor-card.test.tsx
key_decisions:
  - D070 — Module-level tick manager for SlaTimer shared interval
  - D071 — useRef-stabilized callback pattern for parent-to-child prop callbacks in useEffect
  - Used bundle_id for per-row aria-label in BatchVerifyTable (matches selection state tracking key)
  - SAML callback maxAge matched getSessionCookieOptions() exactly (both 28800s), no override needed
patterns_established:
  - Module-level subscribe/unsubscribe Set + single shared interval for N component instances
  - useRef-stabilized callback pattern for consuming unstable parent props inside useEffect
  - ARIA tablist/tab/aria-selected pattern for custom styled tab groups
observability_surfaces:
  - Test suite: `cd dashboard && npx vitest run` — 55 files, 415 tests, zero failures
  - SAML cookie config now respects COOKIE_SECURE env var — incorrect config surfaces as post-SAML login failure
drill_down_paths:
  - .gsd/milestones/M009/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M009/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M009/slices/S04/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-16
---

# S04: Dashboard Quality & Accessibility

**Eliminated render-phase side effects in HomePage and ReviewQueue, consolidated SlaTimer to a single shared interval, unified SAML cookie config, and added ARIA attributes across three components**

## What Happened

Three tasks addressed seven dashboard quality and accessibility findings from the v1.6 foundation assessment:

**T01 — Render-phase side effects (L-01, L-23):** HomePage had a `queueMicrotask(() => setLastUpdated(...))` call in the render body — a side effect that fires during render and double-fires under React strict mode. Replaced with a `useEffect` watching `violations.dataUpdatedAt`. ReviewQueue had a bare `onStatsUpdate(data.stats)` call in the render body. Replaced with a `useEffect` using a `useRef` to stabilize the callback identity, preventing re-triggers when the parent re-renders with a new inline function.

**T02 — SlaTimer shared interval + SAML cookie consolidation (L-08, L-24):** SlaTimer created one `setInterval` per mounted instance — 50 review items meant 50 intervals ticking every second. Replaced with a module-level tick manager: a `Set<() => void>` of subscriber callbacks driven by a single `setInterval(fn, 1000)`. The interval starts when the first subscriber registers and clears when the last unsubscribes. SAML callback route had hardcoded cookie options duplicating `getSessionCookieOptions()`. Replaced with the shared helper, now respecting the `COOKIE_SECURE` env var (D057).

**T03 — ARIA accessibility (L-09, L-10, L-11):** BatchVerifyTable checkboxes got `aria-label="Select all bundles"` (header) and `aria-label="Select bundle {id}"` (per-row). VendorCard toggle button got `aria-expanded={expanded}`. Anomaly severity tabs got `role="tablist"` on container, `role="tab"` + `aria-selected` on each button. All purely additive attribute additions with no behavioral changes.

## Verification

- `cd dashboard && npx vitest run` — **55 files, 415 tests, zero failures**
- ✅ `home-page.test.tsx` (new, 2 tests) — verifies `lastUpdated` set via effect, not during render
- ✅ `review-queue-simple.test.tsx` (1 new test) — verifies `onStatsUpdate` called via effect, fires exactly once
- ✅ `sla-timer.test.tsx` (3 new tests) — verifies single `setInterval` for multiple instances, `clearInterval` on last unmount
- ✅ `auth-saml-callback.test.ts` (2 new tests) — verifies `getSessionCookieOptions()` called, cookie attributes match
- ✅ `batch-verify-table.test.tsx` (2 new tests) — verifies `aria-label` on header and row checkboxes via `getByRole`
- ✅ `vendor-card.test.tsx` (1 new test) — verifies `aria-expanded` toggles false→true
- ✅ `anomalies-page.test.tsx` (new, 4 tests) — verifies `role="tablist"`, `role="tab"`, `aria-selected` state changes

Total: 12 new tests added (2 new test files, 5 existing files extended).

## Requirements Advanced

- FH-QUALITY-01 — Render-phase side effects replaced with `useEffect` in HomePage and ReviewQueue. SlaTimer uses shared interval. ARIA roles on anomaly tabs, `aria-expanded` on VendorCard, `aria-labels` on BatchVerifyTable. Dashboard test suite at 415 tests with zero failures. Remaining items (flaky kernel test, dead code) are in S06.

## Requirements Validated

- none — FH-QUALITY-01 has remaining items in S06 (flaky kernel test determinism, vitest mock hoisting warning)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

T01 test assertion for ReviewQueue `onStatsUpdate` timing: plan suggested verifying the spy wasn't called before `waitFor`, but `render()` wraps in `act()` which flushes effects synchronously. Changed to verify: (1) callback fires with correct data, (2) fires exactly once (not doubled by strict-mode), (3) no React render-phase console warnings. Stronger assertion set that proves the same property.

## Known Limitations

- The vitest `vi.mock("next/headers")` hoisting warning in `next-mocks.ts` still appears during test runs. It's a pre-existing issue (not introduced by this slice) and is addressed in S06's scope.
- ARIA attributes are tested via `getByRole` queries and attribute assertions, not via a live screen reader or full axe-core audit. The M007 Playwright-based `@axe-core/playwright` WCAG AA check provides the browser-level validation layer.

## Follow-ups

- none — all planned work delivered

## Files Created/Modified

- `dashboard/src/app/(dashboard)/page.tsx` — replaced `queueMicrotask` render-phase block with `useEffect`
- `dashboard/src/components/reviews/ReviewQueue.tsx` — replaced render-body `onStatsUpdate` call with `useEffect` + `useRef`
- `dashboard/src/components/reviews/SlaTimer.tsx` — added module-level tick manager, replaced per-instance `setInterval`
- `dashboard/src/app/api/auth/saml-callback/route.ts` — imported `getSessionCookieOptions`, replaced hardcoded cookie options
- `dashboard/src/components/evidence/BatchVerifyTable.tsx` — added `aria-label` to header and per-row checkboxes
- `dashboard/src/components/vendors/VendorCard.tsx` — added `aria-expanded={expanded}` to toggle button
- `dashboard/src/app/(dashboard)/anomalies/page.tsx` — added `role="tablist"`, `role="tab"`, `aria-selected` to severity tabs
- `dashboard/src/__tests__/pages/home-page.test.tsx` — new test file (2 tests)
- `dashboard/src/__tests__/pages/anomalies-page.test.tsx` — new test file (4 tests)
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — extended with 1 new test
- `dashboard/src/__tests__/components/sla-timer.test.tsx` — extended with 3 new tests
- `dashboard/src/__tests__/api/auth-saml-callback.test.ts` — extended with 2 new tests
- `dashboard/src/__tests__/components/batch-verify-table.test.tsx` — extended with 2 new tests
- `dashboard/src/__tests__/components/vendor-card.test.tsx` — extended with 1 new test

## Forward Intelligence

### What the next slice should know
- Dashboard test suite is at 55 files / 415 tests. S06 will add the vitest mock hoisting fix — the warning currently appears but doesn't cause failures.
- The `getSessionCookieOptions()` shared helper is now used in both the login route and the SAML callback route. Any future auth routes should use it too.
- The module-level tick manager pattern in SlaTimer is reusable for any component that needs a shared interval (e.g., activity feed polling, real-time counters).

### What's fragile
- SlaTimer's module-level `subscribers` Set and `tickInterval` live outside React's lifecycle. If a test doesn't properly unmount all SlaTimer instances, the interval leaks between tests. The existing tests handle this correctly, but new tests mounting SlaTimer must call cleanup/unmount.

### Authoritative diagnostics
- `cd dashboard && npx vitest run` — 415 tests, zero failures. This is the single verification command for all S04 work.
- `getByRole("checkbox", { name: "Select all bundles" })` in batch-verify-table.test.tsx is the canary for BatchVerifyTable ARIA regression.
- `vi.spyOn(global, 'setInterval')` in sla-timer.test.tsx proves exactly one interval exists for N instances.

### What assumptions changed
- SAML callback `maxAge` was expected to potentially differ from `getSessionCookieOptions()` — it matched exactly (both 28800s), so no override spread was needed.
