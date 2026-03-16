# S04: Dashboard Quality & Accessibility

**Goal:** Eliminate render-phase side effects, consolidate repeated intervals, use shared cookie config, and add missing ARIA attributes across dashboard components.

**Demo:** `npx vitest run` in dashboard/ passes with zero React strict-mode warnings. BatchVerifyTable checkboxes, VendorCard toggle, and anomaly severity tabs are accessible by screen reader.

## Must-Haves

- HomePage `queueMicrotask(() => setLastUpdated(...))` replaced with `useEffect` watching `violations.dataUpdatedAt`
- ReviewQueue `onStatsUpdate(data.stats)` moved from render body into `useEffect`
- SlaTimer uses a single shared interval for all instances instead of per-instance `setInterval`
- SAML callback uses `getSessionCookieOptions()` from `@/lib/auth` instead of hardcoded cookie options
- BatchVerifyTable checkboxes have `aria-label` ("Select all bundles" / "Select bundle {id}")
- VendorCard toggle button has `aria-expanded={expanded}`
- Anomaly severity tabs have `role="tablist"` on container, `role="tab"` + `aria-selected` on buttons

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cd dashboard && npx vitest run` — all tests pass, zero failures
- New test: `dashboard/src/__tests__/pages/home-page.test.tsx` — verifies `lastUpdated` set via effect, not during render
- New test assertions in `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — verifies `onStatsUpdate` called via effect
- New test assertions in `dashboard/src/__tests__/components/sla-timer.test.tsx` — verifies single interval for multiple instances
- New test assertions in `dashboard/src/__tests__/api/auth-saml-callback.test.ts` — verifies `getSessionCookieOptions()` is used
- New test assertions in `dashboard/src/__tests__/components/batch-verify-table.test.tsx` — verifies `aria-label` on checkboxes
- New test assertions in `dashboard/src/__tests__/components/vendor-card.test.tsx` — verifies `aria-expanded` on toggle
- New test: `dashboard/src/__tests__/pages/anomalies-page.test.tsx` — verifies `role="tablist"`, `role="tab"`, `aria-selected`

## Tasks

- [x] **T01: Fix render-phase side effects in HomePage and ReviewQueue** `est:45m`
  - Why: Both components set state during render — violates React's purity contract, causes double-fires in strict mode, and will break under concurrent features. Highest-value fix in this slice.
  - Files: `dashboard/src/app/(dashboard)/page.tsx`, `dashboard/src/components/reviews/ReviewQueue.tsx`, `dashboard/src/__tests__/pages/home-page.test.tsx` (new), `dashboard/src/__tests__/components/review-queue-simple.test.tsx`
  - Do:
    1. In `page.tsx`: remove the `queueMicrotask(() => setLastUpdated(new Date(violations.dataUpdatedAt)))` call from the render body (~line 41). Replace with a `useEffect` that watches `violations.dataUpdatedAt` and calls `setLastUpdated(new Date(violations.dataUpdatedAt))` when it changes. Keep the existing `setLastUpdated(new Date())` call inside `onSuccess` callback (~line 48) unchanged — that's event-driven, not render-phase.
    2. In `ReviewQueue.tsx`: remove the bare `if (data?.stats && onStatsUpdate) { onStatsUpdate(data.stats) }` from the render body (~lines 89-91). Replace with a `useEffect` that watches `data?.stats` and `onStatsUpdate`, calling `onStatsUpdate(data.stats)` when stats change. Use a ref for `onStatsUpdate` to avoid re-triggering the effect when the callback identity changes.
    3. Create `dashboard/src/__tests__/pages/home-page.test.tsx`: test that `lastUpdated` is set after query data arrives (use `@testing-library/react` `waitFor`), mock `useViolations` to return `dataUpdatedAt`.
    4. Extend `review-queue-simple.test.tsx`: add test that mounts ReviewQueue with an `onStatsUpdate` spy and verifies it's called after render settles (via `waitFor`), not synchronously during render.
  - Verify: `cd dashboard && npx vitest run home-page review-queue-simple`
  - Done when: Both tests pass, no render-phase state updates remain in either component

- [ ] **T02: SlaTimer shared interval + SAML cookie consolidation** `est:45m`
  - Why: SlaTimer creates one `setInterval` per mounted instance — 50 review items means 50 intervals. SAML callback hardcodes cookie options instead of using the shared `getSessionCookieOptions()` helper (D057).
  - Files: `dashboard/src/components/reviews/SlaTimer.tsx`, `dashboard/src/__tests__/components/sla-timer.test.tsx`, `dashboard/src/app/api/auth/saml-callback/route.ts`, `dashboard/src/__tests__/api/auth-saml-callback.test.ts`
  - Do:
    1. In `SlaTimer.tsx`: create a module-level tick manager (a `Set<() => void>` of subscriber callbacks driven by a single `setInterval(fn, 1000)`). The interval starts when the first subscriber registers and clears when the last unsubscribes. Each `SlaTimer` component registers its update callback on mount and unregisters on unmount via `useEffect`. The existing countdown logic inside each component stays — only the interval driving mechanism changes.
    2. Extend `sla-timer.test.tsx`: add test that renders 3 SlaTimer instances, advances fake timers by 1 tick, and asserts all three update. Verify via `vi.spyOn(global, 'setInterval')` that only 1 interval was created (not 3). After unmounting all, verify `clearInterval` was called.
    3. In `saml-callback/route.ts`: import `getSessionCookieOptions` from `@/lib/auth`. Replace the hardcoded `{ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", ... }` object in `response.cookies.set()` with `getSessionCookieOptions()`. Keep `maxAge` and `path` if they differ from the shared options (check `getSessionCookieOptions` output).
    4. Extend `auth-saml-callback.test.ts`: verify the cookie set on successful callback uses the options from `getSessionCookieOptions()`. Mock `@/lib/auth` to include `getSessionCookieOptions` and verify it's called.
  - Verify: `cd dashboard && npx vitest run sla-timer auth-saml-callback`
  - Done when: SlaTimer tests show single interval for multiple instances; SAML callback test confirms shared cookie options used

- [ ] **T03: ARIA attributes on BatchVerifyTable, VendorCard, and anomaly tabs** `est:45m`
  - Why: Three accessibility gaps identified in assessment — checkboxes without labels, toggle without expanded state, tabs without ARIA roles. All are additive attribute additions.
  - Files: `dashboard/src/components/evidence/BatchVerifyTable.tsx`, `dashboard/src/__tests__/components/batch-verify-table.test.tsx`, `dashboard/src/components/vendors/VendorCard.tsx`, `dashboard/src/__tests__/components/vendor-card.test.tsx`, `dashboard/src/app/(dashboard)/anomalies/page.tsx`, `dashboard/src/__tests__/pages/anomalies-page.test.tsx` (new)
  - Do:
    1. In `BatchVerifyTable.tsx`: add `aria-label="Select all bundles"` to the header checkbox (`<input type="checkbox">`). Add `aria-label={`Select bundle ${bundle.id}`}` (or equivalent identifier) to each row checkbox. Use the bundle's ID or a meaningful display name.
    2. In `VendorCard.tsx`: find the button/element that toggles model visibility ("Show models" / "Hide models"). Add `aria-expanded={expanded}` where `expanded` is the boolean state controlling visibility.
    3. In `anomalies/page.tsx`: add `role="tablist"` to the `<div>` wrapping the severity filter buttons (~line 131). Add `role="tab"` and `aria-selected={severityFilter === tab.key}` to each `<button>` inside the map.
    4. Extend `batch-verify-table.test.tsx`: use `getByRole("checkbox", { name: "Select all bundles" })` and `getByRole("checkbox", { name: /Select bundle/ })` to verify aria-labels.
    5. Extend `vendor-card.test.tsx`: verify `aria-expanded="false"` before toggle click, `aria-expanded="true"` after.
    6. Create `dashboard/src/__tests__/pages/anomalies-page.test.tsx`: render the anomalies page (mock `useAnomalies` hook), verify `role="tablist"` container exists, `role="tab"` elements exist for each severity, and clicking a tab sets `aria-selected="true"`.
    7. Run full dashboard test suite: `cd dashboard && npx vitest run` — zero failures.
  - Verify: `cd dashboard && npx vitest run batch-verify vendor-card anomalies-page`
  - Done when: All three ARIA patterns testable via `getByRole` queries; full `npx vitest run` passes with zero failures

## Observability / Diagnostics

This slice is purely client-side React fixes (side effects, intervals, ARIA attributes) with no new runtime servers, API endpoints, or background processes. Observable signals:

- **Test suite:** `cd dashboard && npx vitest run` — 54 files, 403+ tests. Zero failures is the green signal.
- **React DevTools:** After these fixes, Profiler should show no render-phase side effects in HomePage or ReviewQueue. SlaTimer should show one interval source in the React hooks inspector.
- **Accessibility audit:** Lighthouse or axe-core scans should no longer flag missing labels on BatchVerifyTable checkboxes, VendorCard toggle, or anomaly severity tabs.
- **Failure visibility:** Any regression reintroducing render-phase side effects will be caught by the `console.error` spy assertions in home-page.test.tsx and review-queue-simple.test.tsx.
- **No secrets or redaction concerns** — this slice touches only UI components and test files.

## Files Likely Touched

- `dashboard/src/app/(dashboard)/page.tsx`
- `dashboard/src/components/reviews/ReviewQueue.tsx`
- `dashboard/src/components/reviews/SlaTimer.tsx`
- `dashboard/src/app/api/auth/saml-callback/route.ts`
- `dashboard/src/components/evidence/BatchVerifyTable.tsx`
- `dashboard/src/components/vendors/VendorCard.tsx`
- `dashboard/src/app/(dashboard)/anomalies/page.tsx`
- `dashboard/src/__tests__/pages/home-page.test.tsx` (new)
- `dashboard/src/__tests__/pages/anomalies-page.test.tsx` (new)
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx`
- `dashboard/src/__tests__/components/sla-timer.test.tsx`
- `dashboard/src/__tests__/api/auth-saml-callback.test.ts`
- `dashboard/src/__tests__/components/batch-verify-table.test.tsx`
- `dashboard/src/__tests__/components/vendor-card.test.tsx`
