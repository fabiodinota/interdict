---
estimated_steps: 5
estimated_files: 8
---

# T05: Control-plane module expansion — 8 new test files

**Slice:** S04 — Expanded Test Coverage
**Milestone:** M007

## Description

Add 8 new bun:test files covering the highest-value untested control-plane modules: anomalies service (severity computation), anomalies queries (ClickHouse query builders), distribution tracker (kernel lifecycle), auth middleware (bearer extraction), CSV generator (pure function), PDF generator (structure validation), shared utilities (cursor encoding, error classes), and config (env validation). All tests use `bun:test` imports, not vitest.

## Steps

1. Read each target module to identify exported functions, their signatures, and dependencies
2. Create `anomalies/service.test.ts`: test `computeSeverity()` at boundary values (1.2, 2.0, 5.0), `computeOffHoursSeverity()`, and `getSummary()` aggregation with mock query results (mock the 4 query functions)
3. Create `anomalies/queries.test.ts`: test query builder functions using `createEmptyQueryChain()` pattern from existing reports tests — verify correct SQL generation and parameter binding
4. Create `distribution/tracker.test.ts`: test `KernelTracker` register/unregister/broadcast lifecycle with mock gRPC `ServerWritableStream` objects; test acknowledge updates `lastAckAt`
5. Create `auth/middleware.test.ts`: test bearer token extraction from Authorization header, dual-mode routing (API key vs session), and role check rejection — use mock Elysia context objects
6. Create `reports/csv-generator.test.ts`: test `escapeCSV()` with commas, quotes, newlines, null, and `generateCSV()` with minimal ReportData producing correct CSV structure
7. Create `reports/pdf-generator.test.ts`: mock `pdfkit` (`PDFDocument`), call `generatePDF()` with minimal ReportData, verify method calls (addPage, text, etc.) were invoked in correct order
8. Create `shared/utilities.test.ts`: test `encodeCursor()`/`decodeCursor()` roundtrip, malformed cursor rejection, `AppError`/`NotFoundError` class hierarchy, `apiResponse()`/`paginatedResponse()` envelope format
9. Create `config.test.ts`: test `requireEnv()` with set and unset vars, verify error message includes variable name

## Must-Haves

- [ ] All 8 test files exist and pass `bun test`
- [ ] Tests import from `bun:test` (not vitest) — `describe`, `expect`, `test`, `mock` from `bun:test`
- [ ] `computeSeverity()` tested at exact threshold boundaries: 1.19→info, 2.0→warning, 5.0→critical
- [ ] `escapeCSV()` tested with commas, quotes, newlines, null, undefined
- [ ] `encodeCursor()`/`decodeCursor()` roundtrip verified; malformed input returns error/null
- [ ] KernelTracker tests verify register adds connection, unregister removes it, broadcast writes to streams
- [ ] Auth middleware tests verify bearer extraction and rejection of missing/malformed tokens
- [ ] Total control-plane test files ≥26 after this task

## Verification

- `cd control-plane && bun test` — all tests pass
- `find control-plane/src -name "*.test.ts" | wc -l` — returns ≥26

## Inputs

- `control-plane/src/modules/reports/service.test.ts` — `createEmptyQueryChain()` pattern for ClickHouse mocks
- `control-plane/src/modules/vendors/service.test.ts` — Map-based mock DB pattern
- S02 forward intelligence — MockKmsSigningProvider and FailingMockProvider patterns (for adversarial test design)
- Each module's source file for function signatures and types

## Expected Output

- `control-plane/src/modules/anomalies/service.test.ts` — severity computation + summary aggregation tests
- `control-plane/src/modules/anomalies/queries.test.ts` — ClickHouse query builder tests with mock client
- `control-plane/src/modules/distribution/tracker.test.ts` — kernel lifecycle + broadcast tests
- `control-plane/src/modules/auth/middleware.test.ts` — bearer extraction + role check tests
- `control-plane/src/modules/reports/csv-generator.test.ts` — CSV escaping + generation tests
- `control-plane/src/modules/reports/pdf-generator.test.ts` — PDF structure validation with mock PDFDocument
- `control-plane/src/shared/utilities.test.ts` — cursor encoding, error classes, response envelope tests
- `control-plane/src/config.test.ts` — env var validation tests

## Observability Impact

- **No new runtime signals.** This task adds test-only files that do not modify production code paths.
- **Test results**: `cd control-plane && bun test` — reports pass/fail per test file. 8 new files join the existing 18.
- **Failure diagnosis**: Bun test reporter prints failing assertion with expected vs received values. Grep output for `(fail)` to find regressions.
- **Coverage inspection**: Future coverage tooling (if added) will show these 8 modules as covered. Currently visible only via `bun test` pass/fail counts.
