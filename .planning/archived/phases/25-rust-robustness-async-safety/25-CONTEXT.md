# Phase 25: Rust Robustness & Async Safety — Context

**Gathered:** 2026-03-11
**Status:** Complete

## Why This Phase

The v1.3 scan revealed panic-prone code in kernel startup, error handling, and proxy paths. Production Rust code used `.expect()` and `panic!()` where fallible returns were appropriate. Additionally, `std::sync::Mutex` was used around I/O in async contexts, risking deadlocks under tokio.

## Scope

- Replace all `.expect()`/`panic!()` in non-test production code with fallible constructors and `Result` returns
- Fix async safety: replace `std::sync::Mutex` with `tokio::sync::Mutex` + `spawn_blocking` for I/O
- Add input validation for gRPC endpoints (kernel_id, timestamps)
- Harden evidence-collector: rejected bundle logging, ClickHouse DB name sanitization
- Add S3 WORM enforcement config flag
- Redact credentials from startup logs
- Fix relay direction bug and request-id header panic

## Key Files

- `crates/kernel/src/main.rs`
- `crates/kernel/src/proxy/connect.rs`
- `crates/kernel/src/proxy/relay.rs`
- `crates/evidence-collector/src/main.rs`
- `crates/evidence-collector/src/grpc/service.rs`
