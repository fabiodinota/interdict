---
id: S06
milestone: M007
status: ready
---

# S06: Security & CSP Hardening — Context

## Goal

Close all security advisories: replace CSP unsafe-inline with nonces, enable Helm network policies by default, and document full_text_storage risks.

## Why this Slice

The assessment flagged three security items: CSP `unsafe-inline` (High Risk) enables XSS in the dashboard, network policies disabled by default in Helm leaves inter-service traffic uncontrolled, and `full_text_storage` implications are undocumented for operators. Depends on S05 for secret scanning CI integration.

## Scope

### In Scope

- **T01: Replace CSP `unsafe-inline` with nonces** — update `dashboard/next.config.ts` to generate per-request nonces, apply nonce to all inline scripts via Next.js `nonce` prop, remove `unsafe-inline` from `script-src` and `style-src`, verify dashboard functions with strict CSP
- **T02: Enable Helm network policies by default** — change `networkPolicy.enabled: false` to `true` in `helm/interdict/values.yaml`, ensure default-deny ingress with explicit allow rules, validate with `helm template`, update `values-pilot.yaml`
- **T03: Document full_text_storage risks (SEC-02 + SEC-03)** — operator documentation for configuration (encryption-at-rest requirement, mTLS enforcement), inline code comments where `full_text_storage` is used, startup warning log when `full_text_storage = true`

### Out of Scope

- New security features (mTLS improvements, OIDC)
- Penetration testing
- Security scanning tools (covered in S05)

## Constraints

- CSP nonces must work with Next.js SSR (server-side rendering)
- Network policies must not break existing Helm deployments (migration path needed)
- full_text_storage documentation must be operator-facing (not developer-facing)

## Integration Points

### Consumes

- `dashboard/next.config.ts` — existing CSP configuration
- `helm/interdict/values.yaml` — existing Helm values
- `crates/kernel/src/proxy/connect.rs` — where `full_text_storage` is used
- S05 CI pipeline — for secret scanning integration

### Produces

- Nonce-based CSP in dashboard (zero `unsafe-inline`)
- Network-policy-enabled Helm chart (default-deny ingress)
- `full_text_storage` operator documentation and runtime warnings

## Open Questions

- Next.js nonce middleware — need to verify if Next.js 16 has built-in nonce support or if custom middleware is required
- Network policy migration — existing deployments with `networkPolicy.enabled: false` need a clear upgrade path
- `full_text_storage` encryption verification — can we programmatically verify that the evidence store has encryption-at-rest enabled?
