# S04: Expanded Test Coverage — Research

**Date:** 2026-03-15

## Summary

S04 is a broad coverage-expansion slice spanning three codebases (dashboard, control-plane, Rust workspace) plus E2E infrastructure and CI coverage gates. The dashboard currently has **8 tested components out of 46 non-UI components** — reaching 40+ requires adding ~32 new test files. The control-plane has **18 test files across 13 modules** and 191 passing tests — expanding to 27+ tested modules requires targeting the untested anomalies service, auth middleware, distribution tracker, report generators (CSV/PDF), and shared utilities. The Rust workspace has 544 tests across all crates; coverage runs in CI but as a non-blocking signal. E2E infrastructure (Playwright + docker-compose smoke) doesn't exist yet and needs to be built from scratch.

The primary recommendation is to decompose this into 6 tasks: (T01) dashboard component tests batch 1 — simple/medium components, (T02) dashboard component tests batch 2 — complex interactive components, (T03) control-plane module expansion, (T04) negative/adversarial tests across all services, (T05) E2E smoke test with Playwright + docker-compose, (T06) CI coverage threshold enforcement. Task ordering should prioritize T01–T03 (can be parallelized) before T04 (builds on them), with T05–T06 as the final infrastructure tasks.

## Recommendation

**Dashboard (T01+T02):** Follow the established test pattern from `kpi-cards.test.tsx` and `sidebar.test.tsx` — vitest + @testing-library/react + happy-dom. Use `vi.mock()` for hooks and Next.js navigation. Mock child components with complex dependencies (e.g., recharts, cmdk). Group into two batches: simple presentational components first (MandatoryBadge, RouteError, RouteLoading, SlaTimer, AnomalyList, FrameworkCard, VendorCard, CompilationStatus, CategoryPicker, TemplatePicker, PolicyRow, AnomalyCard, ReportProgress, TopBar, theme-toggle — ~15 components), then complex interactive components (ReviewDialog, PolicyWizard, BatchVerifyTable, AddVendorDialog, RuleEditor, ParameterForm, AuditFilters, PolicyOverrideTable, FrameworkDetail, ReportForm, etc. — ~17 components). Skip testing the 20 shadcn/ui primitives (badge, button, card, etc.) — they're upstream-tested.

**Control-plane (T03):** Add tests for: anomalies service (severity computation + sorting logic, ~2 tests), anomalies queries (mock ClickHouse, ~3 tests), distribution tracker (register/unregister/broadcast, ~4 tests), auth middleware (bearer extraction + dual-mode routing, ~3 tests), reports/csv-generator (pure function, ~3 tests), reports/pdf-generator (structure validation, ~2 tests), shared/utilities (cursor encode/decode, error classes, ~4 tests), and config.ts (requireEnv, ~2 tests). That adds ~10 new test files, reaching 28 tested modules.

**E2E (T05):** Create a lightweight Playwright test that assumes docker-compose services are running. The smoke test should verify: dashboard loads login page, control-plane health endpoint responds, and kernel proxy is reachable. Do NOT attempt to run full docker-compose in CI initially — it requires too many credentials and heavy images. Instead, the Playwright config should target the dashboard directly and use msw or direct fetch for API smoke checks. A separate `scripts/smoke-test.sh` can orchestrate docker-compose up + wait + test + down for local use.

**Coverage gates (T06):** The `.codecov.yml` already defines project:70% and patch:80% targets. Convert the CI `coverage` job from `continue-on-error: true` to a hard gate. Add vitest coverage thresholds to `vitest.config.ts`. Add bun test coverage thresholds if supported, or use codecov flags.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| React component testing | @testing-library/react (already installed) | Standard, accessible-first queries |
| Browser automation | Playwright | De facto standard for E2E, excellent CI support |
| Coverage reporting | @vitest/coverage-v8 (already installed) | Native vitest integration |
| Coverage thresholds | vitest `coverage.thresholds` config | Fail-fast in local dev, not just CI |
| Accessibility assertions | @testing-library/jest-dom (already installed) | `toBeInTheDocument`, `toHaveAttribute` etc. |
| Mock timers for SlaTimer | vitest `vi.useFakeTimers()` | Deterministic timer testing |
| ClickHouse mock pattern | Existing `createEmptyQueryChain()` in reports tests | Reuse proven mock pattern |
| Next.js request mocking | Existing `next-mocks.ts` helpers | `buildNextRequest`, `mockFetch`, `jsonResponse` |

## Existing Code and Patterns

- `dashboard/src/__tests__/components/kpi-cards.test.tsx` — canonical pattern for pure presentational component tests: render with props, assert text content, test loading states
- `dashboard/src/__tests__/components/sidebar.test.tsx` — pattern for components needing Next.js navigation mocks (`vi.mock("next/navigation")`) and user interaction testing (`userEvent.setup()`)
- `dashboard/src/__tests__/components/review-queue-simple.test.tsx` — pattern for mocking hooks (`vi.mock("@/hooks/use-reviews")`) and child components (`vi.mock("@/components/reviews/SlaTimer")`)
- `dashboard/src/__tests__/helpers/next-mocks.ts` — reusable Next.js server primitives: `buildNextRequest()`, `mockFetch()`, `jsonResponse()`, `createMockCookieStore()`
- `dashboard/src/__tests__/api/proxy.test.ts` — pattern for testing Next.js API route handlers with auth mocking
- `control-plane/src/modules/reports/service.test.ts` — pattern for mocking ClickHouse client with `createEmptyQueryChain()` and failing mock
- `control-plane/src/modules/vendors/service.test.ts` — pattern for mock database layer with Map-based in-memory storage
- `dashboard/vitest.config.ts` — existing vitest configuration with happy-dom environment, coverage v8 provider
- `.codecov.yml` — existing coverage targets (project:70%, patch:80%) with flag separation for rust/dashboard/control-plane
- `.github/workflows/ci-quality-security.yml` — existing CI with non-blocking coverage job, dashboard test job, control-plane test job

## Constraints

- Dashboard `node_modules` not installed locally (CI installs via `npm ci`). Tests must be validated by running `npm ci && npx vitest run` or relying on CI.
- Control-plane uses `bun test` (not vitest) — tests must use `bun:test` imports (`describe`, `expect`, `test` from `bun:test`)
- Dashboard uses vitest + happy-dom (not jsdom) — some DOM APIs may behave differently
- Components using `recharts` (ViolationChart, VendorUsageChart, BaselineChart) need full chart mocking since recharts relies on SVG rendering
- Components using `next-themes` (ThemeToggle) need ThemeProvider mocking
- PolicyWizard (376 lines) and BatchVerifyTable (365 lines) are the most complex components — may need selective testing of key interaction paths rather than exhaustive coverage
- `cargo-llvm-cov` is not installed locally — coverage percentage validation relies on CI
- E2E smoke test via docker-compose requires all environment secrets configured — cannot run in standard CI without secret provisioning
- The Rust `coverage` CI job uses `continue-on-error: true` — changing to blocking requires ensuring all workspace tests are stable

## Common Pitfalls

- **Mocking hooks that return mutation functions** — must return both `mutateAsync` and `isPending` (see review-queue-simple pattern). Missing fields cause runtime crashes.
- **Next.js `cookies()` async in v16** — `cookies()` returns a Promise in Next.js 16+. The existing `next-mocks.ts` already handles this (`async () => store`), but new test files must use the same mock pattern.
- **recharts and SVG in happy-dom** — happy-dom may not fully implement SVG APIs. Chart components (ViolationChart, VendorUsageChart, BaselineChart) should mock the chart library entirely rather than testing SVG output.
- **Vitest hoisting** — `vi.mock()` calls are hoisted to the top of the file. Import the module under test AFTER defining mocks, or use dynamic imports.
- **Bun test vs vitest API differences** — `bun:test` uses `test()` and `expect()` from `bun:test`, not `it()` from vitest. Some matchers differ slightly. Follow existing control-plane test patterns exactly.
- **Coverage threshold false positives** — setting thresholds too high initially may block PRs that touch untested legacy code. Start with project:60% dashboard / 70% control-plane and ratchet up.
- **E2E flakiness from timing** — docker-compose healthchecks use 5s intervals with 5 retries. A smoke test script must wait for ALL services to be healthy before running tests, not just for ports to open.

## Open Risks

- **Test volume vs. quality tradeoff** — adding 32+ dashboard test files risks producing shallow "renders without crashing" tests. The slice definition says "interaction and accessibility assertions" which requires testing click handlers, form submissions, and ARIA attributes for each component.
- **Playwright CI infrastructure** — running Playwright in GitHub Actions requires `npx playwright install --with-deps` which downloads Chromium (~150MB). This adds ~60s to CI pipeline duration.
- **E2E stability across environments** — the docker-compose E2E test has services depending on Postgres, ClickHouse, MinIO, and mTLS certificates. Any flaky healthcheck or slow startup could cause intermittent failures.
- **Coverage measurement divergence** — Codecov measures coverage from uploaded lcov/coverage data, but local vitest `coverage.thresholds` measure at test-run time. They may disagree on edge cases.
- **Dashboard test maintenance burden** — 40+ component tests will need updating whenever component APIs change. Components with many props (PolicyWizard: category, templates, form state) are particularly fragile.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Vitest | `bobmatnyc/claude-mpm-skills@vitest` | available (283 installs) |
| React Testing | `majesticlabs-dev/majestic-marketplace@react-testing` | available (33 installs) |
| Playwright E2E | `bobmatnyc/claude-mpm-skills@playwright-e2e-testing` | available (1.3K installs) |
| Playwright | `alinaqi/claude-bootstrap@playwright-testing` | available (350 installs) |
| Backend Testing | `backend-testing` | installed (project skill) |
| Testing Strategies | `testing-strategies` | installed (project skill) |
| Webapp Testing | `webapp-testing` | installed (project skill) |

## Inventory

### Dashboard: Untested Components (46 non-UI, 8 tested, 38 untested)

**Simple / Presentational (15 components, ≤80 lines, no complex state):**
1. `MandatoryBadge` (33 lines) — conditional render + tooltip
2. `RouteLoading` (23 lines) — skeleton layout
3. `RouteError` (34 lines) — error display + retry button
4. `theme-toggle` (34 lines) — dropdown menu, needs next-themes mock
5. `AnomalyList` (36 lines) — maps alerts to cards, empty state
6. `BaselineChart` (45 lines) — recharts wrapper, mock chart
7. `TemplatePicker` (71 lines) — card grid selection
8. `FrameworkCard` (72 lines) — card display
9. `CompilationStatus` (75 lines) — status badge with hook
10. `VendorCard` (80 lines) — card with status badge
11. `CategoryPicker` (62 lines) — grid selection
12. `SlaTimer` (68 lines) — timer with color logic, needs fake timers
13. `ReportProgress` (68 lines) — progress display
14. `SigningKeyTable` (68 lines) — table display
15. `PolicyRow` (142 lines) — row with status indicators

**Medium Complexity (13 components, 80-220 lines, hooks/interactions):**
16. `TimeRangeSelector` (84 lines) — date picker
17. `TopBar` (130 lines) — layout + auth
18. `AnomalyCard` (129 lines) — card with chart + actions
19. `BundleDetailPanel` (114 lines) — detail display
20. `ActivityFeed` (125 lines) — feed list
21. `ViolationChart` (120 lines) — recharts, mock chart
22. `VendorUsageChart` (119 lines) — recharts, mock chart
23. `PolicyList` (109 lines) — list with routing
24. `ModelList` (184 lines) — CRUD list
25. `FrameworkDetail` (179 lines) — detail view
26. `RegoPreview` (196 lines) — code display
27. `PolicyVersionHistory` (208 lines) — version list
28. `PolicyOverrideTable` (205 lines) — table with toggles

**Complex Interactive (9 components, >220 lines, multi-step/forms):**
29. `AddVendorDialog` (133 lines) — form dialog
30. `AuditFilters` (220 lines) — multi-filter form
31. `RawRegoEditor` (159 lines) — code editor
32. `RuleEditor` (234 lines) — rule builder
33. `ParameterForm` (241 lines) — dynamic form
34. `ReviewDialog` (254 lines) — resolution form
35. `AuditTable` (327 lines) — data table
36. `BatchVerifyTable` (365 lines) — batch operations
37. `PolicyWizard` (376 lines) — multi-step wizard
38. `ReportForm` (197 lines) — report generation form

### Control-Plane: Untested Modules

**High-value testable (pure logic, no DB):**
1. `anomalies/service.ts` (241 lines) — `computeSeverity()`, `computeOffHoursSeverity()`, sorting, `getSummary()` aggregation
2. `reports/csv-generator.ts` (180 lines) — pure function `generateCSV()` + `escapeCSV()`
3. `shared/utilities.ts` (131 lines) — `encodeCursor()`/`decodeCursor()`, error classes, `apiResponse()`/`paginatedResponse()`

**Medium-value testable (needs mocks):**
4. `distribution/tracker.ts` (216 lines) — `KernelTracker` register/unregister/broadcast/acknowledge
5. `auth/middleware.ts` (121 lines) — bearer extraction, dual-mode routing, role check
6. `anomalies/queries.ts` (288 lines) — ClickHouse query builders (mock CH client)
7. `reports/pdf-generator.ts` (581 lines) — PDF generation (mock jsPDF)

**Low-value / not worth unit testing:**
8. `config.ts` — env var loading (tested implicitly by integration)
9. `db/postgres.ts`, `db/clickhouse.ts` — connection setup (integration-only)
10. `*/index.ts` — Elysia route wiring (integration-only)
11. `*/model.ts` — type definitions (no runtime logic)
12. `db/schema/*.ts` — Drizzle schema definitions (no logic)

### CI Coverage Infrastructure

- `.codecov.yml` — already defines project:70%, patch:80%, flag separation
- CI `coverage` job — `continue-on-error: true`, needs to become blocking
- Dashboard vitest — no local `coverage.thresholds` configured
- Control-plane bun test — `--coverage` flag used but no thresholds

### E2E Infrastructure (doesn't exist)

- No Playwright config
- No Playwright dependency in any package.json
- No smoke test scripts
- docker-compose has healthchecks on all services (Postgres, ClickHouse, MinIO, control-plane, kernel, dashboard)

## Sources

- Dashboard component inventory from `find dashboard/src/components -name "*.tsx"` (66 files: 46 non-UI, 20 UI primitives)
- Existing dashboard tests from `dashboard/src/__tests__/` (15 test files: 8 component, 5 API, 1 middleware, 1 lib)
- Control-plane test inventory from `find control-plane/src -name "*.test.ts"` (18 test files, 191 passing tests)
- Rust test count from `cargo test --workspace --all-targets -- --list` (544 tests)
- CI workflow from `.github/workflows/ci-quality-security.yml`
- Codecov config from `.codecov.yml`
- S01 and S02 summaries for established test patterns and forward intelligence
