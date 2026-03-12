---
id: T01
parent: S01
milestone: M003
provides:
  - Consistent evidence verification across Rust, TypeScript, and dashboard
  - Golden-fixture cross-language test suite
  - content_bytes persistence in ClickHouse
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 1 session
verification_result: passed
completed_at: 
blocker_discovered: false
---
# T01: Plan 01

**# Phase 16, Task 1 — Summary**

## What Happened

# Phase 16, Task 1 — Summary

Fixed the fundamental disagreement in evidence verification across all surfaces. The collector was signing `content_bytes` (protobuf-encoded bundle with chain/sig fields zeroed), but the control plane was verifying against `chain_hash`. Genesis detection was also inconsistent (collector=seq=1, CP=seq=0).

## What Changed

- Signature verification now checks against `content_bytes` in both Rust and TypeScript
- Genesis detection standardized to seq=1
- Chain hash recomputation added: SHA-256(previous_hash || content_bytes)
- `content_bytes` column added to ClickHouse via migration DDL
- 12 golden-fixture tests added for chain hash, Ed25519, hex codec
- Dashboard "independently verify" overclaim removed
