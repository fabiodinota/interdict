---
estimated_steps: 9
estimated_files: 8
---

# T01: CSP nonce middleware with inline style refactor

**Slice:** S06 — Security & CSP Hardening
**Milestone:** M007

## Description

Replace the static `Content-Security-Policy` header (with `'unsafe-inline'`) in `next.config.ts` with a per-request nonce-based CSP generated in Next.js middleware. Merge the existing session-gating logic from `proxy.ts` into the new `middleware.ts`. Make the root layout async to read the nonce from the `x-nonce` request header and pass it to `ThemeProvider` (which forwards it to `next-themes`). Refactor the two inline `style` usages (Sonner toastOptions in dashboard layout, VendorUsageChart borderColor) to CSS classes so `style-src` can also drop `'unsafe-inline'`. Update the existing middleware test to cover nonce generation and CSP header correctness.

## Steps

1. Create `dashboard/src/middleware.ts`:
   - Generate nonce: `const nonce = Buffer.from(crypto.randomUUID()).toString('base64')`
   - Build CSP string with `'nonce-${nonce}'` + `'strict-dynamic'` in `script-src`, `'nonce-${nonce}'` in `style-src`
   - In dev mode (`process.env.NODE_ENV === 'development'`), add `'unsafe-eval'` to `script-src`
   - Set `Content-Security-Policy` on response headers
   - Set `x-nonce` on request headers (for Server Component access)
   - Merge session-gating logic from `proxy.ts`: check `interdict_session` cookie, redirect unauthenticated non-API/non-login to `/login`, redirect authenticated `/login` to `/`
   - Export `config.matcher` excluding `_next/static`, `_next/image`, `favicon.ico`

2. Remove CSP header from `next.config.ts` `headers()` — keep the other security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)

3. Make `dashboard/src/app/layout.tsx` async:
   - Import `headers` from `next/headers`
   - `const nonce = (await headers()).get('x-nonce') ?? undefined`
   - Pass `nonce={nonce}` to `<ThemeProvider>`

4. Refactor Sonner inline style in `dashboard/src/app/(dashboard)/layout.tsx`:
   - Replace `toastOptions: { style: { fontSize, padding, borderRadius, boxShadow } }` with `toastOptions: { className: "text-sm p-4 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]" }` (Tailwind equivalents)

5. Refactor VendorUsageChart inline style in `dashboard/src/components/dashboard/VendorUsageChart.tsx`:
   - Replace `style={{ borderColor: "var(--color-border)" }}` with `className="... border-border"` (merge into existing className)

6. Update `proxy.ts` — either remove it or re-export from middleware for backward compatibility. Since the test file imports from `@/proxy`, keep `proxy.ts` exporting the middleware function for test compatibility, or update the test import.

7. Update `dashboard/src/__tests__/middleware.test.ts`:
   - Update import to use the new middleware
   - Add tests verifying: (a) CSP header is present on responses, (b) nonce appears in CSP `script-src`, (c) `x-nonce` request header is set, (d) no `'unsafe-inline'` in production CSP `script-src`, (e) `'unsafe-eval'` appears in dev mode only
   - Keep all existing session-gating test cases

8. Verify `next build` succeeds with the async layout and middleware

9. Run vitest to confirm all tests pass

## Must-Haves

- [ ] `script-src` contains `'nonce-{n}'` and `'strict-dynamic'`, no `'unsafe-inline'`
- [ ] `style-src` contains `'nonce-{n}'`, no `'unsafe-inline'`
- [ ] Root layout reads `x-nonce` from headers and passes to ThemeProvider
- [ ] Zero inline `style` attributes in SSR-rendered HTML from dashboard layout and VendorUsageChart
- [ ] Session-gating behavior preserved (all existing test cases pass)
- [ ] Middleware matcher excludes static assets
- [ ] Dev mode includes `'unsafe-eval'` for HMR

## Verification

- `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` — all tests pass including new nonce assertions
- `cd dashboard && npx next build` — succeeds without errors
- `grep "'unsafe-inline'" dashboard/src/middleware.ts` — zero matches in production CSP block
- `grep "x-nonce" dashboard/src/app/layout.tsx` — at least 1 match

## Observability Impact

- Signals added/changed: CSP header now dynamic per-request (nonce changes every request); CSP violations in browser console if any inline script/style lacks nonce
- How a future agent inspects this: browser DevTools → Network → Response Headers → `Content-Security-Policy`; browser console for CSP violation errors
- Failure state exposed: `Refused to execute inline script` or `Refused to apply inline style` in browser console indicates a script/style missing its nonce

## Inputs

- `dashboard/src/proxy.ts` — existing session-gating logic to merge
- `dashboard/next.config.ts` — existing CSP header to remove/replace
- `dashboard/src/app/layout.tsx` — sync layout to make async
- `dashboard/src/components/theme-provider.tsx` — already accepts `nonce` prop via spread
- `dashboard/src/__tests__/middleware.test.ts` — existing test file to extend
- S06-RESEARCH.md — nonce pattern details, `next-themes` nonce support confirmation, inline style inventory

## Expected Output

- `dashboard/src/middleware.ts` — new file: nonce CSP + session gating middleware
- `dashboard/src/proxy.ts` — modified or removed (logic moved to middleware)
- `dashboard/next.config.ts` — CSP header removed from `headers()`
- `dashboard/src/app/layout.tsx` — async, reads nonce, passes to ThemeProvider
- `dashboard/src/app/(dashboard)/layout.tsx` — Sonner inline style replaced with className
- `dashboard/src/components/dashboard/VendorUsageChart.tsx` — inline borderColor replaced with Tailwind class
- `dashboard/src/__tests__/middleware.test.ts` — updated with nonce/CSP assertions
