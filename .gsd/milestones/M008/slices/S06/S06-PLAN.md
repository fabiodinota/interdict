# S06: Cross-Service Integration Tests

**Goal:** Write integration tests that validate real kernel↔control-plane↔evidence-collector cross-service communication.
**Demo:** `bash scripts/integration-test.sh` spins up real services, validates policy distribution and evidence pipeline, tears down cleanly. Tests pass 3 consecutive runs.

## Must-Haves

- Docker Compose test profile with ephemeral volumes for isolated test runs
- Integration test proving kernel subscribes to control-plane gRPC and receives policy updates
- Integration test proving evidence flows from kernel through evidence-collector to ClickHouse
- Orchestration script with trap-based cleanup and health-wait logic
- Tests pass reliably without flakiness (3 consecutive runs)

## Proof Level

- This slice proves: integration (real services, real gRPC, real databases)
- Real runtime required: yes (Docker Compose services must be running)
- Human/UAT required: no

## Verification

- `bash scripts/integration-test.sh` exits 0
- Run 3 times consecutively, all pass
- `bash -n scripts/integration-test.sh` — syntax valid
- `shellcheck scripts/integration-test.sh` — lint clean

## Observability / Diagnostics

- Runtime signals: integration-test.sh prints service startup progress, test name, pass/fail per test case
- Inspection surfaces: `docker compose -f docker-compose.yml -f docker-compose.test.yml logs` for failure debugging
- Failure visibility: each test case prints its assertion before checking, making failures self-documenting
- Redaction constraints: no secrets in test output (uses dev-mode credentials)

## Tasks

- [ ] **T01: Create Docker Compose test profile and orchestration script** `est:45m`
  - Why: H-06 — Cross-service integration requires real running services with ephemeral state.
  - Files: `docker-compose.test.yml` (new), `scripts/integration-test.sh` (new)
  - Do: Create `docker-compose.test.yml` as an override file with: ephemeral volumes (no persistent data between runs), test-specific ports to avoid conflicts with dev instance, `COLLECTOR_SIGNING_MODE=dev` for simplified auth. Create `scripts/integration-test.sh` that: (1) runs `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d`, (2) waits for all health checks to pass (with 120s timeout), (3) runs each integration test script in sequence, (4) captures exit codes, (5) runs `docker compose down -v` in a trap handler for cleanup. Include `--skip-build` flag for CI (images pre-built). Pattern: reuse the wait-for-healthy and trap-cleanup patterns from existing `scripts/smoke-test.sh`.
  - Verify: `bash -n scripts/integration-test.sh` — syntax valid. `shellcheck scripts/integration-test.sh` — clean.
  - Done when: Orchestration script can start/stop services and run test scripts.

- [ ] **T02: Write policy distribution integration test** `est:1h`
  - Why: H-06 — No test validates kernel subscribing to control-plane gRPC and receiving policy updates.
  - Files: `tests/integration/policy-distribution.sh` (new)
  - Do: Write a shell script that: (1) Creates a test policy via the control-plane REST API (`curl -X POST /api/v1/policies` with a simple Rego policy). (2) Waits for the kernel to receive the policy update (check kernel logs for policy distribution message, or query a kernel status endpoint if available). (3) Sends a test request through the kernel proxy that should be affected by the policy. (4) Verifies the kernel enforced the policy (response reflects policy action). Include timeout and retry logic for each step. Use `set -euo pipefail` and meaningful error messages. Each assertion should print what it's checking before the check, so failures are self-documenting.
  - Verify: Script passes when services are running. `shellcheck tests/integration/policy-distribution.sh` clean.
  - Done when: Test proves kernel receives and enforces policies distributed by control-plane.

- [ ] **T03: Write evidence pipeline integration test** `est:1h`
  - Why: H-06 — No test validates evidence flows from kernel through evidence-collector to queryable storage.
  - Files: `tests/integration/evidence-pipeline.sh` (new)
  - Do: Write a shell script that: (1) Sends a request through the kernel proxy that triggers evidence collection (e.g., a request to an allowed vendor with content that gets inspected). (2) Waits for the evidence to be processed (poll the evidence-collector logs or wait a fixed delay for async flush). (3) Queries the control-plane audit API (`curl /api/v1/audit`) to verify the evidence bundle appears. (4) Verifies the bundle has expected fields: kernel_id, vendor, timestamp, verdict. Include timeout and retry for eventual consistency. Use the same self-documenting assertion pattern as T02.
  - Verify: Script passes when services are running. `shellcheck tests/integration/evidence-pipeline.sh` clean.
  - Done when: Test proves evidence flows from kernel through collector to queryable audit trail.

## Files Likely Touched

- `docker-compose.test.yml` (new)
- `scripts/integration-test.sh` (new)
- `tests/integration/policy-distribution.sh` (new)
- `tests/integration/evidence-pipeline.sh` (new)
