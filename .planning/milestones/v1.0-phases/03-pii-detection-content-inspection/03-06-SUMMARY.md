---
phase: 03-pii-detection-content-inspection
plan: 06
subsystem: proxy
tags: [content-inspection, connect-tunnel, relay, tls-split, tokio-select]

# Dependency graph
requires:
  - phase: 03-pii-detection-content-inspection
    provides: "ContentInspector with inspect_request() (plans 01-05)"
  - phase: 01-proxy-core
    provides: "CONNECT tunnel handler, bidirectional relay, TLS interception"
provides:
  - "inspecting_relay_outbound function in relay module for unidirectional byte-level inspection"
  - "ContentInspector wired into CONNECT tunnel spawned task via tokio::io::split"
  - "Block verdict severs tunnel, Redact forwards modified content, Allow passes through"
affects: [phase-06-http-body-parsing, phase-03-complete]

# Tech tracking
tech-stack:
  added: []
  patterns: ["tokio::io::split for per-direction relay with inspection", "tokio::select! for concurrent relay with early termination on block"]

key-files:
  created: []
  modified:
    - "crates/kernel/src/proxy/relay.rs"
    - "crates/kernel/src/proxy/connect.rs"

key-decisions:
  - "Split TLS streams with tokio::io::split for per-direction relay (outbound inspected, inbound raw copy)"
  - "Chunk-level inspection sufficient for Phase 3; cross-chunk detection deferred to streaming response path"
  - "tokio::select! terminates both directions when outbound is blocked"

patterns-established:
  - "inspecting_relay_outbound: generic unidirectional relay with ContentInspector for any AsyncRead+AsyncWrite pair"
  - "Conditional relay: inspector present uses split+select, absent uses zero-copy bidirectional"

requirements-completed: [PII-01, PII-02, PII-03]

# Metrics
duration: 7min
completed: 2026-02-27
---

# Phase 3 Plan 6: CONNECT Tunnel Content Inspection Wiring Summary

**ContentInspector.inspect_request() wired into CONNECT tunnel relay via tokio::io::split, enabling outbound prompt inspection with block/redact/allow enforcement in the proxy hot path**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-27T20:49:29Z
- **Completed:** 2026-02-27T20:56:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `inspecting_relay_outbound` function to relay module for unidirectional byte-level content inspection
- Wired ContentInspector into handle_connect spawned task using tokio::io::split for per-direction relay
- Block verdict severs the CONNECT tunnel immediately; Redact forwards modified content; Allow passes through
- Removed #[allow(dead_code)] from content_inspector field -- it is now actively used
- All 164 lib tests + 31 integration tests pass, zero clippy warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: Add inspecting_relay_outbound to relay.rs** - `1a28613` (feat)
2. **Task 2: Wire content_inspector into handle_connect spawned task** - `cbe3cde` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `crates/kernel/src/proxy/relay.rs` - Added inspecting_relay_outbound function with block/redact/allow handling and 2 unit tests
- `crates/kernel/src/proxy/connect.rs` - Wired content_inspector into handle_connect, split TLS streams for per-direction relay, updated doc comments

## Decisions Made
- Split TLS streams with tokio::io::split for per-direction relay (outbound inspected, inbound raw copy) -- allows ContentInspector to inspect only outbound prompts while inbound responses use raw copy
- Chunk-level inspection sufficient for Phase 3 outbound direction; AdaptiveTokenBuffer in InspectingRelay handles cross-chunk detection for streaming responses
- tokio::select! terminates both relay directions when outbound is blocked, preventing data leakage after policy violation
- Added test for both allow and block paths in inspecting_relay_outbound to validate enforcement behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added block test for inspecting_relay_outbound**
- **Found during:** Task 1 (relay.rs implementation)
- **Issue:** Plan only specified allow test; block path needed verification too
- **Fix:** Added test_inspecting_relay_outbound_block test with AWS_KEY pattern
- **Files modified:** crates/kernel/src/proxy/relay.rs
- **Verification:** Test passes, confirms block returns Err and no data forwarded
- **Committed in:** 1a28613 (Task 1 commit)

**2. [Rule 1 - Bug] Simplified relay cleanup on block with shutdown instead of timer**
- **Found during:** Task 2 (connect.rs wiring)
- **Issue:** Plan suggested tokio::time::timeout(100ms, inbound_future) for cleanup which is fragile; shutdown is cleaner
- **Fix:** Used client_write.shutdown() to signal EOF to inbound instead of arbitrary 100ms wait
- **Files modified:** crates/kernel/src/proxy/connect.rs
- **Verification:** All 6 connect tests pass, clippy clean
- **Committed in:** cbe3cde (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical test, 1 bug fix in cleanup logic)
**Impact on plan:** Both auto-fixes improve correctness and test coverage. No scope creep.

## Issues Encountered
None - implementation followed plan structure closely.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 gap closure complete: ContentInspector is fully wired into the CONNECT tunnel hot path
- Outbound prompts are now inspected at the byte-chunk level before reaching AI vendors
- Phase 6 (HTTP body parsing) will add structured JSON inspection for richer content analysis
- All Phase 3 success criteria (SC1-SC5) are now implemented and verified

## Self-Check: PASSED

- relay.rs: FOUND
- connect.rs: FOUND
- 03-06-SUMMARY.md: FOUND
- Commit 1a28613: FOUND
- Commit cbe3cde: FOUND

---
*Phase: 03-pii-detection-content-inspection*
*Completed: 2026-02-27*
