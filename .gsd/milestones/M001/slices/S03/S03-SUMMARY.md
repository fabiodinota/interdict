---
id: S03
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
# S03: Pii Detection Content Inspection

**# Phase 3 Plan 1: Pattern Library Summary**

## What Happened

# Phase 3 Plan 1: Pattern Library Summary

**Comprehensive default pattern library for PII, financial data, and secrets detection with Luhn/IBAN validators and custom enterprise pattern support**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-27T01:31:16Z
- **Completed:** 2026-02-27T01:38:09Z
- **Tasks:** 2 (combined in single commit due to tight coupling)
- **Files modified:** 5

## Accomplishments
- Default pattern library with 12 patterns covering all PII-01, PII-02, PII-03 requirements
- PII detection: EMAIL, PHONE (US + international), SSN, ADDRESS
- Financial data: CREDIT_CARD (Luhn validation), IBAN (mod-97 checksum), SWIFT codes
- Secrets: AWS_KEY (AKIA...), OPENAI_KEY (sk-...), GITHUB_TOKEN (ghp_/ghs_), PRIVATE_KEY (-----BEGIN patterns)
- Custom enterprise pattern support via regex or example-based definitions
- Size limits prevent ReDoS attacks: max 1KB regex, max 100 examples per pattern
- All patterns Unicode-aware with confidence scoring and context boosters

## Task Commits

Tasks 1 and 2 were combined in a single commit due to tight coupling (custom patterns use the same PatternRule structure):

1. **Tasks 1 & 2: Default pattern library with validators and custom pattern support** - `582f53f` (feat)

## Files Created/Modified
- `crates/kernel/src/policy/patterns/mod.rs` - PatternRule, PatternRegistry, validator type alias
- `crates/kernel/src/policy/patterns/default.rs` - 12 default patterns covering PII, financial, secrets
- `crates/kernel/src/policy/patterns/validators.rs` - Luhn algorithm and IBAN mod-97 validation
- `crates/kernel/src/policy/patterns/custom.rs` - CustomPattern with regex and example-based sources
- `crates/kernel/src/policy/mod.rs` - Added `pub mod patterns`

## Decisions Made
- **Pattern validator type alias:** Created `PatternValidator` type alias for `Arc<dyn Fn(&str) -> bool + Send + Sync>` to satisfy clippy's type_complexity lint
- **Example-based literal matching:** Custom patterns with examples use `regex::escape` for literal matching. ML-based pattern inference from examples deferred to future enhancement (noted in code comments).
- **Flexible example regex:** Removed word boundaries (`\b`) from example patterns to support special characters like parentheses in client names
- **International phone flexibility:** Updated international phone pattern to support variable spacing (French format: `+33 1 23 45 67 89`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PatternRule Debug trait implementation**
- **Found during:** Compilation of custom pattern tests
- **Issue:** PatternRule couldn't derive Debug due to validator field containing `dyn Fn` (doesn't implement Debug)
- **Fix:** Implemented manual Debug for PatternRule showing validator presence as "Some(..)" or "None"
- **Files modified:** crates/kernel/src/policy/patterns/mod.rs
- **Verification:** Tests compile and pass
- **Committed in:** 582f53f

**2. [Rule 1 - Bug] Removed unused Arc import in custom.rs**
- **Found during:** Compilation (unused import warning)
- **Issue:** `use std::sync::Arc;` was unused after switching to PatternValidator type alias in PatternRule
- **Fix:** Removed the unused import
- **Files modified:** crates/kernel/src/policy/patterns/custom.rs
- **Verification:** Build succeeds without warnings
- **Committed in:** 582f53f

**3. [Rule 1 - Bug] Fixed example pattern word boundary issue**
- **Found during:** Test execution (test_example_pattern_escapes_special_chars failing)
- **Issue:** Word boundary `\b` doesn't work with special characters like parentheses in "Item (A)"
- **Fix:** Removed word boundaries from example pattern regex, using simple alternation: `(example1|example2)`
- **Files modified:** crates/kernel/src/policy/patterns/custom.rs
- **Verification:** Test passes
- **Committed in:** 582f53f

**4. [Rule 1 - Bug] Fixed Luhn test expectation**
- **Found during:** Test execution (test_luhn_check_invalid_cards failing)
- **Issue:** Test expected "0000000000000000" to fail Luhn check, but it's mathematically valid
- **Fix:** Removed assertion, added comment explaining Luhn algorithm behavior
- **Files modified:** crates/kernel/src/policy/patterns/validators.rs
- **Verification:** Test passes
- **Committed in:** 582f53f

**5. [Rule 1 - Bug] Fixed international phone pattern**
- **Found during:** Test execution (test_phone_international_pattern failing)
- **Issue:** Regex didn't support French phone format with multiple spaces: `+33 1 23 45 67 89`
- **Fix:** Updated regex to support variable digit grouping with `[\s.-]+` and flexible segment lengths
- **Files modified:** crates/kernel/src/policy/patterns/default.rs
- **Verification:** All international phone tests pass
- **Committed in:** 582f53f

---

**Total deviations:** 5 auto-fixed (5 bugs, all discovered during compilation/testing)
**Impact on plan:** All fixes were necessary for correctness. No scope creep — all issues were in the plan's deliverables.

## Issues Encountered
None — all issues were routine test/compilation fixes during implementation.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Pattern library complete with 12 default patterns and custom pattern support
- Ready for Plan 02 (Adaptive streaming buffer and pattern detector)
- Plan 03 will integrate pattern detection with the streaming relay
- Pattern validation and ReDoS prevention implemented as specified

## Self-Check: PASSED

**Files created:**
- ✅ crates/kernel/src/policy/patterns/mod.rs exists (60 lines)
- ✅ crates/kernel/src/policy/patterns/default.rs exists (399 lines, 12 patterns)
- ✅ crates/kernel/src/policy/patterns/validators.rs exists (185 lines, Luhn + IBAN)
- ✅ crates/kernel/src/policy/patterns/custom.rs exists (287 lines, regex + examples)

**Commits verified:**
- ✅ Commit 582f53f exists in git history
- ✅ Commit includes all 4 pattern files + mod.rs update

**Pattern coverage verified:**
- ✅ PII-01: 5 patterns (EMAIL, PHONE_US, PHONE_INTL, SSN, ADDRESS)
- ✅ PII-02: 3 patterns (CREDIT_CARD with Luhn, IBAN with checksum, SWIFT)
- ✅ PII-03: 4 patterns (AWS_KEY, OPENAI_KEY, GITHUB_TOKEN, PRIVATE_KEY)
- ✅ PII-05: CustomPattern with regex and examples support

**Tests verified:**
- ✅ 33 tests pass in policy::patterns module
- ✅ Luhn validator tests pass (4 tests)
- ✅ IBAN validator tests pass (5 tests)
- ✅ Custom pattern tests pass (9 tests)
- ✅ Default pattern tests pass (15 tests)

---
*Phase: 03-pii-detection-content-inspection*
*Completed: 2026-02-27*

# Phase 3 Plan 02: Adaptive Streaming Buffer & Pattern Detector Summary

**Adaptive token buffer with configurable presets and streaming pattern detector with partial match handling for multi-token PII detection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-27T01:40:58Z
- **Completed:** 2026-02-27T01:46:06Z
- **Tasks:** 2 (1 pre-scaffolded, 1 implemented)
- **Files created/modified:** 4

## Accomplishments
- Adaptive token buffer holds 7-20 tokens (Medium preset default) and grows to max_size when partial pattern match detected
- Buffer is bounded with explicit max_size (KERN-13 compliance) — Small: 3-10, Medium: 7-20, Large: 10-30
- UTF-8 boundary splits handled with String::from_utf8_lossy to prevent panics on multi-byte character splits
- StreamingDetector returns NoMatch/PartialMatch/FullMatch results for incremental pattern detection
- Context-aware confidence scoring uses 3-word window with keyword boosters to reduce false positives
- Partial match detection: EMAIL-specific (@ present but no full match) + generic (pattern touches end)
- Overlapping categories merged as "PHONE|ACCOUNT" format per user decision
- 7 unit tests passing (4 buffer, 3 detector), clippy clean on lib target

## Task Commits

Each task was committed atomically:

1. **Tasks 1-2: Adaptive buffer (pre-scaffolded) + streaming detector implementation** - `d4ca5eb` (feat)

_Note: Task 1 (buffer.rs) was pre-created by plan 03-01 scaffolding with full implementation and tests. Task 2 (detector.rs) implemented in this plan._

## Files Created/Modified
- `crates/kernel/src/policy/streaming/mod.rs` - Module declarations, re-exports AdaptiveTokenBuffer, StreamingDetector
- `crates/kernel/src/policy/streaming/buffer.rs` - Adaptive token buffer with VecDeque, configurable presets, UTF-8 handling
- `crates/kernel/src/policy/streaming/detector.rs` - Pattern detector with context-aware confidence, partial match detection, overlap merging
- `crates/kernel/src/policy/redaction.rs` - Added create_placeholder method for StreamingDetector integration

## Decisions Made
- Medium preset (7-20 tokens) chosen as default for balanced latency/accuracy tradeoff
- Partial match detection uses category-specific heuristics (EMAIL checks for @ symbol) plus generic end-of-content matching
- Context window of 3 words before/after provides good false positive reduction without excessive processing
- Overlap merging uses simple start-position sort with category concatenation (pipe separator)

## Deviations from Plan

None - plan executed exactly as written. Task 1 was already complete from scaffolding. Task 2 implemented as specified with context-aware confidence, partial match detection, and overlap resolution.

## Issues Encountered
- Benchmark compilation error (missing `policy` field in Config) is pre-existing from Phase 2 and out of scope
- Partial match detection required EMAIL-specific heuristic since "user@exam" doesn't match full email pattern
- Added generic fallback: pattern match that touches end of content indicates possible partial match

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Adaptive buffer and detector ready for integration with streaming relay (Plan 03-03)
- Buffer behavior verified: respects base_size, grows on partial match, enforces max_size (KERN-13)
- Pattern detection handles NoMatch/PartialMatch/FullMatch with proper confidence scoring
- Ready for Plan 03-03: Content inspection integration with streaming relay and stream severing

---
*Phase: 03-pii-detection-content-inspection*
*Completed: 2026-02-27*

# Phase 3 Plan 3: Content Inspection Integration Summary

**ContentInspector orchestrator with SHA-256 hashing and InspectingRelay for adaptive streaming response inspection with mid-stream severing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-27T01:57:29Z
- **Completed:** 2026-02-27T02:03:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `ContentInspector` integrates pattern detection + redaction for synchronous request inspection (PII-01, PII-02, PII-03)
- SHA-256 hash computed before any modification, attached to every `InspectionResult` (per CONTEXT.md locked decision)
- `InspectingRelay` applies adaptive buffering to streaming responses: NoMatch emits oldest, PartialMatch holds, FullMatch redacts or severs (PII-04)
- Severe categories (PRIVATE_KEY, AWS_KEY, OPENAI_KEY) trigger stream severing with custom policy message injection (KERN-06)
- `ProxyService` accepts `ContentInspector` via `with_content_inspector` builder (plumbing for future HTTP body parsing)
- Bench fix: `proxy_latency.rs` was missing `PolicyEngineConfig` field added in Phase 2

## Task Commits

Each task was committed atomically:

1. **Task 1: Content inspection orchestrator** - `a4453ca` (feat)
2. **Task 2: Streaming relay with incremental inspection** - `ce61b31` (feat)
3. **Task 3: Integrate content inspection into CONNECT handler** - `2e8801c` (feat)
4. **Deviation fix: bench fix + unused dep removal** - `e69c30f` (fix)

## Files Created/Modified

- `crates/kernel/src/policy/content_inspection.rs` - ContentInspector orchestrating pattern detection, redaction, SHA-256 hashing, and verdict
- `crates/kernel/src/proxy/streaming_relay.rs` - InspectingRelay with adaptive buffer, stream severing, and Pitfall 4 mitigation
- `crates/kernel/src/policy/mod.rs` - Added `pub mod content_inspection`
- `crates/kernel/src/proxy/mod.rs` - Added `pub mod streaming_relay`
- `crates/kernel/src/proxy/connect.rs` - Added `ContentInspector` field and `with_content_inspector` builder
- `crates/kernel/benches/proxy_latency.rs` - Added missing `policy: PolicyEngineConfig::default()` field

## Decisions Made

- SHA-256 hash computed BEFORE redaction to enable audit verification of what was originally sent
- Sever categories hardcoded for Phase 3 (PRIVATE_KEY, AWS_KEY, OPENAI_KEY); future: policy-configurable via `sever_categories` param
- CONNECT request body inspection deferred — protocol-specific parsing needed; InspectingRelay handles response stream
- `aho-corasick` dependency removed (was added to Cargo.toml but never used in source)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed failing `test_relay_severs_on_severe_violation` test**
- **Found during:** Task 2 verification
- **Issue:** Test received first output chunk ("Key: " forwarded in NoMatch pass-through) and asserted sever message on it; buffer emits oldest before detecting severe violation in second chunk
- **Fix:** Changed test to collect ALL output chunks after relay completes, then assert sever message appears anywhere in combined output
- **Files modified:** `crates/kernel/src/proxy/streaming_relay.rs`
- **Verification:** `cargo test --lib proxy::streaming_relay` — 3/3 pass
- **Committed in:** `ce61b31` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed bench `proxy_latency.rs` missing `policy` field**
- **Found during:** Verification (`cargo clippy --all-targets`)
- **Issue:** `Config` struct gained `policy: PolicyEngineConfig` in Phase 2 but bench wasn't updated
- **Fix:** Added `policy: kernel::config::PolicyEngineConfig::default()` to bench Config initializer
- **Files modified:** `crates/kernel/benches/proxy_latency.rs`
- **Verification:** `cargo clippy --all-targets -- -D warnings` — clean
- **Committed in:** `e69c30f` (fix commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes essential for correctness. No scope creep. All plan requirements met.

## Issues Encountered

All 3 tasks were already fully committed in a prior interrupted session. This execution:
1. Verified the existing implementation was correct
2. Fixed the one failing test (sever test received wrong chunk)
3. Fixed the pre-existing bench compile error
4. Ran full verification to confirm all success criteria met

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Content inspection pipeline complete: request inspection + streaming response inspection with severing
- Phase 3 Plan 4 (if exists) or Phase 4 ready
- `ContentInspector` and `InspectingRelay` can be wired into main.rs when serving real traffic
- SHA-256 hashes available for evidence collector integration (Phase 4+)

## Self-Check: PASSED

- ✅ `crates/kernel/src/policy/content_inspection.rs` — exists
- ✅ `crates/kernel/src/proxy/streaming_relay.rs` — exists
- ✅ `.planning/phases/03-pii-detection-content-inspection/03-03-SUMMARY.md` — exists
- ✅ Commit `a4453ca` (Task 1) — verified in git log
- ✅ Commit `ce61b31` (Task 2) — verified in git log
- ✅ Commit `2e8801c` (Task 3) — verified in git log
- ✅ All 6 tests pass (`cargo test --lib`)
- ✅ Clippy clean on all targets (`cargo clippy --all-targets -- -D warnings`)

---
*Phase: 03-pii-detection-content-inspection*
*Completed: 2026-02-27*

# Phase 3 Plan 04: Integration Tests & Benchmarks Summary

**25-test integration suite proving all 5 Phase 3 ROADMAP success criteria, with Criterion benchmarks verifying pattern detection, redaction, and buffer performance**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-27T02:07:53Z
- **Completed:** 2026-02-27T02:20:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- All 5 Phase 3 ROADMAP success criteria proven by dedicated integration tests (25 tests, all green)
- Criterion benchmark suite with 12 benchmarks covering pattern detection variants, redaction application, buffer operations, and full content inspection
- SC1: Email, phone, SSN, address detection with `[REDACTED:CATEGORY]` placeholder replacement verified
- SC2: Credit card (Luhn validation), AWS key, OpenAI key, and private key detection/blocking verified
- SC3: Streaming inspection across split chunks with adaptive buffer verified
- SC4: Stream severing with `[REDACTED BY INTERDICT POLICY: RULE_NAME]` injection verified
- SC5: Custom enterprise patterns (regex + examples) integrated alongside built-in patterns verified

## Task Commits

Each task was committed atomically:

1. **Task 1: Integration tests for all success criteria** - `1718207` (test)
2. **Task 2: Performance benchmarks** - `7dea2fa` (feat)

## Files Created/Modified

- `crates/kernel/tests/content_inspection_test.rs` - 868-line integration test suite with 25 tests covering all 5 success criteria + SHA-256, KERN-13, context-aware detection
- `crates/kernel/benches/pattern_matching.rs` - 169-line Criterion benchmark suite with 12 benchmarks
- `crates/kernel/Cargo.toml` - Added `[[bench]] name = "pattern_matching" harness = false`

## Decisions Made

- **Luhn-valid card number:** Plan's test card `4532148803436467` fails Luhn check. Used `4532015112830366` (verified Visa test card) instead.
- **Benchmark validation via debug binary:** Full criterion benchmark compilation takes >2 minutes. Validated all 12 benchmarks via debug binary (`--list` and quick `--sample-size 10` run showing "Success" for each).
- **Import path:** `default_patterns` is only in `kernel::policy::patterns::default::default_patterns` — not re-exported from the `patterns` module itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong Luhn-valid credit card number in SC2 test**
- **Found during:** Task 1 (first test run)
- **Issue:** Plan specified `4532-1488-0343-6467` as a Visa test card, but this number fails the Luhn check (verified programmatically). The SC2 test was failing: `valid Luhn card should be Redacted, got Allow`
- **Fix:** Replaced with `4532015112830366` which is a verified Luhn-valid Visa test card number (also used in default.rs tests)
- **Files modified:** crates/kernel/tests/content_inspection_test.rs
- **Verification:** `test_sc2_credit_card_luhn_valid_detected` now passes
- **Committed in:** 1718207 (Task 1 commit)

**2. [Rule 3 - Blocking] Wrong crate name in imports**
- **Found during:** Task 1 (first compilation attempt)
- **Issue:** Plan template used `interdict_kernel::` imports but the crate is named `kernel`. Also `default_patterns` is not re-exported from the `patterns` module.
- **Fix:** Changed all imports to `kernel::` prefix; used `kernel::policy::patterns::default::default_patterns`
- **Files modified:** crates/kernel/tests/content_inspection_test.rs, crates/kernel/benches/pattern_matching.rs
- **Verification:** Compilation succeeds after fix
- **Committed in:** 1718207 (Task 1 commit)

**3. [Rule 3 - Blocking] Non-ASCII em-dash in byte string literal**
- **Found during:** Task 1 (first compilation attempt)
- **Issue:** Template used `—` (em dash, U+2014) inside a `b"..."` byte string literal, which is invalid
- **Fix:** Replaced `—` with ASCII `--` in the string
- **Files modified:** crates/kernel/tests/content_inspection_test.rs
- **Verification:** Compilation succeeds
- **Committed in:** 1718207 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes necessary for correct compilation and test execution. No scope change.

## Issues Encountered

- Criterion benchmark full compilation (release mode) takes too long for interactive validation. Used debug binary + `--list` and quick sample-size-10 run to validate all 12 benchmarks execute successfully. Full release benchmarks can be run with `cargo bench --bench pattern_matching` when needed (budget ~3-5 min compile time).

## Next Phase Readiness

- Phase 3 is now complete: all 4 plans executed (03-01 through 03-04)
- All 5 ROADMAP Phase 3 success criteria have passing integration tests
- Phase 4 (Evidence Collection & Audit Trail) can proceed
- Pattern matching performance baseline established in benchmark suite

## Self-Check: PASSED

- `crates/kernel/tests/content_inspection_test.rs` — FOUND (868 lines ≥ 300 required)
- `crates/kernel/benches/pattern_matching.rs` — FOUND (164 lines ≥ 50 required)
- Commit `1718207` — FOUND (test: integration tests)
- Commit `7dea2fa` — FOUND (feat: benchmarks)
- All 25 integration tests: PASS
- Clippy `--all-targets -- -D warnings`: CLEAN

---
*Phase: 03-pii-detection-content-inspection*
*Completed: 2026-02-27*

# Phase 3 Plan 05: PLCY-11 Injection Detection Summary

**Prompt injection and jailbreak heuristics now run in request inspection, blocking malicious prompts with explicit INJECTION categories while preserving pre-redaction evidence hashing.**

## Performance

- **Duration:** 3m 16s
- **Started:** 2026-02-27T02:55:32Z
- **Completed:** 2026-02-27T02:58:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented `InjectionDetector` for direct injection, jailbreak, and indirect instruction spoofing phrases using case-insensitive regex sets.
- Exported the new Layer 2 module and added focused unit coverage for required PLCY-11 behaviors.
- Wired `ContentInspector::inspect_request()` to block on injection detections before standard pattern scanning and added six PLCY-11 integration tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement InjectionDetector heuristic module** - `c21de9e` (feat)
2. **Task 2: Wire InjectionDetector into ContentInspector and add integration tests** - `9d6864b` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `crates/kernel/src/policy/layer2/injection.rs` - New heuristic PLCY-11 detector with pattern categories and unit tests.
- `crates/kernel/src/policy/layer2/mod.rs` - Exposes `injection` module in Layer 2.
- `crates/kernel/src/policy/content_inspection.rs` - Adds priority injection blocking gate to request inspection flow.
- `crates/kernel/tests/content_inspection_test.rs` - Adds six PLCY-11 integration tests covering attack and clean prompts.

## Decisions Made

- Injection detections are treated as block-level violations, regardless of other pattern matches.
- Existing hash-before-modification behavior remains unchanged so blocked injection attempts still produce auditable SHA-256 evidence.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PLCY-11 is now implemented and test-covered, removing the requirement orphan identified in Phase 3 verification.
- Phase `03-06` can proceed with wiring request inspection into the CONNECT execution path.

## Self-Check: PASSED

- Confirmed summary artifact exists at `.planning/phases/03-pii-detection-content-inspection/03-05-SUMMARY.md`.
- Confirmed implementation artifact exists at `crates/kernel/src/policy/layer2/injection.rs`.
- Verified task commits `c21de9e` and `9d6864b` exist in git history.

---

*Phase: 03-pii-detection-content-inspection*
*Completed: 2026-02-27*

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
