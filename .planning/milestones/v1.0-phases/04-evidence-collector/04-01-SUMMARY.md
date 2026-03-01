---
phase: 04-evidence-collector
plan: 01
subsystem: infra
tags: [protobuf, grpc, ed25519, sha256, aws-kms]

requires:
  - phase: 03-pii-detection-content-inspection
    provides: kernel-side evidence context and hashing invariants
provides:
  - Standalone evidence-collector and interdict-verify Rust binaries with proto build wiring
  - Evidence protobuf schema for collector streaming and bundle serialization
  - SHA-256 per-kernel chain manager and Ed25519 signing provider abstractions
affects: [phase-04-plan-02, phase-04-plan-04, control-plane-audit-api]

tech-stack:
  added: [tonic, tonic-prost-build, clickhouse, aws-sdk-kms, aws-sdk-s3, ed25519-dalek, protoc-bin-vendored]
  patterns: [per-kernel hash chain state, signing-provider trait abstraction, vendored-protoc build reproducibility]

key-files:
  created:
    - proto/interdict/evidence/v1/evidence.proto
    - crates/evidence-collector/src/chain/hasher.rs
    - crates/evidence-collector/src/signing/local.rs
    - crates/interdict-verify/src/main.rs
  modified:
    - Cargo.toml
    - crates/evidence-collector/build.rs
    - crates/interdict-verify/build.rs

key-decisions:
  - "Switched proto code generation to tonic-prost-build for tonic 0.14 compatibility."
  - "Vendored protoc in build dependencies to keep local/CI builds deterministic without system protobuf install."
  - "Implemented chain linkage as per-kernel ChainManager to avoid cross-kernel ordering ambiguity."

patterns-established:
  - "Per-kernel chain state: HashMap<kernel_id, ChainState> prevents non-deterministic global ordering issues."
  - "Signing abstraction: async SigningProvider trait supports local ephemeral and KMS-backed signing paths."

requirements-completed: [EVID-02, EVID-03, EVID-06, EVID-08, EVID-09]

duration: 11 min
completed: 2026-02-28
---

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
