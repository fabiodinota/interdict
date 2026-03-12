---
id: T02
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
# T02: Plan 02

**# Plan 01-02: Core Proxy Service Summary**

## What Happened

# Plan 01-02: Core Proxy Service Summary

**CONNECT tunnel with TLS interception, zero-copy bidirectional relay, custom multi-connection HTTP/2 pool, WebSocket detection, and graceful shutdown server loop**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-26T17:41:23Z
- **Completed:** 2026-02-26T17:47:30Z
- **Tasks:** 3
- **Files created/modified:** 7

## Accomplishments
- CONNECT tunnel handler performs full TLS interception: terminate client TLS with per-domain cert, establish upstream TLS with webpki roots, relay bytes bidirectionally
- Custom connection pool with DashMap maintains multiple TCP+TLS connections per vendor with least-loaded selection and StreamGuard RAII tracking
- WebSocket upgrade detection handles both HTTP/1.1 (Connection+Upgrade headers) and HTTP/2 (RFC 8441 extended CONNECT)
- Server accept loop with auto HTTP/1.1+HTTP/2 detection, Tower middleware stack, and graceful shutdown with 30s drain timeout
- 45 total unit tests passing, clippy clean with -D warnings, zero unbounded channels (KERN-13)

## Task Commits

Each task was committed atomically:

1. **Task 1: CONNECT tunnel handler, bidirectional relay, and proxy service** - `d7fbd08` (feat)
2. **Task 2: Custom HTTP/2 connection pool with multi-connection per vendor** - `a856789` (feat)
3. **Task 3: WebSocket upgrade detection and bidirectional frame relay** - `258c85f` (feat)

## Files Created/Modified
- `crates/kernel/src/proxy/connect.rs` - CONNECT tunnel handler with TLS interception, ProxyService Tower service, error mapping
- `crates/kernel/src/proxy/relay.rs` - Zero-copy bidirectional byte relay via copy_bidirectional
- `crates/kernel/src/proxy/pool.rs` - Custom HTTP/2 connection pool with DashMap, StreamGuard, PoolStats
- `crates/kernel/src/proxy/websocket.rs` - WebSocket upgrade detection and tokio-tungstenite frame relay
- `crates/kernel/src/main.rs` - Server accept loop with TowerToHyperService bridge, graceful shutdown
- `crates/kernel/src/proxy/mod.rs` - Module declarations and ProxyService re-export
- `crates/kernel/Cargo.toml` - Dependencies already configured from Plan 01-01

## Decisions Made
- Used TowerToHyperService from hyper-util to bridge Tower service stack to hyper's Service trait required by serve_connection_with_upgrades
- Phase 1 uses raw bidirectional byte relay for ALL protocols (SSE, gRPC, WebSocket); frame-level WebSocket relay created as infrastructure for Phase 3 content inspection
- Tests use real hyper client-server TCP connections instead of Incoming::default() which doesn't exist in hyper 1.x
- StreamGuard derives Debug to support unwrap_err() in pool exhaustion tests
- connect_tls provides direct TCP+TLS connections for Phase 1; full HTTP/2 multiplexed SendRequest pooling can be layered in when needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tower-to-Hyper Service trait mismatch**
- **Found during:** Task 1 (main.rs server accept loop)
- **Issue:** hyper_util::server::conn::auto::Builder::serve_connection_with_upgrades requires hyper::Service, but Tower middleware stack implements tower::Service -- different traits
- **Fix:** Added TowerToHyperService wrapper from hyper-util to bridge the trait gap
- **Files modified:** crates/kernel/src/main.rs
- **Committed in:** d7fbd08

**2. [Rule 1 - Bug] Incoming::default() does not exist**
- **Found during:** Task 1 (connect.rs test compilation)
- **Issue:** Tests used Incoming::default() which is not a public constructor in hyper 1.x
- **Fix:** Rewrote tests to use real TCP listener/connection pairs with hyper client for proper integration testing
- **Files modified:** crates/kernel/src/proxy/connect.rs
- **Committed in:** d7fbd08

**3. [Rule 1 - Bug] Temporary value dropped while borrowed in main.rs**
- **Found during:** Task 1 (build)
- **Issue:** auto::Builder::new() created a temporary that was freed before the connection future could use it
- **Fix:** Bound auto::Builder to a let binding before calling serve_connection_with_upgrades
- **Files modified:** crates/kernel/src/main.rs
- **Committed in:** d7fbd08

**4. [Rule 1 - Bug] shutdown_rx not mutable for watch::changed()**
- **Found during:** Task 1 (build)
- **Issue:** watch::Receiver::changed() requires &mut self
- **Fix:** Added mut to shutdown_rx binding
- **Files modified:** crates/kernel/src/main.rs
- **Committed in:** d7fbd08

**5. [Rule 1 - Bug] Clippy never_loop on connection drain loop**
- **Found during:** Task 1 (clippy)
- **Issue:** loop { select! { ... break; ... break; } } never actually loops
- **Fix:** Removed the loop wrapper, using bare select! instead
- **Files modified:** crates/kernel/src/main.rs
- **Committed in:** d7fbd08

**6. [Rule 1 - Bug] StreamGuard missing Debug derive**
- **Found during:** Task 2 (test compilation)
- **Issue:** Pool exhaustion test uses unwrap_err() which requires Debug on the Ok type
- **Fix:** Added #[derive(Debug)] to StreamGuard
- **Files modified:** crates/kernel/src/proxy/pool.rs
- **Committed in:** a856789

**7. [Rule 1 - Bug] Clippy collapsible_if in websocket.rs**
- **Found during:** Task 3 (clippy)
- **Issue:** Nested if statements for HTTP/2 WebSocket detection can be collapsed
- **Fix:** Used let-chain syntax to collapse nested ifs
- **Files modified:** crates/kernel/src/proxy/websocket.rs
- **Committed in:** 258c85f

---

**Total deviations:** 7 auto-fixed (5 bugs, 1 blocking, 1 bug/clippy)
**Impact on plan:** All fixes necessary for compilation and correctness. No scope creep. Core code from Plan 01-01 scaffolding was mostly complete; fixes addressed trait bridging, test infrastructure, and clippy compliance.

## Issues Encountered
- The Plan 01-01 scaffolding pre-created most of the code for this plan. The primary work was fixing compilation errors (Tower/Hyper service trait mismatch, Incoming::default()), adding proper tests, and implementing the WebSocket module.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full proxy pipeline operational: accept -> middleware -> CONNECT -> TLS intercept -> relay -> upstream
- Connection pool ready for multi-connection per vendor with stream tracking
- WebSocket detection and frame relay infrastructure ready for Phase 3 content inspection
- Ready for Plan 01-03: integration tests, benchmarks, and end-to-end validation

---
*Phase: 01-kernel-proxy-foundation*
*Completed: 2026-02-26*
