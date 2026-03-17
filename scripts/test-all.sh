#!/usr/bin/env bash
# scripts/test-all.sh — Run every test, lint, and check in the Interdict project
#
# Usage:
#   bash scripts/test-all.sh              # run everything available
#   bash scripts/test-all.sh --no-rust    # skip Rust tests (no cargo/WSL)
#   bash scripts/test-all.sh --no-docker  # skip Docker integration tests
#   bash scripts/test-all.sh --quick      # skip slow tests (stress, proptest, integration, build)
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed (summary at the end)

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
SKIP_RUST=false
SKIP_DOCKER=false
QUICK=false

for arg in "$@"; do
  case "$arg" in
    --no-rust)   SKIP_RUST=true ;;
    --no-docker) SKIP_DOCKER=true ;;
    --quick)     QUICK=true ;;
    --help|-h)
      echo "Usage: $0 [--no-rust] [--no-docker] [--quick]"
      echo "  --no-rust    Skip Rust checks (cargo fmt/clippy/test)"
      echo "  --no-docker  Skip Docker integration tests"
      echo "  --quick      Skip slow tests (stress, proptest, integration, next build)"
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Tracking
# ---------------------------------------------------------------------------
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
FAILED_NAMES=""
START_TIME=$(date +%s)

_ts() { date '+%H:%M:%S'; }

run_check() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "[$(_ts)] ━━━ ${name} ━━━"
  if "$@"; then
    echo "[$(_ts)] ✅ PASS: ${name}"
    PASSED=$((PASSED + 1))
  else
    echo "[$(_ts)] ❌ FAIL: ${name}"
    FAILED=$((FAILED + 1))
    FAILED_NAMES="${FAILED_NAMES}  - ${name}\n"
  fi
}

skip_check() {
  local name="$1"
  local reason="$2"
  TOTAL=$((TOTAL + 1))
  SKIPPED=$((SKIPPED + 1))
  echo ""
  echo "[$(_ts)] ⏭️  SKIP: ${name} (${reason})"
}

# ---------------------------------------------------------------------------
# Tool detection
# ---------------------------------------------------------------------------
HAS_CARGO=false; command -v cargo &>/dev/null && HAS_CARGO=true
HAS_BUN=false;   command -v bun &>/dev/null && HAS_BUN=true
HAS_NPM=false;    command -v npm &>/dev/null && HAS_NPM=true
HAS_BUF=false;    command -v buf &>/dev/null && HAS_BUF=true
HAS_DOCKER=false;  command -v docker &>/dev/null && docker info &>/dev/null 2>&1 && HAS_DOCKER=true

echo "[$(_ts)] ══════════════════════════════════════════════════"
echo "[$(_ts)]  Interdict — Full Test Suite"
echo "[$(_ts)] ══════════════════════════════════════════════════"
echo "[$(_ts)]  cargo: $([ "$HAS_CARGO" = true ] && echo "✓" || echo "✗")  bun: $([ "$HAS_BUN" = true ] && echo "✓" || echo "✗")  node/npm: $([ "$HAS_NPM" = true ] && echo "✓" || echo "✗")  buf: $([ "$HAS_BUF" = true ] && echo "✓" || echo "✗")  docker: $([ "$HAS_DOCKER" = true ] && echo "✓" || echo "✗")"
echo "[$(_ts)]  flags: $([ "$SKIP_RUST" = true ] && echo "--no-rust ")$([ "$SKIP_DOCKER" = true ] && echo "--no-docker ")$([ "$QUICK" = true ] && echo "--quick ")$([ "$SKIP_RUST$SKIP_DOCKER$QUICK" = "falsefalsefalse" ] && echo "(none)")"
echo "[$(_ts)] ══════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════
# 1. RUST — Format, Lint, Unit/Integration Tests
# ═══════════════════════════════════════════════════════════════════════════

if [ "$SKIP_RUST" = true ] || [ "$HAS_CARGO" = false ]; then
  skip_check "Rust: cargo fmt" "$([ "$SKIP_RUST" = true ] && echo "--no-rust" || echo "cargo not found")"
  skip_check "Rust: cargo clippy" "$([ "$SKIP_RUST" = true ] && echo "--no-rust" || echo "cargo not found")"
  skip_check "Rust: cargo test" "$([ "$SKIP_RUST" = true ] && echo "--no-rust" || echo "cargo not found")"
  skip_check "Rust: content inspection tests" "$([ "$SKIP_RUST" = true ] && echo "--no-rust" || echo "cargo not found")"
else
  run_check "Rust: cargo fmt" \
    cargo fmt --all -- --check

  run_check "Rust: cargo clippy" \
    cargo clippy --workspace --all-targets -- -D warnings

  run_check "Rust: cargo test (unit + integration)" \
    cargo test --workspace --all-targets

  run_check "Rust: content inspection tests" \
    cargo test -p kernel --test content_inspection_test

  if [ "$QUICK" = false ]; then
    run_check "Rust: cargo deny (license + advisory)" \
      cargo deny check 2>/dev/null || skip_check "Rust: cargo deny" "cargo-deny not installed"
  else
    skip_check "Rust: cargo deny" "--quick"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# 2. CONTROL PLANE — TypeScript (Bun)
# ═══════════════════════════════════════════════════════════════════════════

if [ "$HAS_BUN" = true ]; then
  run_check "Control-plane: biome check" \
    bash -c "cd control-plane && npx @biomejs/biome check ./src"

  run_check "Control-plane: tsc --noEmit" \
    bash -c "cd control-plane && bunx tsc --noEmit"

  run_check "Control-plane: bun test" \
    bash -c "cd control-plane && bun test"
else
  skip_check "Control-plane: biome check" "bun not found"
  skip_check "Control-plane: tsc --noEmit" "bun not found"
  skip_check "Control-plane: bun test" "bun not found"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. DASHBOARD — React/Next.js
# ═══════════════════════════════════════════════════════════════════════════

if [ "$HAS_NPM" = true ]; then
  run_check "Dashboard: prettier --check" \
    bash -c "cd dashboard && npx prettier --check 'src/**/*.{ts,tsx,js,jsx,json,css}'"

  run_check "Dashboard: eslint" \
    bash -c "cd dashboard && npx eslint"

  run_check "Dashboard: vitest" \
    bash -c "cd dashboard && npm test"

  if [ "$QUICK" = false ]; then
    run_check "Dashboard: next build" \
      bash -c "cd dashboard && npm run build"
  else
    skip_check "Dashboard: next build" "--quick"
  fi
else
  skip_check "Dashboard: prettier" "npm not found"
  skip_check "Dashboard: eslint" "npm not found"
  skip_check "Dashboard: vitest" "npm not found"
  skip_check "Dashboard: next build" "npm not found"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 4. PROTO — buf lint
# ═══════════════════════════════════════════════════════════════════════════

if [ "$HAS_BUF" = true ]; then
  run_check "Proto: buf lint" \
    buf lint
else
  skip_check "Proto: buf lint" "buf not found"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 5. INFRASTRUCTURE — hadolint, shellcheck, helm lint
# ═══════════════════════════════════════════════════════════════════════════

run_check "Infra: quality gate (hadolint, shellcheck, helm, buf)" \
  npm run lint:infra

# ═══════════════════════════════════════════════════════════════════════════
# 6. DOCKER COMPOSE — config validation
# ═══════════════════════════════════════════════════════════════════════════

if [ "$HAS_DOCKER" = true ]; then
  run_check "Docker: compose config validation" \
    docker compose config --quiet

  run_check "Docker: test profile config validation" \
    docker compose -f docker-compose.yml -f docker-compose.test.yml config --quiet
else
  skip_check "Docker: compose config" "docker not available"
  skip_check "Docker: test profile config" "docker not available"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 7. INTEGRATION TESTS — Full Docker stack (optional)
# ═══════════════════════════════════════════════════════════════════════════

if [ "$SKIP_DOCKER" = true ] || [ "$QUICK" = true ]; then
  skip_check "Integration: full stack tests" "$([ "$SKIP_DOCKER" = true ] && echo "--no-docker" || echo "--quick")"
elif [ "$HAS_DOCKER" = false ]; then
  skip_check "Integration: full stack tests" "docker not available"
else
  run_check "Integration: full stack tests (evidence-pipeline + policy-distribution)" \
    bash scripts/integration-test.sh --skip-build
fi

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

echo ""
echo "[$(_ts)] ══════════════════════════════════════════════════"
echo "[$(_ts)]  Results"
echo "[$(_ts)] ══════════════════════════════════════════════════"
echo "[$(_ts)]  Total:   ${TOTAL}"
echo "[$(_ts)]  Passed:  ${PASSED}"
echo "[$(_ts)]  Failed:  ${FAILED}"
echo "[$(_ts)]  Skipped: ${SKIPPED}"
echo "[$(_ts)]  Time:    ${MINUTES}m ${SECONDS}s"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "[$(_ts)]  Failed checks:"
  echo -e "${FAILED_NAMES}"
  echo "[$(_ts)] ❌ SOME CHECKS FAILED"
  exit 1
fi

if [ "$PASSED" -eq 0 ]; then
  echo ""
  echo "[$(_ts)] ⚠️  No checks ran — verify tool availability"
  exit 0
fi

echo ""
echo "[$(_ts)] ✅ ALL CHECKS PASSED"
exit 0
