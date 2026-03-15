# S04: Expanded Test Coverage — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All deliverables are test files, config changes, and CI pipeline modifications — verifiable by running test suites and inspecting file contents without live runtime.

## Preconditions

- Node.js ≥18 and Bun ≥1.0 installed
- `cd dashboard && npm install` completed (installs @playwright/test)
- `cd control-plane && bun install` completed
- No other processes occupying ports 3000 or 8080

## Smoke Test

Run `cd dashboard && npx vitest run` — should report ≥53 test files, 370+ tests passed, 0 failures. This confirms the entire dashboard test suite including all 38 new component tests.

## Test Cases

### 1. Dashboard component test file count

1. Run `find dashboard/src/__tests__/components -name "*.test.tsx" | wc -l`
2. **Expected:** Output is ≥46 (8 pre-existing + 38 new)

### 2. Dashboard full test suite passes

1. Run `cd dashboard && npx vitest run --reporter=verbose`
2. Scan output for `FAIL` — should find zero failures
3. **Expected:** All 53 test files pass, 370+ test cases pass, 0 failures

### 3. Control-plane test file count

1. Run `find control-plane/src -name "*.test.ts" | wc -l`
2. **Expected:** Output is ≥26 (18 pre-existing + 8 new)

### 4. Control-plane full test suite passes

1. Run `cd control-plane && bun test`
2. **Expected:** 308 pass, ≥26 test files executed. The only 2 failures should be the pre-existing `exchangeApiKeyForSession` tests (not introduced by this slice).

### 5. Anomaly severity computation tests

1. Run `cd control-plane && bun test src/modules/anomalies/service.test.ts`
2. **Expected:** 18 test cases pass covering boundary values (1.19→info, 2.0→warning, 5.0→critical), off-hours severity, vendor switch severity, topic drift, query failure handling, alert sorting, and summary aggregation.

### 6. ClickHouse query builder tests

1. Run `cd control-plane && bun test src/modules/anomalies/queries.test.ts`
2. **Expected:** 14 test cases pass verifying parameter binding, JSONEachRow format, partition filter presence, and invariant #6 compliance (topic drift uses `uniqExact(prompt_hash)` not raw values).

### 7. Auth middleware tests

1. Run `cd control-plane && bun test src/modules/auth/middleware.test.ts`
2. **Expected:** 10 test cases pass covering bearer extraction (missing header, non-Bearer, empty), dual-mode routing (`ik_live_` prefix → API key, other → session token), rejection on null auth, role-based access control, and public route passthrough.

### 8. CSV/PDF generator tests

1. Run `cd control-plane && bun test src/modules/reports/csv-generator.test.ts`
2. Run `cd control-plane && bun test src/modules/reports/pdf-generator.test.ts`
3. **Expected:** CSV: 14 test cases pass (escaping, section headers, empty data). PDF: 8 test cases pass (buffer output, page structure, section titles).

### 9. Utilities and config tests

1. Run `cd control-plane && bun test src/shared/utilities.test.ts`
2. Run `cd control-plane && bun test src/config.test.ts`
3. **Expected:** Utilities: 24 test cases pass (cursor roundtrip, error classes, response envelopes). Config: 10 test cases pass (port validation, env var fallbacks).

### 10. Vitest coverage thresholds configured

1. Run `grep -A5 "thresholds" dashboard/vitest.config.ts`
2. **Expected:** Output shows `lines: 60`, `branches: 50`, `functions: 55`, `statements: 60`

### 11. CI coverage gate is blocking

1. Run `grep -c "continue-on-error" .github/workflows/ci-quality-security.yml`
2. **Expected:** Output is `0` — no `continue-on-error` remains in any CI job

### 12. Playwright config exists and is valid

1. Run `cat dashboard/playwright.config.ts | head -20`
2. **Expected:** Contains `use: { headless: true }` or equivalent, project named `smoke`, baseURL configurable via `PLAYWRIGHT_BASE_URL`, Chromium browser

### 13. Playwright smoke test exists with test cases

1. Run `cat dashboard/e2e/smoke.spec.ts`
2. **Expected:** Contains ≥3 test cases: (1) homepage loads with meaningful content, (2) no fatal console errors on initial load, (3) health endpoint responds

### 14. Smoke test script exists and is syntactically valid

1. Run `bash -n scripts/smoke-test.sh && echo "SYNTAX OK"`
2. **Expected:** Output is `SYNTAX OK`
3. Run `grep "trap" scripts/smoke-test.sh`
4. **Expected:** Contains a `trap cleanup` line for docker-compose teardown

### 15. Dashboard chart components have recharts mocking

1. Run `grep -l "vi.mock.*recharts" dashboard/src/__tests__/components/*.test.tsx`
2. **Expected:** At least 3 files listed (baseline-chart, violation-chart, vendor-usage-chart)

### 16. Each component test has negative/adversarial cases

1. Run `grep -l "empty\|error\|missing\|null\|undefined\|invalid\|no data\|graceful" dashboard/src/__tests__/components/*.test.tsx | wc -l`
2. **Expected:** ≥30 files contain negative/adversarial test cases

## Edge Cases

### Pre-existing auth test failures do not indicate regression

1. Run `cd control-plane && bun test src/modules/auth/index.test.ts`
2. **Expected:** The `exchangeApiKeyForSession` tests may fail when run in the full suite but should pass in isolation. This is a pre-existing inter-test contamination issue, not a regression from S04.

### Coverage threshold violation is caught

1. Temporarily lower a threshold in `dashboard/vitest.config.ts` to `lines: 99`
2. Run `cd dashboard && npx vitest run --coverage`
3. **Expected:** Exit code is non-zero, output shows shortfall percentage
4. Revert the threshold change

### Playwright dry-run syntax check

1. Run `cd dashboard && npx playwright test --list 2>&1 | head -5`
2. **Expected:** Lists the smoke test cases without errors (may fail if Chromium not installed — that's expected; the test spec itself should be listed)

## Failure Signals

- Any `FAIL` in `npx vitest run` output (excluding the pre-existing 2 control-plane auth failures)
- `find ... | wc -l` returning <46 for dashboard components or <26 for control-plane
- `continue-on-error` count > 0 in CI workflow
- Missing `thresholds` in vitest.config.ts
- Missing `dashboard/playwright.config.ts`, `dashboard/e2e/smoke.spec.ts`, or `scripts/smoke-test.sh`
- Syntax errors in `bash -n scripts/smoke-test.sh`

## Requirements Proved By This UAT

- PR-TEST-01 — Dashboard component test coverage expanded from 8→46 files (test cases 2, 3, 15, 16)
- PR-TEST-02 — Control-plane module coverage expanded from 18→26 files (test cases 3, 4, 5–9)
- PR-TEST-03 — E2E smoke test exists and is runnable (test cases 12, 13, 14)
- PR-TEST-04 — Coverage thresholds enforced as CI gates (test cases 10, 11, edge case "coverage violation")

## Not Proven By This UAT

- Playwright smoke test running in CI (requires S05 GitHub Actions workflow)
- Coverage thresholds at production target (70% lines) — current thresholds are conservative (60%)
- Full-stack E2E test execution via docker-compose (requires live Docker environment)
- Dashboard accessibility compliance (deferred to S08)
- Signed container images and release pipeline (S05)

## Notes for Tester

- The 2 pre-existing `exchangeApiKeyForSession` test failures in control-plane are a known inter-test contamination issue. They pass when run in isolation (`bun test src/modules/auth/index.test.ts`). Do not treat them as regressions.
- Playwright requires `npx playwright install chromium` before first run locally. The CI workflow (S05) will handle this automatically.
- The `scripts/smoke-test.sh` script requires Docker to be running and ports 5432, 8123, 3000, 8080 available. It's designed for local development, not CI.
- Coverage thresholds are intentionally conservative — they will be ratcheted up in future slices as coverage grows.
