---
name: wasm-policy-compile
description: Compile and validate policy artifacts for deterministic kernel enforcement.
---

# /wasm-policy-compile

Compile policy logic to runtime-ready artifacts and validate compatibility.

## Inputs

- Policy source path(s)
- Target output directory
- Required policy metadata (id, version, checksum)

## Steps

1. Validate policy source parses cleanly.
2. Compile/build policy artifacts for kernel consumption.
3. Verify deterministic output (stable hash/checksum).
4. Run policy-focused tests that exercise block/redact/allow verdicts.

## Verification

- `cargo test -p kernel --test content_inspection_test`
- Any policy compiler command used by the current phase plan

## Output

- Compiled policy artifact paths
- Hash/checksum summary
- Any compatibility concerns with current kernel runtime
