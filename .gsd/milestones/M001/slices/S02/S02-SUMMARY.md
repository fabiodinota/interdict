---
id: S02
parent: M001
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
# S02: Policy Engine

**# Phase 2 Plan 1: Policy Engine Foundation Summary**

## What Happened

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

# Phase 2 Plan 2: Policy Primitives Summary

**Vendor allowlist as L1 policy verdict, redaction engine with SHA-256 hashing and category-tagged placeholders, and tract-ONNX classifier with bounded background dispatch**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-26T21:42:05Z
- **Completed:** 2026-02-26T21:49:56Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Vendor allowlist refactored from standalone middleware to L1 policy returning PolicyVerdict (Block/Allow)
- Redaction engine applying category-tagged placeholders ([REDACTED:SSN], [REDACTED:EMAIL]) with SHA-256 hash of original content computed before any modification
- Tract-ONNX classifier interface with load() for real models and stub() for testing, including mandatory 'uncertain' output class
- BackgroundL2 dispatcher using bounded crossbeam channels and OS worker threads for non-blocking analytics enrichment

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor allowlist as L1 policy and redaction engine** - `11eeebc` (feat)
2. **Task 2: Layer 2 NLP classifier with tract-onnx and background dispatch** - `489547c` (feat)

## Files Created/Modified
- `crates/kernel/src/policy/layer1/allowlist.rs` - VendorAllowlistPolicy wrapping VendorAllowlist, returning PolicyVerdict
- `crates/kernel/src/policy/redaction.rs` - RedactionEngine with SHA-256 hashing and regex-based category-tagged replacement
- `crates/kernel/src/policy/layer2/mod.rs` - Layer 2 module root
- `crates/kernel/src/policy/layer2/classifier.rs` - Classifier with load/stub/classify, BackgroundL2 with bounded dispatch
- `crates/kernel/src/policy/layer1/mod.rs` - Added `pub mod allowlist`
- `crates/kernel/src/policy/mod.rs` - Added `pub mod layer2`
- `crates/kernel/src/middleware/allowlist.rs` - Added dual-check design documentation
- `crates/kernel/Cargo.toml` - Added `regex = "1"` dependency

## Decisions Made
- **Dual-check design:** Middleware fast-path runs before TLS tunnel (avoids TLS cost for blocked vendors), policy pipeline also checks for audit trail completeness. Both share the same VendorAllowlist domain type.
- **Stub classifier for testing:** No real ONNX model exists yet. Classifier::stub() always returns a configured label with 1.0 confidence, enabling full API testing without a model file.
- **Best-effort background dispatch:** BackgroundL2 uses try_send on bounded crossbeam channel — if queue is full, classification request is dropped with a warning log. This prevents blocking the hot path for non-critical analytics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tract-onnx TValue tensor conversion**
- **Found during:** Task 2 (classifier implementation)
- **Issue:** `tract_ndarray::Array2.into()` doesn't directly convert to `TValue`. Must go through `Tensor` first: `Array2 → Tensor → TValue`.
- **Fix:** Added explicit `Tensor` type annotation and `.into()` chain for proper conversion
- **Files modified:** crates/kernel/src/policy/layer2/classifier.rs
- **Verification:** Build succeeds, classifier compiles
- **Committed in:** 489547c

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** API adaptation for tract-onnx types. No scope creep.

## Issues Encountered
None — all issues were routine API adaptation.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Policy primitives complete: L1 allowlist policy, redaction engine, L2 classifier
- Ready for Plan 03 (Layer 3 human review queue with connection hold)
- Plan 04 (pipeline orchestrator) will compose these primitives into the full 3-layer flow

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (11eeebc, 489547c) verified in git history.

---
*Phase: 02-policy-engine*
*Completed: 2026-02-26*

# Phase 2 Plan 3: Layer 3 Human Review Queue Summary

**SQLite-backed review queue with oneshot-channel connection hold, semaphore-based concurrency limit (max 50), and configurable timeout with fail-mode fallback**

## Performance

- **Duration:** 78 min
- **Started:** 2026-02-26T21:42:15Z
- **Completed:** 2026-02-26T23:01:12Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ReviewQueueStore with WAL-mode SQLite: enqueue, get_pending, get_by_request_id, submit_verdict, expire_timed_out, cleanup_old
- ReviewQueue with oneshot-channel connection hold: escalate blocks until human verdict or timeout
- Semaphore-based concurrent L3 limit prevents proxy resource exhaustion (Pitfall 6)
- Fail-mode applied on timeout: FailClosed→Block, FailOpen→Allow (PLCY-09)
- 12 unit tests covering store CRUD, connection hold, timeout, concurrency limit, persistence

## Task Commits

Each task was committed atomically:

1. **Task 1: SQLite review queue store with WAL mode and schema** - `f941615` (feat)
   - Fix: `7c41aab` — re-add layer3 module overwritten by 02-02, wrap Connection in Mutex
2. **Task 2: Review queue with connection hold, timeout, and concurrency limit** - `2d4e4a0` (feat)

## Files Created/Modified
- `crates/kernel/src/policy/layer3/mod.rs` - Layer 3 module root with queue and store submodules
- `crates/kernel/src/policy/layer3/store.rs` - SQLite persistence with WAL mode, Mutex<Connection> for Send+Sync
- `crates/kernel/src/policy/layer3/queue.rs` - ReviewQueue with oneshot hold, semaphore limit, DashMap pending tracking
- `crates/kernel/src/policy/mod.rs` - Added `pub mod layer3`

## Decisions Made
- Wrapped `rusqlite::Connection` in `std::sync::Mutex` to satisfy Send+Sync for `Arc<ReviewQueueStore>` sharing across tokio tasks — rusqlite's RefCell-based internals aren't Sync
- Used `Semaphore::try_acquire` (non-blocking) instead of blocking acquire — at capacity, immediately return fail-mode rather than queuing more requests
- DashMap for pending request tracking — lock-free concurrent access from both escalate (insert/remove) and submit_verdict (remove/send)
- Store `expire_timed_out` called during individual timeout handling — also useful for periodic batch cleanup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-added layer3 module declaration overwritten by 02-02**
- **Found during:** Task 1 verification (tests not compiling)
- **Issue:** Plan 02-02 modified `policy/mod.rs` to add `pub mod layer2`, overwriting the `pub mod layer3` addition from Task 1
- **Fix:** Re-added `pub mod layer3;` to `policy/mod.rs`
- **Files modified:** crates/kernel/src/policy/mod.rs
- **Verification:** Build succeeds, all tests visible
- **Committed in:** 7c41aab

**2. [Rule 1 - Bug] Wrapped rusqlite Connection in Mutex for Send+Sync**
- **Found during:** Task 2 (queue tests using tokio::spawn require Send)
- **Issue:** `rusqlite::Connection` wraps `RefCell<InnerConnection>` which is not Sync, so `Arc<ReviewQueueStore>` couldn't be shared across async tasks
- **Fix:** Wrapped `Connection` in `std::sync::Mutex`, added lock acquisition in all store methods
- **Files modified:** crates/kernel/src/policy/layer3/store.rs
- **Verification:** All 12 tests pass, clippy clean
- **Committed in:** 7c41aab

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct multi-threaded operation. No scope creep.

## Issues Encountered
None — deviations were routine thread-safety and module declaration fixes.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Layer 3 review queue complete with persistence, connection hold, and fail-mode timeout
- Ready for Plan 02-04 (remaining policy engine integration)
- Dashboard integration (Phase 8/9) can query SQLite directly via ReviewQueueStore

## Self-Check: PASSED

All 3 created files verified on disk. All 3 task commits (f941615, 7c41aab, 2d4e4a0) verified in git history.

---
*Phase: 02-policy-engine*
*Completed: 2026-02-26*

# Phase 2 Plan 4: Policy Pipeline & Proxy Integration Summary

**3-layer policy pipeline (L1 Rego → L2 NLP → L3 human review) with proxy CONNECT integration, verdict merge, and 9 integration tests proving all Phase 2 success criteria**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T23:04:43Z
- **Completed:** 2026-02-26T23:13:34Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- PolicyPipeline orchestrator implementing complete L1→L2→L3 flow with most-restrictive-wins verdict merge
- Proxy CONNECT handler evaluates pipeline before establishing tunnel (Block → 403, Allow/Redact → proceed)
- main.rs initializes full pipeline at startup: WasmEngine, RegorusPool, Classifier, BackgroundL2, ReviewQueue, RedactionEngine
- 7 unit tests proving pipeline orchestration logic (block, allow+bg_l2, escalation, fail-modes, no-short-circuit)
- 9 integration tests proving all 5 Phase 2 success criteria end-to-end

## Task Commits

Each task was committed atomically:

1. **Task 1: Pipeline orchestrator with 3-layer evaluation and proxy integration** - `31b88c0` (feat)
2. **Task 2: Integration tests proving Phase 2 success criteria** - `bd52fc1` (test)

## Files Created/Modified
- `crates/kernel/src/policy/mod.rs` - PolicyPipeline struct, evaluate() method, PipelineResult, build_rego_input(), extract_features(), 7 unit tests
- `crates/kernel/src/proxy/connect.rs` - Pipeline evaluation before tunnel, ProxyService::with_pipeline(), 403 on Block
- `crates/kernel/src/main.rs` - Full pipeline initialization at startup (WasmEngine, RegorusPool, Classifier, BackgroundL2, ReviewQueue, RedactionEngine)
- `crates/kernel/tests/integration_tests/policy_pipeline.rs` - 9 integration tests proving all Phase 2 success criteria
- `crates/kernel/tests/integration_tests/main.rs` - Added policy_pipeline module

## Decisions Made
- Pipeline evaluates all matching policies without short-circuit for complete audit trail
- Proxy evaluates on CONNECT metadata (vendor/path/method) only — content-level inspection deferred to Phase 3
- ProxyService::with_pipeline allows pipeline injection while maintaining backward compatibility (ProxyService::new still works without pipeline)
- "No match" detection uses Allow + no reason as the signal for escalation to L2
- Background L2 dispatched as fire-and-forget when any policy has background_l2 enabled and L1 gives explicit verdict

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 complete — all 5 success criteria have passing integration tests
- Policy pipeline is wired into proxy and ready for traffic
- Phase 3 (Content Inspection) can build on the pipeline's PipelineResult for sliding window content-level evaluation
- Rego policies can be loaded from the configured policies_dir at startup
- L2 model swap from stub to real ONNX model requires only providing l2_model_path in config

---
*Phase: 02-policy-engine*
*Completed: 2026-02-26*
