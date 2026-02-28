---
phase: 04-evidence-collector
plan: 04
subsystem: evidence
tags: [ed25519, sha256, merkle, rs-merkle, clap, verification, integration-test]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Proto schema, chain manager, signing providers, collector/verifier scaffolds"
  - phase: 04-02
    provides: "gRPC service, ClickHouse writer, Merkle builder, S3 anchoring"
  - phase: 04-03
    provides: "Kernel evidence buffer, RawEvidenceEvent, gRPC client, proxy integration"
provides:
  - "interdict-verify binary with chain, signature, and Merkle verification modes"
  - "Export-based offline verification with human-readable and JSON output"
  - "End-to-end integration tests proving evidence pipeline correctness"
  - "Tamper detection across chain hashing, signatures, and Merkle roots"
affects: [05-control-plane, 09-compliance, phase-04-complete]

# Tech tracking
tech-stack:
  added: [tonic-prost 0.14, rand 0.8]
  patterns: [bundle-content-bytes-extraction, offline-export-verification, cross-crate-integration-testing]

key-files:
  created:
    - crates/interdict-verify/src/lib.rs
    - crates/interdict-verify/src/chain.rs
    - crates/interdict-verify/src/signature.rs
    - crates/interdict-verify/src/merkle.rs
    - crates/interdict-verify/src/report.rs
    - crates/evidence-collector/tests/integration_test.rs
  modified:
    - crates/interdict-verify/Cargo.toml
    - crates/interdict-verify/src/main.rs
    - crates/evidence-collector/Cargo.toml

key-decisions:
  - "bundle_content_bytes zeroes chain/sig metadata to reconstruct original signed content for verification"
  - "Integration tests use interdict_verify::proto::EvidenceBundle to avoid cross-crate type mismatch"
  - "Updated interdict-verify prost from 0.13 to 0.14 for workspace consistency"
  - "Added tonic and tonic-prost deps to interdict-verify for proto include macro compatibility"

patterns-established:
  - "Content extraction: zero chain_hash, previous_hash, sequence_number, signature, signing_key_id, dev_signed to reconstruct pre-signing bytes"
  - "Cross-crate integration: verify crate's proto types used in integration tests to validate collector's chain/signing output"
  - "Offline verification: read exported protobuf files and anchor JSON from disk without network access"

requirements-completed: [EVID-10, EVID-01, EVID-02, EVID-03, EVID-04, EVID-05, EVID-06, EVID-07, EVID-08, EVID-09, KERN-14]

# Metrics
duration: 12min
completed: 2026-03-01
---

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
