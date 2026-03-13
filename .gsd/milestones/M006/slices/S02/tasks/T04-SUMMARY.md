---
id: T04
parent: S02
milestone: M006
provides:
  - Zero hardcoded credentials in docker-compose.yml — all secrets via required env vars
  - Fail-fast compose startup when required credential vars are missing
  - env.example with CHANGE_ME placeholders and generation instructions
key_files:
  - docker-compose.yml
  - env.example
key_decisions:
  - Used ${VAR:?error} syntax for credential env vars so docker compose refuses to start with missing secrets; non-secret config (usernames, database names, ports) retains safe defaults
  - Added CLICKHOUSE_USER and CLICKHOUSE_PASSWORD to .env since they were previously only set via compose defaults
patterns_established:
  - Credential env vars in docker-compose.yml use :? (required) syntax; non-secret config uses :- (default) syntax
  - env.example uses CHANGE_ME_* placeholders with inline openssl generation instructions
observability_surfaces:
  - docker compose config error output shows which required vars are missing with generation hints
duration: 15m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T04: Parameterize default credentials in docker-compose

**Removed all hardcoded password defaults from docker-compose.yml and added fail-fast :? required-variable syntax with generation instructions in env.example.**

## What Happened

Replaced 9 credential-bearing environment variables in docker-compose.yml that had hardcoded fallback defaults (e.g. `${POSTGRES_PASSWORD:-interdict}`) with required-variable syntax (`"${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env — generate with openssl rand -base64 32}"`). This covers:

- `POSTGRES_PASSWORD` (postgres service)
- `CLICKHOUSE_PASSWORD` (clickhouse, control-plane, evidence-collector services)
- `MINIO_ROOT_PASSWORD` (minio, minio-init services)
- `DATABASE_URL` (control-plane — contains embedded credentials)
- `AWS_ACCESS_KEY_ID` (evidence-collector — matches MINIO_ROOT_USER)
- `AWS_SECRET_ACCESS_KEY` (evidence-collector — matches MINIO_ROOT_PASSWORD)

Non-secret config (POSTGRES_USER, POSTGRES_DB, CLICKHOUSE_USER, CLICKHOUSE_DATABASE, MINIO_ROOT_USER, bucket names, ports, paths) retains safe `:-default` fallbacks.

Updated env.example to replace all literal credential values with `CHANGE_ME_*` placeholders and added `openssl rand -base64 32` generation instructions. The header now includes a sed-based quick-start that auto-generates credentials.

Also removed hardcoded credential defaults from the minio-init entrypoint script (was using `$${MINIO_ROOT_USER:-interdict}` / `$${MINIO_ROOT_PASSWORD:-interdict-minio-secret}`).

Added missing CLICKHOUSE_USER and CLICKHOUSE_PASSWORD to .env since these were previously only set via compose defaults and are now required.

## Verification

- `grep -E '(PASSWORD|SECRET|DATABASE_URL).*:-' docker-compose.yml` — zero matches (no secret defaults)
- `grep -c ':-interdict' docker-compose.yml` — 8 matches, all non-secret (usernames, db names, bucket)
- `docker compose config` — valid YAML, renders with .env values
- `POSTGRES_PASSWORD= docker compose config` — fails fast with: "required variable POSTGRES_PASSWORD is missing a value: Set POSTGRES_PASSWORD in .env — generate with openssl rand -base64 32"
- `grep -c 'CHANGE_ME' env.example` — 13 placeholder occurrences
- `grep -c 'openssl rand' env.example` — 7 generation instruction occurrences

### Slice-level verification status (this is the final task):
- ✅ `cargo deny check` — passes (advisories ok, bans ok, licenses ok, sources ok)
- ⚠️ `cargo clippy --workspace --all-targets -- -D warnings` — fails on native C compilation (zstd-sys cc-rs error) — pre-existing Windows MSVC build env issue, unrelated to S02 changes
- ⚠️ `rg 'rand.*0\.8' Cargo.lock` — T02 summary documents rand 0.8 remains as transitive dep via tract-onnx (skip-listed in deny.toml)
- N/A `docker compose build` — not run (requires full Docker build, pre-existing from T03)
- ✅ `docker compose config | grep -i password` — all values from env vars, no literals in compose file
- ✅ All 4 Dockerfiles have `USER interdict` (non-root)

## Diagnostics

- Run `docker compose config 2>&1 | grep -i password` to verify no literal passwords in resolved config
- Run `grep -E '(PASSWORD|SECRET|DATABASE_URL).*:-' docker-compose.yml` to verify no secret defaults remain
- Unset any required credential var and run `docker compose config` to verify fail-fast behavior
- Run `diff env.example .env` to check local .env divergence from template

## Deviations

- Values containing `:?` error messages needed YAML quoting (double quotes) since the error text contains special YAML characters. All `:?` values are now quoted strings.
- Added CLICKHOUSE_USER and CLICKHOUSE_PASSWORD to .env (not in original plan) since removing compose defaults made them required.

## Known Issues

- Pre-existing: cargo clippy fails on Windows due to zstd-sys C compiler (MSVC) issue — not related to S02 changes.
- Pre-existing: rand 0.8 remains in Cargo.lock as transitive dep via tract-onnx — documented in T02 and skip-listed in deny.toml.

## Files Created/Modified

- `docker-compose.yml` — Replaced 9 hardcoded credential defaults with :? required-variable syntax
- `env.example` — Replaced literal passwords with CHANGE_ME placeholders and openssl generation instructions
- `.env` — Added CLICKHOUSE_USER and CLICKHOUSE_PASSWORD (previously only from compose defaults)
