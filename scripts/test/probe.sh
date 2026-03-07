#!/usr/bin/env bash
# Probe Interdict with a single chat completion request.
# Usage: bash scripts/test/probe.sh [message]
#
# Reads credentials from scripts/test/.env.test — never pass keys on the CLI.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.test"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "       cp $SCRIPT_DIR/.env.test.example $ENV_FILE  then fill in your keys."
  exit 1
fi

# Load env file — export all vars, skip comments and blank lines
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${OPENAI_API_KEY:?OPENAI_API_KEY must be set in .env.test}"
: "${INTERDICT_PROXY:?INTERDICT_PROXY must be set in .env.test}"
: "${INTERDICT_CA_CERT:?INTERDICT_CA_CERT must be set in .env.test}"
: "${TEST_VENDOR_URL:?TEST_VENDOR_URL must be set in .env.test}"
: "${TEST_MODEL:?TEST_MODEL must be set in .env.test}"

MESSAGE="${1:-Hello from Interdict probe}"

echo "Proxy : $INTERDICT_PROXY"
echo "Vendor: $TEST_VENDOR_URL"
echo "Model : $TEST_MODEL"
echo "---"

# Resolve CA cert: prefer explicit path, fall back to repo root ca.crt
CA_CERT="${INTERDICT_CA_CERT:-}"
if [[ "$CA_CERT" == "./"* || "$CA_CERT" == "ca.crt" ]]; then
  CA_CERT="$REPO_ROOT/ca.crt"
fi

if [[ ! -f "$CA_CERT" ]]; then
  echo "ERROR: CA cert not found at $CA_CERT"
  echo "       Run: docker compose cp kernel:/data/certs/ca.crt ./ca.crt"
  exit 1
fi

BODY="{\"model\":\"$TEST_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"$MESSAGE\"}]}"

# Windows schannel curl ignores --cacert; use -k for local dev.
# In production, import ca.crt into the Windows cert store instead.
curl --silent --show-error \
  --proxy "$INTERDICT_PROXY" \
  --cacert "$CA_CERT" \
  --ssl-no-revoke \
  -k \
  -X POST "$TEST_VENDOR_URL" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY"
