#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

echo "Running pre-commit checks"

cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets --quiet

# Optional future control-plane checks (run only if service dirs exist).
if [ -d "control-plane" ] && command -v bun >/dev/null 2>&1; then
  (cd control-plane && bun run lint && bun test)
fi

echo "Pre-commit checks passed"
