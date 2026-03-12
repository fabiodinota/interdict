---
id: S04
parent: M001
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
# S04: Evidence Collector

**# Phase 4 Plan 1: Evidence Collector Foundations Summary**

## What Happened

# Phase 4 Plan 1: Evidence Collector Foundations Summary

**Evidence collector/verifier scaffolds now compile with shared protobuf contracts, per-kernel SHA-256 chain linkage, and Ed25519 signing providers for dev and KMS-backed production paths.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-27T23:52:27Z
- **Completed:** 2026-02-28T00:04:20Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Added workspace members for `evidence-collector` and `interdict-verify` with independent binaries and build scripts.
- Defined `EvidenceCollector` gRPC service and full `EvidenceBundle` schema (including chain/signature metadata and schema versioning).
- Implemented chain primitives (`ChainState`, `ChainManager`) and signing primitives (`SigningProvider`, local Ed25519 provider, KMS provider) with unit tests.
- Added `interdict-verify` CLI skeleton with `bundle`, `range`, and `chain` verification subcommands plus `--json` and `--kernel-id` flags.

## Task Commits

Each task was committed atomically:

1. **Task 1: Workspace scaffold, proto schema, and crate skeleton** - `992b496` (feat)
2. **Task 2: Hash chain, signing providers, and unit tests** - `df90aaa` (feat)

**Additional verification fix:** `eef15c9` (fix) to resolve post-task lint/test formatting regressions discovered during full-plan verification.

## Files Created/Modified
- `Cargo.toml` - Added workspace members for new phase-4 binaries.
- `proto/interdict/evidence/v1/evidence.proto` - Added collector RPC schema and complete bundle fields.
- `crates/evidence-collector/src/chain/hasher.rs` - Added SHA-256 linkage primitives and per-kernel chain manager.
- `crates/evidence-collector/src/signing/mod.rs` - Added signing trait and typed errors.
- `crates/evidence-collector/src/signing/local.rs` - Added local key generation/file-loading Ed25519 signing provider and tests.
- `crates/evidence-collector/src/signing/kms.rs` - Added AWS KMS-backed signing provider skeleton with cached public key.
- `crates/interdict-verify/src/main.rs` - Added CLI command skeleton for verification modes.

## Decisions Made
- Used `tonic-prost-build` (instead of `tonic-build::configure`) due tonic 0.14 API changes.
- Vendored `protoc` to avoid environment-specific build failures on machines without protobuf installed.
- Added a library target (`src/lib.rs`) for `evidence-collector` so `cargo test -p evidence-collector --lib` can execute module tests directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tonic 0.14 removed `tonic_build::configure` API**
- **Found during:** Task 1 verification
- **Issue:** Build scripts failed because prost-related codegen moved out of `tonic-build` in 0.14.
- **Fix:** Switched both crates to `tonic-prost-build` and updated `build.rs` calls.
- **Files modified:** `crates/evidence-collector/Cargo.toml`, `crates/evidence-collector/build.rs`, `crates/interdict-verify/Cargo.toml`, `crates/interdict-verify/build.rs`
- **Verification:** `cargo build -p evidence-collector -p interdict-verify`
- **Committed in:** `992b496`

**2. [Rule 3 - Blocking] Missing protoc binary in environment**
- **Found during:** Task 1 verification
- **Issue:** Proto compilation failed with "Could not find protoc".
- **Fix:** Added `protoc-bin-vendored` and configured `PROTOC` in both build scripts.
- **Files modified:** `crates/evidence-collector/Cargo.toml`, `crates/evidence-collector/build.rs`, `crates/interdict-verify/Cargo.toml`, `crates/interdict-verify/build.rs`
- **Verification:** `cargo build -p evidence-collector -p interdict-verify`
- **Committed in:** `992b496`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required for successful local/CI compilation; no scope creep.

## Issues Encountered
- A post-task clippy cleanup introduced a test import mismatch and rustfmt ordering delta; both were corrected in `eef15c9` before final verification.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundations are ready for Plan 04-02 gRPC service wiring and storage pipeline integration.
- KMS provider compiles but requires AWS credentials/runtime validation in a later integration-focused plan.

---
*Phase: 04-evidence-collector*
*Completed: 2026-02-28*

## Self-Check: PASSED
- Found summary file: `.planning/phases/04-evidence-collector/04-01-SUMMARY.md`
- Found task commit: `992b496`
- Found task commit: `df90aaa`
- Found verification fix commit: `eef15c9`

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

# Phase 04 Plan 03: Kernel Evidence Buffer Summary

**Bounded mpsc evidence buffer with 500ms zstd-compressed gRPC flusher and fire-and-forget proxy integration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T22:44:59Z
- **Completed:** 2026-02-28T22:51:08Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- EvidenceBuffer with bounded 8192-capacity mpsc channel and non-blocking try_send (KERN-14, KERN-13)
- Background flusher drains every 500ms, serializes via prost, compresses with zstd level 3, streams via gRPC
- RawEvidenceEvent captures all EVID-06 fields (timestamp, actor, vendor, model, hashes, policy action, latency)
- Evidence emission wired into proxy CONNECT handler -- fire-and-forget after policy evaluation
- Proto compilation in kernel build.rs (client-only, no server code generated)
- Graceful flusher shutdown with 2s timeout on kernel exit

## Task Commits

Each task was committed atomically:

1. **Task 1: Kernel evidence buffer, bundle construction, and gRPC client** - `71727a4` (feat)
2. **Task 2: Wire evidence buffer into proxy pipeline** - `5793a2e` (feat)

## Files Created/Modified
- `crates/kernel/src/evidence/mod.rs` - EvidenceBuffer with bounded mpsc, background flusher, stub mode
- `crates/kernel/src/evidence/bundle.rs` - RawEvidenceEvent struct and to_proto_bundle conversion
- `crates/kernel/src/evidence/client.rs` - EvidenceGrpcClient with lazy connect and reconnect
- `crates/kernel/build.rs` - Proto compilation for kernel (client-only)
- `crates/kernel/Cargo.toml` - Added tonic-prost, updated prost to 0.14
- `crates/kernel/src/lib.rs` - Added pub mod evidence
- `crates/kernel/src/main.rs` - Evidence buffer creation, env config, graceful shutdown
- `crates/kernel/src/proxy/connect.rs` - Evidence emission after policy evaluation

## Decisions Made
- Updated prost from 0.13 to 0.14 to match tonic-prost-build 0.14 generated code requirements
- Added tonic-prost runtime dependency (generated code references tonic_prost::ProstCodec)
- Lazy gRPC connection with reconnect-on-failure pattern for evidence client
- EvidenceBundleBatch as prost message wrapper for serializing bundle vectors
- clippy::too_many_arguments allowed on handle_connect (8 params needed for evidence integration)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tonic-prost runtime dependency**
- **Found during:** Task 1 (Proto compilation)
- **Issue:** tonic-prost-build generates code referencing tonic_prost::ProstCodec at runtime, but tonic-prost was not in kernel dependencies
- **Fix:** Added `tonic-prost = "0.14"` to kernel Cargo.toml dependencies
- **Files modified:** crates/kernel/Cargo.toml
- **Verification:** cargo build -p kernel succeeds
- **Committed in:** 71727a4 (Task 1 commit)

**2. [Rule 3 - Blocking] Updated prost from 0.13 to 0.14**
- **Found during:** Task 1 (Proto compilation)
- **Issue:** tonic-prost 0.14 expects prost 0.14 types; kernel had prost 0.13 causing type mismatches
- **Fix:** Updated prost and prost-types from 0.13 to 0.14, prost-build from 0.13 to 0.14
- **Files modified:** crates/kernel/Cargo.toml
- **Verification:** cargo build -p kernel succeeds, all tests pass
- **Committed in:** 71727a4 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed test assertion for policy_rules_json**
- **Found during:** Task 1 (Test verification)
- **Issue:** Test expected escaped backslashes in JSON string (`[\"policy-a\"]`) but serde_json produces standard JSON (`["policy-a"]`)
- **Fix:** Updated assertion to use correct JSON format
- **Files modified:** crates/kernel/src/evidence/bundle.rs
- **Verification:** cargo test -p kernel --lib evidence passes
- **Committed in:** 71727a4 (Task 1 commit)

**4. [Rule 1 - Bug] Added clippy::too_many_arguments allow attribute**
- **Found during:** Task 2 (Clippy verification)
- **Issue:** handle_connect has 8 parameters (above clippy's default 7 limit) due to evidence_buffer and full_text_storage additions
- **Fix:** Added #[allow(clippy::too_many_arguments)] on handle_connect
- **Files modified:** crates/kernel/src/proxy/connect.rs
- **Verification:** cargo clippy -p kernel -- -D warnings passes clean
- **Committed in:** 5793a2e (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bug)
**Impact on plan:** All auto-fixes necessary for compilation and test correctness. No scope creep.

## Issues Encountered
- Pre-existing evidence-collector S3 type mismatch (`ObjectLockMode` vs `ObjectLockRetentionMode` in s3.rs) prevents full workspace compilation. Logged to deferred-items.md. Not caused by this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Kernel evidence pipeline is complete and ready for end-to-end testing
- Evidence collector gRPC server (04-02) needs to accept incoming batches
- Response-side evidence fields (response_hash, token_count) deferred to streaming response integration
- Full-text storage controlled by INTERDICT_EVIDENCE_FULL_TEXT_STORAGE env var

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 04-evidence-collector*
*Completed: 2026-02-28*

# Phase 04 Plan 04: Verifier Binary and Integration Tests Summary

**Standalone interdict-verify binary with chain, signature, and Merkle verification across three modes, plus 7 integration tests proving end-to-end evidence pipeline from kernel buffer through chain hashing, signing, Merkle tree construction, and tamper detection**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-28T22:54:23Z
- **Completed:** 2026-03-01T23:06:19Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Implemented full interdict-verify binary with three verification modes (single bundle, time-range, full chain) supporting both human-readable and JSON output
- Chain verification detects tampered bundles and sequence gaps with per-kernel independent validation
- Ed25519 signature verification validates signatures and reports key IDs and dev-signed status
- Merkle root verification computes tree from bundle chain hashes and compares against exported S3 anchor JSON files
- 24 unit tests and 7 integration tests proving end-to-end evidence pipeline correctness including tamper detection, non-blocking buffer behavior, schema completeness, and per-kernel chain independence

## Task Commits

Each task was committed atomically:

1. **Task 1: interdict-verify binary with three verification modes** - `49b8e8d` (feat)
2. **Task 2: End-to-end integration tests for evidence pipeline** - `1e076b5` (feat)

## Files Created/Modified
- `crates/interdict-verify/src/lib.rs` - Module root exposing chain, signature, merkle, report modules and proto types
- `crates/interdict-verify/src/chain.rs` - Hash chain verification with per-kernel grouping, sequence contiguity, and SHA-256 recomputation
- `crates/interdict-verify/src/signature.rs` - Ed25519 signature verification with public key file parsing and batch validation
- `crates/interdict-verify/src/merkle.rs` - Merkle root computation, verification against expected root, and S3 anchor JSON parsing
- `crates/interdict-verify/src/report.rs` - Human-readable and JSON output formatting with VerificationReport aggregation
- `crates/interdict-verify/src/main.rs` - CLI with bundle/range/chain subcommands, public key file loading, anchor dir support, and exit codes
- `crates/interdict-verify/Cargo.toml` - Added lib target, tonic/tonic-prost/rand deps, updated prost to 0.14
- `crates/evidence-collector/tests/integration_test.rs` - 7 integration tests covering chain roundtrip, Merkle verification, non-blocking buffer, schema completeness, dev signing, ClickHouse row compatibility, and per-kernel independence
- `crates/evidence-collector/Cargo.toml` - Added dev-dependencies for interdict-verify and kernel crates

## Decisions Made
- **bundle_content_bytes extraction:** Zeroes all chain/signature metadata fields (chain_hash, previous_hash, sequence_number, signature, signing_key_id, dev_signed) to reconstruct the exact protobuf bytes that were originally signed by the collector. This matches the collector's flow where these fields are set after content hashing and signing.
- **Cross-crate proto type handling:** Integration tests use `interdict_verify::proto::EvidenceBundle` instead of `evidence_collector::grpc::proto::EvidenceBundle` because each crate generates its own proto types and the verify functions expect their own type.
- **prost 0.13 to 0.14 upgrade:** The interdict-verify crate was still on prost 0.13 from Plan 04-01, updated to 0.14 for workspace consistency with evidence-collector and kernel.
- **tonic/tonic-prost dependencies:** Required for `tonic::include_proto!` macro and generated codec support in the verify crate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated prost from 0.13 to 0.14 in interdict-verify**
- **Found during:** Task 1 (Cargo.toml setup)
- **Issue:** interdict-verify had prost 0.13 while rest of workspace uses 0.14, causing type mismatches
- **Fix:** Updated prost, prost-types from 0.13 to 0.14; updated prost-build from 0.13 to 0.14
- **Files modified:** crates/interdict-verify/Cargo.toml
- **Verification:** cargo build -p interdict-verify succeeds
- **Committed in:** 49b8e8d (Task 1 commit)

**2. [Rule 3 - Blocking] Added tonic and tonic-prost dependencies**
- **Found during:** Task 1 (Proto include macro)
- **Issue:** tonic::include_proto! macro and tonic_prost::ProstCodec required at runtime but not in dependencies
- **Fix:** Added tonic 0.14 and tonic-prost 0.14 to dependencies
- **Files modified:** crates/interdict-verify/Cargo.toml
- **Verification:** cargo build -p interdict-verify succeeds
- **Committed in:** 49b8e8d (Task 1 commit)

**3. [Rule 1 - Bug] Fixed signature test to match collector signing flow**
- **Found during:** Task 1 (Unit test verification)
- **Issue:** Test set signing_key_id and dev_signed before computing content bytes, but bundle_content_bytes zeroes those fields for verification. The test needed to match the collector flow where those fields are set after signing.
- **Fix:** Moved signing_key_id and dev_signed assignment to after content bytes computation and signing
- **Files modified:** crates/interdict-verify/src/signature.rs
- **Verification:** cargo test -p interdict-verify --lib passes (24/24)
- **Committed in:** 49b8e8d (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes required for compilation and test correctness. No scope creep.

## Issues Encountered
None - all planned work compiled and tested cleanly after deviation fixes.

## User Setup Required
None - no external service configuration required. Verification binary operates entirely offline on exported files.

## Next Phase Readiness
- Phase 04 Evidence Collector is fully complete with all 4 plans executed
- All requirements fulfilled: EVID-01 through EVID-10, KERN-14
- Both binaries compile: interdict-collector and interdict-verify (EVID-08)
- Ready for Phase 05 (Control Plane) which will provide the API layer for evidence querying
- Verification tool is ready for auditor use once export pipelines are wired

---
*Phase: 04-evidence-collector*
*Completed: 2026-03-01*

## Self-Check: PASSED
