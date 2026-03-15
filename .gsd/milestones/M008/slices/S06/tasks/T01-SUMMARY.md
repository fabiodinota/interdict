---
id: T01
parent: S06
milestone: M008
provides:
  - Docker Compose test profile with ephemeral volumes and isolated ports
  - Integration test orchestration script with trap-based cleanup and health-wait
key_files:
  - docker-compose.test.yml
  - scripts/integration-test.sh
key_decisions:
  - "D055: Integration test profile uses deterministic dev credentials, test-prefixed ephemeral volumes, 1xxxx port range, dashboard excluded"
patterns_established:
  - "docker-compose.test.yml override file pattern for isolated integration test runs"
  - "Orchestration script auto-discovers tests/integration/*.sh and runs them sequentially"
  - "Trap-based cleanup dumps service logs on failure before tearing down"
observability_surfaces:
  - "Per-test pass/fail logging with timestamps in integration-test.sh"
  - "Service log dump on failure via trap handler"
  - "`docker compose -f docker-compose.yml -f docker-compose.test.yml -p interdict-integration logs` for post-mortem debugging"
duration: 25m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Create Docker Compose test profile and orchestration script

**Created docker-compose.test.yml override with ephemeral volumes and scripts/integration-test.sh orchestration with trap-based cleanup, health-wait, and auto-discovery of test scripts**

## What Happened

Created `docker-compose.test.yml` as a Docker Compose override file that:
- Overrides all named volumes to test-prefixed ephemeral volumes (destroyed on `down -v`)
- Remaps all exposed ports to 1xxxx range (15432, 18123, 13001, 18443) to avoid conflicts with dev instance
- Uses deterministic dev-mode credentials (no .env required for test runs)
- Overrides postgres healthcheck to use test credentials
- Sets `COLLECTOR_REQUIRE_OBJECT_LOCK=false` for MinIO compatibility in test mode
- Excludes dashboard service via Docker Compose profiles (not needed for integration tests)
- Maintains real mTLS between services (tests validate actual gRPC channels)

Created `scripts/integration-test.sh` that:
- Starts services with `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d`
- Waits for all health checks (120s timeout) including control-plane HTTP health endpoint
- Auto-discovers and runs all `tests/integration/*.sh` scripts in sorted order
- Tracks per-test pass/fail with timestamped output
- Captures exit codes and produces a summary with total/passed/failed counts
- Runs `docker compose down -v` in a trap handler for guaranteed cleanup
- Dumps last 50 lines of service logs on failure before teardown
- Supports `--skip-build` flag for CI (pre-built images)
- Exports `CONTROL_PLANE_URL`, `KERNEL_URL`, `CLICKHOUSE_*` env vars for test scripts

## Verification

- `bash -n scripts/integration-test.sh` — syntax valid ✅
- `shellcheck scripts/integration-test.sh` — lint clean ✅
- `docker compose -f docker-compose.yml -f docker-compose.test.yml config --quiet` — valid ✅
- Port remapping verified: 13001, 18443, 15432, 18123 (no dev port conflicts) ✅
- Volumes verified: all services use test_* prefixed volumes ✅
- Postgres healthcheck uses test credentials ✅
- Dashboard excluded from test profile ✅

### Slice-level verification status (T01 is intermediate — partial passes expected)

- `bash -n scripts/integration-test.sh` — ✅ PASS
- `shellcheck scripts/integration-test.sh` — ✅ PASS
- `bash scripts/integration-test.sh` exits 0 — ⏳ not runnable yet (no test scripts exist; script handles this gracefully)
- Run 3 times consecutively — ⏳ deferred to final task
- Service log inspection on failure — ✅ implemented in trap handler

## Diagnostics

- On failure: trap handler dumps last 50 lines of each service log before teardown
- Post-mortem: `docker compose -f docker-compose.yml -f docker-compose.test.yml -p interdict-integration logs`
- Per-test output: each test prints timestamped step/assertion before checking
- No secrets in test output (uses hardcoded dev-mode credentials)

## Deviations

- Added postgres healthcheck override (not in plan) — base healthcheck used production user/db names that don't exist in test profile
- Set `COLLECTOR_REQUIRE_OBJECT_LOCK=false` (not in plan) — MinIO test instance doesn't support object lock without special configuration
- Added SC2329 shellcheck suppression for trap-invoked cleanup function

## Known Issues

None.

## Files Created/Modified

- `docker-compose.test.yml` — Docker Compose override for integration test profile
- `scripts/integration-test.sh` — Integration test orchestration script
- `tests/integration/` — Created empty directory for test scripts (T02/T03 will populate)
- `.gsd/milestones/M008/slices/S06/S06-PLAN.md` — Added failure-path verification checks, marked T01 done
- `.gsd/DECISIONS.md` — Appended D055 (integration test profile pattern)
