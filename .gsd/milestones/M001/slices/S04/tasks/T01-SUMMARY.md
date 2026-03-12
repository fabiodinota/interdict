---
id: T01
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
# T01: Plan 01

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
