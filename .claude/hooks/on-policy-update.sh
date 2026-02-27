#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

echo "Policy update hook triggered"

# Current repository baseline: validate policy-sensitive tests and linting.
cargo clippy -p kernel --all-targets -- -D warnings
cargo test -p kernel --test content_inspection_test --quiet

echo "Policy update validation complete"
