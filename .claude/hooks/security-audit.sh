#!/bin/bash
set -e

echo "🔐 Running security audit..."

cargo audit
cargo deny check

echo "→ Checking for plaintext keys or env vars..."
grep -r "env::var" crates/ --include="*.rs" || echo "No env vars found"

echo "✅ Security audit passed"