---
id: "16-01"
parent: "16"
milestone: v1.2
provides:
  - Consistent evidence verification across Rust, TypeScript, and dashboard
  - Golden-fixture cross-language test suite
  - content_bytes persistence in ClickHouse
key_files:
  - control-plane/src/modules/evidence/service.ts
  - crates/interdict-verify/src/chain.rs
  - crates/interdict-verify/src/signature.rs
  - dashboard/src/components/evidence/VerificationStepper.tsx
key_decisions:
  - "Signed payload = protobuf-encoded bundle with 6 chain/sig fields zeroed"
  - "Genesis = seq=1, not seq=0"
  - "Merkle verification explicitly deferred"
duration: "1 session"
commit: 9bf2b24
---

# Phase 16, Task 1 — Summary

Fixed the fundamental disagreement in evidence verification across all surfaces. The collector was signing `content_bytes` (protobuf-encoded bundle with chain/sig fields zeroed), but the control plane was verifying against `chain_hash`. Genesis detection was also inconsistent (collector=seq=1, CP=seq=0).

## What Changed

- Signature verification now checks against `content_bytes` in both Rust and TypeScript
- Genesis detection standardized to seq=1
- Chain hash recomputation added: SHA-256(previous_hash || content_bytes)
- `content_bytes` column added to ClickHouse via migration DDL
- 12 golden-fixture tests added for chain hash, Ed25519, hex codec
- Dashboard "independently verify" overclaim removed
