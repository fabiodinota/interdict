#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT_DIR}"

echo "Running Husky-aligned pre-push helper"

npm run lint:infra
npm run verify:rust:wsl

echo "Pre-push helper checks passed"
