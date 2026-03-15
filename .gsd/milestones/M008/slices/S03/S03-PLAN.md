# S03: Input Validation & Output Sanitization

**Goal:** Sanitize CSV formula injection, add maxLength to TypeBox schemas, configure body size limits.
**Demo:** CSV test proves formula prefixes are sanitized. Model test proves oversized strings rejected. Elysia rejects >1MB request bodies. `bun test` passes.

## Must-Haves

- `escapeCSV()` sanitizes formula-injection prefixes (`=`, `+`, `-`, `@`) by prepending a single quote
- All TypeBox string fields in model files have explicit `maxLength` constraints
- Elysia body size limit configured (1MB default, env var override)
- Tests for CSV sanitization, model validation, and body limit

## Verification

- `bun test src/modules/reports/csv-generator.test.ts` — new tests for formula sanitization pass
- `bun test` — all existing tests still pass
- `grep -r "maxLength" control-plane/src/modules/*/model.ts | wc -l` returns ≥10
- `grep "body" control-plane/src/index.ts` shows body limit configuration

## Tasks

- [ ] **T01: Add CSV formula injection sanitization** `est:30m`
  - Why: M-02 — A malicious vendor name starting with `=CMD(...)` could execute commands when the CSV is opened in Excel.
  - Files: `control-plane/src/modules/reports/csv-generator.ts`, `control-plane/src/modules/reports/csv-generator.test.ts`
  - Do: In `escapeCSV()`, after converting to string, check if the first character is `=`, `+`, `-`, or `@`. If so, prepend a single quote (`'`) and wrap in double quotes. This is the standard Excel formula injection defense. Add tests: `=CMD("calc")` becomes `"'=CMD(""calc"")"`, `+1-1` becomes `"'+1-1"`, `@SUM(A1:A10)` becomes `"'@SUM(A1:A10)"`, `-1+1` becomes `"'-1+1"`, normal strings unchanged, numbers unchanged, null/undefined unchanged. Also test that existing escaping (commas, quotes, newlines) still works correctly with the new prefix check.
  - Verify: `bun test src/modules/reports/csv-generator.test.ts` — all existing + new tests pass
  - Done when: Formula-prefixed values are sanitized in CSV output.

- [ ] **T02: Add maxLength to TypeBox model schemas and configure body limits** `est:45m`
  - Why: M-05 + L-04 — Unbounded string fields allow multi-megabyte payloads. No body size limit compounds the issue.
  - Files: `control-plane/src/modules/policies/model.ts`, `control-plane/src/modules/vendors/model.ts`, `control-plane/src/modules/anomalies/model.ts`, `control-plane/src/modules/department-overrides/model.ts`, `control-plane/src/modules/regulatory/model.ts`, `control-plane/src/modules/reviews/model.ts`, `control-plane/src/index.ts`
  - Do: Add `maxLength` to all `t.String()` fields: `description` fields → 10,000 chars, `name`/`title` fields → 500 chars, `rego_source` → 500,000 chars (Rego policies can be large), `base_url` → 2,000 chars, `notes`/`comments` → 5,000 chars, `id`/`key` fields → 255 chars. In `control-plane/src/index.ts`, add Elysia body size limit: `.onParse` or Elysia config option to limit request body to `parseInt(process.env.MAX_BODY_SIZE || '1048576')` bytes (1MB default). Add test verifying that a string exceeding maxLength is rejected by TypeBox validation.
  - Verify: `grep -r "maxLength" control-plane/src/modules/*/model.ts | wc -l` ≥ 10. `bun test` passes.
  - Done when: All TypeBox string fields have maxLength and Elysia has body size limit.

## Files Likely Touched

- `control-plane/src/modules/reports/csv-generator.ts`
- `control-plane/src/modules/reports/csv-generator.test.ts`
- `control-plane/src/modules/policies/model.ts`
- `control-plane/src/modules/vendors/model.ts`
- `control-plane/src/modules/anomalies/model.ts`
- `control-plane/src/modules/department-overrides/model.ts`
- `control-plane/src/modules/regulatory/model.ts`
- `control-plane/src/modules/reviews/model.ts`
- `control-plane/src/index.ts`
