---
id: T05
parent: S04
milestone: M007
provides:
  - 8 new bun:test files expanding control-plane test coverage from 18→26 sub-modules
  - Coverage for anomaly severity computation, ClickHouse query builders, kernel tracker lifecycle, auth middleware, CSV/PDF generators, cursor encoding, error classes, and config validation
key_files:
  - control-plane/src/modules/anomalies/service.test.ts
  - control-plane/src/modules/anomalies/queries.test.ts
  - control-plane/src/modules/distribution/tracker.test.ts
  - control-plane/src/modules/auth/middleware.test.ts
  - control-plane/src/modules/reports/csv-generator.test.ts
  - control-plane/src/modules/reports/pdf-generator.test.ts
  - control-plane/src/shared/utilities.test.ts
  - control-plane/src/config.test.ts
key_decisions:
  - Test computeSeverity/computeOffHoursSeverity indirectly through AnomalyService.detectAnomalies() with mock query results since they are private functions
  - Use Bun's mock.module() for module-level mocking (queries, db, pdfkit) rather than dependency injection
  - Test auth middleware via lightweight Elysia test app with .handle() rather than mocking resolve internals
  - Config production-mode requireEnv tests skipped — isProduction is a module-level const evaluated at import time, not toggleable per-test
patterns_established:
  - Mock ClickHouse client pattern: factory returning { client, queryFn } for query builder tests
  - Mock gRPC stream pattern: mock({ write }) as ServerWritableStream for distribution tests
  - PDFKit mock pattern: mock.module("pdfkit") with method-call tracking via trackCall() closure
  - Elysia auth test pattern: createTestApp() builds minimal Elysia app with authPlugin + .handle(Request) for assertions
observability_surfaces:
  - none — test-only task, no runtime surfaces modified
duration: 25min
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T05: Control-plane module expansion — 8 new test files

**Added 8 bun:test files with 88+ test cases covering anomaly severity, query builders, kernel tracker, auth middleware, CSV/PDF generators, cursor encoding, error classes, and config validation.**

## What Happened

Created 8 test files covering the highest-value untested control-plane modules:

1. **anomalies/service.test.ts** (18 cases) — Tests `computeSeverity()` at boundary values (1.19→info, 2.0→warning, 5.0→critical), `computeOffHoursSeverity()` thresholds, vendor switch severity, topic drift via ratio, query failure warning collection, alert sorting (critical→warning→info), and `getSummary()` aggregation. Uses `mock.module("./queries")` to inject mock query results.

2. **anomalies/queries.test.ts** (14 cases) — Tests all four query builder functions (`queryVolumeAnomalies`, `queryOffHoursUsage`, `queryVendorSwitching`, `queryTopicDrift`). Verifies parameter binding, JSONEachRow format, partition filter presence (`event_date`), and invariant #6 compliance (topic drift query uses `uniqExact(prompt_hash)` not raw values).

3. **distribution/tracker.test.ts** (14 cases) — Tests `KernelTracker` register/unregister/acknowledge lifecycle, reconnection replacement, multi-kernel support, ACK version updates, NACK handling, and `broadcastUpdate()` writing to all streams and unregistering failed kernels.

4. **auth/middleware.test.ts** (10 cases) — Tests bearer token extraction (missing header, non-Bearer, empty), dual-mode routing (`ik_live_` prefix → API key, other → session token), rejection on null auth results, role-based access control (super_admin passes, read_only_auditor blocked), and public route passthrough.

5. **reports/csv-generator.test.ts** (14 cases) — Tests CSV structure (all section headers), escaping (commas→quotes, double-quotes→doubled, newlines→quoted, null→empty), unavailable sections (DATA UNAVAILABLE markers), violation percentages, policy formatting, and empty data handling.

6. **reports/pdf-generator.test.ts** (8 cases) — Mocks PDFKit with method-call tracking. Verifies `generatePDF()` returns Buffer, calls `doc.end()`, adds multiple pages, renders section titles and KPI values, includes warnings page, handles null summary and empty arrays gracefully.

7. **shared/utilities.test.ts** (24 cases) — Tests `encodeCursor()`/`decodeCursor()` roundtrip (standard, special chars, zero timestamp, UUID IDs, base64url safety), malformed cursor rejection (no separator, non-numeric timestamp, invalid base64, empty ID). Tests all 7 error class hierarchies (AppError, NotFoundError, ValidationError, CompilationError, ConflictError, AuthError, ForbiddenError). Tests `apiResponse()`, `paginatedResponse()`, `apiError()` envelope formatting with and without optional fields. Verifies constants.

8. **config.test.ts** (10 cases) — Tests `requireEnv()` fallback behavior, port validation (non-numeric, >65535, 0, negative), gRPC port validation, optional var defaults (CLICKHOUSE_USER, CLICKHOUSE_PASSWORD).

## Verification

- `cd control-plane && bun test` — **308 pass, 2 fail** (2 failures are pre-existing `exchangeApiKeyForSession` inter-test contamination in `auth/index.test.ts`, not related to this task — they pass in isolation)
- `find control-plane/src -name "*.test.ts" | wc -l` → **26** (18 existing + 8 new) ✓
- `cd dashboard && npx vitest run` — **53 test files, 370 tests passed** ✓ (slice check)
- All 8 new test files pass individually and in the full suite

## Diagnostics

- Run `cd control-plane && bun test` to see pass/fail for all 26 test files
- Run individual test files: `cd control-plane && bun test src/modules/anomalies/service.test.ts`
- Bun test reporter prints each test case name and `(pass)`/`(fail)` with expected vs received on failure

## Deviations

- **Config production-mode test removed**: `isProduction` is a module-level `const` evaluated at import time. Setting `NODE_ENV=production` in `beforeEach` does not affect it. Replaced the production-mode `requireEnv` throw test with a fallback verification test that proves the mechanism works.
- **Topic drift invariant #6 regex fixed**: Initial regex for checking that `prompt_hash` isn't exposed in the final SELECT was too broad (matched `uniqExact(prompt_hash)` inside CTEs). Fixed to check only the portion after `FROM current_hour`.

## Known Issues

- Pre-existing: `exchangeApiKeyForSession` tests in `auth/index.test.ts` fail when run in the full suite (pass in isolation) — inter-test state contamination, not caused by this task.

## Files Created/Modified

- `control-plane/src/modules/anomalies/service.test.ts` — 18 test cases for severity computation + summary aggregation
- `control-plane/src/modules/anomalies/queries.test.ts` — 14 test cases for ClickHouse query builders
- `control-plane/src/modules/distribution/tracker.test.ts` — 14 test cases for kernel lifecycle + broadcast
- `control-plane/src/modules/auth/middleware.test.ts` — 10 test cases for bearer extraction + role checks
- `control-plane/src/modules/reports/csv-generator.test.ts` — 14 test cases for CSV escaping + generation
- `control-plane/src/modules/reports/pdf-generator.test.ts` — 8 test cases for PDF structure validation
- `control-plane/src/shared/utilities.test.ts` — 24 test cases for cursor encoding, errors, response envelopes
- `control-plane/src/config.test.ts` — 10 test cases for env var validation + port checks
- `.gsd/milestones/M007/slices/S04/S04-PLAN.md` — marked T05 as [x]
- `.gsd/milestones/M007/slices/S04/tasks/T05-PLAN.md` — added Observability Impact section
