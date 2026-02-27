#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

echo "Running kernel benchmark checks"

# Fast default check for pre-push, full benches optional.
cargo test -p kernel --test content_inspection_test --quiet

if [ "${RUN_FULL_BENCH:-0}" = "1" ]; then
  cargo bench -p kernel --bench pattern_matching
  cargo bench -p kernel --bench proxy_latency
fi

echo "Benchmark checks passed"
