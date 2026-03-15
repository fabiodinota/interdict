# S08: Documentation, Accessibility & Polish — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: mixed (artifact-driven for docs + live-runtime for a11y tests)
- Why this mode is sufficient: Documentation is static markdown verified by existence/content checks. Accessibility is verified by automated axe-core assertions in vitest (happy-dom) and Playwright (real browser). Human verification supplements automated checks for screen reader usability and doc clarity.

## Preconditions

- Repository cloned with all M007 slices (S01–S08) applied
- Node.js ≥18 and bun installed
- `cd dashboard && bun install` completed (vitest-axe and @axe-core/playwright installed)
- No running services required (docs are static, vitest uses happy-dom)

## Smoke Test

Run `cd dashboard && npx vitest run` — all 385 tests pass including 6 axe-core a11y assertions. Then verify `ls docs/operator/guide.md docs/operator/troubleshooting.md docs/api/rest.md docs/api/grpc.md` — all 4 documentation files exist.

## Test Cases

### 1. Operator guide completeness

1. Open `docs/operator/guide.md`
2. Verify it contains all major sections: Overview, Quick Start, Kubernetes Deployment, Configuration Reference, Certificate Management, Signing Key Management, Monitoring, Backup & Restore, Environment Validation, Upgrade Procedures
3. Verify `wc -l docs/operator/guide.md` reports ≥578 lines
4. Verify Configuration Reference contains env var tables grouped by component (Database, ClickHouse, MinIO, Kernel, Control Plane, Evidence Collector, mTLS, SAML, Signing Keys)
5. Verify `scripts/backup.sh`, `scripts/validate-env.sh`, `--profile monitoring` are all referenced
6. **Expected:** All sections present with substantive content. Cross-references to troubleshooting.md, full-text-storage.md, rest.md, grpc.md all present.

### 2. Troubleshooting guide coverage

1. Open `docs/operator/troubleshooting.md`
2. Verify it contains all 9 problem categories: Certificate/mTLS, Database Connectivity, Evidence Pipeline, Policy Distribution, Signing Keys, CSP Violations, Docker Compose, Helm/Kubernetes, Diagnostic Commands
3. Verify `wc -l docs/operator/troubleshooting.md` reports ≥417 lines
4. Each category should follow symptom → cause → fix pattern
5. Verify the Diagnostic Commands section contains a reference table with ≥14 rows
6. **Expected:** All categories covered with actionable remediation steps. Table of diagnostic commands at the end.

### 3. REST API reference accuracy

1. Open `docs/api/rest.md`
2. Verify all 13 modules are documented: vendors, models, policies, rules, audit, evidence, reviews, signing-keys, distribution, routes, users, auth, health
3. Spot-check 3 modules against actual source files in `control-plane/src/modules/*/index.ts`
4. Verify authentication section documents both API key (`ik_live_` prefix) and session token modes
5. Verify response envelope, pagination, and error code sections are present
6. Verify role hierarchy table lists 5 roles with levels 1–5
7. **Expected:** Endpoint paths, HTTP methods, and descriptions match source code. Auth requirements correctly documented per-module.

### 4. gRPC API reference accuracy

1. Open `docs/api/grpc.md`
2. Verify EvidenceCollectorService documents `SubmitEvidence` client-streaming RPC
3. Verify PolicyDistributionService documents `Subscribe` (server-stream) and `Acknowledge` (unary) RPCs
4. Cross-check message field tables against `proto/evidence.proto` and `proto/policy_distribution.proto`
5. Verify connection details table includes ports and env vars
6. **Expected:** Message schemas match proto file definitions. RPC modes (client-stream, server-stream, unary) correctly labeled.

### 5. Dashboard aria-label accessibility

1. Open `dashboard/src/components/dashboard/TimeRangeSelector.tsx`
2. Verify the refresh icon button has `aria-label="Refresh data"`
3. Open `dashboard/src/components/vendors/ModelList.tsx`
4. Verify the delete icon button has `aria-label="Remove model"`
5. Open `dashboard/src/components/layout/Sidebar.tsx`
6. Verify the collapse toggle has `aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}`
7. Open `dashboard/src/components/policies/PolicyRow.tsx`
8. Verify the Switch has an `aria-label` containing the policy name
9. **Expected:** All 4 icon buttons have descriptive aria-labels. Labels are contextual (e.g., Sidebar label changes based on collapsed state).

### 6. vitest-axe integration verification

1. Run `cd dashboard && npx vitest run --reporter=verbose 2>&1 | grep "axe"`
2. Verify 6 component test files show "has no axe-core accessibility violations" — all passing
3. Open `dashboard/src/__tests__/setup.ts` and verify vitest-axe matchers are registered
4. Open any axe-enabled test file (e.g., `sidebar.test.tsx`) and verify it uses `toHaveNoViolations()` with `color-contrast` disabled
5. **Expected:** 6 components pass axe-core a11y checks. color-contrast is disabled per-assertion (not globally). Setup file uses `expect.extend(matchers)`.

### 7. Playwright WCAG AA assertion

1. Open `dashboard/e2e/smoke.spec.ts`
2. Verify `@axe-core/playwright` is imported
3. Verify a test case uses `AxeBuilder` with `withTags(['wcag2a', 'wcag2aa'])`
4. Verify the test filters for `critical` and `serious` impact violations
5. **Expected:** Playwright smoke test includes a WCAG AA axe-core assertion that would fail if any critical/serious violations exist on the dashboard.

### 8. Project tracking accuracy

1. Open `.gsd/PROJECT.md` and verify v1.5 Production Readiness section exists with 11 deliverable line items
2. Open `README.md` and verify current status shows v1.5, Documentation section links all 5 docs, Production Considerations references operator guide
3. Open `.gsd/STATE.md` and verify M007 is marked complete
4. Run `grep "v1.5" .gsd/PROJECT.md README.md` — both files show v1.5
5. Run `grep "docs/operator" README.md` — at least 3 references
6. **Expected:** All tracking docs consistently reflect v1.5 and M007 completion.

## Edge Cases

### Missing vitest-axe dependency

1. Delete `node_modules` in dashboard, re-run `bun install`
2. Run `npx vitest run`
3. **Expected:** Tests still pass — vitest-axe resolves from package.json devDependencies

### Doc cross-reference integrity

1. Run `grep -r "troubleshooting.md\|guide.md\|full-text-storage.md\|rest.md\|grpc.md" docs/`
2. **Expected:** All cross-reference links between operator/API docs resolve to existing files. No broken links.

### axe-core with color-contrast enabled

1. In any test file, temporarily remove the `rules: { "color-contrast": { enabled: false } }` option
2. Run the single test
3. **Expected:** May produce false results due to happy-dom CSSOM limitation. This is expected and why the rule is disabled in happy-dom. The rule remains active in Playwright (real browser) tests.

## Failure Signals

- `npx vitest run` reports any test failures — especially axe-core violations with rule IDs like `button-name`, `image-alt`, `label`
- Missing `aria-label` in grep output for any of the 4 targeted components
- `docs/operator/guide.md` or `docs/api/rest.md` missing or under minimum line count
- PROJECT.md or README.md not showing v1.5
- STATE.md not showing M007 as complete
- axe-core violations in Playwright smoke test output with `critical` or `serious` impact

## Requirements Proved By This UAT

- HR-DOC-01 — Planning/state docs accurately reflect v1.5 verified state (Test Case 8)
- PR-OPS-01 — Operator guide and API documentation exist and are complete (Test Cases 1–4)
- PR-A11Y-01 — Dashboard passes axe-core with zero critical/serious WCAG violations (Test Cases 5–7)

## Not Proven By This UAT

- Screen reader usability of the dashboard — requires human testing with NVDA/VoiceOver/JAWS
- Operator guide accuracy for production Kubernetes clusters — guide references Helm commands and config but hasn't been followed step-by-step on a live cluster
- API doc accuracy against live running API — docs were written from source code inspection, not runtime testing
- Color contrast compliance — disabled in happy-dom tests (D043), should be verified visually or with Lighthouse

## Notes for Tester

- The vitest-axe `color-contrast` rule is intentionally disabled in happy-dom tests (see D043). Color-contrast testing happens in the Playwright smoke test which uses a real browser. If you want to verify color contrast manually, use browser DevTools Lighthouse audit or axe browser extension.
- The operator guide references scripts (`backup.sh`, `validate-env.sh`, `smoke-test.sh`) and Docker Compose profiles that exist in the repo from S07. You can verify script existence with `ls scripts/backup.sh scripts/validate-env.sh scripts/smoke-test.sh`.
- API docs were manually authored from source code inspection (D042). If you want to verify endpoint accuracy, cross-reference `docs/api/rest.md` module sections against `control-plane/src/modules/*/index.ts` route definitions.
- The Playwright smoke test (Test Case 7) requires a running dashboard instance to actually execute. In CI, it runs via docker-compose. For local UAT, you can inspect the test code without running it.
