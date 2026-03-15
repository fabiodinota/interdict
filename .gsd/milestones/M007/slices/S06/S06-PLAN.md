# S06: Security & CSP Hardening

**Goal:** Dashboard CSP uses nonces instead of `unsafe-inline` in `script-src`. Helm network policies enabled by default. `full_text_storage` risks documented for operators with startup warning. No security advisory remains unaddressed.

**Demo:** `next build` succeeds with nonce-based CSP middleware. Existing middleware tests updated and passing. `helm template` renders network policies. `cargo build` compiles with new startup warnings for `full_text_storage`.

## Must-Haves

- CSP nonce middleware generates per-request cryptographic nonce
- `script-src` removes `'unsafe-inline'`, uses `'nonce-{n}'` + `'strict-dynamic'`
- Root layout is async, reads nonce from `x-nonce` header, passes to `ThemeProvider`
- Two inline style usages (Sonner toastOptions, VendorUsageChart borderColor) refactored to CSS classes
- `style-src` removes `'unsafe-inline'`, uses `'nonce-{n}'`
- Static CSP removed from `next.config.ts` (middleware owns it)
- Session-gating logic from `proxy.ts` merged into `middleware.ts`
- Dev mode includes `'unsafe-eval'` for React Fast Refresh
- Middleware matcher excludes `_next/static`, `_next/image`, `favicon.ico`
- Helm `networkPolicy.enabled` flipped to `true` for all 4 services in `values.yaml`
- `tracing::warn!` at startup in evidence-collector and kernel when `full_text_storage` is enabled
- Operator guide section for `full_text_storage` created

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (structural validation via build + test + template render)
- Human/UAT required: no (browser CSP verification deferred to S08 axe-core pass)

## Verification

- `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` — middleware tests pass with nonce assertions
- `cd dashboard && npx next build` — builds successfully with async root layout and nonce middleware
- `helm template interdict helm/interdict` — renders all 4 network policies (no `enabled: false` skip)
- `cargo build -p kernel -p evidence-collector` — compiles with new `full_text_storage` warnings
- `grep -c "unsafe-inline" dashboard/src/proxy.ts` — returns 0 (no unsafe-inline in production CSP)
- `grep -c "x-nonce" dashboard/src/app/layout.tsx` — returns 1+ (nonce read from headers)

## Observability / Diagnostics

- Runtime signals: `tracing::warn!` emitted once at startup when `full_text_storage` is enabled (kernel + evidence-collector)
- Inspection surfaces: CSP header visible in browser DevTools Network tab; `helm template` output shows NetworkPolicy manifests
- Failure visibility: CSP violations appear in browser console as `Refused to execute inline script`; network policy misconfig blocks pod-to-pod traffic (visible in `kubectl logs`)
- Redaction constraints: nonce values are ephemeral per-request — no persistence or logging needed

## Integration Closure

- Upstream surfaces consumed: S05 CI pipeline (secret scanning job integrates with security posture); `proxy.ts` session-gating logic (merged into middleware)
- New wiring introduced: `middleware.ts` replaces `proxy.ts` as the request interception entry point; root layout becomes async Server Component
- What remains before the milestone is truly usable end-to-end: S08 browser-level CSP verification with axe-core; S07 multi-platform Docker builds

## Tasks

- [x] **T01: CSP nonce middleware with inline style refactor** `est:1h`
  - Why: The dashboard currently uses `'unsafe-inline'` in both `script-src` and `style-src`, defeating XSS protection. Moving to per-request nonces is the highest-security-value change in this slice.
  - Files: `dashboard/src/middleware.ts`, `dashboard/src/proxy.ts`, `dashboard/src/app/layout.tsx`, `dashboard/src/components/theme-provider.tsx`, `dashboard/next.config.ts`, `dashboard/src/app/(dashboard)/layout.tsx`, `dashboard/src/components/dashboard/VendorUsageChart.tsx`, `dashboard/src/__tests__/middleware.test.ts`
  - Do: Create `middleware.ts` that generates a nonce via `crypto.randomUUID()` + base64, builds CSP header with `'nonce-{n}'` + `'strict-dynamic'` in `script-src`, sets CSP on response and `x-nonce` on request headers, merges session-gating from `proxy.ts`. Remove CSP from `next.config.ts` `headers()`. Make root layout async, read nonce from `headers()`, pass to ThemeProvider. Refactor Sonner toastOptions inline `style` to `className`/Tailwind classes. Refactor VendorUsageChart inline `borderColor` to Tailwind `border-border` class. Update middleware test to verify nonce generation and CSP header. Include `'unsafe-eval'` in dev mode only. Keep `proxy.ts` as a re-export or remove if middleware.ts fully replaces it.
  - Verify: `cd dashboard && npx vitest run src/__tests__/middleware.test.ts` passes; `npx next build` succeeds
  - Done when: `script-src` and `style-src` have zero `'unsafe-inline'` in production CSP; nonce propagates from middleware → layout → ThemeProvider; all existing session-gating tests still pass

- [x] **T02: Enable Helm network policies by default** `est:15m`
  - Why: All four NetworkPolicy templates already exist with correct ingress/egress rules but are disabled by default. Enabling them is a one-line-each change that completes zero-trust pod-to-pod communication.
  - Files: `helm/interdict/values.yaml`
  - Do: Flip `networkPolicy.enabled` from `false` to `true` for kernel, controlPlane, evidenceCollector, and dashboard. Add a YAML comment noting operators can set `false` if their CNI doesn't support NetworkPolicy.
  - Verify: `helm template interdict helm/interdict | grep -c "kind: NetworkPolicy"` returns 4
  - Done when: All 4 network policies render by default in `helm template` output

- [x] **T03: full_text_storage startup warnings and operator guide** `est:30m`
  - Why: `full_text_storage` stores raw LLM prompts/responses — a significant privacy and compliance risk that operators must opt into knowingly. Currently there's no warning at startup and no documentation.
  - Files: `crates/evidence-collector/src/main.rs`, `crates/kernel/src/bootstrap.rs`, `crates/kernel/src/proxy/connect.rs`, `docs/operator/full-text-storage.md`
  - Do: Add `tracing::warn!` in evidence-collector `main.rs` after config load when `cfg.full_text_storage == true` — message emphasizes encryption-at-rest, GDPR/data-residency, and recommends explicit opt-in review. Add `tracing::warn!` in kernel `bootstrap.rs` when the env var resolves to true. Add inline code comments at `build_evidence_event` in `connect.rs`. Create `docs/operator/full-text-storage.md` covering what the flag does, security implications, encryption requirements, GDPR/residency considerations, and the two env vars (`INTERDICT_EVIDENCE_FULL_TEXT_STORAGE`, `COLLECTOR_FULL_TEXT_STORAGE`).
  - Verify: `cargo build -p kernel -p evidence-collector` compiles; `grep -c "tracing::warn" crates/evidence-collector/src/main.rs` ≥ 1; `test -f docs/operator/full-text-storage.md`
  - Done when: Both binaries emit a warning when full_text_storage is enabled; operator guide exists with complete coverage of risks and configuration

## Files Likely Touched

- `dashboard/src/middleware.ts` (new)
- `dashboard/src/proxy.ts` (modified or removed)
- `dashboard/src/app/layout.tsx`
- `dashboard/src/components/theme-provider.tsx`
- `dashboard/next.config.ts`
- `dashboard/src/app/(dashboard)/layout.tsx`
- `dashboard/src/components/dashboard/VendorUsageChart.tsx`
- `dashboard/src/__tests__/middleware.test.ts`
- `helm/interdict/values.yaml`
- `crates/evidence-collector/src/main.rs`
- `crates/kernel/src/bootstrap.rs`
- `crates/kernel/src/proxy/connect.rs`
- `docs/operator/full-text-storage.md` (new)
