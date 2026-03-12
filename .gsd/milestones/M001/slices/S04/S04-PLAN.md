# S04: Evidence Collector

**Goal:** Scaffold the evidence-collector and interdict-verify workspace crates, define the protobuf schema, and implement core cryptographic primitives (hash chain + signing providers).
**Demo:** Scaffold the evidence-collector and interdict-verify workspace crates, define the protobuf schema, and implement core cryptographic primitives (hash chain + signing providers).

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Scaffold the evidence-collector and interdict-verify workspace crates, define the protobuf schema, and implement core cryptographic primitives (hash chain + signing providers).

Purpose: Establish the foundational types, proto definitions, and crypto building blocks that all subsequent Phase 4 plans depend on. The protobuf schema is the wire format for kernel-to-collector communication. The hash chain and signing providers are the cryptographic core of the evidence integrity guarantee.

Output: Two new workspace crates (evidence-collector, interdict-verify) with proto compilation, SHA-256 chain state, Ed25519 signing providers (local + KMS), and configuration structure.
- [x] **T02: Plan 02**
  - Implement the Evidence Collector gRPC service, ClickHouse batched storage, hourly Merkle tree construction with S3 WORM anchoring, and wire everything into the collector main binary.

Purpose: This is the core evidence pipeline -- receiving compressed evidence from kernels, computing chain hashes, persisting to ClickHouse with correct batching, and building hourly Merkle trees anchored to S3 for external immutability verification. The ClickHouse batching (min 1000 rows, max 1 INSERT/sec) is a correctness requirement to avoid "too many parts" failures.

Output: Fully functional evidence collector binary that receives gRPC streams, persists to ClickHouse, and anchors hourly Merkle roots to S3.
- [x] **T03: Plan 03**
  - Add the kernel-side evidence buffer with bounded async channel, background 500ms gRPC flusher, and evidence bundle construction from policy pipeline results.

Purpose: The kernel must create evidence bundles asynchronously without adding latency to proxied AI responses (KERN-14). This is the kernel-to-collector bridge -- a bounded mpsc channel collects events, a background task compresses with zstd and streams to the evidence collector via gRPC every 500ms. Evidence loss under backpressure is acceptable (fail-open for evidence); adding latency to AI responses is not.

Output: New `evidence` module in the kernel crate with EvidenceBuffer, RawEvidenceEvent, background flusher, and gRPC client.
- [x] **T04: Plan 04**
  - Implement the standalone interdict-verify binary with all three verification modes and create integration tests that prove the end-to-end evidence pipeline works correctly.

Purpose: The verifier is the auditor's tool -- it must independently validate hash chain integrity, Ed25519 signatures, and Merkle roots against S3 anchors without any network access to production (user decision: export-based offline verification). The integration tests prove the entire pipeline from kernel evidence buffer through gRPC to the collector's chain/sign/persist operations.

Output: Complete interdict-verify binary with chain, signature, and Merkle verification. Integration test exercising the full evidence pipeline.

## Files Likely Touched

