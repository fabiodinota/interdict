---
id: S06
parent: M007
milestone: M007
provides:
  - Per-request nonce-based CSP replacing unsafe-inline in script-src and style-src
  - Helm NetworkPolicy enabled by default for all 4 services (zero-trust pod-to-pod)
  - Startup tracing::warn! when full_text_storage is enabled (kernel + evidence-collector)
  - Operator guide for full_text_storage covering security, GDPR, and configuration
requires:
  - slice: S05
    provides: CI pipeline infrastructure for secret scanning and security gate integration
affects:
  - S08
key_files:
  - dashboard/src/proxy.ts
  - dashboard/next.config.ts
  - dashboard/src/app/layout.tsx
  - dashboard/src/app/(dashboard)/layout.tsx
  - dashboard/src/components/dashboard/VendorUsageChart.tsx
  - dashboard/src/__tests__/middleware.test.ts
  - helm/interdict/values.yaml
  - crates/evidence-collector/src/main.rs
  - crates/kernel/src/bootstrap.rs
  - crates/kernel/src/proxy/connect.rs
  - docs/operator/full-text-storage.md
key_decisions:
  - D035: CSP nonce middleware replaces static CSP headers; inline styles refactored to Tailwind
  - D036: Helm NetworkPolicy enabled by default with CNI documentation
patterns_established:
  - Nonce generation via crypto.randomUUID() + base64 in proxy.ts middleware with x-nonce header propagation
  - Async root layout pattern for reading request headers in Server Components
  - Startup warn! pattern for risky config flags with cross-reference to operator docs
  - YAML inline comment documenting infrastructure prerequisites (CNI) at toggle point
observability_surfaces:
  - CSP header visible in browser DevTools Network → Response Headers → Content-Security-Policy
  - CSP violations in browser console (Refused to execute inline script / apply inline style)
  - tracing::warn! at startup in kernel and evidence-collector when full_text_storage is enabled
  - helm template output shows 4 NetworkPolicy manifests
  - kubectl get networkpolicy shows active policies at runtime
drill_down_paths:
  - .gsd/milestones/M007/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S06/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S06/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-15
---

# S06: Security & CSP Hardening

**Replaced unsafe-inline CSP with per-request nonce-based middleware, enabled zero-trust Helm network policies by default, and added full_text_storage operator warnings and documentation**

## What Happened

Three changes hardened the security posture across dashboard, Helm, and Rust services:

**CSP Nonce Middleware (T01):** Rewrote `proxy.ts` to generate a cryptographic nonce per request via `crypto.randomUUID()` + base64. The CSP header uses `'nonce-{n}'` + `'strict-dynamic'` in `script-src` and `'nonce-{n}'` in `style-src`, eliminating all `'unsafe-inline'` from production. The nonce propagates via `x-nonce` request header to the async root layout, which passes it to `ThemeProvider` (next-themes). Two inline `style` usages — Sonner toastOptions and VendorUsageChart borderColor — were refactored to Tailwind classes. Dev mode retains `'unsafe-eval'` for React Fast Refresh. Session-gating logic merged alongside nonce generation in the same `proxy.ts`. Static CSP removed from `next.config.ts` headers(); other security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) remain. 17 middleware tests pass (9 new CSP/nonce + 8 existing session-gating).

**Helm Network Policies (T02):** Flipped `networkPolicy.enabled` from `false` to `true` for all 4 services (kernel, controlPlane, evidenceCollector, dashboard) in `values.yaml`. The NetworkPolicy templates already had correct ingress/egress rules — this change activates zero-trust pod-to-pod communication by default. Each toggle has a YAML comment documenting the CNI requirement (Calico, Cilium) and how to disable.

**full_text_storage Warnings (T03):** Added `tracing::warn!` at startup in both evidence-collector `main.rs` and kernel `bootstrap.rs` when `full_text_storage` is enabled, warning about encryption-at-rest, GDPR/data-residency implications, and referencing the operator guide. Added doc comment on `build_evidence_event` in `connect.rs` explaining the flag's privacy implications. Created 163-line operator guide at `docs/operator/full-text-storage.md` covering what the flag does, both env vars, security requirements, GDPR Article 17 obligations, data residency, retention policies, and Docker Compose/Helm configuration examples.

## Verification

All slice-level verification checks pass:

- `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` — **17 tests pass** (9 CSP/nonce + 8 session-gating) ✅
- `cd dashboard && npx next build` — **succeeds** with async root layout and nonce middleware ✅
- `helm template interdict helm/interdict --dependency-update | grep -c "kind: NetworkPolicy"` — **4** ✅
- `cargo build -p kernel -p evidence-collector` — **compiles** with full_text_storage warnings ✅
- `grep -c "unsafe-inline" dashboard/src/proxy.ts` — **0** ✅
- `grep -c "x-nonce" dashboard/src/app/layout.tsx` — **1** ✅
- `grep -c "tracing::warn" crates/evidence-collector/src/main.rs` — **2** (≥1) ✅
- `grep -c "tracing::warn" crates/kernel/src/bootstrap.rs` — **1** (≥1) ✅
- `test -f docs/operator/full-text-storage.md` — **exists** ✅

## Requirements Advanced

- PR-SEC-01 (CSP nonce-based policy) — Dashboard CSP uses per-request nonces with zero unsafe-inline in script-src and style-src
- PR-SEC-02 (Helm network policies) — All 4 services have NetworkPolicy enabled by default
- PR-SEC-03 (No unaddressed security advisories) — full_text_storage risk documented with startup warnings

## Requirements Validated

- None newly validated (these advance toward PR-SEC criteria but final validation requires S08 browser-level verification)

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- **No separate `middleware.ts` file**: Next.js 16 errors when both `proxy.ts` and `middleware.ts` exist. All middleware logic stays in `proxy.ts` — this is the correct Next.js 16 pattern.
- **`tsconfig.json` excludes `playwright.config.ts`**: Pre-existing build failure (missing `@playwright/test` types) was blocking `next build`. Added to exclude array — a config fix, not a task deviation.
- **Kernel warning uses block expression**: The env var parse is inline inside `ProxyService::with_distribution()`, so the warn! uses `{ let full_text = ...; if full_text { warn!(...) } full_text }` to avoid duplicating parse logic.

## Known Limitations

- Browser-level CSP verification deferred to S08 (axe-core pass) — current proof is structural (build + test + grep)
- `helm template` requires `--dependency-update` on Helm v4.x with OCI-based subchart dependencies
- Nonce values are ephemeral per-request — no server-side logging or persistence (by design)

## Follow-ups

- S08: Browser-level CSP verification with axe-core to confirm zero console violations
- S08: Document the `proxy.ts` (not `middleware.ts`) pattern in operator guide for Next.js 16

## Files Created/Modified

- `dashboard/src/proxy.ts` — Rewritten: nonce CSP generation + session gating middleware
- `dashboard/next.config.ts` — Removed static CSP header, kept other security headers
- `dashboard/src/app/layout.tsx` — Made async, reads x-nonce from headers, passes nonce to ThemeProvider
- `dashboard/src/app/(dashboard)/layout.tsx` — Sonner inline style replaced with className (Tailwind)
- `dashboard/src/components/dashboard/VendorUsageChart.tsx` — Inline borderColor style replaced with border-border class
- `dashboard/src/__tests__/middleware.test.ts` — Extended with 9 CSP/nonce tests, kept 8 session-gating tests
- `dashboard/tsconfig.json` — Excluded playwright.config.ts from compilation
- `helm/interdict/values.yaml` — Flipped 4 networkPolicy.enabled to true, added CNI comments
- `crates/evidence-collector/src/main.rs` — Added startup tracing::warn! for full_text_storage
- `crates/kernel/src/bootstrap.rs` — Added startup tracing::warn! for full_text_storage
- `crates/kernel/src/proxy/connect.rs` — Added doc comment on build_evidence_event
- `docs/operator/full-text-storage.md` — New 163-line operator guide

## Forward Intelligence

### What the next slice should know
- Next.js 16 uses `proxy.ts` as the sole middleware entry point — creating `middleware.ts` alongside it causes a build error. All request interception (CSP, session gating, routing) lives in `proxy.ts`.
- The async root layout pattern (`export default async function RootLayout`) is required for reading request headers in Server Components — this affects any future layout modifications.
- `helm template` on Helm v4.x requires `--dependency-update` when OCI-based subchart dependencies are present, even if `.tgz` files exist in `charts/`.

### What's fragile
- CSP nonce propagation chain (`proxy.ts` → `x-nonce` header → `layout.tsx` → ThemeProvider) — any middleware that strips or rewrites request headers will break nonce delivery to Server Components.
- `style-src 'nonce-{n}'` without `'unsafe-inline'` — any new inline `style` attribute added by a developer or dependency will trigger CSP violations in the browser console.

### Authoritative diagnostics
- `grep -c "unsafe-inline" dashboard/src/proxy.ts` must return 0 — any non-zero indicates CSP regression
- `helm template interdict helm/interdict --dependency-update | grep -c "kind: NetworkPolicy"` must return 4
- Browser DevTools → Network → Response Headers → Content-Security-Policy shows the live nonce-based header

### What assumptions changed
- Assumed `middleware.ts` was the correct Next.js entry point — Next.js 16 requires `proxy.ts` only
- Assumed `helm template` would work without flags — Helm v4.x OCI dependencies require `--dependency-update`
