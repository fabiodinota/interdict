# S06: Cross-Service Integration Tests — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: mixed (artifact-driven static checks + live-runtime Docker tests)
- Why this mode is sufficient: Static verification (syntax, shellcheck, compose config) proves correctness of scripts. Live-runtime tests prove cross-service communication works end-to-end.

## Preconditions

- Docker Engine running with Docker Compose v2
- No services running on ports 13001, 15432, 18123, 18443 (test profile ports)
- At least 4GB RAM available for service stack
- Project images buildable (`docker compose build` succeeds) OR pre-built images available
- Working directory is the repository root

## Smoke Test

Run `bash scripts/integration-test.sh` — it should start services, run both integration tests, print pass/fail per test, and exit 0. All ephemeral volumes should be cleaned up after.

## Test Cases

### 1. Static validation — orchestration script

1. Run `bash -n scripts/integration-test.sh`
2. Run `shellcheck scripts/integration-test.sh`
3. **Expected:** Both exit 0 with no output (syntax valid, lint clean)

### 2. Static validation — integration test scripts

1. Run `bash -n tests/integration/policy-distribution.sh`
2. Run `bash -n tests/integration/evidence-pipeline.sh`
3. Run `shellcheck tests/integration/policy-distribution.sh`
4. Run `shellcheck tests/integration/evidence-pipeline.sh`
5. **Expected:** All exit 0 with no output

### 3. Docker Compose test profile validates

1. Run `docker compose -f docker-compose.yml -f docker-compose.test.yml config --quiet`
2. **Expected:** Exit 0 (valid compose configuration)

### 4. Port isolation from dev instance

1. Run `docker compose -f docker-compose.yml -f docker-compose.test.yml config`
2. Inspect published ports in the output
3. **Expected:** Ports are 15432 (postgres), 18123 (clickhouse), 13001 (control-plane), 18443 (kernel). No overlap with default dev ports (5432, 8123, 3001, 8443).

### 5. Ephemeral volumes use test prefix

1. Run `docker compose -f docker-compose.yml -f docker-compose.test.yml config`
2. Inspect volume names in the output
3. **Expected:** All named volumes have `test_` prefix (e.g., `test_postgres_data`, `test_clickhouse_data`, `test_minio_data`)

### 6. Full integration test run

1. Run `bash scripts/integration-test.sh`
2. Observe service startup progress output
3. Observe per-test pass/fail output
4. **Expected:** All services start and pass health checks within 120s. Both `policy-distribution.sh` and `evidence-pipeline.sh` pass. Script exits 0 with summary showing 2/2 passed.

### 7. Policy distribution lifecycle

1. During test case 6, observe the policy-distribution test output
2. **Expected:** 8 steps complete:
   - Auth bootstrap (user + API key inserted or already exists)
   - API key authentication verified (`GET /api/v1/auth/me` returns 200)
   - Policy created via REST API (returns policy ID)
   - Compilation completes (status transitions to `compiled`)
   - Kernel shows distribution activity in logs
   - Non-allowlisted domain request returns 403 or connection refused
   - Policy appears in policy list
   - Test policy cleaned up via DELETE

### 8. Evidence pipeline end-to-end

1. During test case 6, observe the evidence-pipeline test output
2. **Expected:** 8 steps complete:
   - Auth bootstrap (reuses same key pattern)
   - Baseline ClickHouse row count recorded
   - 3 CONNECT requests sent through kernel proxy
   - New evidence rows appear in ClickHouse (count > baseline)
   - Evidence bundle has required fields (bundle_id, kernel_id, vendor, policy_action, timestamp)
   - Chain hash is populated (or empty in dev signing mode)
   - Audit API query returns results (or gracefully skipped if not wired)
   - Evidence-collector shows gRPC/ClickHouse activity in logs

### 9. Three consecutive runs (stability)

1. Run `bash scripts/integration-test.sh` three times in sequence
2. **Expected:** All 3 runs exit 0. No flakiness, no port conflicts, no leftover state between runs.

### 10. Cleanup on failure

1. Run a test that intentionally fails (e.g., stop a service mid-test: `docker compose -f docker-compose.yml -f docker-compose.test.yml stop control-plane`)
2. Wait for the integration test to detect the failure
3. **Expected:** Trap handler fires: prints last 50 lines of each service log, then runs `docker compose down -v`. No orphaned containers or volumes remain.

### 11. Skip-build flag

1. Pre-build images: `docker compose -f docker-compose.yml -f docker-compose.test.yml build`
2. Run `bash scripts/integration-test.sh --skip-build`
3. **Expected:** Script starts services without building images. Faster startup.

## Edge Cases

### No test scripts exist

1. Temporarily rename `tests/integration/` contents
2. Run `bash scripts/integration-test.sh`
3. **Expected:** Script handles gracefully — reports 0 tests found and exits 0 (no tests to fail)

### Port conflict with dev instance

1. Start the dev instance on default ports
2. Run `bash scripts/integration-test.sh`
3. **Expected:** Test profile uses 1xxxx ports, so no conflict. Both instances can run simultaneously.

### ClickHouse schema not yet initialized

1. On first run with clean volumes, evidence-pipeline test Step 2 queries ClickHouse before the evidence-collector has created the schema
2. **Expected:** Test polls for table creation with retry logic rather than failing immediately

### Slow compilation

1. If OPA compilation takes longer than usual (complex policy or cold start)
2. **Expected:** Policy distribution test Step 4 retries up to 30 times with 2s interval (60s total). Only fails after full timeout with explicit error.

## Failure Signals

- `integration-test.sh` exits non-zero — one or more test cases failed
- `❌ FAIL:` in test output — specific assertion failed (self-documenting message shows what was checked)
- Service health check timeout (120s) — a service failed to start (check `docker compose logs <service>`)
- `compilation_status: failed` in policy distribution test — OPA compiler error (check control-plane logs)
- ClickHouse row count never increments — evidence pipeline broken (check evidence-collector and kernel logs)
- Orphaned containers after test — trap handler failed (check for `interdict-integration` project containers)

## Requirements Proved By This UAT

- AR-TEST-01 — Cross-service integration test validates kernel↔control-plane policy distribution and kernel→evidence-collector→ClickHouse evidence pipeline

## Not Proven By This UAT

- Runtime stability under load — tests run with minimal traffic, not production-scale
- Air-gapped deployment — tests assume internet access for image pulls
- Multi-node kernel distribution — tests validate single kernel instance only

## Notes for Tester

- Test cases 1–5 can be verified without Docker running (static checks)
- Test cases 6–11 require Docker Engine with at least 4GB available RAM
- First run will be slow due to image building (~5-10 minutes). Use `--skip-build` after first successful build.
- The evidence pipeline test sends CONNECT requests to `api.openai.com` — these will be intercepted by the kernel proxy but won't actually reach OpenAI (evidence is captured during policy evaluation before upstream connection)
- If you see `Table default.evidence_bundles doesn't exist` in early ClickHouse queries, that's expected — the test polls for table creation
- The audit API verification (evidence-pipeline Step 7) may print "SKIP" if the audit search endpoint isn't wired — this is informational, not a failure
