---
name: evidence-bundle-audit
description: Audit evidence payload integrity, hash chaining, and signature requirements.
---

# /evidence-bundle-audit

Use this skill when changing evidence schemas, collectors, or cryptographic logic.

## Checklist

1. Confirm pre-mutation hashing remains intact.
2. Verify chain linkage fields are preserved and correctly populated.
3. Ensure signature material is never logged or exposed in plaintext.
4. Confirm storage/anchoring semantics remain tamper-evident.

## Verification

- Targeted evidence integration tests for chain continuity.
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo audit` (if installed)

## Output

- Pass/fail against each checklist item
- Files requiring follow-up hardening
- Recommendation: approve, approve-with-risk, or block
