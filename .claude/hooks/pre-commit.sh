#!/bin/bash
set -e
echo "🔧 pre-commit"
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cd packages/api && bun run lint && cd ../..
cd packages/dashboard && bun run lint && cd ../..
cargo test --quiet
cd packages/api && bun test && cd ../..
echo "✅ pre-commit OK"
