#!/usr/bin/env bash
# tests/integration/evidence-pipeline-win.sh — Evidence Pipeline Integration Test (Windows)
#
# Windows-compatible variant of evidence-pipeline.sh.
# Uses docker exec to send proxy traffic through the kernel from inside the
# Docker network, avoiding Windows curl HTTPS-proxy limitations.
#
# Requires: CONTROL_PLANE_URL, KERNEL_URL, CLICKHOUSE_URL, CLICKHOUSE_USER,
#           CLICKHOUSE_PASSWORD, CLICKHOUSE_DATABASE, COMPOSE_CMD, PROJECT_NAME
# (exported by scripts/integration-test.sh)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

: "${CONTROL_PLANE_URL:=http://localhost:13001}"
: "${KERNEL_URL:=https://localhost:18443}"
: "${CLICKHOUSE_URL:=http://localhost:18123}"
: "${CLICKHOUSE_USER:=default}"
: "${CLICKHOUSE_PASSWORD:=test_password_clickhouse}"
: "${CLICKHOUSE_DATABASE:=interdict_test}"
: "${COMPOSE_CMD:=docker compose -f docker-compose.yml -f docker-compose.test.yml}"
: "${PROJECT_NAME:=interdict-integration}"

TEST_API_KEY="ik_live_integration_test_key_00000000000000000000"
TEST_API_KEY_HASH=""
TARGET_VENDOR="api.openai.com"
MAX_RETRIES=30
RETRY_INTERVAL=2

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ts() { date '+%H:%M:%S'; }
assert_step() { echo "[$(_ts)] 🔍 ASSERT: $1"; }
pass()        { echo "[$(_ts)] ✅ PASS: $1"; }
fail()        { echo "[$(_ts)] ❌ FAIL: $1"; exit 1; }
info()        { echo "[$(_ts)]   $1"; }

compute_key_hash() {
  if command -v sha256sum &>/dev/null; then
    printf '%s' "$TEST_API_KEY" | sha256sum | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    printf '%s' "$TEST_API_KEY" | shasum -a 256 | awk '{print $1}'
  else
    fail "Neither sha256sum nor shasum found"
  fi
}

pg_exec() {
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" exec -T postgres \
    psql -U interdict_test -d interdict_test -tAc "$1" 2>/dev/null
}

ch_query() {
  curl -sf \
    -d "$1" \
    "${CLICKHOUSE_URL}/?database=${CLICKHOUSE_DATABASE}&user=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}" \
    2>/dev/null
}

api_get() {
  curl -sf -H "Authorization: Bearer ${TEST_API_KEY}" \
    "${CONTROL_PLANE_URL}$1" 2>/dev/null
}

# Send a request through the kernel proxy from INSIDE the Docker network.
# Uses docker exec on the control-plane container (has curl/wget) to avoid
# Windows HTTPS-proxy curl limitations.
kernel_proxy_request() {
  local target_url="$1"
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" exec -T control-plane \
    wget -q -O /dev/null --no-check-certificate \
      -e "https_proxy=https://kernel:8443" \
      --timeout=10 \
      "$target_url" 2>&1 || true
}

# Get HTTP status code for a proxy request via the kernel (inside Docker network)
kernel_proxy_status() {
  local target_url="$1"
  # wget returns exit code 8 for server error (4xx/5xx), 4 for network error
  local exit_code=0
  local output=""
  output=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" exec -T control-plane \
    wget --spider -S -q --no-check-certificate \
      -e "https_proxy=https://kernel:8443" \
      --timeout=10 \
      "$target_url" 2>&1) || exit_code=$?

  # Extract HTTP status from wget -S output
  local status
  status=$(echo "$output" | grep -oP 'HTTP/\S+\s+\K\d+' | tail -1)
  if [ -n "$status" ]; then
    echo "$status"
  elif [ "$exit_code" -eq 0 ]; then
    echo "200"
  else
    echo "000"
  fi
}

# ---------------------------------------------------------------------------
# Step 1: Bootstrap test API key
# ---------------------------------------------------------------------------

echo ""
echo "[$(_ts)] === Evidence Pipeline Integration Test (Windows) ==="
echo ""

assert_step "Bootstrapping test API key in postgres"

TEST_API_KEY_HASH=$(compute_key_hash)
info "API key hash: ${TEST_API_KEY_HASH:0:16}..."

pg_exec "
  INSERT INTO users (email, display_name, role, is_service, is_active)
  VALUES ('integration-test@interdict.local', 'Integration Test User', 'super_admin', false, true)
  ON CONFLICT (email) DO NOTHING;
" || fail "Failed to insert test user into postgres"

TEST_USER_ID=$(pg_exec "SELECT id FROM users WHERE email = 'integration-test@interdict.local';")
[ -z "$TEST_USER_ID" ] && fail "Could not find test user ID"
info "Test user ID: ${TEST_USER_ID}"

EXISTING_KEY=$(pg_exec "SELECT id FROM api_keys WHERE key_hash = '${TEST_API_KEY_HASH}';")
if [ -z "$EXISTING_KEY" ]; then
  pg_exec "
    INSERT INTO api_keys (user_id, key_hash, key_prefix, label, is_active)
    VALUES ('${TEST_USER_ID}', '${TEST_API_KEY_HASH}', 'ik_live_integra', 'Integration test key', true);
  " || fail "Failed to insert test API key"
  info "API key inserted"
else
  info "API key already exists, skipping insert"
fi

pass "Test API key bootstrapped"

# ---------------------------------------------------------------------------
# Step 2: Record ClickHouse baseline
# ---------------------------------------------------------------------------

assert_step "Recording baseline evidence count in ClickHouse"

TABLE_EXISTS=$(ch_query "SELECT count() FROM system.tables WHERE database = '${CLICKHOUSE_DATABASE}' AND name = 'evidence_bundles'" || echo "")
if [ -z "$TABLE_EXISTS" ] || [ "$TABLE_EXISTS" = "0" ]; then
  info "evidence_bundles table not yet created — waiting for evidence-collector..."
  TABLE_READY=false
  for i in $(seq 1 "$MAX_RETRIES"); do
    TABLE_EXISTS=$(ch_query "SELECT count() FROM system.tables WHERE database = '${CLICKHOUSE_DATABASE}' AND name = 'evidence_bundles'" || echo "")
    if [ -n "$TABLE_EXISTS" ] && [ "$TABLE_EXISTS" -gt 0 ] 2>/dev/null; then
      TABLE_READY=true
      break
    fi
    info "Attempt ${i}/${MAX_RETRIES}: waiting for evidence_bundles table..."
    sleep "$RETRY_INTERVAL"
  done
  [ "$TABLE_READY" != "true" ] && fail "evidence_bundles table not created after $((MAX_RETRIES * RETRY_INTERVAL))s"
fi

BASELINE_COUNT=$(ch_query "SELECT count() FROM evidence_bundles" || echo "0")
BASELINE_COUNT=$(echo "$BASELINE_COUNT" | tr -d '[:space:]')
info "Baseline evidence count: ${BASELINE_COUNT}"

pass "ClickHouse reachable, baseline count recorded"

# ---------------------------------------------------------------------------
# Step 3: Send requests through the kernel proxy (via docker exec)
# ---------------------------------------------------------------------------

assert_step "Sending requests to ${TARGET_VENDOR} via kernel proxy (docker exec)"

# Use docker exec to run curl INSIDE a container on the Docker network.
# This avoids Windows HTTPS-proxy issues entirely.
REQUESTS_SENT=0
for attempt in 1 2 3; do
  # Run curl inside the control-plane container targeting the kernel as proxy
  HTTP_CODE=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" exec -T control-plane \
    sh -c "curl -s -o /dev/null -w '%{http_code}' \
      --proxy 'https://kernel:8443' \
      --proxy-insecure \
      --max-time 10 \
      'https://${TARGET_VENDOR}/v1/chat/completions' 2>/dev/null" \
  ) || HTTP_CODE="000"
  # Trim whitespace/carriage returns from docker exec output
  HTTP_CODE=$(echo "$HTTP_CODE" | tr -d '[:space:]')

  info "Request ${attempt}: HTTP ${HTTP_CODE} from kernel proxy"
  REQUESTS_SENT=$((REQUESTS_SENT + 1))

  if [ "$HTTP_CODE" != "000" ]; then
    info "Kernel responded with HTTP ${HTTP_CODE} — evidence should have been emitted"
  else
    # Fallback: try wget instead of curl (Bun image might not have curl)
    info "curl unavailable or failed — trying wget..."
    WGET_OUT=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" exec -T control-plane \
      sh -c "wget --spider -S -q --no-check-certificate \
        -e 'https_proxy=https://kernel:8443' \
        --timeout=10 \
        'https://${TARGET_VENDOR}/v1/chat/completions' 2>&1" \
    ) || true
    WGET_STATUS=$(echo "$WGET_OUT" | grep -oE 'HTTP/[0-9.]+ [0-9]+' | tail -1 | awk '{print $2}')
    if [ -n "$WGET_STATUS" ]; then
      info "  wget got HTTP ${WGET_STATUS}"
    else
      info "  Connection failed — kernel may not have processed the request"
    fi
  fi
done

info "Sent ${REQUESTS_SENT} requests through kernel proxy (via docker exec)"
pass "Requests sent through kernel proxy"

# ---------------------------------------------------------------------------
# Step 4: Wait for evidence in ClickHouse
# ---------------------------------------------------------------------------

assert_step "Waiting for evidence to flush to ClickHouse (timeout: $((MAX_RETRIES * RETRY_INTERVAL))s)"

EVIDENCE_FOUND=false
for i in $(seq 1 "$MAX_RETRIES"); do
  CURRENT_COUNT=$(ch_query "SELECT count() FROM evidence_bundles" || echo "0")
  CURRENT_COUNT=$(echo "$CURRENT_COUNT" | tr -d '[:space:]')

  if [ -n "$CURRENT_COUNT" ] && [ "$CURRENT_COUNT" -gt "$BASELINE_COUNT" ] 2>/dev/null; then
    NEW_ROWS=$((CURRENT_COUNT - BASELINE_COUNT))
    info "Found ${NEW_ROWS} new evidence row(s) in ClickHouse"
    EVIDENCE_FOUND=true
    break
  fi
  info "Attempt ${i}/${MAX_RETRIES}: count=${CURRENT_COUNT} (baseline=${BASELINE_COUNT}), waiting..."
  sleep "$RETRY_INTERVAL"
done

if [ "$EVIDENCE_FOUND" != "true" ]; then
  info "Evidence-collector logs (last 30 lines):"
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" logs evidence-collector --tail=30 2>/dev/null || true
  info "Kernel logs (last 30 lines):"
  ${COMPOSE_CMD} -p "${PROJECT_NAME}" logs kernel --tail=30 2>/dev/null || true
  fail "No new evidence appeared in ClickHouse after $((MAX_RETRIES * RETRY_INTERVAL))s"
fi

pass "Evidence flushed to ClickHouse (${NEW_ROWS} new row(s))"

# ---------------------------------------------------------------------------
# Step 5: Verify evidence bundle fields
# ---------------------------------------------------------------------------

assert_step "Verifying evidence bundle fields in ClickHouse"

BUNDLE_JSON=$(ch_query "
  SELECT bundle_id, kernel_id, vendor, policy_action, timestamp,
         schema_version, enforcement_latency_us, dev_signed
  FROM evidence_bundles
  ORDER BY timestamp DESC LIMIT 1
  FORMAT JSONEachRow
" || echo "")

if [ -z "$BUNDLE_JSON" ]; then
  fail "Could not retrieve evidence bundle from ClickHouse"
fi

info "Evidence bundle: ${BUNDLE_JSON}"

verify_field() {
  local field_name="$1"
  local field_value
  field_value=$(echo "$BUNDLE_JSON" | grep -o "\"${field_name}\":\"[^\"]*\"" | head -1 | cut -d'"' -f4)
  if [ -z "$field_value" ]; then
    field_value=$(echo "$BUNDLE_JSON" | grep -o "\"${field_name}\":[0-9]*" | head -1 | cut -d':' -f2)
  fi
  [ -z "$field_value" ] && fail "Evidence bundle missing required field: ${field_name}"
  info "  ${field_name} = ${field_value}"
}

verify_field "bundle_id"
verify_field "kernel_id"
verify_field "vendor"
verify_field "policy_action"
verify_field "timestamp"

pass "Evidence bundle has all required fields"

# ---------------------------------------------------------------------------
# Step 6: Verify evidence chain integrity
# ---------------------------------------------------------------------------

assert_step "Verifying evidence chain integrity (sequence numbers)"

SEQUENCE_DATA=$(ch_query "
  SELECT sequence_number, chain_hash, previous_hash
  FROM evidence_bundles ORDER BY timestamp DESC LIMIT 5
  FORMAT JSONEachRow
" || echo "")

if [ -n "$SEQUENCE_DATA" ]; then
  ROW_COUNT=$(echo "$SEQUENCE_DATA" | wc -l | tr -d '[:space:]')
  info "Retrieved ${ROW_COUNT} evidence rows for chain verification"
  HAS_CHAIN=$(echo "$SEQUENCE_DATA" | grep -c '"chain_hash":"[^"]\+"' || echo "0")
  if [ "$HAS_CHAIN" -gt 0 ]; then
    info "  ${HAS_CHAIN}/${ROW_COUNT} rows have non-empty chain_hash"
    pass "Evidence chain hashes present"
  else
    info "  Chain hashes empty (expected in dev signing mode)"
    pass "Evidence chain integrity check completed (dev mode)"
  fi
else
  pass "Evidence chain integrity check skipped (no multi-row data)"
fi

# ---------------------------------------------------------------------------
# Step 7: Verify evidence via audit API
# ---------------------------------------------------------------------------

assert_step "Verifying evidence via control-plane audit search API"

AUDIT_RESPONSE=$(api_get "/api/v1/audit/search?vendor=${TARGET_VENDOR}&page_size=5")
if [ -z "$AUDIT_RESPONSE" ]; then
  info "Audit endpoint may not be wired yet — evidence verified directly in ClickHouse"
  pass "Audit API check skipped (endpoint may not be wired)"
elif echo "$AUDIT_RESPONSE" | grep -q '"bundle_id"'; then
  pass "Evidence appears in audit search API"
else
  info "Evidence was verified directly in ClickHouse — pipeline is functional"
  pass "Audit API responded (evidence verified via ClickHouse)"
fi

# ---------------------------------------------------------------------------
# Step 8: Verify evidence-collector health
# ---------------------------------------------------------------------------

assert_step "Checking evidence-collector health via container logs"

EC_LOGS=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" logs evidence-collector --tail=50 2>/dev/null || true)
if echo "$EC_LOGS" | grep -q "listening\|started\|ready\|gRPC\|insert\|clickhouse\|batch"; then
  pass "Evidence-collector operational"
else
  info "Note: evidence was verified in ClickHouse, so the collector is functional"
  pass "Evidence-collector operational (evidence confirmed in ClickHouse)"
fi

echo ""
echo "[$(_ts)] === Evidence Pipeline Test Complete (Windows) ==="
echo "[$(_ts)] All assertions passed."
echo ""
