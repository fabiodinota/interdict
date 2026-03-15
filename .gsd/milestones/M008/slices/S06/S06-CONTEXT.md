---
id: S06
milestone: M008
status: ready
---

# S06: Cross-Service Integration Tests — Context

## Goal

Write integration tests that validate real cross-service communication — kernel↔control-plane policy distribution and kernel→evidence-collector→ClickHouse evidence pipeline — closing H-06.

## Why this Slice

Individual services are well-tested in isolation but no test validates the actual integration boundaries. A kernel subscribing to a real control-plane gRPC stream, receiving a policy update, and enforcing it has never been tested end-to-end. Silent failures at service boundaries are the highest remaining test gap.

## Scope

### In Scope

- Docker Compose test profile for spinning up real services
- Integration test: kernel subscribes to control-plane gRPC, receives policy snapshot, enforces policy
- Integration test: kernel sends evidence bundle via gRPC, evidence-collector stores in ClickHouse, control-plane queries it
- Test orchestration script for CI execution
- Timeout and retry logic for service startup

### Out of Scope

- Full E2E browser tests (covered by existing Playwright smoke tests)
- Performance testing of cross-service flows
- Testing every policy type through the full stack

## Constraints

- Tests must work without external dependencies (all services run locally via Docker Compose)
- Services need real databases (Postgres, ClickHouse) but can use ephemeral containers
- gRPC connections are timing-sensitive — tests need retry/backoff for service startup
- Tests must clean up all containers on exit (trap-based cleanup)
- Depends on S02 being complete (rate limiter must not block integration test auth)

## Integration Points

### Consumes

- `docker-compose.yml` — Base service definitions
- `scripts/smoke-test.sh` — Existing orchestration patterns
- S02 rate limiter — must not interfere with test auth requests

### Produces

- `docker-compose.test.yml` — Test-specific overrides (ephemeral volumes, test ports)
- `scripts/integration-test.sh` — Orchestration script for full integration test
- `tests/integration/policy-distribution.sh` — Policy distribution integration test
- `tests/integration/evidence-pipeline.sh` — Evidence pipeline integration test
