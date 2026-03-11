#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

echo "Running Husky-aligned pre-commit helper"

npx lint-staged
npm run lint:infra:staged

echo "Pre-commit helper checks passed"
