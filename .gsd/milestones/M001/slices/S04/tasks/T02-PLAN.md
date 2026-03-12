# T02: Plan 02

**Slice:** S04 — **Milestone:** M001

## Description

Implement the Evidence Collector gRPC service, ClickHouse batched storage, hourly Merkle tree construction with S3 WORM anchoring, and wire everything into the collector main binary.

Purpose: This is the core evidence pipeline -- receiving compressed evidence from kernels, computing chain hashes, persisting to ClickHouse with correct batching, and building hourly Merkle trees anchored to S3 for external immutability verification. The ClickHouse batching (min 1000 rows, max 1 INSERT/sec) is a correctness requirement to avoid "too many parts" failures.

Output: Fully functional evidence collector binary that receives gRPC streams, persists to ClickHouse, and anchors hourly Merkle roots to S3.
