# S06: Security & CSP Hardening — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are structural (CSP headers, Helm values, Rust warnings, documentation). Build success + test pass + grep verification confirms correctness. Browser-level CSP testing deferred to S08 axe-core pass.

## Preconditions

- Repository checked out with all S06 changes applied
- Node.js and Bun available for dashboard build/test
- Rust toolchain available for `cargo build`
- Helm v4.x available for template rendering
- No additional services need to be running

## Smoke Test

Run `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` — 17 tests pass including 9 CSP/nonce tests.

## Test Cases

### 1. CSP nonce generation produces valid base64 nonce per request

1. Run `cd dashboard && npx vitest run src/__tests__/middleware.test.ts`
2. Verify the test "generates nonce and sets CSP header" passes
3. **Expected:** Test passes — CSP header contains `'nonce-'` followed by a base64 string; nonce differs per request

### 2. Production CSP has zero unsafe-inline

1. Run `grep -c "'unsafe-inline'" dashboard/src/proxy.ts`
2. **Expected:** Output is `0` — no `'unsafe-inline'` in any CSP directive

### 3. script-src uses strict-dynamic with nonce

1. Run `cd dashboard && npx vitest run src/__tests__/middleware.test.ts`
2. Verify the test "script-src includes strict-dynamic" passes
3. **Expected:** Test passes — `script-src` contains both `'nonce-{n}'` and `'strict-dynamic'`

### 4. style-src uses nonce without unsafe-inline

1. Run `cd dashboard && npx vitest run src/__tests__/middleware.test.ts`
2. Verify the test "style-src includes nonce" passes
3. **Expected:** Test passes — `style-src` has `'nonce-{n}'` but not `'unsafe-inline'`

### 5. Dev mode includes unsafe-eval for React Fast Refresh

1. Run `cd dashboard && npx vitest run src/__tests__/middleware.test.ts`
2. Verify the test "dev mode includes unsafe-eval" passes
3. **Expected:** Test passes — dev mode CSP includes `'unsafe-eval'` in script-src

### 6. x-nonce header propagated to root layout

1. Run `grep -c "x-nonce" dashboard/src/app/layout.tsx`
2. **Expected:** Output is `1` or more — layout reads nonce from `x-nonce` request header

### 7. Inline styles removed from Sonner toastOptions

1. Run `grep -c "style:" dashboard/src/app/\(dashboard\)/layout.tsx`
2. **Expected:** Output is `0` — inline style replaced with className/Tailwind

### 8. Inline styles removed from VendorUsageChart

1. Run `grep -c "style=" dashboard/src/components/dashboard/VendorUsageChart.tsx`
2. **Expected:** Output is `0` — inline borderColor replaced with border-border class

### 9. Static CSP removed from next.config.ts

1. Run `grep -c "Content-Security-Policy" dashboard/next.config.ts`
2. **Expected:** Output is `0` — CSP now managed by middleware, not static headers

### 10. Dashboard builds successfully with nonce middleware

1. Run `cd dashboard && npx next build`
2. **Expected:** Build succeeds with zero errors; all routes compile

### 11. Session-gating tests still pass after middleware merge

1. Run `cd dashboard && npx vitest run src/__tests__/middleware.test.ts`
2. Verify all 8 session-gating tests pass alongside the 9 CSP tests
3. **Expected:** All 17 tests pass — session gating behavior unchanged

### 12. All 4 Helm NetworkPolicies render by default

1. Run `helm template interdict helm/interdict --dependency-update | grep -c "kind: NetworkPolicy"`
2. **Expected:** Output is `4` — kernel, controlPlane, evidenceCollector, and dashboard policies render

### 13. NetworkPolicy values show enabled: true

1. Run `grep -A1 "networkPolicy:" helm/interdict/values.yaml`
2. **Expected:** All 4 blocks show `enabled: true`

### 14. CNI requirement documented in values.yaml

1. Run `grep -c "Requires CNI" helm/interdict/values.yaml`
2. **Expected:** Output is `4` — each service has the CNI comment

### 15. evidence-collector emits full_text_storage warning

1. Run `grep -c "tracing::warn" crates/evidence-collector/src/main.rs`
2. **Expected:** Output is ≥1 — startup warning present

### 16. kernel emits full_text_storage warning

1. Run `grep -c "tracing::warn" crates/kernel/src/bootstrap.rs`
2. **Expected:** Output is ≥1 — startup warning present

### 17. Rust crates compile with warnings

1. Run `cargo build -p kernel -p evidence-collector`
2. **Expected:** Build succeeds with zero errors

### 18. Operator guide exists and is substantive

1. Run `test -f docs/operator/full-text-storage.md && wc -l docs/operator/full-text-storage.md`
2. **Expected:** File exists and has ≥40 lines covering security, GDPR, configuration

## Edge Cases

### New inline style added to dashboard component

1. A developer adds `style={{ color: 'red' }}` to a component
2. **Expected:** Browser console shows `Refused to apply inline style` CSP violation — the nonce-based `style-src` blocks inline styles without a matching nonce

### CNI without NetworkPolicy support

1. Deploy Helm chart to a cluster without NetworkPolicy-capable CNI (e.g., default Flannel)
2. **Expected:** NetworkPolicy resources are created but have no effect — pods communicate normally. Operator can set `<service>.networkPolicy.enabled: false` to suppress the resources.

### full_text_storage not set (default)

1. Start kernel or evidence-collector without setting `INTERDICT_EVIDENCE_FULL_TEXT_STORAGE` or `COLLECTOR_FULL_TEXT_STORAGE`
2. **Expected:** No warning emitted — the flag defaults to false

### proxy.ts and middleware.ts both exist

1. Create a `dashboard/src/middleware.ts` alongside the existing `proxy.ts`
2. Run `npx next build`
3. **Expected:** Build error — Next.js 16 requires only `proxy.ts`

## Failure Signals

- `npx vitest run src/__tests__/middleware.test.ts` reports any test failure — CSP generation or session gating is broken
- `npx next build` fails — async layout, nonce propagation, or import structure is broken
- `grep "unsafe-inline" dashboard/src/proxy.ts` returns non-zero — CSP regression
- `helm template` returns fewer than 4 NetworkPolicies — values.yaml reverted
- `cargo build` fails — Rust warning code has compilation errors
- Browser console shows `Refused to execute inline script` — a script tag is missing its nonce attribute

## Requirements Proved By This UAT

- PR-SEC-01 — CSP uses per-request nonces with zero unsafe-inline (proved by tests 1–11)
- PR-SEC-02 — Helm network policies enabled by default for all 4 services (proved by tests 12–14)
- PR-SEC-03 — full_text_storage risks documented and warned at startup (proved by tests 15–18)

## Not Proven By This UAT

- Browser-level CSP enforcement — deferred to S08 axe-core/Playwright verification
- Runtime pod-to-pod network isolation — requires live Kubernetes cluster with NetworkPolicy-capable CNI
- Actual tracing::warn! output at runtime — requires running the binaries with the env var set
- GDPR compliance of full_text_storage documentation — requires legal review

## Notes for Tester

- `helm template` on Helm v4.x requires `--dependency-update` flag due to OCI subchart dependency resolution
- The middleware file is `proxy.ts`, not `middleware.ts` — this is the correct Next.js 16 pattern
- Dev mode CSP intentionally includes `'unsafe-eval'` — this is not a security issue, only applies in development
- The `tsconfig.json` change (excluding playwright.config.ts) was a pre-existing fix, not part of the security hardening scope
