---
phase: 02-policy-engine
plan: 01
subsystem: policy
tags: [regorus, wasmtime, rego, wasm, verdict, policy-config, pooling-allocator]

requires:
  - phase: 01-kernel-proxy
    provides: "kernel crate structure, config system, error types, Cargo.toml base dependencies"
provides:
  - "VerdictAction enum (Allow/Redact/Block) with Ord for most-restrictive-wins merge"
  - "PolicyVerdict and MergedVerdict with merge logic (additive redaction union)"
  - "VerdictTrace for full pipeline audit trail"
  - "PolicyConfig (fail_mode, block_response_detail, redaction_direction)"
  - "PolicyEngineConfig in top-level Config with serde defaults"
  - "RegorusPool for concurrent Rego policy evaluation via spawn_blocking"
  - "WasmEngine with pooling allocator for bounded Wasm execution"
  - "PolicyBlocked error variant and policy_blocked_response helper"
affects: [02-policy-engine, 04-evidence-collector, 06-policy-distribution]

tech-stack:
  added: [regorus 0.9.1, wasmtime 42, tract-onnx 0.22.1, rusqlite 0.38, sha2 0.10, crossbeam-channel 0.5, crossbeam-queue 0.3, chrono 0.4]
  patterns: [engine-pool-with-semaphore, spawn-blocking-for-sync-eval, most-restrictive-wins-merge, pooling-allocator-bounded-memory]

key-files:
  created:
    - crates/kernel/src/policy/mod.rs
    - crates/kernel/src/policy/verdict.rs
    - crates/kernel/src/policy/config.rs
    - crates/kernel/src/policy/layer1/mod.rs
    - crates/kernel/src/policy/layer1/regorus.rs
    - crates/kernel/src/policy/wasm_engine.rs
  modified:
    - crates/kernel/Cargo.toml
    - crates/kernel/src/lib.rs
    - crates/kernel/src/config.rs
    - crates/kernel/src/error.rs
    - crates/kernel/src/proxy/connect.rs
    - crates/kernel/tests/integration_tests/helpers.rs
    - interdict.toml

key-decisions:
  - "Regorus arc feature enables Send+Sync Engine — allows direct pool across threads"
  - "Rego verdict parsed from JSON object with action/reason/redactions fields"
  - "WasmEngine wraps wasmtime::Engine — no Store creation at init, deferred to evaluation"
  - "PoolingAllocationConfig uses 1MB max_memory_size per slot to avoid 4GB virtual memory overhead"

patterns-established:
  - "Engine Pool: ArrayQueue<Engine> + Semaphore for bounded concurrency with spawn_blocking for sync evaluation"
  - "Verdict Merge: max(VerdictAction) for most-restrictive-wins, flat_map for additive redaction union"
  - "Fail Mode: FailClosed default_action() returns Block, FailOpen returns Allow — consistent error handling"

requirements-completed: [PLCY-01, PLCY-02, PLCY-03, PLCY-07, PLCY-09]

duration: 103min
completed: 2026-02-26
---

# Phase 2 Plan 1: Policy Engine Foundation Summary

**Verdict types with most-restrictive-wins merge, Regorus engine pool for Rego evaluation via spawn_blocking, and Wasmtime pooling allocator with bounded 1MB-per-slot memory**

## Performance

- **Duration:** 103 min
- **Started:** 2026-02-26T19:55:47Z
- **Completed:** 2026-02-26T21:38:51Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Verdict type system (Allow/Redact/Block) with Ord-based most-restrictive-wins merge and additive redaction union
- PolicyConfig supporting fail_mode, block_response_detail, and redaction_direction per CONTEXT.md locked decisions
- RegorusPool: pre-loaded engine pool with semaphore-bounded concurrency, spawn_blocking for sync eval, RAII engine return
- WasmEngine: Wasmtime pooling allocator with conservative 1MB memory per slot, 64 instance slots, cranelift optimization
- 12 new unit tests for verdict merge, policy config, Regorus evaluation, and Wasmtime initialization

## Task Commits

Each task was committed atomically:

1. **Task 1: Dependencies, policy config, verdict types with merge logic** - `4de1417` (feat)
2. **Task 2: Regorus engine pool and Wasmtime pooling allocator setup** - `f04f2e7` (feat)

## Files Created/Modified
- `crates/kernel/src/policy/mod.rs` - Policy module root with RequestContext, Direction, re-exports
- `crates/kernel/src/policy/verdict.rs` - VerdictAction, PolicyVerdict, MergedVerdict, VerdictTrace, ClassificationResult, HumanDecision
- `crates/kernel/src/policy/config.rs` - FailMode, BlockResponseDetail, RedactionDirection, PolicyConfig
- `crates/kernel/src/policy/layer1/mod.rs` - Layer 1 module root
- `crates/kernel/src/policy/layer1/regorus.rs` - RegorusPool with evaluate(), load_policy(), Rego verdict parsing
- `crates/kernel/src/policy/wasm_engine.rs` - WasmEngine with PoolingAllocationConfig, load_module(), deserialize_module()
- `crates/kernel/Cargo.toml` - Added regorus, wasmtime, tract-onnx, rusqlite, sha2, crossbeam, chrono, wat dependencies
- `crates/kernel/src/config.rs` - Added PolicyEngineConfig with pool/queue/timeout defaults
- `crates/kernel/src/error.rs` - Added PolicyEvaluation, PolicyBlocked variants and policy_blocked_response helper
- `crates/kernel/src/lib.rs` - Added `pub mod policy`
- `interdict.toml` - Added [policy] section with documented defaults

## Decisions Made
- Regorus `arc` feature maps `Rc` → `Arc`, making Engine Send+Sync for direct pool usage across threads
- Rego verdict JSON schema: `{action, reason?, redactions?}` parsed with get-by-key pattern using `regorus::Value::from(key)` as BTreeMap lookup key
- WasmEngine wraps `wasmtime::Engine` only — Store creation deferred to actual evaluation (Phase 5+ custom modules)
- Pooling allocator uses 1MB `max_memory_size` per slot (vs 4GB default) to avoid virtual memory exhaustion (Pitfall 1)
- `uuid` crate upgraded to include `serde` feature for VerdictTrace serialization
- `wat` crate added as dev-dependency for Wasm module tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added uuid serde feature**
- **Found during:** Task 1 (verdict types)
- **Issue:** uuid::Uuid in VerdictTrace needed Serialize/Deserialize, but uuid crate lacked serde feature
- **Fix:** Added `serde` to uuid features: `uuid = { version = "1", features = ["v4", "serde"] }`
- **Files modified:** crates/kernel/Cargo.toml
- **Verification:** Build succeeds, VerdictTrace serialization test passes
- **Committed in:** 4de1417

**2. [Rule 3 - Blocking] Fixed existing Config struct constructors**
- **Found during:** Task 1 (adding PolicyEngineConfig to Config)
- **Issue:** Two existing test helpers in connect.rs and helpers.rs construct Config manually, missing new `policy` field
- **Fix:** Added `policy: PolicyEngineConfig::default()` to both constructors
- **Files modified:** crates/kernel/src/proxy/connect.rs, crates/kernel/tests/integration_tests/helpers.rs
- **Verification:** All 16 integration tests pass
- **Committed in:** 4de1417

**3. [Rule 1 - Bug] Fixed clippy derivable_impls warnings**
- **Found during:** Task 1 (policy config enums)
- **Issue:** Manual Default impls for FailMode, BlockResponseDetail, RedactionDirection could use `#[derive(Default)]` + `#[default]`
- **Fix:** Replaced manual Default impls with derive macros and `#[default]` attributes
- **Files modified:** crates/kernel/src/policy/config.rs
- **Verification:** clippy clean
- **Committed in:** 4de1417

**4. [Rule 3 - Blocking] Adapted to regorus Value API (Result-based, not Option-based)**
- **Found during:** Task 2 (Rego verdict parsing)
- **Issue:** regorus::Value methods (`as_object`, `as_string`, `as_array`) return `Result`, not `Option`. Value lookup uses `BTreeMap<Value, Value>`, not string keys
- **Fix:** Rewrote parse_rego_verdict to use `value.as_object().ok()`, `Value::from(key)` for BTreeMap lookup
- **Files modified:** crates/kernel/src/policy/layer1/regorus.rs
- **Verification:** All 5 regorus tests pass
- **Committed in:** f04f2e7

**5. [Rule 3 - Blocking] Added wat dev-dependency for Wasm tests**
- **Found during:** Task 2 (wasm_engine tests)
- **Issue:** `wat::parse_str` used in tests but `wat` crate not in dev-dependencies
- **Fix:** Added `wat = "1"` to dev-dependencies
- **Files modified:** crates/kernel/Cargo.toml
- **Verification:** All wasm_engine tests pass
- **Committed in:** f04f2e7

---

**Total deviations:** 5 auto-fixed (2 blocking, 1 bug, 2 blocking)
**Impact on plan:** All fixes necessary for compilation and correctness. No scope creep.

## Issues Encountered
None — all issues were routine API adaptation resolved through deviation rules.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Policy engine foundation complete: verdict types, config, Regorus pool, Wasmtime engine
- Ready for Plan 02 (allowlist refactoring as policy verdict)
- Layer 2 classifier and Layer 3 review queue build on these types in Plans 03-04

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (4de1417, f04f2e7) verified in git history.

---
*Phase: 02-policy-engine*
*Completed: 2026-02-26*
