---
id: "25-01"
parent: "25"
milestone: v1.3
provides:
  - Zero-panic production Rust code with fallible constructors
  - Async-safe mutex usage throughout kernel and evidence-collector
  - gRPC input validation for kernel_id and timestamps
  - S3 WORM enforcement config flag
  - Credential redaction in startup logs
key_files:
  - crates/kernel/src/main.rs
  - crates/kernel/src/proxy/connect.rs
  - crates/kernel/src/proxy/relay.rs
  - crates/evidence-collector/src/main.rs
  - crates/evidence-collector/src/grpc/service.rs
key_decisions:
  - "All .expect()/.panic!() replaced with fallible Result returns"
  - "std::sync::Mutex replaced with tokio::sync::Mutex + spawn_blocking for I/O"
  - "kernel_id validated: 1-128 chars, [a-zA-Z0-9_-]"
  - "Strict timestamp rejection — no silent Utc::now() substitution"
duration: "1 session"
commit: b691106
---

# Phase 25, Task 1 — Summary

Eliminated all panic-prone patterns from production Rust code and fixed async safety issues. The kernel startup path, proxy relay, and evidence-collector gRPC service all previously used `.expect()` calls that could crash the process on malformed input.

## What Changed

- `InjectionDetector::new()` and `ContentInspector::new()` now return `Result` with descriptive errors
- `Response::builder().expect()` chains replaced with `json_response()` helpers that propagate errors
- Request-id header extraction no longer panics on missing values
- Review queue SQLite switched from `std::sync::Mutex` to `tokio::sync::Mutex` with `spawn_blocking` to prevent async executor starvation
- Signing key file watcher wraps blocking I/O in `spawn_blocking`
- Added explicit `inspect_response()` method and fixed relay direction bug
- Evidence-collector now validates kernel_id (1-128 chars, `[a-zA-Z0-9_-]`) and strictly rejects invalid timestamps
- ClickHouse database name sanitized, rejected bundles logged, credentials redacted from startup logs
- Added `require_object_lock` config flag for S3 WORM enforcement
