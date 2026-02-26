#!/bin/bash
set -e

echo "📜 Policy updated — recompiling and validating..."

# Recompile Rego → Wasm
cargo run -p policy-compiler --quiet

# Validate against all regulatory packs
echo "→ Validating EU AI Act, GDPR, NIST mappings..."
cargo test --test regulatory --quiet

echo "→ Pushing new policies (dry-run)"
echo "✅ Policy update complete"