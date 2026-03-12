# Phase 25: Rust Robustness & Async Safety — Research

**Date:** 2026-03-11

## Summary

The scan identified two systemic issues in the Rust codebase: panic-prone error handling and async-unsafe mutex usage. Both are production-risk patterns that could cause process crashes or deadlocks under load.

## Decisions

- All `.expect()` calls in non-test code replaced with `?` operator or explicit error handling
- `InjectionDetector::new()` and `ContentInspector::new()` now return `Result` instead of panicking
- `Response::builder().expect()` chains replaced with non-panicking `json_response()` helpers
- Review queue SQLite switched from `std::sync::Mutex` to `tokio::sync::Mutex` with `spawn_blocking`
- Signing key file watcher wraps blocking I/O in `spawn_blocking`
- `inspect_response()` added as explicit method; relay direction bug fixed
- kernel_id validated: 1-128 chars, `[a-zA-Z0-9_-]`
- Timestamps strictly rejected (no silent `Utc::now()` substitution)
- ClickHouse database name sanitized to prevent injection
- `require_object_lock` config flag added for S3 WORM enforcement
- Credentials redacted from ClickHouse URL in startup logs