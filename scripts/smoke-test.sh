#!/usr/bin/env bash
# scripts/smoke-test.sh — Run Playwright E2E smoke tests against the full local stack.
#
# Usage:
#   bash scripts/smoke-test.sh
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env file configured (see env.example)
#   - Playwright browsers installed: cd dashboard && npx playwright install chromium
#
# The script:
#   1. Starts all services via docker-compose
#   2. Waits for healthchecks to pass (120s timeout)
#   3. Runs Playwright smoke tests targeting the dashboard at localhost:8080
#   4. Tears down docker-compose regardless of test outcome

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
DASHBOARD_DIR="${REPO_ROOT}/dashboard"
HEALTH_TIMEOUT=120
DASHBOARD_URL="http://localhost:8080"

# Ensure cleanup runs on any exit
cleanup() {
  echo ""
  echo "==> Tearing down docker-compose..."
  docker compose -f "$COMPOSE_FILE" down --remove-orphans --timeout 10 2>/dev/null || true
  echo "==> Cleanup complete."
}
trap cleanup EXIT

echo "==> Starting docker-compose stack..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for all services to be healthy (timeout: ${HEALTH_TIMEOUT}s)..."

wait_for_healthy() {
  local elapsed=0
  local interval=5
  while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    # Check if all services with healthchecks are healthy
    local unhealthy
    unhealthy=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null \
      | grep -c '"unhealthy"\|"starting"' || true)
    
    # Also check that the dashboard specifically responds
    if [ "$unhealthy" -eq 0 ]; then
      if curl -sf "$DASHBOARD_URL" > /dev/null 2>&1; then
        echo "==> All services healthy after ${elapsed}s."
        return 0
      fi
    fi

    echo "  ... waiting (${elapsed}s / ${HEALTH_TIMEOUT}s) — ${unhealthy} service(s) not ready"
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  echo "ERROR: Services did not become healthy within ${HEALTH_TIMEOUT}s."
  echo "==> Service status:"
  docker compose -f "$COMPOSE_FILE" ps
  return 1
}

wait_for_healthy

echo ""
echo "==> Running Playwright smoke tests..."
cd "$DASHBOARD_DIR"

PLAYWRIGHT_BASE_URL="$DASHBOARD_URL" npx playwright test --project=smoke
TEST_EXIT=$?

echo ""
if [ "$TEST_EXIT" -eq 0 ]; then
  echo "✅ Smoke tests passed."
else
  echo "❌ Smoke tests failed (exit code: $TEST_EXIT)."
fi

exit "$TEST_EXIT"
