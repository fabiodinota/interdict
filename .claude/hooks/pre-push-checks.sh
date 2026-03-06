#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

echo "[pre-push] running full workspace checks"

# Rust: format + clippy + tests
if [ -f "Cargo.toml" ]; then
  echo "[pre-push] rust fmt check"
  cargo fmt --all -- --check

  echo "[pre-push] rust clippy"
  cargo clippy --workspace --all-targets -- -D warnings

  echo "[pre-push] rust tests"
  cargo test --workspace --all-targets

  echo "[pre-push] kernel content inspection tests"
  cargo test -p kernel --test content_inspection_test 2>/dev/null || true

  if command -v cargo-audit &>/dev/null; then
    echo "[pre-push] cargo audit"
    cargo audit
  fi
fi

# Control plane
if [ -f "control-plane/package.json" ]; then
  echo "[pre-push] control-plane typecheck"
  (cd control-plane && bun run typecheck)

  echo "[pre-push] control-plane tests"
  (cd control-plane && bun test)
fi

# Dashboard
if [ -f "dashboard/package.json" ]; then
  echo "[pre-push] dashboard typecheck"
  (cd dashboard && bun run typecheck)

  echo "[pre-push] dashboard build"
  (cd dashboard && bun run build)
fi

echo "[pre-push] checks completed"
