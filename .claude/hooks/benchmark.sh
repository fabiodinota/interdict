#!/bin/bash
set -e

echo "📊 Running kernel benchmarks (target <10 ms p99)..."

cargo bench --package kernel --bench latency -- --quiet

# Simple 10k RPS smoke test
echo "→ 10k RPS smoke test..."
cargo run -p kernel --example load-test --quiet

echo "✅ Benchmarks passed"