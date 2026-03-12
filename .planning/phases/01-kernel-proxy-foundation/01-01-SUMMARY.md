---
phase: 01-kernel-proxy-foundation
plan: 01
subsystem: kernel
tags: [rust, tokio, hyper, rustls, rcgen, tower, dashmap, jemalloc, toml, tracing]

requires:
  - phase: none
    provides: greenfield project
provides:
  - Rust workspace with kernel crate and all Phase 1 dependencies
  - TOML config loading with validation (proxy, TLS, pool, allowlist, logging)
  - TLS cert cache with DashMap and on-demand rcgen generation signed by deployment CA
  - Vendor allowlist Tower middleware (deny-by-default, exact domain match)
  - Request ID middleware with UUID v4 for structured log correlation
  - Structured JSON logging via tracing-subscriber
  - jemalloc global allocator
  - ProxyError enum with structured JSON error responses (403, 502, 503)
affects: [01-02, 01-03, all-future-phases]

tech-stack:
  added: [tokio, hyper, hyper-util, rustls, tokio-rustls, rcgen, tower, tower-http, dashmap, tracing, tracing-subscriber, serde, toml, thiserror, anyhow, tikv-jemallocator, uuid, bytes, http-body-util, serde_json]
  patterns: [tower-layer-service, dashmap-cert-cache, spawn-blocking-for-crypto, fail-closed-config]

key-files:
  created:
    - Cargo.toml
    - crates/kernel/Cargo.toml
    - crates/kernel/src/main.rs
    - crates/kernel/src/lib.rs
    - crates/kernel/src/config.rs
    - crates/kernel/src/error.rs
    - crates/kernel/src/logging.rs
    - crates/kernel/src/proxy/mod.rs
    - crates/kernel/src/proxy/tls.rs
    - crates/kernel/src/middleware/mod.rs
    - crates/kernel/src/middleware/allowlist.rs
    - crates/kernel/src/middleware/request_id.rs
    - interdict.toml
  modified: []

key-decisions:
  - "Used rcgen 0.13 with pem+x509-parser features for CA loading and on-demand cert generation"
  - "DashMap entry API for thundering-herd prevention on cert cache misses"
  - "spawn_blocking wraps CPU-bound cert generation to avoid blocking async runtime"
  - "extract_host made generic over body type for testability without Incoming::default()"
  - "Tower util feature added for ServiceExt in tests"

patterns-established:
  - "Tower Layer/Service pattern: AllowlistLayer wraps inner service, checks host before delegating"
  - "DashMap cert cache: get_or_create with entry API for thread-safe lazy generation"
  - "Structured JSON error responses: vendor_blocked_response (403), vendor_unreachable_response (502), backpressure_response (503)"
  - "KERN-13 compliance: zero unbounded channels, comment markers in main.rs and lib.rs"

requirements-completed: [KERN-01, KERN-09, KERN-13]

duration: ~45min
completed: 2026-02-26
---

# Plan 01-01: Kernel Foundation Summary

**Rust workspace with TLS cert cache (DashMap + rcgen), deny-by-default vendor allowlist Tower middleware, TOML config loading, and structured JSON logging with jemalloc allocator**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3
- **Files created:** 13

## Accomplishments
- Rust workspace with kernel crate compiles cleanly on edition 2024
- Config struct deserializes all TOML sections with serde defaults and file-existence validation
- TLS CertCache generates domain-specific certs signed by deployment CA, cached in DashMap with pre_warm support
- VendorAllowlist as Tower Layer/Service blocks non-approved domains with 403 JSON response
- RequestIdService generates UUID v4 per request for tracing span correlation
- 19 unit tests all passing, clippy clean with -D warnings

## Task Commits

1. **Task 1: Rust workspace, kernel crate, config, error types, logging** - `ced49bf`
2. **Task 2: TLS cert cache with DashMap and rcgen** - `a1e6aa5`
3. **Task 3: Vendor allowlist and request ID Tower middleware** - `ed0e20f`

## Files Created/Modified
- `Cargo.toml` - Workspace root with crates/kernel member
- `crates/kernel/Cargo.toml` - All Phase 1 dependencies pinned
- `crates/kernel/src/main.rs` - Entry point with jemalloc, config loading, CA loading, cert pre-warm
- `crates/kernel/src/config.rs` - Config struct with proxy/TLS/pool/allowlist/logging sections
- `crates/kernel/src/error.rs` - ProxyError enum with structured JSON error responses
- `crates/kernel/src/logging.rs` - JSON/pretty logging via tracing-subscriber
- `crates/kernel/src/proxy/tls.rs` - CertCache with DashMap, CA loading, on-demand cert generation
- `crates/kernel/src/middleware/allowlist.rs` - Tower Layer/Service for vendor allowlist
- `crates/kernel/src/middleware/request_id.rs` - UUID v4 request ID middleware
- `interdict.toml` - Example config with 4 AI vendor domains

## Decisions Made
- Used rcgen pem+x509-parser features for CA cert loading from PEM files
- DashMap entry API prevents thundering herd on concurrent cert cache misses
- spawn_blocking for cert generation avoids blocking tokio runtime
- Made extract_host generic over body type so tests don't need Incoming::default()

## Deviations from Plan

### Auto-fixed Issues

**1. [Clippy] Added is_empty() to CertCache**
- **Found during:** Post-Task 3 clippy run
- **Issue:** CertCache had `len()` but no `is_empty()`, clippy error with -D warnings
- **Fix:** Added `is_empty()` method delegating to DashMap
- **Committed in:** ed0e20f (Task 3 commit)

**2. [Compile] Fixed tests using Incoming::default() and ServiceExt**
- **Found during:** Task 3 test compilation
- **Issue:** `Incoming::default()` doesn't exist in hyper; `ServiceExt` needs tower `util` feature
- **Fix:** Made extract_host generic, used `()` body in tests, added `util` feature to tower, used direct `service.call()` instead of `.oneshot()`
- **Committed in:** ed0e20f (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 clippy, 1 compile)
**Impact on plan:** Both essential for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundation types exported and ready for Plan 01-02 (proxy service, relay, connection pool)
- CertCache, VendorAllowlist, Config, ProxyError all tested and available
- Tower service stack pattern established for composing middleware layers

---
*Phase: 01-kernel-proxy-foundation*
*Completed: 2026-02-26*
