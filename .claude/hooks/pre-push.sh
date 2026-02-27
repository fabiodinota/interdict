#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT_DIR}"

echo "Running pre-push checks"

CHANGED_FILES="$(git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only)"
if printf '%s\n' "${CHANGED_FILES}" | grep -q '^crates/kernel/'; then
  echo "Kernel changes detected, running benchmark checks"
  "${SCRIPT_DIR}/benchmark.sh"
fi

"${SCRIPT_DIR}/security-audit.sh"

echo "Pre-push checks passed"
