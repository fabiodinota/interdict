---
estimated_steps: 5
estimated_files: 4
---

# T01: Proto max_len=0, timestamp safe cast, PEM ASN.1 validation

**Slice:** S06 — Proto Safety, Observability & Testing
**Milestone:** M009

## Description

Three surgical safety fixes that retire assessment findings and milestone proof-strategy risks. Change proto deprecated field constraints to reject non-empty content. Replace two unsafe numeric casts with safe conversions. Add ASN.1 OID validation to PEM key parsing.

## Steps

1. **Proto max_len = 0:** In `proto/interdict/evidence/v1/evidence.proto`, change `max_len = 1048576` to `max_len = 0` on both `prompt_text` (field 10, around line 73) and `response_text` (field 11, around line 78). The buf.validate CEL expression `uint(this.size()) > rules.max_len` evaluates as `uint(this.size()) > 0`, rejecting any non-empty string. Empty strings (proto3 default) pass through — correct behavior. Run `buf lint` to confirm clean.

2. **Timestamp nanos safe cast:** In `crates/evidence-collector/src/grpc/service.rs` at line 302, replace `timestamp.nanos as u32` with `u32::try_from(timestamp.nanos).unwrap_or(0)`. Proto nanos is `i32` and could be negative (malformed input); `unwrap_or(0)` is fail-safe. In `crates/kernel/src/evidence/bundle.rs` at line 57, replace `ts.timestamp_subsec_nanos() as i32` with `i32::try_from(ts.timestamp_subsec_nanos()).expect("subsec_nanos 0..999_999_999 fits i32")`. This is technically safe (chrono returns 0..999_999_999) but makes the assumption explicit for clippy.

3. **PEM ASN.1 OID validation:** In `crates/evidence-collector/src/signing/local.rs`, modify `decode_pem()` (around line 70). After base64 decode, if the payload is exactly 48 bytes (PKCS8 Ed25519 envelope size), validate the ASN.1 structure:
   - Bytes 7-11 must match `[0x06, 0x03, 0x2b, 0x65, 0x70]` (OID 1.3.101.112 = id-EdDSA / Ed25519)
   - If OID matches, extract the 32-byte key starting at offset 16
   - If OID doesn't match, return `Err(SigningError::...)` with a descriptive message about unrecognized PKCS8 key type
   - If payload is NOT 48 bytes, fall through to the existing raw-key handling (32-byte raw key, 64-byte keypair)
   - No new crate dependencies — this is a fixed-format byte check

4. **Add PEM validation unit tests** in the `#[cfg(test)]` module at the bottom of `local.rs`:
   - `test_decode_pem_valid_pkcs8`: construct a valid 48-byte PKCS8 Ed25519 DER with correct OID, verify 32-byte key extracted
   - `test_decode_pem_invalid_oid`: 48-byte payload with wrong OID at bytes 7-11, verify error returned
   - `test_decode_pem_raw_32_byte`: 32-byte payload passes through existing handling
   - If `decode_pem` is private, test through the `from_file` path or make `decode_pem` `pub(crate)` for testing

5. **Verify all gates pass:** Run `buf lint`, `cargo build --workspace`, `cargo test -p evidence-collector`, `cargo test -p kernel`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all -- --check`.

## Must-Haves

- [ ] `prompt_text` and `response_text` have `max_len = 0` in evidence.proto
- [ ] `buf lint` passes clean
- [ ] `timestamp.nanos as u32` replaced with `u32::try_from().unwrap_or(0)` in service.rs
- [ ] `timestamp_subsec_nanos() as i32` replaced with `i32::try_from().expect()` in bundle.rs
- [ ] `decode_pem()` validates Ed25519 PKCS8 OID bytes before extracting key
- [ ] Invalid PKCS8 OID rejected with error (not silently passed)
- [ ] Raw 32-byte and 64-byte key payloads still work (no regression)
- [ ] PEM validation has at least 3 unit tests

## Verification

- `buf lint` — clean
- `cargo build --workspace` — passes (proto codegen propagates)
- `cargo test -p evidence-collector -- signing` — PEM tests pass
- `cargo test -p kernel -- bundle` — timestamp test passes
- `cargo clippy --workspace --all-targets -- -D warnings` — clean (no unsafe cast warnings)
- `cargo fmt --all -- --check` — clean

## Inputs

- `proto/interdict/evidence/v1/evidence.proto` — deprecated fields at lines 70-80 with current `max_len = 1048576`
- `crates/evidence-collector/src/grpc/service.rs:302` — `timestamp.nanos as u32`
- `crates/kernel/src/evidence/bundle.rs:57` — `ts.timestamp_subsec_nanos() as i32`
- `crates/evidence-collector/src/signing/local.rs:70` — `decode_pem()` function

## Expected Output

- `proto/interdict/evidence/v1/evidence.proto` — `max_len = 0` on fields 10 and 11
- `crates/evidence-collector/src/grpc/service.rs` — safe `u32::try_from` for nanos
- `crates/kernel/src/evidence/bundle.rs` — safe `i32::try_from` for nanos
- `crates/evidence-collector/src/signing/local.rs` — ASN.1 OID validation in `decode_pem()` with 3+ unit tests

## Observability Impact

- **tracing::warn on PEM OID mismatch:** `decode_pem()` logs a warning when a 48-byte PKCS8 payload has an unrecognized OID, visible in structured logs (grep `unrecognized PKCS8`).
- **tracing::warn on negative timestamp nanos:** `bundle_timestamp()` in service.rs now returns 0 for negative nanos instead of wrapping; the `unwrap_or(0)` is a silent fail-safe (negative nanos is malformed proto input, rare).
- **Proto validation rejection:** `max_len = 0` causes buf.validate to reject non-empty deprecated fields at the gRPC layer — visible as validation errors in gRPC response status.
- **Inspection:** No new endpoints. Changes surface through existing gRPC error responses and structured log output.
