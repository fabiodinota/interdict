# T02: SlaTimer shared interval + SAML cookie consolidation

## Description

Two behavioral correctness fixes:

**SlaTimer**: Each mounted `SlaTimer` component creates its own `setInterval(fn, 1000)`. With 50 review items visible, that's 50 independent timers. Refactor to a module-level tick manager — one interval drives all subscribers.

**SAML callback**: The callback handler at `dashboard/src/app/api/auth/saml-callback/route.ts` hardcodes cookie options (`httpOnly: true, secure: NODE_ENV === "production"`, etc.) instead of using the shared `getSessionCookieOptions()` from `@/lib/auth` that respects the `COOKIE_SECURE` env var (D057).

## Steps

1. **Implement shared tick manager in SlaTimer**
   - File: `dashboard/src/components/reviews/SlaTimer.tsx`
   - Add a module-level (outside the component) tick manager:
     ```tsx
     const subscribers = new Set<() => void>();
     let tickInterval: ReturnType<typeof setInterval> | null = null;

     function subscribe(callback: () => void): () => void {
       subscribers.add(callback);
       if (subscribers.size === 1 && !tickInterval) {
         tickInterval = setInterval(() => {
           subscribers.forEach((cb) => cb());
         }, 1000);
       }
       return () => {
         subscribers.delete(callback);
         if (subscribers.size === 0 && tickInterval) {
           clearInterval(tickInterval);
           tickInterval = null;
         }
       };
     }
     ```
   - In the component: replace the existing `useEffect` that creates a per-instance `setInterval` with one that calls `subscribe` and returns the unsubscribe function:
     ```tsx
     useEffect(() => {
       const tick = () => {
         // existing countdown/update logic
       };
       tick(); // fire immediately
       return subscribe(tick);
     }, [/* existing deps */]);
     ```
   - The per-instance countdown calculation logic stays inside the component — only the driving interval is shared.

2. **Extend SlaTimer tests**
   - File: `dashboard/src/__tests__/components/sla-timer.test.tsx`
   - Add test: render 3 `SlaTimer` instances with different deadlines. Spy on `global.setInterval`. Assert exactly 1 `setInterval` call was made, not 3.
   - Add test: unmount all 3. Assert `clearInterval` was called and no interval remains.
   - Add test: advance fake timer by 1 second. Assert all 3 timers updated (their displayed remaining time decreased).
   - Note: SlaTimer tests likely already use `vi.useFakeTimers()` — follow existing patterns.
   - Important: since the tick manager is module-level state, each test should mount fresh and unmount to clean up. Consider adding a `beforeEach` that ensures the module-level interval is clean (unmounting all instances clears it).

3. **Fix SAML callback cookie options**
   - File: `dashboard/src/app/api/auth/saml-callback/route.ts`
   - Add import: `import { getSessionCookieOptions } from "@/lib/auth";`
   - Find the `response.cookies.set(SESSION_COOKIE_NAME, token, { ... })` call (~line 53)
   - The current hardcoded options are:
     ```ts
     {
       httpOnly: true,
       secure: process.env.NODE_ENV === "production",
       sameSite: "lax",
       // maxAge and path may be here too
     }
     ```
   - Replace with: `getSessionCookieOptions()`
   - The shared function already returns `{ httpOnly, secure, sameSite, maxAge, path }` — all fields. Check if the callback was setting a different `maxAge` and preserve it if so by spreading: `{ ...getSessionCookieOptions(), maxAge: customValue }`.
   - Note: `getSessionCookieOptions()` uses `COOKIE_SECURE` env var per D057, which is the correct behavior.

4. **Extend SAML callback test**
   - File: `dashboard/src/__tests__/api/auth-saml-callback.test.ts`
   - The existing mock for `@/lib/auth` needs to include `getSessionCookieOptions`. Add it to the mock returning the expected cookie options object.
   - Add test: on successful SAML callback, verify the response cookie was set with the options returned by `getSessionCookieOptions()` (verify `httpOnly`, `secure`, `sameSite` match).
   - Alternatively: verify `getSessionCookieOptions` was called (if using `vi.fn()`).

## Must-Haves

- Single `setInterval` for any number of `SlaTimer` instances
- Interval starts on first mount, clears on last unmount (no leaked intervals)
- SAML callback uses `getSessionCookieOptions()` — no hardcoded cookie options
- Existing SlaTimer tests still pass (countdown, threshold, transition behavior)
- Existing SAML callback tests still pass

## Verification

```bash
cd dashboard && npx vitest run sla-timer auth-saml-callback
```

## Observability Impact

- **SlaTimer interval count**: In React DevTools Profiler, all mounted SlaTimer instances share a single interval source visible in the hooks inspector. The module-level `subscribers` set size equals the number of mounted timers — inspectable via breakpoint in `subscribe()`.
- **Interval leak detection**: If all SlaTimer instances unmount, `tickInterval` becomes `null` and `subscribers.size === 0`. A leaked interval would show as a non-null `tickInterval` with an empty subscriber set — impossible by construction since cleanup is symmetric.
- **SAML cookie config**: The cookie options are now driven by `COOKIE_SECURE` env var (D057). In non-production environments, set `COOKIE_SECURE=true` to force secure cookies. Incorrect cookie config surfaces as login failures after SAML redirect — check `Set-Cookie` header in browser DevTools Network tab.
- **Test suite**: `npx vitest run sla-timer auth-saml-callback` — 19 tests. Regressions reintroducing per-instance intervals will be caught by the `setInterval` spy assertion.

## Inputs

- `dashboard/src/components/reviews/SlaTimer.tsx` — per-instance `setInterval` at line ~29
- `dashboard/src/__tests__/components/sla-timer.test.tsx` — existing 7 test cases with fake timers
- `dashboard/src/app/api/auth/saml-callback/route.ts` — hardcoded cookie at lines ~53-56
- `dashboard/src/__tests__/api/auth-saml-callback.test.ts` — existing 7 test cases
- `dashboard/src/lib/auth.ts` — `getSessionCookieOptions()` definition at line ~57 (returns `{ httpOnly: true, secure: COOKIE_SECURE ?? NODE_ENV, sameSite: "lax", maxAge: SESSION_COOKIE_MAX_AGE_SECONDS, path: "/" }`)

## Expected Output

- Modified `SlaTimer.tsx` with module-level tick manager (subscribe/unsubscribe pattern)
- Extended `sla-timer.test.tsx` with ≥2 new test cases proving single interval
- Modified `saml-callback/route.ts` using `getSessionCookieOptions()`
- Extended `auth-saml-callback.test.ts` with ≥1 new test case
- `npx vitest run sla-timer auth-saml-callback` passes
