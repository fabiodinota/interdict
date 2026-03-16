---
id: T02
parent: S04
milestone: M009
provides:
  - Shared module-level tick manager for SlaTimer — one setInterval for any number of instances
  - SAML callback cookie options driven by getSessionCookieOptions() (D057 compliance)
key_files:
  - dashboard/src/components/reviews/SlaTimer.tsx
  - dashboard/src/app/api/auth/saml-callback/route.ts
  - dashboard/src/__tests__/components/sla-timer.test.tsx
  - dashboard/src/__tests__/api/auth-saml-callback.test.ts
key_decisions:
  - Module-level subscribe/unsubscribe pattern for SlaTimer — subscribers Set + single tickInterval, starts on first mount, clears on last unmount
  - SAML callback maxAge matches getSessionCookieOptions() exactly (both 28800s), so no override spread needed
patterns_established:
  - Module-level tick manager with Set-based subscribe/unsubscribe for shared intervals across component instances
observability_surfaces:
  - Test suite: `npx vitest run sla-timer auth-saml-callback` — 19 tests (10 SlaTimer + 9 SAML), setInterval spy validates single interval
  - SAML cookie config now respects COOKIE_SECURE env var — incorrect config surfaces as post-SAML login failure
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: SlaTimer shared interval + SAML cookie consolidation

**Replaced per-instance setInterval in SlaTimer with a module-level tick manager and switched SAML callback to use shared getSessionCookieOptions()**

## What Happened

Two independent behavioral fixes:

**SlaTimer**: Added a module-level tick manager (`subscribers` Set + single `tickInterval`) outside the component. `subscribe()` adds a callback and starts the interval on first subscriber; the returned unsubscribe function removes the callback and clears the interval when the last subscriber leaves. Each SlaTimer's `useEffect` calls `subscribe(tick)` and returns the unsubscribe. The per-instance countdown logic is unchanged — only the driving interval is shared.

**SAML callback**: Imported `getSessionCookieOptions` from `@/lib/auth` and replaced the hardcoded `{ httpOnly, secure, sameSite, maxAge, path }` object in `response.cookies.set()`. The hardcoded `maxAge: 8 * 60 * 60` matched `SESSION_COOKIE_MAX_AGE_SECONDS` exactly, so no override was needed.

## Verification

- `npx vitest run sla-timer auth-saml-callback` — 19 tests passed (10 SlaTimer, 9 SAML callback)
  - 3 new SlaTimer tests: single setInterval for multiple instances, clearInterval on last unmount, synced advancement
  - 2 new SAML tests: getSessionCookieOptions() called, cookie attributes match mock output
- `cd dashboard && npx vitest run` — 54 files, 408 tests, zero failures (full suite green)

### Slice-level verification status (T02 of T03):
- ✅ `cd dashboard && npx vitest run` — all tests pass, zero failures
- ✅ home-page.test.tsx — verifies lastUpdated set via effect (T01)
- ✅ review-queue-simple.test.tsx — verifies onStatsUpdate called via effect (T01)
- ✅ sla-timer.test.tsx — verifies single interval for multiple instances (this task)
- ✅ auth-saml-callback.test.ts — verifies getSessionCookieOptions() is used (this task)
- ⬜ batch-verify-table.test.tsx — aria-label on checkboxes (T03)
- ⬜ vendor-card.test.tsx — aria-expanded on toggle (T03)
- ⬜ anomalies-page.test.tsx — role="tablist", role="tab", aria-selected (T03)

## Diagnostics

- **Interval leak detection**: If all SlaTimer instances unmount, `tickInterval` becomes null and `subscribers.size === 0`. Inspect via React DevTools hooks inspector or breakpoint in `subscribe()`.
- **SAML cookie config**: Cookie options now respect `COOKIE_SECURE` env var. Check `Set-Cookie` header in browser DevTools Network tab after SAML redirect to verify.
- **Test commands**: `npx vitest run sla-timer` for interval tests, `npx vitest run auth-saml-callback` for cookie tests.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/components/reviews/SlaTimer.tsx` — Added module-level tick manager (subscribe/unsubscribe), replaced per-instance setInterval with subscribe call in useEffect
- `dashboard/src/__tests__/components/sla-timer.test.tsx` — Added 3 tests: single setInterval for multiple instances, clearInterval on last unmount, synced tick advancement
- `dashboard/src/app/api/auth/saml-callback/route.ts` — Imported getSessionCookieOptions, replaced hardcoded cookie options
- `dashboard/src/__tests__/api/auth-saml-callback.test.ts` — Added getSessionCookieOptions to mock, added 2 tests verifying shared cookie options used
