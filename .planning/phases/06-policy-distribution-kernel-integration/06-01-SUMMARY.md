---
phase: 06-policy-distribution-kernel-integration
plan: 01
subsystem: kernel
tags: [grpc, proto, arc-swap, hot-reload, hierarchy, session, dashmap, policy-distribution]

# Dependency graph
requires:
  - phase: 02-policy-engine-core
    provides: "RegorusPool, WasmEngine, PolicyConfig, VerdictAction, MergedVerdict"
  - phase: 05-control-plane-api-core
    provides: "Control plane API scaffold and policy management"
provides:
  - "PolicyDistribution gRPC proto (Subscribe/Acknowledge RPCs)"
  - "ArcSwap-based PolicySetManager for zero-downtime atomic policy swaps"
  - "Three-level HierarchyResolver (org/dept/team) with vendor filtering"
  - "Bounded SessionStore with slow-leak exfiltration detection"
  - "DistributionConfig with disconnect, session, and hierarchy settings"
  - "resolve_session_id for header-based and inferred session boundaries"
affects: [06-02-distribution-client, 06-03-control-plane-server, 06-04-integration-tests]

# Tech tracking
tech-stack:
  added: [arc-swap 1.7]
  patterns: [ArcSwap atomic swap for lock-free reads, DashMap bounded session store with LRU eviction, xDS-style gRPC server-streaming proto]

key-files:
  created:
    - proto/interdict/policy/v1/policy_distribution.proto
    - crates/kernel/src/policy/hot_reload.rs
    - crates/kernel/src/policy/hierarchy.rs
    - crates/kernel/src/policy/session.rs
    - crates/kernel/src/policy/distribution.rs
  modified:
    - crates/kernel/build.rs
    - crates/kernel/Cargo.toml
    - crates/kernel/src/policy/mod.rs
    - crates/kernel/src/config.rs

key-decisions:
  - "ArcSwap::store for atomic swap (not compare_and_swap) since distribution client is sole writer"
  - "HierarchyResolver distributes policies into org/dept/team buckets at construction; resolve gathers applicable at query time"
  - "SessionStore uses DashMap for lock-free concurrent access with Instant-based LRU eviction"
  - "resolve_session_id uses dual approach: explicit header when cooperative, sha256(user+vendor)+time_bucket when not"
  - "DetectionState tracks three escalation signals: diverse categories, high-volume redactions, cumulative risk score"

patterns-established:
  - "ArcSwap pattern: PolicySetManager wraps ArcSwap<PolicySet>, load() returns Guard for hot path, swap() for distribution client"
  - "Hierarchy bucket pattern: classify policies into org/dept/team at construction, gather at query time"
  - "Session boundary inference: header-first with deterministic fallback from identity+time window"

requirements-completed: [PLCY-06, PLCY-08, PLCY-10, KERN-10]

# Metrics
duration: 8m39s
completed: 2026-03-01
---

# Phase 6 Plan 01: Foundational Types Summary

**ArcSwap-based PolicySetManager, three-level HierarchyResolver, bounded SessionStore with slow-leak detection, and xDS-style PolicyDistribution gRPC proto**

## Performance

- **Duration:** 8m 39s
- **Started:** 2026-03-01T05:02:51Z
- **Completed:** 2026-03-01T05:11:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Proto schema defines PolicyDistribution service with Subscribe (server-streaming) and Acknowledge RPCs, PolicyEntry with Wasm bytes + Rego source + scope + fail mode
- PolicySetManager provides zero-downtime lock-free reads via ArcSwap Guard with atomic swap for the distribution client
- HierarchyResolver classifies policies into org/dept/team buckets and resolves applicable policies with vendor filtering
- SessionStore tracks multi-turn conversations with DashMap, TTL-based cleanup, LRU eviction, and three slow-leak escalation patterns
- DistributionConfig adds all distribution, hierarchy, and session settings to PolicyEngineConfig with serde defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Create proto schema + kernel hot-reload and hierarchy modules** - `bb4df1a` (feat)
2. **Task 2: Create bounded session context store** - `8b5e228` (feat)

## Files Created/Modified
- `proto/interdict/policy/v1/policy_distribution.proto` - gRPC service definition with Subscribe/Acknowledge RPCs
- `crates/kernel/src/policy/hot_reload.rs` - ArcSwap-based PolicySet and PolicySetManager (6 tests)
- `crates/kernel/src/policy/hierarchy.rs` - Three-level hierarchy resolver with vendor filtering (7 tests)
- `crates/kernel/src/policy/session.rs` - Bounded session store with slow-leak detection (18 tests)
- `crates/kernel/src/policy/distribution.rs` - Placeholder module for Plan 02
- `crates/kernel/src/policy/mod.rs` - Added hierarchy, hot_reload, session, distribution modules
- `crates/kernel/build.rs` - Added policy distribution proto to compilation
- `crates/kernel/Cargo.toml` - Added arc-swap 1.7 dependency
- `crates/kernel/src/config.rs` - Added DistributionConfig with all fields and defaults (2 tests)
- `Cargo.lock` - Updated with arc-swap

## Decisions Made
- ArcSwap::store used for atomic swap (not compare_and_swap) since the distribution client is the sole writer
- HierarchyResolver distributes policies into org/dept/team buckets at construction; resolve gathers applicable at query time
- SessionStore uses DashMap for lock-free concurrent access with Instant-based LRU eviction
- resolve_session_id uses dual approach: explicit header when cooperative, sha256(user+vendor)+time_bucket when not
- DetectionState tracks three escalation signals: diverse categories, high-volume redactions, cumulative risk score

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundational types ready for the distribution client (Plan 02)
- PolicySetManager ready to be driven by gRPC subscription client
- HierarchyResolver ready to be constructed from PolicyUpdate messages
- SessionStore ready to be integrated into request pipeline
- Proto stubs will be generated for both kernel (client) and control plane (server)

---
## Self-Check: PASSED

All 9 created/modified files verified present. Both task commits (bb4df1a, 8b5e228) verified in git log.

---
*Phase: 06-policy-distribution-kernel-integration*
*Completed: 2026-03-01*
