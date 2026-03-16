# T01: Fix render-phase side effects in HomePage and ReviewQueue

## Description

Two dashboard components set state during the render phase — a React anti-pattern that fires twice in strict mode and will break under concurrent features. Both need to move their state updates into `useEffect` hooks.

**HomePage** (`page.tsx` line ~41): Uses `queueMicrotask(() => setLastUpdated(...))` during render. Despite the microtask wrapper, this is still a render-phase side effect — it fires synchronously within the same task.

**ReviewQueue** (`ReviewQueue.tsx` lines ~89-91): Calls `onStatsUpdate(data.stats)` unconditionally during render to propagate stats to the parent.

## Steps

1. **Fix HomePage render-phase side effect**
   - File: `dashboard/src/app/(dashboard)/page.tsx`
   - Add `useEffect` to the import from `react` (currently imports `useState, useCallback`)
   - Remove the entire block (~lines 36-42):
     ```
     if (
       violations.dataUpdatedAt &&
       (!lastUpdated || violations.dataUpdatedAt > lastUpdated.getTime())
     ) {
       queueMicrotask(() => setLastUpdated(new Date(violations.dataUpdatedAt)));
     }
     ```
   - Replace with a `useEffect` after the data hooks section:
     ```tsx
     useEffect(() => {
       if (violations.dataUpdatedAt) {
         setLastUpdated(new Date(violations.dataUpdatedAt));
       }
     }, [violations.dataUpdatedAt]);
     ```
   - The `handleRefresh` callback at ~line 48 that calls `setLastUpdated(new Date())` is event-driven — leave it as-is.

2. **Fix ReviewQueue render-phase side effect**
   - File: `dashboard/src/components/reviews/ReviewQueue.tsx`
   - Add `useEffect, useRef` to the react import
   - Remove the bare render-body call (~lines 89-91):
     ```
     if (data?.stats && onStatsUpdate) {
       onStatsUpdate(data.stats);
     }
     ```
   - Add a ref to stabilize the callback identity (avoids effect re-triggers when parent re-renders with a new inline function):
     ```tsx
     const onStatsUpdateRef = useRef(onStatsUpdate);
     onStatsUpdateRef.current = onStatsUpdate;
     ```
   - Add a `useEffect` that fires when stats data changes:
     ```tsx
     useEffect(() => {
       if (data?.stats && onStatsUpdateRef.current) {
         onStatsUpdateRef.current(data.stats);
       }
     }, [data?.stats]);
     ```

3. **Create HomePage test**
   - File: `dashboard/src/__tests__/pages/home-page.test.tsx` (new)
   - Mock the dashboard hooks (`@/hooks/use-dashboard-stats`) to return controlled data with a `dataUpdatedAt` timestamp
   - Mock `@tanstack/react-query` for `useQueryClient`
   - Mock child components (`KpiCards`, `TimeRangeSelector`, `ViolationChart`, `VendorUsageChart`, `ActivityFeed`) as simple stubs to avoid deep dependency trees
   - Test: render HomePage, verify that `lastUpdated` display updates after mock data arrives (use `waitFor`)
   - Test: verify no console warnings about state updates during render

4. **Extend ReviewQueue test**
   - File: `dashboard/src/__tests__/components/review-queue-simple.test.tsx`
   - Add test: render `ReviewQueue` with an `onStatsUpdate` spy; mock `useReviewQueue` to return `data.stats`. Use `waitFor` to assert the spy is called — proving it runs via effect, not synchronously during render.
   - The spy should NOT be called before `waitFor` — if it were, it would mean it ran during render.

## Must-Haves

- `queueMicrotask` call removed from `page.tsx` render body
- `onStatsUpdate` call removed from `ReviewQueue.tsx` render body
- Both replaced with `useEffect` hooks
- `useRef` used in ReviewQueue to stabilize `onStatsUpdate` callback identity
- New HomePage test passes
- Extended ReviewQueue test passes

## Verification

```bash
cd dashboard && npx vitest run home-page review-queue-simple
```

## Observability Impact

These are pure React pattern fixes — no new runtime signals, endpoints, or logs. The observable change:
- **Before:** Strict-mode React would double-fire `queueMicrotask` state updates in HomePage and call `onStatsUpdate` twice per render in ReviewQueue. React DevTools would show render-phase side effects.
- **After:** Both updates fire exactly once via `useEffect`. No render-phase warnings in console. React DevTools Profiler shows clean commit phases without side-effect violations.
- **Future agent inspection:** Run `npx vitest run home-page review-queue-simple` — both test files verify the effects fire correctly and no render-phase warnings are emitted.

- `dashboard/src/app/(dashboard)/page.tsx` — render-phase `queueMicrotask` at line ~41
- `dashboard/src/components/reviews/ReviewQueue.tsx` — render-phase `onStatsUpdate` at lines ~89-91
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — existing test file to extend

## Expected Output

- Modified `page.tsx` with `useEffect` replacing `queueMicrotask` render-phase block
- Modified `ReviewQueue.tsx` with `useEffect` + `useRef` replacing render-phase `onStatsUpdate`
- New `dashboard/src/__tests__/pages/home-page.test.tsx` with ≥2 test cases
- Extended `review-queue-simple.test.tsx` with ≥1 new test case
- `npx vitest run home-page review-queue-simple` passes
