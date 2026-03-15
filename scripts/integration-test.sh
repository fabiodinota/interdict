#!/usr/bin/env bash
# scripts/integration-test.sh — Orchestrate cross-service integration tests
#
# Spins up real services via Docker Compose with the test profile,
# waits for health checks, runs integration test scripts, tears down cleanly.
#
# Usage:
#   bash scripts/integration-test.sh            # build + test
#   bash scripts/integration-test.sh --skip-build   # skip image builds (CI, pre-built)
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed
#   2 — infrastructure failure (services didn't start, timeout)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_BASE="${REPO_ROOT}/docker-compose.yml"
COMPOSE_TEST="${REPO_ROOT}/docker-compose.test.yml"
COMPOSE_CMD="docker compose -f ${COMPOSE_BASE} -f ${COMPOSE_TEST}"
TEST_DIR="${REPO_ROOT}/tests/integration"
HEALTH_TIMEOUT=120
SKIP_BUILD=false
PROJECT_NAME="interdict-integration"

# Test-profile ports (must match docker-compose.test.yml)
CONTROL_PLANE_PORT=13001
KERNEL_PORT=18443
CLICKHOUSE_PORT=18123

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build]"
      echo "  --skip-build  Skip docker image builds (use pre-built images)"
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------

_ts() { date '+%H:%M:%S'; }

log_step()  { echo ""; echo "[$(_ts)] === $1 ==="; }
log_info()  { echo "[$(_ts)]   $1"; }
log_pass()  { echo "[$(_ts)] ✅ PASS: $1"; }
log_fail()  { echo "[$(_ts)] ❌ FAIL: $1"; }
log_warn()  { echo "[$(_ts)] ⚠️  WARN: $1"; }

# ---------------------------------------------------------------------------
# Cleanup — always runs on exit via trap
# ---------------------------------------------------------------------------

# shellcheck disable=SC2329  # cleanup is invoked by trap, not directly
cleanup() {
  local exit_code=$?
  log_step "Teardown"

  if [ "$exit_code" -ne 0 ]; then
    log_info "Test run failed — dumping service logs for debugging..."
    echo "--- SERVICE LOGS (last 50 lines per service) ---"
    ${COMPOSE_CMD} -p "${PROJECT_NAME}" logs --tail=50 2>/dev/null || true
    echo "--- END SERVICE LOGS ---"
  fi

  log_info "Stopping services and removing ephemeral volumes..."
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" down -v --remove-orphans --timeout 15 2>/dev/null || true
  log_info "Cleanup complete."
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

log_step "Pre-flight"

if ! command -v docker &>/dev/null; then
  log_fail "docker not found in PATH"
  exit 2
fi

if ! docker info &>/dev/null; then
  log_fail "Docker daemon not running"
  exit 2
fi

# Verify compose files parse correctly
if ! ${COMPOSE_CMD} -p "${PROJECT_NAME}" config --quiet 2>/dev/null; then
  log_fail "Docker Compose configuration invalid"
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" config 2>&1 | tail -10
  exit 2
fi

log_info "Docker and Compose configuration OK"

# ---------------------------------------------------------------------------
# Start services
# ---------------------------------------------------------------------------

log_step "Starting services"

BUILD_FLAG=""
if [ "$SKIP_BUILD" = true ]; then
  log_info "Skipping image builds (--skip-build)"
else
  BUILD_FLAG="--build"
fi

# shellcheck disable=SC2086
${COMPOSE_CMD} -p "${PROJECT_NAME}" up -d ${BUILD_FLAG}

# ---------------------------------------------------------------------------
# Wait for all services to be healthy
# ---------------------------------------------------------------------------

log_step "Waiting for services (timeout: ${HEALTH_TIMEOUT}s)"

wait_for_healthy() {
  local elapsed=0
  local interval=5

  while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    # Count services that are not yet healthy (starting or unhealthy)
    local not_ready
    not_ready=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" ps --format json 2>/dev/null \
      | grep -cE '"unhealthy"|"starting"' || true)

    if [ "$not_ready" -eq 0 ]; then
      # Double-check key services respond
      if curl -sf "http://localhost:${CONTROL_PLANE_PORT}/health" >/dev/null 2>&1; then
        log_pass "All services healthy after ${elapsed}s"
        return 0
      fi
    fi

    log_info "Waiting... (${elapsed}s / ${HEALTH_TIMEOUT}s) — ${not_ready} service(s) not ready"
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  log_fail "Services did not become healthy within ${HEALTH_TIMEOUT}s"
  echo ""
  echo "Service status:"
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" ps 2>/dev/null || true
  echo ""
  echo "Recent logs:"
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" logs --tail=30 2>/dev/null || true
  return 1
}

if ! wait_for_healthy; then
  exit 2
fi

# ---------------------------------------------------------------------------
# Export test configuration for test scripts
# ---------------------------------------------------------------------------

export CONTROL_PLANE_URL="http://localhost:${CONTROL_PLANE_PORT}"
export KERNEL_URL="https://localhost:${KERNEL_PORT}"
export CLICKHOUSE_URL="http://localhost:${CLICKHOUSE_PORT}"
export CLICKHOUSE_USER="default"
export CLICKHOUSE_PASSWORD="test_password_clickhouse"
export CLICKHOUSE_DATABASE="interdict_test"
export COMPOSE_CMD
export PROJECT_NAME

# ---------------------------------------------------------------------------
# Run integration tests
# ---------------------------------------------------------------------------

log_step "Running integration tests"

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0
FAILED_TESTS=""

run_test() {
  local test_script="$1"
  local test_name
  test_name="$(basename "$test_script" .sh)"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  echo ""
  log_info "--- Test: ${test_name} ---"

  if bash "$test_script"; then
    log_pass "${test_name}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "${test_name}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS="${FAILED_TESTS} ${test_name}"
  fi
}

# Discover and run all integration test scripts
if [ -d "$TEST_DIR" ]; then
  # Find executable .sh files in the integration test directory
  test_scripts=()
  while IFS= read -r -d '' script; do
    test_scripts+=("$script")
  done < <(find "$TEST_DIR" -maxdepth 1 -name "*.sh" -type f -print0 | sort -z)

  if [ ${#test_scripts[@]} -eq 0 ]; then
    log_warn "No integration test scripts found in ${TEST_DIR}"
    log_info "Integration test orchestration verified — no test scripts to run yet."
  else
    for script in "${test_scripts[@]}"; do
      run_test "$script"
    done
  fi
else
  log_warn "Integration test directory not found: ${TEST_DIR}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

log_step "Results"
log_info "Total: ${TESTS_TOTAL}  Passed: ${TESTS_PASSED}  Failed: ${TESTS_FAILED}"

if [ "$TESTS_FAILED" -gt 0 ]; then
  log_fail "Failed tests:${FAILED_TESTS}"
  exit 1
fi

if [ "$TESTS_TOTAL" -eq 0 ]; then
  log_info "No test scripts found — orchestration-only run successful."
  exit 0
fi

log_pass "All integration tests passed."
exit 0
