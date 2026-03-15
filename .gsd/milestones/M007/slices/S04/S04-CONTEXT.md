---
id: S04
milestone: M007
status: ready
---

# S04: Expanded Test Coverage — Context

## Goal

Fill the remaining test gaps across Rust, TypeScript control-plane, and dashboard to bring overall coverage from B- to A-, establish E2E testing infrastructure, and enforce coverage thresholds as hard CI gates.

## Why this Slice

S01 and S02 cover the most critical untested paths. This slice broadens coverage to the remaining gaps: ~41 untested dashboard components, 9+ untested TypeScript modules, Rust modules with sparse coverage, and the complete absence of E2E/negative/adversarial tests. Depends on S01/S02 patterns being established first.

## Scope

### In Scope

- **T01: Remaining Rust module tests** — bootstrap.rs (config loading, startup errors), middleware/request_id.rs (ID injection/propagation), policy/distribution/mod.rs (lifecycle), evidence/mod.rs (buffer edge cases)
- **T02: TypeScript control-plane test expansion** — anomalies/ (4 files), auth/saml/* (3 files, mock IdP), audit/service.ts, reports/pdf-generator.ts (golden file comparison), reports/csv-generator.ts, distribution/tracker.ts, all model.ts files (schema/validation)
- **T03: Dashboard component test expansion** — expand from 9 to 40+ tested components: policy management, evidence verification, audit trail, anomaly alerts, settings, key management, layout. Add interaction testing, error state testing, accessibility assertions
- **T04: Fix existing TypeScript test errors** — framework-list.test.tsx (`active` → `isActive`), policy-list.test.tsx (condition check error)
- **T05: Negative and adversarial testing** — invalid inputs, network failures, auth edge cases, adversarial policy evaluation, corrupted evidence chains
- **T06: E2E test suite** — Playwright for dashboard E2E, docker-compose smoke test script, air-gapped E2E validation, critical user workflows (login→audit, create policy→enforce, submit review→verify, evidence verification)
- **T07: Coverage thresholds as CI gates** — .codecov.yml enforcement, project target 70% (hard gate), patch target 80% (hard gate), CI fails on regression

### Out of Scope

- Relay, streaming relay, TLS tests (covered in S01)
- Queue, store, signing tests (covered in S02)
- CI/CD pipeline changes beyond coverage gates (covered in S05)

## Constraints

- Dashboard tests use Vitest (not Jest)
- Control-plane tests use Bun test runner
- Playwright requires headless Chrome in CI (GitHub Actions)
- Docker-compose smoke test must be idempotent and cleanup after itself
- Coverage thresholds must not be so aggressive they block unrelated PRs

## Integration Points

### Consumes

- S01 async relay mock patterns — reuse for Rust negative testing
- S02 mock AWS KMS client — reuse for evidence chain corruption tests
- S02 SQLite test fixture patterns — reuse for store negative testing
- Existing dashboard test setup (Vitest config, test-utils)
- Existing control-plane test setup (Bun test config)

### Produces

- 40+ tested dashboard components with interaction and accessibility assertions
- 27+ tested control-plane modules
- E2E test suite (Playwright + docker-compose smoke)
- Coverage threshold enforcement in CI
- Negative test patterns across all services

## Open Questions

- Playwright CI setup — need to determine if GitHub Actions has built-in Playwright support or if we need a custom Docker image
- Golden file comparison for PDF tests — PDF binary comparison may be fragile; may need content-based comparison
- Air-gapped E2E — how to validate without internet in CI (may need pre-cached images)
