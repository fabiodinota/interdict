# Phase 16: Evidence Verification Truth — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

Interdict's strongest differentiator is tamper-evident evidence. The verification implementations disagreed across services — the collector, Rust verifier, control plane, and dashboard all used different chain semantics and signature payloads.

## Scope

- Align chain semantics across all verification surfaces
- Align signature payload semantics (protobuf-encoded content_bytes, not chain_hash)
- Fix genesis detection (seq=1, not seq=0)
- Add cross-language golden-fixture verification tests
- Remove UI wording that overclaims verification capability

## Key Files

- `control-plane/src/modules/evidence/service.ts`
- `dashboard/src/components/evidence/VerificationStepper.tsx`
- `crates/evidence-collector/src/grpc/service.rs`
- `crates/interdict-verify/src/chain.rs`
- `crates/interdict-verify/src/signature.rs`
- `proto/interdict/evidence/v1/evidence.proto`
