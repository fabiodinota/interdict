# S04: Dashboard Quality & Accessibility — Research

**Date:** 2026-03-16
**Depth:** Light

## Summary

This slice fixes 6 discrete dashboard issues: two render-phase side effects, one per-instance interval (SlaTimer), one hardcoded cookie config (SAML callback), and three ARIA gaps (BatchVerifyTable checkboxes, VendorCard expand toggle, anomaly severity tabs). All are small, isolated edits to known files with existing test coverage. No new libraries, no architectural changes, no integration risk.

The render-phase side effects are the most important fix — they violate React's render purity contract (setting state during render) and will break under React concurrent features / strict mode double-renders. The `queueMicrotask` workaround in `page.tsx` is still a render-phase side effect (the microtask fires synchronously within the same task). The `onStatsUpdate` call in `ReviewQueue.tsx` fires unconditionally during render.

## Recommendation

Fix each issue independently — no shared abstractions needed. Order doesn't matter since all six changes are to different files with no cross-dependencies. Group tests per file change.

## Implementation Landscape

### Key Files

- `dashboard/src/app/(dashboard)/page.tsx` — HomePage render-phase side effect: `queueMicrotask(() => setLastUpdated(...))` called during render body. Replace with `useEffect` watching `violations.dataUpdatedAt`.
- `dashboard/src/components/reviews/ReviewQueue.tsx` — Render-phase side effect: `onStatsUpdate(data.stats)` called unconditionally during render body (line ~85). Wrap in `useEffect` watching `data?.stats` and `onStatsUpdate`.
- `dashboard/src/components/reviews/SlaTimer.tsx` — Each instance creates its own `setInterval(fn, 1000)`. With 50 review items, that's 50 independent intervals. Replace with a shared module-level tick (single interval, subscriber pattern) or a shared React context. Simpler approach: a module-scope `EventTarget` or `Set<() => void>` that one interval drives.
- `dashboard/src/app/api/auth/saml-callback/route.ts` — Hardcodes cookie options (`httpOnly`, `secure: NODE_ENV === "production"`, `sameSite`, `maxAge`, `path`). Should use `getSessionCookieOptions()` from `@/lib/auth` which already handles `COOKIE_SECURE` env var (D057).
- `dashboard/src/components/evidence/BatchVerifyTable.tsx` — Checkboxes are raw `<input type="checkbox">` without `aria-label`. Header checkbox needs "Select all bundles", row checkboxes need "Select bundle {id}".
- `dashboard/src/components/vendors/VendorCard.tsx` — "Show models" / "Hide models" toggle button lacks `aria-expanded`. Add `aria-expanded={expanded}` to the button element.
- `dashboard/src/app/(dashboard)/anomalies/page.tsx` — Severity filter tabs use plain `<button>` elements inside a styled `<div>`. Missing `role="tablist"` on container and `role="tab"` + `aria-selected` on each button.

### Existing Tests

All target components have test files:

| Component | Test File | Existing Cases |
|-----------|-----------|---------------|
| HomePage | *none* | — |
| ReviewQueue | `review-queue-simple.test.tsx` | ~4 basic render tests |
| SlaTimer | `sla-timer.test.tsx` | 7 (countdown, thresholds, transitions) |
| SAML callback | `auth-saml-callback.test.ts` | 7 (exchange, cookie, redirects) |
| BatchVerifyTable | `batch-verify-table.test.tsx` | 11 (render, selection, pagination) |
| VendorCard | `vendor-card.test.tsx` | 5 (render, toggle, fallbacks) |
| AnomaliesPage | *none* | — |

### Build Order

No dependency ordering needed — all 6 changes are independent. Sensible grouping by risk:

1. **Render-phase side effects** (HomePage + ReviewQueue) — highest value, most likely to cause React warnings. Straightforward `useEffect` wrapping.
2. **SlaTimer shared interval** — moderate complexity (shared tick mechanism). The existing tests with fake timers provide good safety net.
3. **SAML callback cookie options** — one-liner, uses existing `getSessionCookieOptions()`. Existing test already checks cookie attributes.
4. **ARIA attributes** — three files, all additive. BatchVerifyTable checkboxes, VendorCard aria-expanded, anomaly tabs role/aria-selected.

### Verification Approach

- `npx vitest run` in dashboard/ — all existing tests must continue passing
- Add tests for:
  - HomePage: verify `useEffect` sets `lastUpdated` after `dataUpdatedAt` changes (or simply verify no render-phase state update warning)
  - ReviewQueue: verify `onStatsUpdate` is called via effect, not during render
  - SlaTimer: existing tests cover interval behavior — add test verifying single interval for multiple instances
  - SAML callback: extend existing test to verify `getSessionCookieOptions()` is used (mock the import)
  - BatchVerifyTable: verify `aria-label` on checkboxes via `getByRole("checkbox", { name: ... })`
  - VendorCard: verify `aria-expanded` attribute on toggle button
  - Anomaly page: verify `role="tablist"`, `role="tab"`, `aria-selected` on severity filter

## Constraints

- React strict mode double-renders: side effects in render body fire twice in dev, causing duplicate `onStatsUpdate` calls and stale `lastUpdated` values. `useEffect` fixes both.
- SlaTimer shared interval must clean up when last subscriber unmounts — otherwise the interval leaks.
- SAML callback mock in existing tests mocks `@/lib/auth` — the new test for cookie options needs `getSessionCookieOptions` in the mock.
