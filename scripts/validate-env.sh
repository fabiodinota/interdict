#!/usr/bin/env bash
# scripts/validate-env.sh — Pre-flight environment validation for Interdict.
#
# Validates that all required environment variables are set, contain real
# credentials (not CHANGE_ME placeholders), and that URL-typed vars have
# valid schemes. Designed to run before `docker compose up` to catch
# misconfiguration early.
#
# Usage:
#   bash scripts/validate-env.sh                     # reads .env in repo root
#   bash scripts/validate-env.sh --env-file path     # reads alternate env file
#
# Exit code: number of validation failures (0 = all pass).
#
# Expected output with env.example (all CHANGE_ME placeholders):
#   FAIL  DATABASE_URL contains placeholder value (CHANGE_ME)
#   FAIL  POSTGRES_PASSWORD contains placeholder value (CHANGE_ME)
#   FAIL  CLICKHOUSE_PASSWORD contains placeholder value (CHANGE_ME)
#   FAIL  MINIO_ROOT_PASSWORD contains placeholder value (CHANGE_ME)
#   FAIL  AWS_SECRET_ACCESS_KEY contains placeholder value (CHANGE_ME)
#   ...
#   ❌ 5 validation failure(s). Fix the issues above before running docker compose up.
#
# Expected output with no .env file:
#   WARN  Env file not found: .env (checking environment variables only)
#   FAIL  DATABASE_URL is not set or empty
#   ...
#
# Security: This script NEVER prints credential values — only variable names
# and pass/fail status.

set -euo pipefail

# ---------------------------------------------------------------------------
# Color helpers (disabled when stdout is not a terminal)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

FAILURES=0
WARNINGS=0

pass() { printf '%sPASS%s  %s\n' "$GREEN" "$NC" "$1"; }
fail() { printf '%sFAIL%s  %s\n' "$RED" "$NC" "$1"; FAILURES=$((FAILURES + 1)); }
warn() { printf '%sWARN%s  %s\n' "$YELLOW" "$NC" "$1"; WARNINGS=$((WARNINGS + 1)); }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $(basename "$0") [--env-file PATH]"
      echo "  Validates required environment variables for Interdict deployment."
      echo "  Reads .env from the repo root by default."
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Load env file
# ---------------------------------------------------------------------------
echo "==> Interdict environment validation"
echo ""

if [ -f "$ENV_FILE" ]; then
  echo "Loading: ${ENV_FILE}"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
else
  warn "Env file not found: ${ENV_FILE} (checking environment variables only)"
fi

echo ""

# ---------------------------------------------------------------------------
# 1. Required variables — must be set and non-empty
# ---------------------------------------------------------------------------
REQUIRED_VARS=(
  DATABASE_URL
  POSTGRES_PASSWORD
  CLICKHOUSE_PASSWORD
  MINIO_ROOT_PASSWORD
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
)

echo "--- Required variables ---"
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    fail "${var} is not set or empty"
  else
    pass "${var} is set"
  fi
done
echo ""

# ---------------------------------------------------------------------------
# 2. Placeholder detection — credential vars must not contain CHANGE_ME
# ---------------------------------------------------------------------------
CREDENTIAL_VARS=(
  DATABASE_URL
  POSTGRES_PASSWORD
  CLICKHOUSE_PASSWORD
  MINIO_ROOT_PASSWORD
  AWS_SECRET_ACCESS_KEY
)

echo "--- Placeholder detection ---"
for var in "${CREDENTIAL_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    # Already reported as missing above; skip duplicate noise
    continue
  fi
  # Case-insensitive check for CHANGE_ME anywhere in the value
  if echo "$val" | grep -qi 'CHANGE_ME'; then
    fail "${var} contains placeholder value (CHANGE_ME)"
  else
    pass "${var} has no placeholder"
  fi
done
echo ""

# ---------------------------------------------------------------------------
# 3. URL format validation
# ---------------------------------------------------------------------------
echo "--- URL format validation ---"

validate_url() {
  local var_name="$1"
  shift
  local val="${!var_name:-}"

  if [ -z "$val" ]; then
    # Already reported as missing; skip
    return
  fi

  local valid=false
  for scheme in "$@"; do
    if [[ "$val" == "${scheme}"* ]]; then
      valid=true
      break
    fi
  done

  if $valid; then
    pass "${var_name} has valid URL scheme"
  else
    fail "${var_name} must start with one of: $*"
  fi
}

validate_url DATABASE_URL "postgres://" "postgresql://"
validate_url CLICKHOUSE_URL "http://" "https://"
validate_url AWS_ENDPOINT_URL "http://" "https://"

echo ""

# ---------------------------------------------------------------------------
# 4. Consistency checks (warnings, not failures)
# ---------------------------------------------------------------------------
echo "--- Consistency checks ---"

check_consistency() {
  local var_a="$1"
  local var_b="$2"
  local val_a="${!var_a:-}"
  local val_b="${!var_b:-}"

  if [ -z "$val_a" ] || [ -z "$val_b" ]; then
    # Can't compare if either is missing
    return
  fi

  if [ "$val_a" = "$val_b" ]; then
    pass "${var_a} matches ${var_b}"
  else
    warn "${var_a} does not match ${var_b} — these should be identical"
  fi
}

check_consistency AWS_ACCESS_KEY_ID MINIO_ROOT_USER
check_consistency AWS_SECRET_ACCESS_KEY MINIO_ROOT_PASSWORD

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "==========================================="
if [ "$FAILURES" -gt 0 ]; then
  printf '%s❌ %d validation failure(s).%s Fix the issues above before running docker compose up.\n' "$RED" "$FAILURES" "$NC"
  if [ "$WARNINGS" -gt 0 ]; then
    printf '%s⚠  %d warning(s).%s\n' "$YELLOW" "$WARNINGS" "$NC"
  fi
  echo ""
  echo "Quick fix: copy env.example, generate real passwords, then re-run:"
  echo "  cp env.example .env"
  echo "  sed -i \"s|CHANGE_ME_POSTGRES_PASSWORD|\$(openssl rand -base64 32)|\" .env"
  echo "  sed -i \"s|CHANGE_ME_CLICKHOUSE_PASSWORD|\$(openssl rand -base64 32)|\" .env"
  echo "  sed -i \"s|CHANGE_ME_MINIO_PASSWORD|\$(openssl rand -base64 32)|\" .env"
  echo "  bash scripts/validate-env.sh"
else
  printf '%s✅ All checks passed.%s\n' "$GREEN" "$NC"
  if [ "$WARNINGS" -gt 0 ]; then
    printf '%s⚠  %d warning(s) — review above.%s\n' "$YELLOW" "$WARNINGS" "$NC"
  fi
fi
echo "==========================================="

exit "$FAILURES"
