# Phase 16: Evidence Verification Truth — Research

**Date:** 2026-03-10

## Summary

The root problem was a disagreement in what constitutes the "signed payload" across services. The collector signs `content_bytes` (protobuf-encoded bundle with chain/sig fields zeroed), but the control plane was verifying against `chain_hash`. Genesis detection also disagreed: collector uses seq=1, control plane used seq=0.

## Decision

- Canonical signed payload = protobuf-encoded bundle with 6 chain/sig fields zeroed (`content_bytes`)
- Genesis = seq=1 (not seq=0)
- Chain hash = SHA-256(previous_hash || content_bytes)
- Merkle verification explicitly deferred (not removed, not claimed)
- `content_bytes` persisted in ClickHouse via migration DDL
