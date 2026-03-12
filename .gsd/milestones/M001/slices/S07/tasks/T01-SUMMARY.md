---
id: T01
parent: S07
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

**# Phase 6.1 Plan 01: Kernel Integration Wiring Summary**

## What Happened

# Phase 6.1 Plan 01: Kernel Integration Wiring Summary

**ContentInspector wired into main.rs with default patterns, live PolicySet enforcement via with_live_set() in ProxyService.call(), entrypoint fix for distributed Rego policies, and 3 integration tests proving PII inspection and hot-reload enforcement through the running proxy**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-01T15:35:41Z
- **Completed:** 2026-03-01T15:47:23Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Closed INT-01: ContentInspector instantiated with PatternRegistry::default_patterns() in main.rs and wired into ProxyService via .with_content_inspector() -- PII detection is now active at runtime
- Closed INT-02: ProxyService.call() builds effective_pipeline from live PolicySet when PolicySetManager has version > 0, replacing debug-only logging with actual enforcement
- Fixed entrypoint derivation bug: distributed policies now use explicit entrypoint from proto instead of rsplit('/') on inline Rego source
- Added PolicyPipeline.with_live_set() for request-scoped pipeline creation sharing L2/L3/redaction resources
- 3 integration tests prove the wiring is active at runtime (not just compiled)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire ContentInspector + PolicySet enforcement + entrypoint fix** - `8ea74d3` (feat)
2. **Task 2: Integration tests proving PII redaction and hot-reload enforcement** - `5568a8d` (test)

## Files Created/Modified
- `crates/kernel/src/policy/config.rs` - Added entrypoint: Option<String> field for distributed policy rule paths
- `crates/kernel/src/policy/mod.rs` - Added with_live_set() method and entrypoint-aware evaluate()
- `crates/kernel/src/policy/distribution/snapshot.rs` - Populates entrypoint from proto entry.entrypoint
- `crates/kernel/src/main.rs` - ContentInspector instantiation with default patterns, chained .with_content_inspector()
- `crates/kernel/src/proxy/connect.rs` - effective_pipeline from live PolicySet when PSM version > 0
- `crates/kernel/tests/integration_tests/helpers.rs` - TestProxyConfig extended with content_inspector and policy_set_manager
- `crates/kernel/tests/integration_tests/wiring.rs` - 3 integration tests (PII inspection, negative control, hot-reload enforcement)
- `crates/kernel/tests/integration_tests/main.rs` - Added wiring module
- `crates/kernel/src/proxy/relay.rs` - entrypoint field in test PolicyConfig literals
- `crates/kernel/src/policy/content_inspection.rs` - entrypoint field in test PolicyConfig literals
- `crates/kernel/src/policy/hierarchy.rs` - entrypoint field in test PolicyConfig literals
- `crates/kernel/tests/content_inspection_test.rs` - entrypoint field in test PolicyConfig literals
- `crates/kernel/tests/distribution_test.rs` - entrypoint field in test PolicyConfig literals
- `crates/kernel/tests/integration_tests/policy_pipeline.rs` - entrypoint field in test PolicyConfig literals
- `crates/kernel/benches/pattern_matching.rs` - entrypoint field in bench PolicyConfig literal

## Decisions Made
- entrypoint field on PolicyConfig: optional String used by evaluate() for distributed policies, falls back to rsplit derivation for filesystem policies (backward compatible)
- with_live_set() shares L2/L3/redaction/allowlist but not BackgroundL2 (not Clone, analytics-only -- acceptable per research open question 1)
- effective_pipeline in call(): version > 0 AND policies non-empty triggers live set; otherwise static fallback preserves backward compatibility
- TestProxy with_config() uses ProxyService::with_distribution() when PSM is provided, creates minimal pipeline with stub classifier

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed clippy manual_map lint in connect.rs**
- **Found during:** Task 1 (verify step)
- **Issue:** match on pipeline Option flagged by clippy as manual implementation of Option::map
- **Fix:** Replaced match with pipeline.as_ref().map(|base| Arc::new(base.with_live_set(&current)))
- **Files modified:** crates/kernel/src/proxy/connect.rs
- **Verification:** cargo clippy -p kernel --all-targets -- -D warnings passes
- **Committed in:** 8ea74d3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial clippy fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v1.0 milestone gaps INT-01 and INT-02 are now closed with test evidence
- FLOW-01 and FLOW-02 (end-to-end policy flow) validated via hot-reload enforcement test
- ContentInspector is active in the running binary -- PII detection happens on every CONNECT tunnel
- Hot-reloaded policies from distribution client now actually drive enforcement
- Ready for Phase 7 (Identity, Access & Security) or v1.0 milestone completion

## Self-Check: PASSED

All key files verified present. Both task commits (8ea74d3, 5568a8d) verified in git log. All 354+ workspace tests pass. Clippy clean with -D warnings. Format check passes.

---
*Phase: 06.1-kernel-integration-wiring*
*Completed: 2026-03-01*
