---
id: S01
milestone: M007
status: ready
---

# S01: Hot-Path Relay Testing — Context

## Goal

Bring the most critical untested code paths — proxy relay, streaming relay, and TLS — from 0% to ≥80% line coverage with meaningful unit and integration tests.

## Why this Slice

The 2026-03-14 assessment identified proxy/relay.rs (~730 lines) and proxy/streaming_relay.rs (~480 lines) as having zero test coverage. These are the most critical hot-path modules — every HTTP request flows through them. This is the highest-risk gap in the codebase and must be addressed first to establish test patterns for subsequent slices.

## Scope

### In Scope

- Unit tests for `crates/kernel/src/proxy/relay.rs`: bidirectional relay, connection reset handling, client disconnect, cross-chunk pattern detection (256-byte overlap), zero-copy verification, timeout behavior, large payload relay
- Unit tests for `crates/kernel/src/proxy/streaming_relay.rs`: bidirectional streaming copy, evidence collection callback, partial writes, buffer backpressure, connection termination propagation, error in evidence callback handling, concurrent readers/writers
- Unit tests for `crates/kernel/src/proxy/tls.rs`: TLS establishment, handshake failure, certificate validation (webpki_roots), mTLS, expired certificate rejection
- Integration test (`crates/kernel/tests/relay_integration_test.rs`): mock upstream HTTPS server → kernel proxy → verify request/response integrity, evidence events, cross-chunk PII detection

### Out of Scope

- Tests for non-proxy modules (covered in S02 and S04)
- Performance benchmarking of relay code (covered in S05)
- Changes to relay implementation (test-only slice)

## Constraints

- Must use tokio test runtime for async tests
- Mock upstream servers must be lightweight (no real HTTP server dependency)
- Tests must pass with `--test-threads=1` for deterministic ordering where needed
- Must not introduce test-only dependencies that bloat the kernel binary

## Integration Points

### Consumes

- `crates/kernel/src/proxy/relay.rs` — the relay module under test
- `crates/kernel/src/proxy/streaming_relay.rs` — the streaming relay module under test
- `crates/kernel/src/proxy/tls.rs` — the TLS module under test
- `crates/kernel/src/proxy/connect.rs` — ProxyService that orchestrates relay

### Produces

- `crates/kernel/src/proxy/relay.rs` — inline `#[cfg(test)] mod tests` block
- `crates/kernel/src/proxy/streaming_relay.rs` — inline `#[cfg(test)] mod tests` block
- `crates/kernel/src/proxy/tls.rs` — inline `#[cfg(test)] mod tests` block
- `crates/kernel/tests/relay_integration_test.rs` — integration test file
- Established async relay mock patterns reusable by S04

## Open Questions

- Relay internal visibility — some relay functions may be private; may need `pub(crate)` or test helpers to exercise them
- Mock complexity — cross-chunk pattern detection with 256-byte overlap may require carefully crafted test payloads
- TLS test certificates — need to generate test CA + server cert for TLS tests; may use `rcgen` crate
