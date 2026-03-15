# S08: Documentation, Accessibility & Polish

**Goal:** Operator guide, API docs (REST + gRPC), and troubleshooting guide exist. Dashboard passes axe-core with zero critical/serious WCAG violations. All project tracking documents updated to reflect v1.5 status.

**Demo:** `docs/operator/guide.md`, `docs/operator/troubleshooting.md`, `docs/api/rest.md`, `docs/api/grpc.md` exist with substantive content. `cd dashboard && npx vitest run` passes with vitest-axe a11y assertions. `@axe-core/playwright` WCAG AA check added to Playwright smoke test. PROJECT.md and README.md reflect v1.5.

## Must-Haves

- Comprehensive operator guide covering deployment, configuration, certificates, key rotation, monitoring, backup, environment validation, and upgrades
- Troubleshooting guide covering common failure modes (mTLS, DB connectivity, evidence pipeline, policy distribution, CSP, signing keys)
- REST API reference documenting all 53 endpoints across 13 modules
- gRPC API reference documenting 2 proto services (EvidenceCollectorService, PolicyDistributionService)
- Dashboard icon buttons with missing `aria-label` fixed (TimeRangeSelector refresh, ModelList delete, Sidebar collapse)
- vitest-axe integrated into dashboard test setup with `toHaveNoViolations()` assertions on component tests
- `@axe-core/playwright` WCAG AA assertion added to Playwright smoke test
- PROJECT.md updated to v1.5 with Production Readiness requirements
- README.md deployment section references new operator docs

## Proof Level

- This slice proves: operational + final-assembly
- Real runtime required: no (docs are static, a11y tests run in happy-dom + Playwright)
- Human/UAT required: yes (operator guide review by someone unfamiliar with project, screen reader verification)

## Verification

- `test -f docs/operator/guide.md && wc -l docs/operator/guide.md | awk '{exit ($1 < 200)}'` — operator guide exists with ≥200 lines
- `test -f docs/operator/troubleshooting.md && wc -l docs/operator/troubleshooting.md | awk '{exit ($1 < 100)}'` — troubleshooting guide exists with ≥100 lines
- `test -f docs/api/rest.md && test -f docs/api/grpc.md` — API docs exist
- `cd dashboard && npx vitest run` — all tests pass including vitest-axe assertions
- `grep -c "aria-label" dashboard/src/components/dashboard/TimeRangeSelector.tsx` returns ≥1
- `grep -c "aria-label" dashboard/src/components/vendors/ModelList.tsx` returns ≥1
- `grep -c "aria-label" dashboard/src/components/layout/Sidebar.tsx` returns ≥1
- `grep "axe" dashboard/e2e/smoke.spec.ts` — axe-core assertion present in Playwright smoke test
- `grep "v1.5" .gsd/PROJECT.md` — PROJECT.md reflects v1.5
- `grep "docs/operator" README.md` — README references operator docs
- `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep -E "FAIL|violation|axe"` — inspectable failure output for a11y violations (should show zero violations or explicit FAIL lines with axe rule IDs)

## Observability / Diagnostics

- Runtime signals: vitest-axe violations print axe-core rule IDs and affected HTML nodes to test output
- Inspection surfaces: `npx vitest run --reporter=verbose` shows per-component a11y assertion results
- Failure visibility: axe-core violation details include rule ID, impact level (critical/serious/moderate/minor), and failing HTML snippet
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `env.example` (config reference), `scripts/backup.sh`, `scripts/validate-env.sh`, `scripts/smoke-test.sh` (S07), `docker-compose.monitoring.yml` (S07), `helm/interdict/values.yaml` (S07), `docs/operator/full-text-storage.md` (S06), all control-plane `modules/*/model.ts` and `modules/*/index.ts` (API surface), `proto/` files (gRPC surface), all S01–S07 summaries (for accurate documentation)
- New wiring introduced in this slice: vitest-axe matcher in test setup, @axe-core/playwright in smoke test
- What remains before the milestone is truly usable end-to-end: nothing — this is the final slice

## Tasks

- [x] **T01: Dashboard accessibility fixes + axe-core test integration** `est:45m`
  - Why: PR-A11Y-01 requires dashboard passes axe-core with zero critical/serious WCAG violations. Three icon buttons are missing `aria-label` attributes, and the test infrastructure lacks a11y assertion tooling.
  - Files: `dashboard/src/components/dashboard/TimeRangeSelector.tsx`, `dashboard/src/components/vendors/ModelList.tsx`, `dashboard/src/components/layout/Sidebar.tsx`, `dashboard/src/__tests__/setup.ts`, `dashboard/src/__tests__/components/Sidebar.test.tsx`, `dashboard/src/__tests__/components/TimeRangeSelector.test.tsx`, `dashboard/e2e/smoke.spec.ts`, `dashboard/package.json`
  - Do: Install `vitest-axe` and `@axe-core/playwright`. Add `aria-label` to 3 icon buttons. Extend `setup.ts` with vitest-axe matchers. Add `toHaveNoViolations()` assertions to 5–8 representative component tests. Add WCAG AA axe-core check to Playwright smoke test. Disable `color-contrast` rule in vitest-axe config (happy-dom limitation).
  - Verify: `cd dashboard && npx vitest run` passes. `grep -c "aria-label" dashboard/src/components/dashboard/TimeRangeSelector.tsx` ≥ 1.
  - Done when: All 3 icon buttons have aria-labels, vitest-axe assertions pass on ≥5 component tests, Playwright smoke test includes WCAG AA assertion.

- [x] **T02: Operator guide + troubleshooting guide** `est:45m`
  - Why: PR-OPS-01 requires operator guide and troubleshooting guide. These document the deployment, configuration, and operational procedures established in S05–S07. Follow the voice and structure of the existing `full-text-storage.md`.
  - Files: `docs/operator/guide.md`, `docs/operator/troubleshooting.md`
  - Do: Create operator guide covering: quick start (Docker Compose), Kubernetes deployment (Helm), configuration reference (from env.example), certificate management (mTLS, CA trust), signing key rotation, monitoring (`--profile monitoring`), backup (`scripts/backup.sh`), environment validation (`scripts/validate-env.sh`), upgrade procedures, and cross-references to `full-text-storage.md`. Create troubleshooting guide covering: certificate/mTLS issues, database connectivity, evidence pipeline failures, policy distribution errors, signing key rotation, CSP violations, deployment-specific issues (Docker Compose vs Helm).
  - Verify: `test -f docs/operator/guide.md && wc -l docs/operator/guide.md | awk '{exit ($1 < 200)}'` and `test -f docs/operator/troubleshooting.md && wc -l docs/operator/troubleshooting.md | awk '{exit ($1 < 100)}'`
  - Done when: Both docs exist with substantive content, cover all documented operational scripts/procedures from S05–S07, and follow the `full-text-storage.md` voice.

- [x] **T03: API documentation (REST + gRPC)** `est:30m`
  - Why: PR-OPS-01 requires API documentation. The control plane has 53 REST endpoints across 13 modules with TypeBox schemas, and 2 gRPC services with well-commented proto files.
  - Files: `docs/api/rest.md`, `docs/api/grpc.md`
  - Do: Create REST API reference documenting all 13 modules with endpoint paths, HTTP methods, request/response schemas, authentication requirements, and example payloads. Create gRPC reference documenting EvidenceCollectorService (SubmitEvidence streaming RPC) and PolicyDistributionService (Subscribe server-stream, Acknowledge unary) with message schemas from proto files. Note: skip `@elysiajs/openapi` runtime integration — manual docs provide better control and don't risk Elysia version compatibility issues. The docs serve as the authoritative API reference.
  - Verify: `test -f docs/api/rest.md && test -f docs/api/grpc.md && wc -l docs/api/rest.md | awk '{exit ($1 < 150)}'`
  - Done when: REST reference covers all 13 modules (53 endpoints), gRPC reference covers both services with message schemas, authentication documented.

- [x] **T04: Project tracking updates** `est:15m`
  - Why: HR-DOC-01 requires project tracking docs reflect verified state. PROJECT.md still says v1.2; README.md doesn't reference new operator docs. All M007 slices need to be marked complete.
  - Files: `.gsd/PROJECT.md`, `README.md`, `.gsd/STATE.md`
  - Do: Update PROJECT.md: add v1.5 Production Readiness section with all M007 deliverables (test coverage, CI/CD, security hardening, DevOps, documentation, accessibility). Update README.md: change "Current Status" to show v1.5, add "Documentation" section referencing `docs/operator/guide.md` and `docs/api/`. Update STATE.md: mark S08 complete, set phase to complete.
  - Verify: `grep "v1.5" .gsd/PROJECT.md && grep "docs/operator" README.md`
  - Done when: PROJECT.md reflects v1.5, README.md references operator docs, STATE.md shows M007 complete.

## Files Likely Touched

- `dashboard/src/components/dashboard/TimeRangeSelector.tsx`
- `dashboard/src/components/vendors/ModelList.tsx`
- `dashboard/src/components/layout/Sidebar.tsx`
- `dashboard/src/__tests__/setup.ts`
- `dashboard/src/__tests__/components/*.test.tsx` (5–8 existing test files extended)
- `dashboard/e2e/smoke.spec.ts`
- `dashboard/package.json`
- `docs/operator/guide.md` (new)
- `docs/operator/troubleshooting.md` (new)
- `docs/api/rest.md` (new)
- `docs/api/grpc.md` (new)
- `.gsd/PROJECT.md`
- `README.md`
- `.gsd/STATE.md`
