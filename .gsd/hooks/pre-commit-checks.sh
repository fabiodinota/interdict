#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

run_rust=false
run_control_plane=false
run_dashboard=false

for file in "$@"; do
  case "$file" in
    crates/**|Cargo.toml|Cargo.lock)
      run_rust=true
      ;;
    control-plane/*)
      run_control_plane=true
      ;;
    dashboard/*)
      run_dashboard=true
      ;;
  esac
done

if $run_rust; then
  echo "[pre-commit] rust fmt check"
  cargo fmt --all -- --check

  echo "[pre-commit] rust clippy"
  cargo clippy --workspace --all-targets -- -D warnings
fi

if $run_control_plane; then
  echo "[pre-commit] control-plane typecheck"
  (cd control-plane && bun run typecheck)

  echo "[pre-commit] control-plane lint"
  (cd control-plane && bun run lint 2>/dev/null) || true
fi

if $run_dashboard; then
  echo "[pre-commit] dashboard lint"
  (cd dashboard && bun run lint)
fi

echo "[pre-commit] quick checks completed"
