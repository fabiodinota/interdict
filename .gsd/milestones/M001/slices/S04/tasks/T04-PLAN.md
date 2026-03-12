# T04: Plan 04

**Slice:** S04 — **Milestone:** M001

## Description

Implement the standalone interdict-verify binary with all three verification modes and create integration tests that prove the end-to-end evidence pipeline works correctly.

Purpose: The verifier is the auditor's tool -- it must independently validate hash chain integrity, Ed25519 signatures, and Merkle roots against S3 anchors without any network access to production (user decision: export-based offline verification). The integration tests prove the entire pipeline from kernel evidence buffer through gRPC to the collector's chain/sign/persist operations.

Output: Complete interdict-verify binary with chain, signature, and Merkle verification. Integration test exercising the full evidence pipeline.
