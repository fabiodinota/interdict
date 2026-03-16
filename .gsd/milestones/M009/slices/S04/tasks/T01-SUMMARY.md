---
id: T01
parent: S04
milestone: M009
provides:
  - Render-phase side effects eliminated from HomePage and ReviewQueue
key_files:
  - dashboard/src/app/(dashboard)/page.tsx
  - dashboard/src/components/reviews/ReviewQueue.tsx
  - dashboard/src/__tests__/pages/home-page.test.tsx
  - dashboard/src/__tests__/components/review-queue-simple.test.tsx
key_decisions:
  - Used useRef to stabilize onStatsUpdate callback identity in ReviewQueue, avoiding effect re-triggers from parent re-renders with new inline functions
patterns_established:
  - useRef-stabilized callback pattern for parent-to-child prop callbacks consumed inside useEffect
observability_surfaces:
  - none
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Fix render-phase side effects in HomePage and ReviewQueue

**Replaced render-phase `queueMicrotask` and bare `onStatsUpdate` calls with `useEffect` hooks in HomePage and ReviewQueue**

## What Happened

Two render-phase side effects fixed:

1. **HomePage** (`page.tsx`): Removed the `queueMicrotask(() => setLastUpdated(...))` block from the render body. Replaced with a `useEffect` watching `violations.dataUpdatedAt`. The effect sets `lastUpdated` only when the data timestamp changes — simpler and correct under concurrent React.

2. **ReviewQueue** (`ReviewQueue.tsx`): Removed the bare `if (data?.stats && onStatsUpdate) { onStatsUpdate(data.stats) }` from the render body. Added a `useRef` to stabilize the `onStatsUpdate` callback identity (prevents the effect from re-triggering when the parent re-renders with a new inline function). Added a `useEffect` that fires when `data?.stats` changes.

Created a new HomePage test file with 2 test cases. Extended ReviewQueue test with 1 new test case that verifies the callback fires via effect (not during render) and no React render-phase warnings are emitted.

## Verification

- `cd dashboard && npx vitest run home-page review-queue-simple` — 6 tests pass (2 new HomePage + 1 new ReviewQueue + 3 existing)
- `cd dashboard && npx vitest run` — all 403 tests pass across 54 test files, zero failures

### Slice-level checks (T01 is first of 3 tasks):
- ✅ `cd dashboard && npx vitest run` — all tests pass, zero failures
- ✅ `home-page.test.tsx` — verifies `lastUpdated` set via effect, not during render
- ✅ `review-queue-simple.test.tsx` — verifies `onStatsUpdate` called via effect
- ⬜ `sla-timer.test.tsx` — single interval assertion (T02)
- ⬜ `auth-saml-callback.test.ts` — shared cookie options (T02)
- ⬜ `batch-verify-table.test.tsx` — aria-label on checkboxes (T03)
- ⬜ `vendor-card.test.tsx` — aria-expanded on toggle (T03)
- ⬜ `anomalies-page.test.tsx` — role="tablist" + role="tab" (T03)

## Diagnostics

None — these are client-side React pattern fixes with no runtime surfaces. Run `npx vitest run home-page review-queue-simple` to verify the effects fire correctly.

## Deviations

Test assertion strategy for ReviewQueue's `onStatsUpdate` effect timing: the plan suggested checking the spy wasn't called before `waitFor`, but `render()` wraps in `act()` which flushes effects synchronously. Changed to verify: (1) callback fires with correct data, (2) fires exactly once (not doubled by strict-mode), (3) no React render-phase console warnings. This is a stronger assertion set that proves the same thing.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/app/(dashboard)/page.tsx` — replaced `queueMicrotask` render-phase block with `useEffect`
- `dashboard/src/components/reviews/ReviewQueue.tsx` — replaced render-body `onStatsUpdate` call with `useEffect` + `useRef`
- `dashboard/src/__tests__/pages/home-page.test.tsx` — new test file (2 tests)
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — extended with 1 new test case
- `.gsd/milestones/M009/slices/S04/S04-PLAN.md` — added Observability/Diagnostics section, marked T01 done
- `.gsd/milestones/M009/slices/S04/tasks/T01-PLAN.md` — added Observability Impact section
