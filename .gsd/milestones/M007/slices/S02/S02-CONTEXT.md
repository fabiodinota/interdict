---
id: S02
milestone: M007
status: ready
---

# S02: Layer 3 Queue + Evidence Signing Tests — Context

## Goal

Cover the human review queue persistence layer and all evidence signing providers with comprehensive tests, closing the "high risk" gap identified in the assessment.

## Why this Slice

The assessment flagged `policy/layer3/queue.rs` and `layer3/store.rs` as high-risk untested code, and the Evidence-Collector KMS integration as untested. The Layer 3 queue is the final decision point in the policy pipeline — an undetected bug here could silently approve blocked content. Signing integrity is the foundation of the entire tamper-evidence guarantee. Both need coverage before expanding to broader tests in S04.

## Scope

### In Scope

- Unit tests for `crates/kernel/src/policy/layer3/queue.rs` (~350 lines): FIFO ordering, capacity limits, concurrent enqueue, shutdown draining, overflow behavior, review item expiry/timeout
- Unit tests for `crates/kernel/src/policy/layer3/store.rs`: SQLite initialization, CRUD operations, concurrent read/write atomicity, WAL recovery, disk-full handling, expired item cleanup
- Unit tests for evidence-collector signing providers:
  - `signing/local.rs`: key generation, sign/verify, deterministic key ID, `is_dev_key()` flag
  - `signing/kms.rs`: mock AWS client, correct algorithm verification, throttling/error handling
  - `signing/rotation.rs`: ArcSwap atomic swap, old signature verification, concurrent signing during rotation
- Unit tests for `chain/signer.rs` and `chain/mod.rs`: signature application, independent chains per kernel ID, hash continuity, concurrent bundle submissions

### Out of Scope

- Layer 1 (Wasm/Rego) and Layer 2 (NLP) tests (covered in S04)
- Evidence collector performance testing
- Changes to signing implementation

## Constraints

- Evidence-collector tests may require `--test-threads=1` for serialization
- SQLite tests need tempdir-based isolation (no shared state between tests)
- KMS tests must mock AWS SDK — no real AWS calls
- Must respect existing `ArcSwap` rotation pattern

## Integration Points

### Consumes

- `crates/kernel/src/policy/layer3/queue.rs` — queue module under test
- `crates/kernel/src/policy/layer3/store.rs` — store module under test
- `crates/evidence-collector/src/signing/` — all signing providers under test
- `crates/evidence-collector/src/chain/` — chain management under test

### Produces

- Inline `#[cfg(test)] mod tests` blocks for all modules listed above
- Mock AWS KMS client reusable by S04 negative testing
- SQLite test fixture pattern reusable by S04

## Open Questions

- SQLite WAL mode testing — simulating unclean shutdown may require OS-level tricks or tempfile manipulation
- KMS mock depth — need to determine if `aws-sdk-kms` has built-in test utilities or if we need a full mock
- Chain concurrency — testing concurrent bundle submissions may need careful tokio::spawn orchestration
