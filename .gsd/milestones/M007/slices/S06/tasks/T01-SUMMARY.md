---
id: T01
parent: S06
milestone: M007
provides:
  - Per-request nonce-based CSP middleware replacing static unsafe-inline CSP
  - Inline style refactoring to Tailwind classes for style-src nonce compliance
key_files:
  - dashboard/src/proxy.ts
  - dashboard/next.config.ts
  - dashboard/src/app/layout.tsx
  - dashboard/src/app/(dashboard)/layout.tsx
  - dashboard/src/components/dashboard/VendorUsageChart.tsx
  - dashboard/src/__tests__/middleware.test.ts
key_decisions:
  - D035: CSP nonce middleware replaces static CSP headers
patterns_established:
  - Nonce generation via crypto.randomUUID() + base64 in proxy.ts middleware
  - x-nonce request header propagation for Server Component nonce access
  - Async root layout pattern for reading request headers in Server Components
observability_surfaces:
  - CSP header visible in browser DevTools Network → Response Headers → Content-Security-Policy
  - CSP violations in browser console (Refused to execute inline script / apply inline style) indicate missing nonces
  - Nonce values are ephemeral per-request — no persistence or logging
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: CSP nonce middleware with inline style refactor

**Replaced static `unsafe-inline` CSP with per-request nonce-based CSP middleware and refactored inline styles to Tailwind classes**

## What Happened

Created nonce-based CSP generation in `dashboard/src/proxy.ts` (Next.js 16 uses `proxy.ts` as the middleware entry point, not `middleware.ts`). The proxy generates a cryptographic nonce per request via `crypto.randomUUID()` + base64 encoding, builds a CSP header with `'nonce-{n}'` + `'strict-dynamic'` in `script-src` and `'nonce-{n}'` in `style-src`, and sets the CSP on every response. The nonce is propagated to Server Components via the `x-nonce` request header.

Removed the static CSP from `next.config.ts` `headers()` — the other four security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) remain.

Made the root layout async to read `x-nonce` from `headers()` and pass it as a `nonce` prop to `ThemeProvider` (which forwards to `next-themes`).

Refactored two inline `style` usages:
- Sonner `toastOptions.style` → `toastOptions.className` with Tailwind equivalents
- VendorUsageChart `style={{ borderColor }}` → `border-border` Tailwind class

Session-gating logic stays in `proxy.ts` with nonce generation merged alongside it.

## Verification

- `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` — **17 tests pass** (8 new CSP/nonce tests + 1 dev-mode test + 8 existing session-gating tests)
- `cd dashboard && npx next build` — **succeeds** (async root layout, nonce middleware, all routes dynamic)
- `grep -c "'unsafe-inline'" dashboard/src/proxy.ts` — **0** (no unsafe-inline in production CSP)
- `grep -c "x-nonce" dashboard/src/app/layout.tsx` — **1** (nonce read from headers)
- `grep -c "style:" dashboard/src/app/(dashboard)/layout.tsx` — **0** (inline style removed)
- `grep -c "style=" dashboard/src/components/dashboard/VendorUsageChart.tsx` — **0** (inline style removed)

### Slice-level checks (partial — T01 is first of 3 tasks):
- ✅ middleware tests pass with nonce assertions
- ✅ `next build` succeeds with async root layout and nonce middleware
- ⏳ `helm template` — T02
- ⏳ `cargo build` with full_text_storage warnings — T03
- ✅ `grep unsafe-inline proxy.ts` returns 0
- ✅ `grep x-nonce layout.tsx` returns 1+

## Diagnostics

- **CSP header**: Browser DevTools → Network → any response → `Content-Security-Policy` header shows nonce-based directives
- **CSP violations**: Browser console shows `Refused to execute inline script` or `Refused to apply inline style` if a script/style is missing its nonce
- **Nonce values**: Ephemeral per-request, not logged or persisted

## Deviations

- **No separate `middleware.ts` file**: Next.js 16 errors when both `proxy.ts` and `middleware.ts` exist (`"Please use proxy.ts only"`). All logic stays in `proxy.ts` instead of creating a new `middleware.ts` and having `proxy.ts` re-export. This is the correct Next.js 16 pattern.
- **`tsconfig.json` excludes `playwright.config.ts`**: Pre-existing build failure (TS can't find `@playwright/test` types) was blocking `next build`. Added `playwright.config.ts` to `exclude` array — this is a config fix, not a task deviation.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/proxy.ts` — Rewritten: nonce CSP generation + session gating middleware (was session-only)
- `dashboard/next.config.ts` — Removed static CSP header from `headers()`, kept other security headers
- `dashboard/src/app/layout.tsx` — Made async, reads `x-nonce` from headers, passes `nonce` to ThemeProvider
- `dashboard/src/app/(dashboard)/layout.tsx` — Sonner inline `style` replaced with `className` (Tailwind)
- `dashboard/src/components/dashboard/VendorUsageChart.tsx` — Inline `borderColor` style replaced with `border-border` class
- `dashboard/src/__tests__/middleware.test.ts` — Extended with 9 CSP/nonce tests, kept 8 session-gating tests
- `dashboard/tsconfig.json` — Excluded `playwright.config.ts` from compilation (pre-existing build fix)
