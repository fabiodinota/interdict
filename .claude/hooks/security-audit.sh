#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

echo "Running security audit checks"

if cargo audit --version >/dev/null 2>&1; then
  cargo audit
else
  echo "Skipping cargo audit (not installed)"
fi

if cargo deny --version >/dev/null 2>&1; then
  cargo deny check
else
  echo "Skipping cargo deny (not installed)"
fi

if command -v rg >/dev/null 2>&1; then
  echo "Scanning for direct env::var hot-path usage"
  rg --line-number --glob '*.rs' 'env::var' crates/ || true
fi

echo "Security audit checks completed"
