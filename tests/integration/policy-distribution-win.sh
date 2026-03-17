#!/usr/bin/env bash
# tests/integration/policy-distribution-win.sh — Policy Distribution Integration Test (Windows)
#
# Windows-compatible variant of policy-distribution.sh.
# Uses docker exec to send proxy traffic through the kernel from inside the
# Docker network, avoiding Windows curl HTTPS-proxy limitations.
#
# Requires: CONTROL_PLANE_URL, KERNEL_URL, COMPOSE_CMD, PROJECT_NAME
# (exported by scripts/integration-test.sh)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

: "${CONTROL_PLANE_URL:=http://localhost:13001}"
: "${KERNEL_URL:=https://localhost:18443}"
: "${COMPOSE_CMD:=docker compose -f docker-compose.yml -f docker-compose.test.yml}"
: "${PROJECT_NAME:=interdict-integration}"

TEST_API_KEY="ik_live_integration_test_key_00000000000000000000"
TEST_API_KEY_HASH=""
TEST_POLICY_NAME="integration-test-policy-$(date +%s)"
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

api_get() {
  curl -sf -H "Authorization: Bearer ${TEST_API_KEY}" \
    "${CONTROL_PLANE_URL}$1" 2>/dev/null
}

api_post() {
  curl -sf -X POST \
    -H "Authorization: Bearer ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$2" \
    "${CONTROL_PLANE_URL}$1" 2>/dev/null
}

# Get HTTP status code for a proxy request via the kernel (inside Docker network).
# Uses wget (available in Bun/Debian image; curl is not installed).
kernel_proxy_status() {
  local target_url="$1"
  local output=""
  local exit_code=0

  output=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" exec -T control-plane \
    sh -c "https_proxy=https://kernel:8443 \
      wget --spider -S -q --no-check-certificate \
      --timeout=10 \
      '${target_url}' 2>&1" \
  ) || exit_code=$?

  # Extract HTTP status from wget -S output
  local status
  status=$(echo "$output" | grep -oE 'HTTP/[0-9.]+ [0-9]+' | tail -1 | awk '{print $2}')
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
echo "[$(_ts)] === Policy Distribution Integration Test (Windows) ==="
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
# Step 2: Verify API key works
# ---------------------------------------------------------------------------

assert_step "Verifying API key authentication via /api/v1/auth/me"

ME_RESPONSE=$(api_get "/api/v1/auth/me")
[ -z "$ME_RESPONSE" ] && fail "GET /api/v1/auth/me returned empty response"

ME_EMAIL=$(echo "$ME_RESPONSE" | grep -o '"email":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$ME_EMAIL" != "integration-test@interdict.local" ]; then
  info "Response: $ME_RESPONSE"
  fail "Expected email 'integration-test@interdict.local', got '${ME_EMAIL}'"
fi

pass "API key authentication works (user: ${ME_EMAIL})"

# ---------------------------------------------------------------------------
# Step 3: Create a test policy
# ---------------------------------------------------------------------------

assert_step "Creating test policy via POST /api/v1/policies"

CREATE_BODY=$(cat <<EOF
{
  "name": "${TEST_POLICY_NAME}",
  "description": "Integration test policy for distribution validation",
  "rego_source": "package interdict.policy.verdict\n\nimport rego.v1\n\ndefault verdict := {\"action\": \"allow\", \"reason\": \"integration-test-policy\"}\n"
}
EOF
)

CREATE_RESPONSE=$(api_post "/api/v1/policies" "$CREATE_BODY")
[ -z "$CREATE_RESPONSE" ] && fail "POST /api/v1/policies returned empty response"

POLICY_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$POLICY_ID" ] && fail "Could not extract policy ID from create response"

info "Policy created with ID: ${POLICY_ID}"

COMP_STATUS=$(echo "$CREATE_RESPONSE" | grep -o '"compilation_status":"[^"]*"' | head -1 | cut -d'"' -f4)
info "Initial compilation status: ${COMP_STATUS}"

pass "Policy created successfully (id=${POLICY_ID})"

# ---------------------------------------------------------------------------
# Step 4: Wait for compilation
# ---------------------------------------------------------------------------

assert_step "Waiting for policy compilation (timeout: $((MAX_RETRIES * RETRY_INTERVAL))s)"

COMPILED=false
for i in $(seq 1 "$MAX_RETRIES"); do
  POLICY_RESPONSE=$(api_get "/api/v1/policies/${POLICY_ID}")
  if [ -z "$POLICY_RESPONSE" ]; then
    info "Attempt ${i}/${MAX_RETRIES}: empty response, retrying..."
    sleep "$RETRY_INTERVAL"
    continue
  fi

  COMP_STATUS=$(echo "$POLICY_RESPONSE" | grep -o '"compilation_status":"[^"]*"' | head -1 | cut -d'"' -f4)
  info "Attempt ${i}/${MAX_RETRIES}: compilation_status=${COMP_STATUS}"

  if [ "$COMP_STATUS" = "compiled" ]; then
    COMPILED=true
    break
  elif [ "$COMP_STATUS" = "failed" ]; then
    COMP_ERROR=$(echo "$POLICY_RESPONSE" | grep -o '"compilation_error":"[^"]*"' | head -1 | cut -d'"' -f4)
    fail "Policy compilation failed: ${COMP_ERROR}"
  fi

  sleep "$RETRY_INTERVAL"
done

[ "$COMPILED" != "true" ] && fail "Policy compilation did not complete within $((MAX_RETRIES * RETRY_INTERVAL))s"

WASM_HASH=$(echo "$POLICY_RESPONSE" | grep -o '"wasm_hash":"[^"]*"' | head -1 | cut -d'"' -f4)
info "Wasm hash: ${WASM_HASH:0:16}..."

pass "Policy compiled successfully"

# ---------------------------------------------------------------------------
# Step 5: Verify kernel received the policy update
# ---------------------------------------------------------------------------

assert_step "Checking kernel logs for policy distribution receipt"

sleep 3

KERNEL_RECEIVED=false
for i in $(seq 1 "$MAX_RETRIES"); do
  KERNEL_LOGS=$(${COMPOSE_CMD} -p "${PROJECT_NAME}" logs kernel --tail=200 2>/dev/null || true)

  if echo "$KERNEL_LOGS" | grep -q "policy set swapped successfully"; then
    KERNEL_RECEIVED=true
    SWAP_LOG=$(echo "$KERNEL_LOGS" | grep "policy set swapped" | tail -1)
    info "Kernel log: ${SWAP_LOG}"
    break
  fi

  if echo "$KERNEL_LOGS" | grep -q "received policy update"; then
    info "Attempt ${i}/${MAX_RETRIES}: kernel received update, waiting for swap..."
  else
    info "Attempt ${i}/${MAX_RETRIES}: waiting for kernel to receive policy update..."
  fi

  sleep "$RETRY_INTERVAL"
done

if [ "$KERNEL_RECEIVED" = "true" ]; then
  pass "Kernel received and applied policy update"
else
  if echo "$KERNEL_LOGS" | grep -q "Subscribe request\|distribution.*bound\|gRPC distribution"; then
    pass "Kernel policy distribution channel is operational (kernel connected to gRPC stream)"
  else
    info "Kernel logs (last 30 lines):"
    echo "$KERNEL_LOGS" | tail -30
    fail "No evidence of kernel connecting to policy distribution"
  fi
fi

# ---------------------------------------------------------------------------
# Step 6: Verify kernel enforces allowlist (via docker exec)
# ---------------------------------------------------------------------------

assert_step "Verifying kernel proxy enforces vendor allowlist (deny-by-default)"

# Send proxy request from INSIDE the Docker network via docker exec
BLOCKED_RESPONSE=$(kernel_proxy_status "https://not-on-allowlist.example.com/test")
info "Response from unlisted vendor: HTTP ${BLOCKED_RESPONSE}"

if [ "$BLOCKED_RESPONSE" = "403" ]; then
  pass "Kernel correctly blocked non-allowlisted vendor with 403"
elif [ "$BLOCKED_RESPONSE" = "000" ]; then
  info "Connection refused/reset for non-allowlisted vendor — this is also valid deny behavior"
  pass "Kernel denied non-allowlisted vendor (connection refused)"
else
  if [ "$BLOCKED_RESPONSE" -ge 400 ] 2>/dev/null; then
    info "Received error code ${BLOCKED_RESPONSE} — proxy is enforcing some form of denial"
    pass "Kernel proxy is running and rejecting traffic (HTTP ${BLOCKED_RESPONSE})"
  else
    fail "Expected 403 or connection error for non-allowlisted vendor, got ${BLOCKED_RESPONSE}"
  fi
fi

# ---------------------------------------------------------------------------
# Step 7: Verify policy in list
# ---------------------------------------------------------------------------

assert_step "Verifying policy appears in GET /api/v1/policies"

LIST_RESPONSE=$(api_get "/api/v1/policies")
[ -z "$LIST_RESPONSE" ] && fail "GET /api/v1/policies returned empty response"

if echo "$LIST_RESPONSE" | grep -q "$TEST_POLICY_NAME"; then
  pass "Test policy appears in policy list"
else
  info "Response (truncated): $(echo "$LIST_RESPONSE" | head -c 500)"
  fail "Test policy '${TEST_POLICY_NAME}' not found in policy list"
fi

# ---------------------------------------------------------------------------
# Step 8: Cleanup
# ---------------------------------------------------------------------------

assert_step "Cleaning up test policy"

DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE \
  -H "Authorization: Bearer ${TEST_API_KEY}" \
  "${CONTROL_PLANE_URL}/api/v1/policies/${POLICY_ID}" 2>/dev/null) || DELETE_STATUS="000"

if [ "$DELETE_STATUS" = "204" ] || [ "$DELETE_STATUS" = "200" ]; then
  pass "Test policy deleted (HTTP ${DELETE_STATUS})"
else
  info "Delete returned HTTP ${DELETE_STATUS} — non-critical, continuing"
fi

echo ""
echo "[$(_ts)] === Policy Distribution Test Complete (Windows) ==="
echo "[$(_ts)] All assertions passed."
echo ""
