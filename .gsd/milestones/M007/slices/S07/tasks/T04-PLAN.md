---
estimated_steps: 3
estimated_files: 2
---

# T04: Environment validation script

**Slice:** S07 — DevOps & Deployment Maturity
**Milestone:** M007

## Description

The `.env` file uses CHANGE_ME placeholders that pass Docker Compose's `${VAR:?msg}` syntax check (the variable is technically set) but indicate unconfigured credentials. Operators need a pre-flight validation script that catches placeholder passwords, missing required variables, and malformed URLs before `docker compose up` wastes time starting infrastructure with bad config.

## Steps

1. **Create `scripts/validate-env.sh`** — Script that: (1) loads `.env` via `set -a; source .env; set +a` if the file exists, (2) checks required variables are set and non-empty: `DATABASE_URL`, `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `MINIO_ROOT_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, (3) detects `CHANGE_ME` substring in credential vars (case-insensitive grep pattern), (4) validates URL format for `DATABASE_URL` (starts with `postgres://`), `CLICKHOUSE_URL` (starts with `http://` or `https://`), `AWS_ENDPOINT_URL` (starts with `http://` or `https://`), (5) checks consistency: `AWS_ACCESS_KEY_ID` should match `MINIO_ROOT_USER`, `AWS_SECRET_ACCESS_KEY` should match `MINIO_ROOT_PASSWORD` (warn, not fail), (6) prints colored pass/fail per check with variable names only (never values), (7) exits with count of failures as exit code (0 = all pass). Accept `--env-file` flag to specify alternate path.

2. **Wire into smoke-test.sh** — Add `scripts/validate-env.sh` call before the `docker compose up` step in `scripts/smoke-test.sh`. Parse a `--skip-env-check` flag that bypasses validation for CI environments where env is known-good. If validate-env.sh fails, print guidance and exit before wasting time on docker compose up.

3. **Validate script quality** — Run `shellcheck scripts/validate-env.sh` and `bash -n scripts/validate-env.sh`. Test manually with no .env file (should fail), with env.example copied as .env (should fail on CHANGE_ME placeholders), and describe expected output in script header comments.

## Must-Haves

- [ ] Script checks all required credential variables
- [ ] Script detects CHANGE_ME placeholder pattern
- [ ] Script validates URL format for database/API URLs
- [ ] Script never prints credential values
- [ ] Script exits non-zero on any validation failure
- [ ] smoke-test.sh calls validate-env.sh before docker compose up

## Verification

- `bash -n scripts/validate-env.sh` passes (valid syntax)
- `shellcheck scripts/validate-env.sh` passes
- Running with no .env prints errors and exits non-zero
- `grep "validate-env" scripts/smoke-test.sh` finds the pre-step

## Inputs

- `env.example` — full list of environment variables with CHANGE_ME placeholders
- `scripts/smoke-test.sh` — E2E smoke test script to wire validation into
- `docker-compose.yml` — `${VAR:?msg}` patterns showing which vars are required

## Expected Output

- `scripts/validate-env.sh` — comprehensive environment validation script
- `scripts/smoke-test.sh` — updated with validate-env.sh pre-step

## Observability Impact

- **New signal:** `scripts/validate-env.sh` prints per-variable PASS/FAIL status to stdout with colored output. Exit code equals number of failures (0 = all pass).
- **Inspection:** Run `bash scripts/validate-env.sh` or `bash scripts/validate-env.sh --env-file path` to validate any env file. Never prints credential values.
- **Failure visibility:** CHANGE_ME placeholders, missing required vars, and malformed URLs are each reported as named FAIL lines. Consistency mismatches (AWS↔MinIO) produce WARN lines.
- **Smoke test integration:** `scripts/smoke-test.sh` now exits early with guidance if env validation fails, preventing wasted docker compose startup time. Use `--skip-env-check` to bypass in CI.
