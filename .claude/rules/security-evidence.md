# Security and Evidence Rules

## Secrets and Prompt Safety

- Never log plaintext secrets, raw private keys, or full prompts in production logs.
- Keep sensitive outputs redacted in diagnostics and test snapshots.

## Evidence Integrity

- Compute content hashes before mutation/redaction.
- Preserve chain linkage fields whenever evidence payload structures evolve.
- Do not weaken cryptographic requirements without explicit architectural approval.

## Policy Hardening

- Treat bypasses and prompt-injection/jailbreak vectors as block-level security conditions where configured.
- Keep fail-open modes explicit, scoped, and auditable.

## Verification

- Run `cargo clippy --workspace --all-targets -- -D warnings` for security-significant changes.
- Run targeted integration tests for policy enforcement and inspection flows.
- Run `cargo audit` when available.
