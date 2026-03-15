---
id: T01
parent: S03
milestone: M008
provides:
  - CSV formula injection sanitization via escapeCSV() prefix-neutralization
key_files:
  - control-plane/src/modules/reports/csv-generator.ts
  - control-plane/src/modules/reports/csv-generator.test.ts
key_decisions:
  - Fail-closed for negative numbers: String(-1) starts with "-", gets sanitized — safe default for security-sensitive CSV output
  - escapeCSV() exported for direct unit testing in addition to integration-level testing via generateCSV()
patterns_established:
  - Formula injection defense: single-quote prefix + force-quote wrapping for =, +, -, @ prefixes (OWASP standard)
observability_surfaces:
  - none (pure function, no runtime logging needed — sanitization is deterministic and testable)
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Add CSV formula injection sanitization

**escapeCSV() now neutralizes formula-injection prefixes (=, +, -, @) by prepending a single-quote and force-quoting, with 21 new tests covering direct unit and integration-level scenarios.**

## What Happened

Modified `escapeCSV()` in `csv-generator.ts` to detect formula-triggering prefixes (`=`, `+`, `-`, `@`) as the first character of a string value. When detected, the value is prepended with a single-quote (`'`) and wrapped in double-quotes, which is the standard Excel/Sheets formula injection defense (OWASP recommendation). The function was also exported to enable direct unit testing.

Added 21 new tests across three test blocks:
- **escapeCSV direct tests (14):** Formula prefix sanitization for all four characters, combined with commas/quotes/newlines, normal values unchanged, null/undefined/boolean/empty handling, negative number fail-closed behavior.
- **Standard CSV escaping regression (4):** Comma, double-quote, newline, and carriage-return escaping still works.
- **Integration via generateCSV (3):** Formula-prefixed vendor names, department names, and policy names are sanitized in full report output.

Also added `## Observability / Diagnostics` and `## Verification (Diagnostic / Failure-Path)` sections to the slice plan per pre-flight requirements.

## Verification

- `bun test src/modules/reports/csv-generator.test.ts` — **35/35 pass** (14 existing + 21 new)
- `bun test` — **384/386 pass** (2 pre-existing failures in `auth/service.test.ts` unrelated to this change)
- Slice verification partial results:
  - ✅ `bun test src/modules/reports/csv-generator.test.ts` — all tests pass
  - ✅ `bun test` — no new failures
  - ⬜ `grep -r "maxLength" ... | wc -l` returns 7 (needs ≥10, T02 scope)
  - ⬜ `grep "body" control-plane/src/index.ts` — no body limit yet (T02 scope)

## Diagnostics

None — `escapeCSV()` is a pure function with deterministic behavior. Sanitization is verified at test time, not runtime. No logging or runtime observability needed.

## Deviations

None.

## Known Issues

- 2 pre-existing test failures in `control-plane/src/modules/auth/service.test.ts` (`exchangeApiKeyForSession is not a function`) — unrelated to this task, exist on the branch before changes.

## Files Created/Modified

- `control-plane/src/modules/reports/csv-generator.ts` — Added formula injection defense to `escapeCSV()`, exported the function
- `control-plane/src/modules/reports/csv-generator.test.ts` — Added 21 new tests for formula injection sanitization (direct + integration)
- `.gsd/milestones/M008/slices/S03/S03-PLAN.md` — Added Observability / Diagnostics and Diagnostic Verification sections
