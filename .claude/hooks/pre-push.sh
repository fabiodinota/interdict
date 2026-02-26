#!/bin/bash
set -e

echo "🚀 Running Interdict pre-push checks..."

# Full Rust tests + benches (only on kernel changes)
if git diff --name-only HEAD^ | grep -q "crates/kernel"; then
  echo "→ Kernel changed — running benchmarks"
  ./hooks/benchmark.sh
fi

# Security audit
./hooks/security-audit.sh

echo "✅ Pre-push passed — ready to push"