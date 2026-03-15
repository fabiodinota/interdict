# S04: Expanded Test Coverage

**Goal:** Dashboard coverage expands from 8→40+ tested components, control-plane from 18→26+ tested sub-modules, all test tasks include negative/adversarial cases (empty data, error states, boundary conditions), E2E smoke test exists and is runnable, and coverage thresholds are enforced as hard CI gates.

**Demo:** `npx vitest run` in dashboard passes with 40+ component test files; `bun test` in control-plane passes with 26+ test files; Playwright smoke test runs against local dashboard; CI coverage job blocks on failure.

## Must-Haves

- 32+ new dashboard component test files (total 40+) with interaction and accessibility assertions
- Each component test includes at least one negative/adversarial case (empty data, error state, or missing prop)
- 8 new control-plane test files covering anomalies service, CSV/PDF generators, utilities, tracker, auth middleware, config
- E2E Playwright smoke test file that verifies dashboard loads and health endpoints respond
- vitest.config.ts coverage thresholds configured (60% project minimum)
- CI coverage job converted from `continue-on-error: true` to blocking gate

## Proof Level

- This slice proves: contract (test coverage expansion + threshold enforcement)
- Real runtime required: no (tests run against mocks/happy-dom, E2E is local-only initially)
- Human/UAT required: no

## Verification

- `cd dashboard && npx vitest run` — ≥40 component test files pass (8 existing + 32+ new)
- `cd control-plane && bun test` — ≥26 test files pass (18 existing + 8 new)
- `npx playwright test --project=smoke` — smoke test file exists and is syntactically valid
- `grep -c "continue-on-error" .github/workflows/ci-quality-security.yml` — coverage job no longer uses continue-on-error
- `grep "thresholds" dashboard/vitest.config.ts` — coverage thresholds are configured

## Integration Closure

- Upstream surfaces consumed: S01 relay test patterns (ErrorReader/ErrorWriter, echo backend), S02 signing test patterns (MockKmsSigningProvider, FailingMockProvider)
- New wiring introduced in this slice: Playwright config, dashboard coverage thresholds, CI gate hardening
- What remains before the milestone is truly usable end-to-end: S05 (CI/CD pipeline), S06 (security hardening), S07 (DevOps), S08 (docs/polish)

## Tasks

- [x] **T01: Dashboard simple component tests — 10 presentational components** `est:1.5h`
  - Why: The simplest components (≤80 lines) provide the fastest coverage wins. Establishes the test pattern that later batches replicate.
  - Files: `dashboard/src/__tests__/components/mandatory-badge.test.tsx`, `dashboard/src/__tests__/components/route-loading.test.tsx`, `dashboard/src/__tests__/components/route-error.test.tsx`, `dashboard/src/__tests__/components/theme-toggle.test.tsx`, `dashboard/src/__tests__/components/anomaly-list.test.tsx`, `dashboard/src/__tests__/components/baseline-chart.test.tsx`, `dashboard/src/__tests__/components/template-picker.test.tsx`, `dashboard/src/__tests__/components/framework-card.test.tsx`, `dashboard/src/__tests__/components/compilation-status.test.tsx`, `dashboard/src/__tests__/components/vendor-card.test.tsx`
  - Do: Read each component source to understand props/imports. Write tests following kpi-cards.test.tsx pattern: render with valid props → assert key content; render with empty/missing data → assert graceful handling; check accessibility attributes where present. Mock `recharts` for BaselineChart, `next-themes` for theme-toggle, hooks for CompilationStatus.
  - Verify: `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep -c "PASS"` shows 10 new passing test files
  - Done when: All 10 test files pass with at least 2 test cases each (happy path + negative case)

- [x] **T02: Dashboard medium component tests — 10 stateful/interactive components** `est:2h`
  - Why: Medium-complexity components (60-142 lines) need hook mocking, timer faking, or navigation mocks — extending coverage to the interaction layer.
  - Files: `dashboard/src/__tests__/components/category-picker.test.tsx`, `dashboard/src/__tests__/components/sla-timer.test.tsx`, `dashboard/src/__tests__/components/report-progress.test.tsx`, `dashboard/src/__tests__/components/signing-key-table.test.tsx`, `dashboard/src/__tests__/components/policy-row.test.tsx`, `dashboard/src/__tests__/components/top-bar.test.tsx`, `dashboard/src/__tests__/components/bundle-detail-panel.test.tsx`, `dashboard/src/__tests__/components/activity-feed.test.tsx`, `dashboard/src/__tests__/components/rotate-key-dialog.test.tsx`, `dashboard/src/__tests__/components/time-range-selector.test.tsx`
  - Do: Read each component. Use `vi.useFakeTimers()` for SlaTimer. Mock `next/navigation` for TopBar (follow sidebar.test.tsx pattern). Mock hooks with `vi.mock()` returning both data and mutation functions. Each test must include at least one interaction test (`userEvent.click` or similar) and one negative case.
  - Verify: `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep -c "PASS"` shows 10 additional passing test files
  - Done when: All 10 test files pass with interaction assertions and negative cases

- [x] **T03: Dashboard complex component tests — charts, tables, and detail views** `est:2h`
  - Why: Chart components need recharts mocking, table components need complex data fixtures, detail views need routing mocks — these are the medium-hard middle ground.
  - Files: `dashboard/src/__tests__/components/violation-chart.test.tsx`, `dashboard/src/__tests__/components/vendor-usage-chart.test.tsx`, `dashboard/src/__tests__/components/policy-version-history.test.tsx`, `dashboard/src/__tests__/components/policy-override-table.test.tsx`, `dashboard/src/__tests__/components/model-list.test.tsx`, `dashboard/src/__tests__/components/framework-detail.test.tsx`, `dashboard/src/__tests__/components/rego-preview.test.tsx`, `dashboard/src/__tests__/components/anomaly-card.test.tsx`, `dashboard/src/__tests__/components/add-vendor-dialog.test.tsx`, `dashboard/src/__tests__/components/report-form.test.tsx`
  - Do: Mock recharts globally for chart components (`vi.mock('recharts', ...)`). Use `vi.mock("next/navigation")` for components with routing. Create minimal data fixtures matching component prop types. Include empty-state, error-state, and interaction tests. For AddVendorDialog and ReportForm, test form submission flow with userEvent.
  - Verify: `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep -c "PASS"` shows 10 additional passing test files
  - Done when: All 10 test files pass, chart mocking pattern is consistent across all chart tests

- [x] **T04: Dashboard complex component tests — forms, dialogs, and wizards** `est:2.5h`
  - Why: The most complex components (>200 lines, multi-step forms, batch operations) require careful selective testing of key interaction paths rather than exhaustive coverage.
  - Files: `dashboard/src/__tests__/components/audit-filters.test.tsx`, `dashboard/src/__tests__/components/raw-rego-editor.test.tsx`, `dashboard/src/__tests__/components/rule-editor.test.tsx`, `dashboard/src/__tests__/components/parameter-form.test.tsx`, `dashboard/src/__tests__/components/review-dialog.test.tsx`, `dashboard/src/__tests__/components/batch-verify-table.test.tsx`, `dashboard/src/__tests__/components/policy-wizard.test.tsx`, `dashboard/src/__tests__/components/theme-provider.test.tsx`
  - Do: For PolicyWizard (376 lines) and BatchVerifyTable (365 lines): test initial render, key state transitions, and submission — not every permutation. For ReviewDialog: test resolution form submission and cancellation. For ParameterForm and RuleEditor: test dynamic field rendering and validation. Mock complex child components when they add noise (e.g., `vi.mock("@/components/policies/CategoryPicker")`). Include error-state and empty-data tests.
  - Verify: `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep -c "PASS"` shows 8 additional passing test files
  - Done when: All 8 test files pass, total dashboard component tests ≥40

- [x] **T05: Control-plane module expansion — 8 new test files** `est:1.5h`
  - Why: Expands control-plane test coverage from 18 to 26+ sub-modules, targeting the highest-value untested pure-logic modules.
  - Files: `control-plane/src/modules/anomalies/service.test.ts`, `control-plane/src/modules/anomalies/queries.test.ts`, `control-plane/src/modules/distribution/tracker.test.ts`, `control-plane/src/modules/auth/middleware.test.ts`, `control-plane/src/modules/reports/csv-generator.test.ts`, `control-plane/src/modules/reports/pdf-generator.test.ts`, `control-plane/src/shared/utilities.test.ts`, `control-plane/src/config.test.ts`
  - Do: Use `bun:test` imports (not vitest). Follow existing patterns: `createEmptyQueryChain()` for ClickHouse mocks, Map-based mock DB for tracker. Test `computeSeverity()` and `computeOffHoursSeverity()` with threshold boundary values. Test `escapeCSV()` and `generateCSV()` as pure functions. Test `encodeCursor()`/`decodeCursor()` roundtrip, error classes, `requireEnv()`. Mock jsPDF for PDF generator structure tests. Test `KernelTracker` register/unregister/broadcast with mock gRPC streams. Test auth middleware bearer extraction and dual-mode routing. Include adversarial inputs (malformed cursors, empty data, missing env vars).
  - Verify: `cd control-plane && bun test` — all tests pass, ≥26 test files present
  - Done when: 8 new test files pass with 23+ new test cases total

- [x] **T06: E2E smoke test + CI coverage gate enforcement** `est:1.5h`
  - Why: Completes the slice by adding the infrastructure layer — Playwright for E2E verification and hard coverage gates that prevent regression.
  - Files: `dashboard/playwright.config.ts`, `dashboard/e2e/smoke.spec.ts`, `dashboard/package.json`, `dashboard/vitest.config.ts`, `.github/workflows/ci-quality-security.yml`, `scripts/smoke-test.sh`
  - Do: Install Playwright as dashboard devDependency. Create playwright.config.ts targeting localhost:3000 with headless Chromium. Write smoke.spec.ts that: (1) navigates to `/` and asserts page loads, (2) checks for login/dashboard content, (3) optionally fetches control-plane health endpoint. Create `scripts/smoke-test.sh` that orchestrates docker-compose up → wait for health → playwright test → docker-compose down. Add `coverage.thresholds` to vitest.config.ts: `{ lines: 60, branches: 50, functions: 55, statements: 60 }`. Remove `continue-on-error: true` from CI coverage job. Keep thresholds conservative initially — ratchet up after baseline is established.
  - Verify: `grep "thresholds" dashboard/vitest.config.ts` returns threshold config; `grep -c "continue-on-error" .github/workflows/ci-quality-security.yml` shows reduced count; `cat dashboard/e2e/smoke.spec.ts` exists with test assertions
  - Done when: Playwright config + smoke test exist, vitest coverage thresholds set, CI coverage job is blocking

## Observability / Diagnostics

- **Test results**: `cd dashboard && npx vitest run --reporter=verbose` — every component test file reports pass/fail per-case. Grep for `FAIL` to find regressions.
- **Coverage report**: `cd dashboard && npx vitest run --coverage` — generates V8 coverage under `dashboard/coverage/`. Inspect `coverage/lcov-report/index.html` for per-file line/branch coverage.
- **Control-plane test results**: `cd control-plane && bun test` — reports pass/fail per test file.
- **CI gate status**: Check the `coverage` job in `.github/workflows/ci-quality-security.yml` — when `continue-on-error` is removed, coverage failures block the pipeline.
- **Failure visibility**: Vitest verbose reporter prints each test case name + duration. Failed assertions show expected vs received values and component render output. Coverage threshold violations print the shortfall percentage.
- **E2E smoke**: `npx playwright test --project=smoke` — Playwright HTML report at `dashboard/playwright-report/`.

## Files Likely Touched

- `dashboard/src/__tests__/components/*.test.tsx` (38 new test files)
- `control-plane/src/modules/anomalies/service.test.ts` (new)
- `control-plane/src/modules/anomalies/queries.test.ts` (new)
- `control-plane/src/modules/distribution/tracker.test.ts` (new)
- `control-plane/src/modules/auth/middleware.test.ts` (new)
- `control-plane/src/modules/reports/csv-generator.test.ts` (new)
- `control-plane/src/modules/reports/pdf-generator.test.ts` (new)
- `control-plane/src/shared/utilities.test.ts` (new)
- `control-plane/src/config.test.ts` (new)
- `dashboard/vitest.config.ts` (modified — coverage thresholds)
- `dashboard/playwright.config.ts` (new)
- `dashboard/e2e/smoke.spec.ts` (new)
- `dashboard/package.json` (modified — Playwright dep)
- `.github/workflows/ci-quality-security.yml` (modified — coverage gate)
- `scripts/smoke-test.sh` (new)
