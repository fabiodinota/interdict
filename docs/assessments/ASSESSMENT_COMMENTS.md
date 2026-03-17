# Interdict — Comprehensive Fix Plan

**Date:** 2026-03-14  
**Source:** Comprehensive Foundation Assessment (Claude Opus 4.6 multi-agent deep audit, 2026-03-14)  
**Branch:** `feat/comprehensive-test-coverage`  
**Commit:** `b5ef69f`  
**Goal:** Address **every single** gap, concern, advisory, weakness, missing feature, and risk identified in the audit to reach full production readiness before scaling beyond pilots and GA release.

## Executive Summary

This single consolidated plan extracts **100%** of the items flagged as “could be better” across the entire assessment document:

- Architecture concerns (2)
- Security advisories (3)
- Test coverage gaps (Rust hot-path modules, Layer 3 queue/store, Evidence Collector signing, bootstrap, middleware, 9+ TypeScript modules, dashboard ~82% of components, error paths, E2E, quality)
- CI/CD & release deficiencies (7+)
- Dashboard weaknesses (accessibility, CSP, TypeScript test errors, test coverage/quality)
- DevOps/Deployment gaps (Docker, Helm, Docker Compose, release process — 15+)
- Unused dependencies (4)
- Documentation gaps (3)
- All Medium/High risks and operational items

Total distinct action items: ~45 (batched for efficiency).  
The Rust data plane and architecture remain A+/A+ — fixes focus on operational maturity, hot-path testing, release automation, and DevOps hardening.

---

## Prioritized Action Plan

### Tier 1 — Critical (Before Next Pilot Engagement)

1. **Hot-path testing (Critical risk)**
   - Add comprehensive unit + integration tests for `proxy/streaming_relay.rs` and `proxy/relay.rs` (zero coverage — core data flow).

2. **Layer 3 review queue testing (High risk)**
   - Add tests for `policy/layer3/queue.rs` and `policy/layer3/store.rs` (buffer management, FIFO, SQLite atomicity, recovery).

3. **Dashboard test errors**
   - Fix TypeScript errors in `framework-list.test.tsx` (property mismatch) and `policy-list.test.tsx` (condition check).

4. **Unused dependencies cleanup**
   - Remove `tower-http` (kernel `Cargo.toml`).
   - Remove `@sinclair/typebox` and `drizzle-typebox` (control-plane `package.json`).
   - Verify and clean `uuid` (evidence-collector `Cargo.toml`) if truly unused.

5. **ProxyService constructor safety (SEC-01, Low)**
   - Document `ProxyService::new()` as dangerous (bypasses all policy enforcement) in `crates/kernel/src/proxy/service.rs`.
   - Add compile-time guard or explicit startup validation/warning.

### Tier 2 — High Priority (Before GA Release)

**Testing & Quality** 6. Add tests for remaining Rust gaps:

- `proxy/tls.rs` (TLS connection establishment — security boundary).
- Evidence-Collector KMS signing + local Ed25519 signing.
- `bootstrap.rs` (startup orchestration).
- `middleware/request_id.rs`.

7. Add TypeScript control-plane tests:
   - `anomalies/` (4 files).
   - `auth/saml/*` (3 files).
   - `audit/service.ts`.
   - `reports/pdf-generator.ts`.
   - `reports/csv-generator.ts`.

8. Expand dashboard testing:
   - Cover remaining ~41 untested components.
   - Upgrade from render-only checks to interaction testing, error paths, and accessibility testing.

9. Add negative/adversarial testing across all services (invalid inputs, timeouts, network failures, injection attempts).

10. Implement full E2E test suite:
    - Playwright for dashboard.
    - docker-compose smoke/integration tests for full stack.
    - Air-gapped E2E validation (currently missing demonstration — add CI job).

11. Set coverage thresholds as hard CI gates (currently advisory only).

**CI/CD & Release (Critical)** 12. Build complete release pipeline:  
 - Automated image builds + push to `ghcr.io` (addresses “No image registry” High Risk).  
 - Semantic versioning enforcement.  
 - Automated changelog generation from conventional commits.  
 - GitHub Releases with artifacts and notes.  
 - Proper tagging strategy (`latest`, `vX.Y.Z`, SHA-based).  
 - Image signing (SLSA) and SBOM generation.

13. Add secret scanning to CI (detect-secrets, truffleHog, or GitHub secret scanner) — addresses High Risk.

14. Make `cargo-audit` blocking (currently informational).

15. Add performance regression gates using existing Criterion benchmarks (latency thresholds).

16. Add CODEOWNERS file and commit message linting (commitlint or conventional commits enforcement).

**Security & Hardening** 17. Address `full_text_storage` risks (SEC-02 & SEC-03):  
 - Document encryption-at-rest requirement when enabled.  
 - Explicitly document mTLS enforcement for gRPC transmission of raw text in operator guide.

18. Replace CSP `'unsafe-inline'` with nonce-based approach in dashboard.

19. Enable network policies by default in Helm chart (zero-trust) or document as mandatory post-install step.

### Tier 3 — Medium/Long-term (Post-GA or Ongoing)

**Deployment & Operations** 20. **Docker improvements**:  
 - Add/document proper `.dockerignore`.  
 - Add multi-platform builds.

21. **Helm/Kubernetes improvements**:
    - Add cert-manager integration.
    - Implement backup/restore jobs.
    - Add PVC retention policies.
    - Add kube-score/conftest validation to CI.

22. **Docker Compose improvements**:
    - Configure proper logging drivers.
    - Add monitoring stack (Prometheus + Grafana).
    - Implement secret rotation procedures.
    - Add backup automation.

**Documentation** 23. Create deployment runbook / operator guide for production setup (covers air-gapped, full_text_storage, mTLS, ProxyService risks).  
24. Create troubleshooting guide.  
25. Generate API documentation (OpenAPI/Swagger for control-plane REST + gRPC reflection/docs).

**Other** 26. Improve dashboard accessibility (ARIA labels on all interactive elements, skip navigation, live region announcements, keyboard navigation, WCAG AA target).

---

## Detailed Gaps Addressed (Complete Inventory for Traceability)

**Architecture**

- ProxyService::new() bypass documented + guarded.
- Air-gapped E2E fully demonstrated in CI/manual testing.

**Security Advisories**

- SEC-01, SEC-02, SEC-03 closed via documentation + guards.
- CSP hardening completed.

**Test Coverage**

- All zero-coverage modules (streaming_relay.rs, relay.rs, tls.rs, layer3/queue.rs, layer3/store.rs, bootstrap.rs, middleware/request_id.rs, Evidence-Collector signing, anomalies/, saml/, audit/service.ts, pdf/csv generators).
- Dashboard component coverage expanded + quality upgraded (interaction + accessibility).
- Negative/adversarial paths, E2E, and coverage gates added.

**CI/CD Pipeline**

- Full release pipeline, secret scanning, blocking audits, performance gates, E2E in CI, commit linting, CODEOWNERS, kube-score/conftest.

**Dashboard Quality**

- Accessibility upgraded from C+ → A target.
- Test coverage/quality upgraded.
- TypeScript errors fixed.
- CSP hardened.

**DevOps & Deployment**

- All Docker, Helm, Docker Compose, and release process items addressed.
- Network policies enabled by default.

**Dependencies**

- All 4 unused dependencies removed/verified.
- Ongoing renovate + deny.toml governance maintained.

**Documentation**

- Deployment runbook, troubleshooting guide, and API docs created.

**Risks**

- All Medium/High risks (hot-path untested, no release pipeline, no E2E, air-gapped unvalidated, no secret scanning, no image registry, CSP unsafe-inline, network policies) eliminated.

---

## Success Criteria for Completion

- Hot-path modules (`relay*`, `streaming_relay`, Layer 3) ≥80% coverage.
- Full E2E suite (including air-gapped) passing in CI.
- Release pipeline automated with signed images in `ghcr.io`.
- Secret scanning + blocking audits enforced.
- Dashboard accessibility score improved to WCAG AA.
- All unused dependencies removed.
- Operator documentation complete.
- Updated assessment scores: Test Coverage → A-, CI/CD → A, DevOps → A.

## Next Steps Recommendation

1. Assign Tier 1 items immediately (est. 2–3 days).
2. Parallelize release pipeline + secret scanning work.
3. Schedule follow-up audit once Tier 1 + Tier 2 are complete.
4. Track progress in `.gsd/STATE.md` and link issues to this plan.

**This document is the single source of truth for all improvements identified in the 2026-03-14 assessment.**  
_Generated by exhaustive extraction and synthesis of every gap, concern, and recommendation in the audit._
