---
phase: 04-evidence-collector
plan: 03
subsystem: evidence
tags: [grpc, mpsc, zstd, tonic, prost, tokio, evidence-buffer]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Proto schema (evidence.proto), evidence collector scaffold"
provides:
  - "EvidenceBuffer with bounded mpsc channel and background flusher"
  - "RawEvidenceEvent capturing all EVID-06 fields"
  - "EvidenceGrpcClient for streaming compressed batches to collector"
  - "Fire-and-forget evidence emission wired into proxy pipeline"
affects: [04-evidence-collector, 05-control-plane]

# Tech tracking
tech-stack:
  added: [tonic-prost 0.14, prost 0.14, prost-types 0.14, zstd 0.13]
  patterns: [bounded-mpsc-buffer, fire-and-forget-try-send, background-flusher, zstd-compression]

key-files:
  created:
    - crates/kernel/src/evidence/mod.rs
    - crates/kernel/src/evidence/bundle.rs
    - crates/kernel/src/evidence/client.rs
    - crates/kernel/build.rs
  modified:
    - crates/kernel/Cargo.toml
    - crates/kernel/src/lib.rs
    - crates/kernel/src/main.rs
    - crates/kernel/src/proxy/connect.rs

key-decisions:
  - "Updated prost from 0.13 to 0.14 for tonic-prost-build 0.14 compatibility"
  - "Lazy gRPC connection with reconnect-on-failure for evidence client resilience"
  - "EvidenceBundleBatch wrapper for prost serialization of bundle vectors"
  - "clippy::too_many_arguments allowed on handle_connect due to evidence parameters"

patterns-established:
  - "Fire-and-forget evidence: try_send never blocks proxy hot path"
  - "Background flusher: tokio::select between interval tick and channel recv"
  - "Stub buffer: disconnected sender for tests that do not need evidence"

requirements-completed: [KERN-14, EVID-06]

# Metrics
duration: 6min
completed: 2026-02-28
---

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
