# S03: Input Validation & Output Sanitization — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All three deliverables (CSV sanitization, maxLength constraints, body limits) are verifiable through automated tests, grep checks, and structured API responses — no live runtime or human UX judgment needed.

## Preconditions

- Bun installed and `control-plane/` dependencies available (`bun install` completed)
- Working directory is repository root or `control-plane/`

## Smoke Test

Run `bun test` from `control-plane/` — 408+ tests pass, 0 new failures. Then verify `grep -r "maxLength" src/modules/*/model.ts | wc -l` returns ≥47.

## Test Cases

### 1. CSV Formula Injection — Equals Prefix

1. Run `bun test src/modules/reports/csv-generator.test.ts`
2. Look for test: `sanitizes = prefix`
3. **Expected:** `escapeCSV('=CMD("calc")')` returns `"'=CMD(""calc"")"` — single-quote prepended, value force-quoted, inner quotes doubled.

### 2. CSV Formula Injection — Plus Prefix

1. In the same test run, look for: `sanitizes + prefix`
2. **Expected:** `escapeCSV('+1-1')` returns `"'+1-1"` — single-quote prepended, force-quoted.

### 3. CSV Formula Injection — Minus Prefix

1. Look for: `sanitizes - prefix`
2. **Expected:** `escapeCSV('-1+1')` returns `"'-1+1"` — single-quote prepended, force-quoted.

### 4. CSV Formula Injection — At-Sign Prefix

1. Look for: `sanitizes @ prefix`
2. **Expected:** `escapeCSV('@SUM(A1:A10)')` returns `"'@SUM(A1:A10)"` — single-quote prepended, force-quoted.

### 5. CSV Formula Injection — Normal Values Unchanged

1. Look for tests in `normal values unchanged` group
2. **Expected:** Plain strings, numbers, null, undefined, booleans, and empty strings pass through without single-quote prefix.

### 6. CSV Formula Injection — Integration via generateCSV

1. Look for `generateCSV — formula injection in data fields` test group
2. **Expected:** Formula-prefixed vendor names, department names, and policy names are sanitized when appearing in full CSV report output.

### 7. TypeBox maxLength — String Within Limit Accepted

1. Run `bun test src/modules/validation.test.ts`
2. Look for tests with `within maxLength` or `at limit`
3. **Expected:** Strings at or below the maxLength boundary pass TypeBox validation (Value.Check returns true).

### 8. TypeBox maxLength — String Exceeding Limit Rejected

1. In the same test run, look for tests with `exceeding maxLength` or `over limit`
2. **Expected:** Strings 1 character over the maxLength boundary fail TypeBox validation (Value.Check returns false).

### 9. TypeBox maxLength — Coverage Across Models

1. Run `grep -r "maxLength" control-plane/src/modules/*/model.ts | wc -l`
2. **Expected:** Returns 47 (or more). All TypeBox string fields across policies, vendors, anomalies, regulatory, reviews, and auth models have explicit maxLength.

### 10. Body Size Limit — Oversized Request Rejected

1. Run `bun test src/modules/body-limit.test.ts`
2. Look for test: `rejects body exceeding limit with structured 413`
3. **Expected:** POST with Content-Length exceeding MAX_BODY_BYTES returns HTTP 413 with JSON body `{ success: false, error: { code: "BODY_TOO_LARGE", maxBytes: 1048576 } }`.

### 11. Body Size Limit — Within-Limit Request Accepted

1. In the same test run, look for: `accepts body within limit`
2. **Expected:** POST with Content-Length within MAX_BODY_BYTES is not rejected by the body limit check.

### 12. Body Size Limit — GET Requests Pass Through

1. Look for: `GET requests pass through`
2. **Expected:** GET requests are not subject to body size checking regardless of headers.

### 13. Body Size Limit — Environment Variable Override

1. Inspect `control-plane/src/index.ts`
2. Look for `MAX_BODY_SIZE` env var usage
3. **Expected:** `const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_SIZE || "1048576", 10)` — configurable via env var, defaults to 1MB.

## Edge Cases

### Formula Prefix Combined with CSV Special Characters

1. Run CSV generator tests
2. Look for: `sanitizes formula prefix with commas in value`, `sanitizes formula prefix with quotes in value`, `sanitizes formula prefix with newlines in value`
3. **Expected:** Formula prefix sanitization (single-quote prepend) works correctly alongside standard CSV escaping (comma-quoting, quote-doubling, newline-quoting).

### Negative Number Fail-Closed

1. Look for: `leaves negative numbers as-is (stringified by String())`
2. **Expected:** `escapeCSV(-1)` — the Number -1 is first converted to String("-1") which starts with "-", triggering sanitization. This is the intentional fail-closed behavior.

### TypeBox maxLength on Rego Source (Large Field)

1. In validation tests, check if rego_source has maxLength 500000
2. **Expected:** Rego policy text up to 500K characters is accepted; above 500K is rejected. This accommodates legitimately large Rego policies.

## Failure Signals

- `bun test` shows new failures beyond the 2 pre-existing auth/service.test.ts failures
- `grep -r "maxLength" control-plane/src/modules/*/model.ts | wc -l` returns less than 47
- `grep "MAX_BODY" control-plane/src/index.ts` returns no output (body limit not configured)
- Any TypeBox model file has `t.String()` without `maxLength` parameter
- Body limit test returns wrong HTTP status code or missing structured error fields

## Requirements Proved By This UAT

- AR-INPUT-01 — CSV formula injection sanitized, TypeBox maxLength on all string fields, Elysia body size limit configured. Proved by 45 new tests (21 CSV + 21 maxLength + 3 body limit) and structural grep verification.

## Not Proven By This UAT

- Runtime behavior under actual load (body limit at scale with concurrent requests)
- Bun maxRequestBodySize backstop (internal Bun behavior, tested only via onRequest Content-Length check)
- Whether negative number sanitization in CSV causes downstream issues for report consumers

## Notes for Tester

- The 2 failures in `auth/service.test.ts` are pre-existing and unrelated to S03 — ignore them.
- Body limit tests start a temporary Elysia server on a random port — ensure no port conflicts.
- TypeBox validation tests use `Value.Check()` from `@sinclair/typebox/value` — they validate schema constraints without hitting the API server.
