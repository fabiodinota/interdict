---
id: T01
parent: S01
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

**# Plan 01-01: Kernel Foundation Summary**

## What Happened

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
