# T01: Plan 01

**Slice:** S04 — **Milestone:** M001

## Description

Scaffold the evidence-collector and interdict-verify workspace crates, define the protobuf schema, and implement core cryptographic primitives (hash chain + signing providers).

Purpose: Establish the foundational types, proto definitions, and crypto building blocks that all subsequent Phase 4 plans depend on. The protobuf schema is the wire format for kernel-to-collector communication. The hash chain and signing providers are the cryptographic core of the evidence integrity guarantee.

Output: Two new workspace crates (evidence-collector, interdict-verify) with proto compilation, SHA-256 chain state, Ed25519 signing providers (local + KMS), and configuration structure.
