---
phase: 02-policy-engine
plan: 02
subsystem: policy
tags: [allowlist, redaction, classifier, tract-onnx, sha256, regex, crossbeam, nlp]

requires:
  - phase: 02-policy-engine
    provides: "PolicyVerdict, VerdictAction, ClassificationResult types from Plan 01"
provides:
  - "VendorAllowlistPolicy returning PolicyVerdict as L1 policy (Block/Allow)"
  - "RedactionEngine with category-tagged placeholders and pre-redaction SHA-256 hash"
  - "Classifier with load() for real ONNX models and stub() for testing"
  - "BackgroundL2 with bounded crossbeam channels and OS worker threads"
affects: [02-policy-engine, 04-evidence-collector]

tech-stack:
  added: [regex 1]
  patterns: [dual-check-allowlist-design, category-tagged-redaction, model-agnostic-classifier, background-best-effort-dispatch]

key-files:
  created:
    - crates/kernel/src/policy/layer1/allowlist.rs
    - crates/kernel/src/policy/redaction.rs
    - crates/kernel/src/policy/layer2/mod.rs
    - crates/kernel/src/policy/layer2/classifier.rs
  modified:
    - crates/kernel/src/policy/layer1/mod.rs
    - crates/kernel/src/policy/mod.rs
    - crates/kernel/src/middleware/allowlist.rs
    - crates/kernel/Cargo.toml

key-decisions:
  - "Dual-check design: middleware fast-path before TLS + policy pipeline for audit trail"
  - "Classifier uses stub() for testing since no real ONNX model exists yet"
  - "BackgroundL2 drops items when queue full (best-effort analytics, not blocking)"

patterns-established:
  - "Category-tagged redaction: [REDACTED:CATEGORY] format for all content redaction"
  - "SHA-256 before modification: hash always computed on original content first"
  - "Model-agnostic classifier: load()/stub() pattern for real vs test ONNX models"
  - "Bounded background dispatch: crossbeam bounded channels with try_send for best-effort"

requirements-completed: [PLCY-04, KERN-11]

duration: 7min
completed: 2026-02-26
---

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
