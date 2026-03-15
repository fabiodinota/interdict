---
estimated_steps: 5
estimated_files: 6
---

# T06: E2E smoke test + CI coverage gate enforcement

**Slice:** S04 — Expanded Test Coverage
**Milestone:** M007

## Description

Add Playwright E2E smoke test infrastructure and harden CI coverage gates. The Playwright smoke test verifies the dashboard loads and key endpoints respond — it's designed to run locally via `scripts/smoke-test.sh` (docker-compose orchestrated) and later in CI. The CI coverage job is converted from advisory (`continue-on-error: true`) to blocking. Dashboard vitest.config.ts gets coverage thresholds to catch regression locally before CI.

## Steps

1. Add `@playwright/test` as a devDependency in `dashboard/package.json`
2. Create `dashboard/playwright.config.ts` with headless Chromium, baseURL `http://localhost:3000`, timeout 30s, retries 1, project named "smoke"
3. Create `dashboard/e2e/smoke.spec.ts` with tests: (a) navigate to `/` → assert page title or login content visible, (b) fetch `/api/health` or control-plane health → assert 200 response, (c) assert no console errors on initial load
4. Create `scripts/smoke-test.sh` that: starts docker-compose, waits for all healthchecks to pass (with 120s timeout), runs `npx playwright test --project=smoke`, then tears down docker-compose regardless of result (trap EXIT)
5. Add `coverage.thresholds` to `dashboard/vitest.config.ts`: `{ lines: 60, branches: 50, functions: 55, statements: 60 }` — conservative initial thresholds
6. In `.github/workflows/ci-quality-security.yml`: remove `continue-on-error: true` from the `coverage` job to make it a hard gate

## Must-Haves

- [ ] Playwright config and smoke test file exist and are syntactically valid
- [ ] smoke-test.sh is executable and handles cleanup on failure (trap)
- [ ] vitest.config.ts has coverage.thresholds configured
- [ ] CI coverage job no longer uses `continue-on-error: true`
- [ ] Playwright test is isolated to a "smoke" project — doesn't interfere with vitest component tests

## Verification

- `cat dashboard/playwright.config.ts` — exists with headless Chromium config
- `cat dashboard/e2e/smoke.spec.ts` — exists with ≥2 test cases
- `grep "thresholds" dashboard/vitest.config.ts` — returns threshold configuration
- `grep -c "continue-on-error: true" .github/workflows/ci-quality-security.yml` — count decreased by 1 (coverage job no longer advisory)
- `bash -n scripts/smoke-test.sh` — syntax check passes

## Inputs

- T01-T04 — dashboard test coverage must be in place before thresholds are meaningful
- T05 — control-plane coverage must be in place before CI gate is safe to harden
- `.codecov.yml` — existing project:70%, patch:80% targets (local thresholds should be lower to avoid false blocks)
- `.github/workflows/ci-quality-security.yml` — existing CI with `continue-on-error: true` on coverage job

## Expected Output

- `dashboard/playwright.config.ts` — Playwright configuration targeting localhost:3000
- `dashboard/e2e/smoke.spec.ts` — E2E smoke test with page load + health check assertions
- `dashboard/package.json` — updated with `@playwright/test` devDependency
- `dashboard/vitest.config.ts` — updated with coverage.thresholds block
- `.github/workflows/ci-quality-security.yml` — coverage job hardened to blocking
- `scripts/smoke-test.sh` — docker-compose orchestration for local E2E runs

## Observability Impact

- **Playwright HTML report**: After smoke tests run, `dashboard/playwright-report/index.html` contains screenshots, traces, and per-test timing. Retained on failure via `trace: "retain-on-failure"` config.
- **CI coverage gate**: The `coverage` job in `.github/workflows/ci-quality-security.yml` now blocks the pipeline on failure. Check the job status in GitHub Actions to see if Rust coverage generation or Codecov upload failed.
- **Vitest coverage thresholds**: Running `cd dashboard && npx vitest run --coverage` locally enforces line/branch/function/statement thresholds. Threshold violations print the shortfall percentage and fail the process exit code.
- **Smoke test orchestration**: `scripts/smoke-test.sh` prints service health status every 5s during startup, and reports pass/fail exit code. On failure, docker-compose logs are available via `docker compose logs` before the trap cleanup runs.
- **Failure inspection**: A future agent can verify these signals by: (1) `grep "thresholds" dashboard/vitest.config.ts` to confirm threshold config, (2) `grep -c "continue-on-error" .github/workflows/ci-quality-security.yml` to confirm the gate is hard, (3) `cat dashboard/e2e/smoke.spec.ts` to inspect test assertions.
