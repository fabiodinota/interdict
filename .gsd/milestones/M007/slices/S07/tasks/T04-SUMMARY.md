---
id: T04
parent: S07
milestone: M007
provides:
  - Pre-flight environment validation script (scripts/validate-env.sh) catching placeholder passwords, missing vars, malformed URLs
  - smoke-test.sh integration with --skip-env-check bypass for CI
key_files:
  - scripts/validate-env.sh
  - scripts/smoke-test.sh
key_decisions:
  - Consistency checks (AWS↔MinIO credential match) are warnings not failures — operators may intentionally diverge in production S3
patterns_established:
  - validate-env.sh pattern: source .env → check required vars → detect CHANGE_ME placeholders → validate URL schemes → consistency warnings → exit with failure count
  - smoke-test.sh pre-step pattern: validate-env.sh before docker compose up with --skip-env-check bypass
observability_surfaces:
  - scripts/validate-env.sh prints per-variable PASS/FAIL/WARN without revealing credential values
  - Exit code equals failure count (0 = all pass)
  - smoke-test.sh exits early with guidance message on env validation failure
duration: 10m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T04: Environment validation script

**Created `scripts/validate-env.sh` — catches CHANGE_ME placeholders, missing required vars, and malformed URLs before docker compose wastes time starting with bad config**

## What Happened

Created a comprehensive environment validation script that runs 4 categories of checks:

1. **Required variables** — verifies DATABASE_URL, POSTGRES_PASSWORD, CLICKHOUSE_PASSWORD, MINIO_ROOT_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY are set and non-empty.
2. **Placeholder detection** — case-insensitive grep for `CHANGE_ME` in all credential variables.
3. **URL format validation** — DATABASE_URL must start with `postgres://` or `postgresql://`, CLICKHOUSE_URL with `http(s)://`, AWS_ENDPOINT_URL with `http(s)://`.
4. **Consistency checks** — warns (does not fail) if AWS_ACCESS_KEY_ID ≠ MINIO_ROOT_USER or AWS_SECRET_ACCESS_KEY ≠ MINIO_ROOT_PASSWORD.

Script supports `--env-file PATH` to validate alternate env files. Never prints credential values — only variable names and pass/fail status. Exit code is the number of failures.

Wired into `scripts/smoke-test.sh` as a pre-step before `docker compose up`. Added `--skip-env-check` flag for CI environments where env is known-good. On validation failure, smoke-test prints guidance and exits before wasting time on infrastructure startup.

## Verification

- `bash -n scripts/validate-env.sh` — passes (valid syntax)
- `shellcheck scripts/validate-env.sh` — passes clean (0 issues)
- No .env file test: exits 6 (all required vars missing) with WARN about missing file
- env.example as .env test: exits 5 (all credential vars have CHANGE_ME placeholders), URL schemes all pass
- `grep "validate-env" scripts/smoke-test.sh` — finds the pre-step integration
- `shellcheck scripts/smoke-test.sh` — only pre-existing SC2329 note (trap-invoked function)

### Slice-level checks passing after T04:
- ✅ `test -f scripts/validate-env.sh && bash -n scripts/validate-env.sh`
- ✅ `shellcheck scripts/backup.sh scripts/validate-env.sh`
- ✅ `grep "validate-env" scripts/smoke-test.sh`
- ✅ All prior T01-T03 checks remain passing (structural, no runtime dependencies)

## Diagnostics

- **Quick validation:** `bash scripts/validate-env.sh` — prints per-variable PASS/FAIL with colored output
- **Custom env file:** `bash scripts/validate-env.sh --env-file /path/to/.env`
- **Failure shape:** Each FAIL line names the variable and the issue (missing, placeholder, bad URL scheme). Exit code = failure count.
- **Smoke test skip:** `bash scripts/smoke-test.sh --skip-env-check` bypasses validation for CI

## Deviations

- Added `postgresql://` as accepted scheme for DATABASE_URL alongside `postgres://` — both are valid libpq connection strings and common in practice.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate-env.sh` — new: comprehensive environment validation script (required vars, placeholder detection, URL validation, consistency checks)
- `scripts/smoke-test.sh` — modified: added validate-env.sh pre-step with --skip-env-check flag
- `.gsd/milestones/M007/slices/S07/tasks/T04-PLAN.md` — added Observability Impact section per pre-flight requirement
