---
id: T01
parent: S06
milestone: M009
provides:
  - Proto deprecated fields reject non-empty content (max_len=0)
  - Safe timestamp nanos casts in service.rs and bundle.rs
  - PEM decode_pem() validates Ed25519 PKCS8 ASN.1 OID before key extraction
key_files:
  - proto/interdict/evidence/v1/evidence.proto
  - crates/evidence-collector/src/grpc/service.rs
  - crates/kernel/src/evidence/bundle.rs
  - crates/evidence-collector/src/signing/local.rs
key_decisions:
  - PKCS8 envelope validated by fixed byte-offset OID check (no ASN.1 parser crate) — 48-byte envelope is a fixed format
  - unwrap_or(0) for negative nanos (fail-safe) vs expect() for subsec_nanos (always fits i32, makes assumption explicit)
patterns_established:
  - Fixed-format ASN.1 validation for known DER structures without adding parser dependencies
observability_surfaces:
  - PEM OID mismatch returns descriptive SigningError mentioning "unrecognized PKCS8 key type"
  - Negative nanos silently clamped to 0 via unwrap_or (proto malformed input, rare)
  - Proto validation rejects non-empty deprecated fields at gRPC layer
duration: 20m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Proto max_len=0, timestamp safe cast, PEM ASN.1 validation

**Three surgical safety fixes: proto deprecated field rejection, safe numeric casts, and PEM PKCS8 OID validation with 3 unit tests.**

## What Happened

Applied all three fixes as planned:

1. **Proto max_len=0:** Changed `max_len = 1048576` to `max_len = 0` on `prompt_text` (field 10) and `response_text` (field 11) in evidence.proto. buf.validate CEL expression now evaluates `uint(this.size()) > 0`, rejecting any non-empty string on these deprecated fields.

2. **Timestamp safe casts:** Replaced `timestamp.nanos as u32` with `u32::try_from(timestamp.nanos).unwrap_or(0)` in service.rs — handles negative nanos from malformed proto input. Replaced `ts.timestamp_subsec_nanos() as i32` with `i32::try_from(...).expect("subsec_nanos 0..999_999_999 fits i32")` in bundle.rs — chrono guarantees the range but the expect makes the assumption explicit for future readers.

3. **PEM ASN.1 OID validation:** Modified `decode_pem()` in local.rs to check 48-byte payloads for the Ed25519 OID at bytes 7..12 (`[0x06, 0x03, 0x2b, 0x65, 0x70]`). Valid OID → extract 32-byte key from offset 16..48. Wrong OID → descriptive `SigningError`. Non-48-byte payloads fall through to existing raw key handling (32-byte or 64-byte). Added helper `build_pkcs8_ed25519_der()` and 3 tests.

## Verification

- `buf lint` — clean (no output, exit 0)
- `cargo build --workspace` — passes
- `cargo test -p evidence-collector -- signing` — 24 passed, 0 failed (includes 3 new PEM tests: `test_decode_pem_valid_pkcs8`, `test_decode_pem_invalid_oid`, `test_decode_pem_raw_32_byte`)
- `cargo test -p kernel -- bundle` — 1 passed (raw_event_to_proto_preserves_fields with safe cast)
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

### Slice-level verification (T01 scope):
- ✅ `buf lint` — clean
- ✅ `cargo build --workspace` — passes
- ⏳ `cargo test -p kernel --test-threads=1` — not yet (T02 flaky fix)
- ⏳ `cargo test -p evidence-collector` — passing for signing, Merkle/roundtrip not yet (T03)
- ⏳ `cargo test -p interdict-verify` — not yet (T03)
- ✅ `cargo clippy --workspace --all-targets -- -D warnings` — clean
- ✅ `cargo fmt --all -- --check` — clean
- ⏳ `bun test` (control-plane/) — not yet (T05)
- ⏳ `npx vitest run` (dashboard/) — not yet (T05)

## Diagnostics

- PEM OID errors: `SigningError::LocalKeyError("unrecognized PKCS8 key type: OID does not match Ed25519 (1.3.101.112)")`
- Proto validation: non-empty deprecated fields rejected at gRPC validation layer (buf.validate)
- Negative nanos: silently clamped to 0, no log (rare malformed input case)

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `proto/interdict/evidence/v1/evidence.proto` — `max_len = 0` on fields 10 and 11
- `crates/evidence-collector/src/grpc/service.rs` — safe `u32::try_from` for timestamp nanos
- `crates/kernel/src/evidence/bundle.rs` — safe `i32::try_from` for subsec nanos
- `crates/evidence-collector/src/signing/local.rs` — ASN.1 OID validation in `decode_pem()` + 3 unit tests + test helper
- `.gsd/milestones/M009/slices/S06/tasks/T01-PLAN.md` — added Observability Impact section
