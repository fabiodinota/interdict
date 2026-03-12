---
id: T02
parent: S04
milestone: M001
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# T02: Plan 02

**# Phase 4 Plan 2: Evidence Pipeline Core Summary**

## What Happened

# Phase 4 Plan 2: Evidence Pipeline Core Summary

**gRPC evidence service receives zstd-compressed client-streaming batches, persists to ClickHouse via Inserter (min 1000 rows, 1 INSERT/sec), builds hourly Merkle trees with rs_merkle SHA-256, and anchors roots to S3 Object Lock with WORM Compliance mode and 7-year retention.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T22:45:27Z
- **Completed:** 2026-02-28T22:51:17Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Implemented EvidenceCollectorService gRPC handler with client-streaming, zstd decompression, per-kernel chain hashing, Ed25519 signing, and async ClickHouse enqueue.
- Built ClickHouseWriter with mpsc-channel worker pattern wrapping Inserter API (max_rows=1000, period=1s, max_bytes=50MB), DDL with daily toYYYYMMDD partitions, 7-year TTL, and 3 materialized views (hourly violations, vendor usage, department summary).
- Implemented HourlyMerkleBuilder with rs_merkle SHA-256 finalize, hourly rotation task with sub-hourly overflow detection, and CancellationToken-based graceful shutdown.
- Built S3Anchor with Object Lock Compliance mode PUT, verify_anchor GET, configurable retention, and dev-mode skip for local development.
- Wired collector main.rs with all components: signing provider selection, ChainManager, ClickHouseWriter, MerkleBuilder, S3Anchor, gRPC server, and graceful shutdown handling.

## Task Commits

Each task was committed atomically:

1. **Task 1: gRPC service, ClickHouse storage, and ClickHouse schema** - `dcfce2d` (feat)
2. **Task 2: Hourly Merkle tree builder, S3 WORM anchoring, and main binary wiring** - `3413d0f` (feat)

## Files Created/Modified
- `crates/evidence-collector/src/grpc/mod.rs` - Proto codegen re-export and service module declaration.
- `crates/evidence-collector/src/grpc/service.rs` - EvidenceCollectorService with client-streaming, zstd decompression, chain hashing, signing, ClickHouse enqueue.
- `crates/evidence-collector/src/storage/mod.rs` - Storage module declarations (clickhouse, s3).
- `crates/evidence-collector/src/storage/clickhouse.rs` - ClickHouseWriter with Inserter API, DDL, 3 materialized views, mpsc worker.
- `crates/evidence-collector/src/storage/s3.rs` - S3Anchor with Object Lock Compliance PUT, verify_anchor, s3_key_for_hour helper.
- `crates/evidence-collector/src/merkle/mod.rs` - Merkle module declaration.
- `crates/evidence-collector/src/merkle/builder.rs` - HourlyMerkleBuilder with rs_merkle finalize, rotation task, overflow detection.
- `crates/evidence-collector/Cargo.toml` - Added tokio-util; bumped prost to 0.14.
- `crates/evidence-collector/src/lib.rs` - Added grpc, merkle, storage module declarations.
- `crates/evidence-collector/src/main.rs` - Full collector binary wiring with graceful shutdown.

## Decisions Made
- **mpsc worker for ClickHouse Inserter:** The Inserter API requires `&mut self` which conflicts with concurrent gRPC handlers. Solved with bounded mpsc channel + dedicated background worker task.
- **Box<EvidenceRow> in WriteCommand:** Clippy flagged 448-byte vs 8-byte variant size disparity. Boxing the Row variant reduces enum size to pointer-sized.
- **CancellationToken for shutdown:** Used tokio-util's CancellationToken to coordinate graceful shutdown between gRPC server, merkle rotation task, and ClickHouse flush.
- **Dev-mode S3 skip:** When S3 bucket is empty, all S3 operations are skipped with warning logs. This allows local development without requiring AWS credentials or S3 bucket setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ObjectLockRetention builder used wrong type**
- **Found during:** Task 2 (S3 anchor implementation)
- **Issue:** `ObjectLockRetention::builder().mode()` expects `ObjectLockRetentionMode`, not `ObjectLockMode`. The unused retention builder caused a compile error.
- **Fix:** Removed the unused ObjectLockRetention builder since the PutObject call uses `.object_lock_mode()` directly.
- **Files modified:** `crates/evidence-collector/src/storage/s3.rs`
- **Committed in:** `3413d0f`

**2. [Rule 1 - Bug] Clippy collapsible_if and large_enum_variant**
- **Found during:** Task 2 (final verification)
- **Issue:** Nested if-let in merkle rotation task and 448-byte vs 8-byte WriteCommand enum variant.
- **Fix:** Collapsed nested if-let with `&&` chain; boxed EvidenceRow in WriteCommand::Row.
- **Files modified:** `crates/evidence-collector/src/merkle/builder.rs`, `crates/evidence-collector/src/storage/clickhouse.rs`
- **Committed in:** `3413d0f`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for compilation and clippy compliance. No scope creep.

## Issues Encountered
None - all planned work compiled and tested on first pass after deviation fixes.

## User Setup Required
None - no external service configuration required. S3 and ClickHouse connections are skipped in dev mode by default.

## Next Phase Readiness
- Evidence pipeline core is fully wired. Binary compiles and starts with dev-mode defaults.
- Ready for Plan 04-03 (kernel-side evidence buffer and gRPC client integration).
- ClickHouse and S3 require real infrastructure for integration testing (not needed for unit tests).

---
*Phase: 04-evidence-collector*
*Completed: 2026-02-28*

## Self-Check: PASSED
- Found all 9 key files on disk
- Found task commit: `dcfce2d`
- Found task commit: `3413d0f`
