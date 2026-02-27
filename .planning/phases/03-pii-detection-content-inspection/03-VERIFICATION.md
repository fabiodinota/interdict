---
phase: 03-pii-detection-content-inspection
verified: 2026-02-27T03:00:00Z
status: gaps_found
score: 9/10 must-haves verified
re_verification: false
gaps:
  - truth: "PLCY-11: Prompt injection and jailbreak detection implemented"
    status: failed
    reason: "PLCY-11 is listed as a Phase 3 requirement in ROADMAP.md but no implementation exists in any crate. No plan claimed it in their requirements frontmatter, and the 03-04-SUMMARY explicitly omits PLCY-11 from requirements-completed."
    artifacts:
      - path: "crates/kernel/src/policy/layer2/"
        issue: "No prompt injection or jailbreak detection patterns added to Layer 2 classifier or anywhere else"
    missing:
      - "Prompt injection / jailbreak detection via Layer 2 NLP classifier (PLCY-11)"
      - "Integration tests verifying injection detection (currently zero coverage of PLCY-11)"
  - truth: "Outbound prompts are inspected and PII is redacted BEFORE reaching vendor"
    status: partial
    reason: "ContentInspector.inspect_request() exists and is fully implemented, but is NOT wired into connect.rs handle_connect(). The content_inspector field in ProxyService is explicitly described as 'plumbing for future use'. No actual request body inspection occurs at the proxy layer — it only works in standalone unit/integration tests."
    artifacts:
      - path: "crates/kernel/src/proxy/connect.rs"
        issue: "content_inspector field stored as Option but .inspect_request() is never called in handle_connect() — lines 83-86 contain a comment explicitly deferring this to a future phase"
    missing:
      - "Call to content_inspector.inspect_request() in handle_connect() before tunnel establishment, OR clarification that this is intentionally deferred with a design note in ROADMAP"
human_verification:
  - test: "Run live proxy with email in prompt, verify vendor never sees raw email"
    expected: "Proxied request to AI vendor contains [REDACTED:EMAIL] instead of original email address"
    why_human: "Request body inspection is not wired into proxy tunnel in Phase 3; only unit/integration tests verify the ContentInspector logic in isolation"
  - test: "Streaming response with PII across chunk boundaries"
    expected: "Buffer holds tokens, detects cross-chunk PII, redacts before client receives"
    why_human: "Integration test uses mpsc channels but real SSE/gRPC streaming relay wiring to InspectingRelay not verified end-to-end"
  - test: "Placeholder format validation against ROADMAP examples"
    expected: "ROADMAP cites [PII:EMAIL], [FINANCIAL:CARD] as examples; implementation uses [REDACTED:EMAIL], [REDACTED:CREDIT_CARD]"
    why_human: "ROADMAP uses 'e.g.' so may be non-normative — needs product owner confirmation that [REDACTED:CATEGORY] format is acceptable"
---

# Phase 3: PII Detection & Content Inspection — Verification Report

**Phase Goal:** The kernel detects and redacts PII, financial data, secrets, and custom enterprise patterns in both outbound prompts and inbound streaming responses, replacing detected content with category-tagged placeholders
**Verified:** 2026-02-27T03:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (derived from ROADMAP.md Success Criteria + Requirements)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | SC1: Email, phone, SSN, address detected and replaced with `[REDACTED:CATEGORY]` | ✓ VERIFIED | 4 passing tests: test_sc1_email_detected_and_replaced, test_sc1_phone_detected_and_replaced, test_sc1_ssn_detected_and_replaced, test_sc1_address_detected_and_replaced |
| 2 | SC2: Credit cards (Luhn-validated), AWS/OpenAI/private keys detected; secrets block, PII redacts | ✓ VERIFIED | 5 passing tests: test_sc2_credit_card_luhn_valid_detected, test_sc2_aws_key_blocks_stream, test_sc2_openai_key_blocks_stream, test_sc2_private_key_blocks_stream, test_sc2_credit_card_luhn_invalid_not_detected |
| 3 | SC3: Streaming responses inspected via 5-10 token sliding window buffer | ✓ VERIFIED | test_sc3_streaming_redacts_email_across_chunks passes; AdaptiveTokenBuffer Medium preset holds 7-20 tokens (KERN-05) |
| 4 | SC4: Kernel severs stream mid-response and injects `[REDACTED BY INTERDICT POLICY: {RULE_NAME}]` | ✓ VERIFIED | test_sc4_stream_severed_on_aws_key passes; InspectingRelay.relay_with_inspection severs on severe categories |
| 5 | SC5: Custom enterprise patterns (regex + examples) detected alongside built-in patterns | ✓ VERIFIED | test_sc5_regex_custom_pattern_detected, test_sc5_example_custom_pattern_detected, test_sc5_custom_patterns_alongside_builtin_patterns pass |
| 6 | PII-06: Redaction uses category-tagged placeholders (not full blocking) | ✓ VERIFIED | RedactionEngine.create_placeholder() returns `[REDACTED:{category}]`; VerdictAction::Redact returns modified content |
| 7 | KERN-05: Sliding window buffer bounded at 5-10 tokens default | ✓ VERIFIED | AdaptiveTokenBuffer Small(3-10), Medium(7-20), Large(10-30); KERN-13 bounded buffer enforced; 3 passing KERN-13 tests |
| 8 | KERN-06: Stream severing with custom policy message injection | ✓ VERIFIED | InspectingRelay injects sever_message bytes before returning Err; test verified |
| 9 | Outbound prompts inspected before reaching vendor | ✗ PARTIAL | ContentInspector.inspect_request() implemented and tested in isolation, but NOT wired into proxy tunnel (connect.rs handle_connect defers this to a future phase) |
| 10 | PLCY-11: Prompt injection / jailbreak detection via Layer 2 classifier | ✗ FAILED | No implementation anywhere in codebase; omitted from all plan `requirements` frontmatter; omitted from all summary `requirements-completed` fields |

**Score:** 8.5/10 truths verified (8 fully ✓, 1 partial ✗, 1 failed ✗)

---

## Required Artifacts

### Plan 03-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `crates/kernel/src/policy/patterns/default.rs` | Comprehensive default patterns for PII, financial, secrets; min 150 lines | ✓ VERIFIED | 401 lines; 12 patterns: EMAIL, PHONE(×2), SSN, ADDRESS, CREDIT_CARD, IBAN, SWIFT, AWS_KEY, OPENAI_KEY, GITHUB_TOKEN, PRIVATE_KEY |
| `crates/kernel/src/policy/patterns/validators.rs` | Luhn and IBAN checksum validators; exports luhn_check, validate_iban | ✓ VERIFIED | 185 lines; `pub fn luhn_check` and `pub fn validate_iban` exported; 9 tests pass |
| `crates/kernel/src/policy/patterns/custom.rs` | Custom pattern support; contains CustomPattern | ✓ VERIFIED | 286 lines; CustomPattern struct, PatternSource enum, validate_custom_pattern; ReDoS limits (1KB regex, 100 examples) |
| `crates/kernel/src/policy/patterns/mod.rs` | PatternRegistry, PatternRule | ✓ VERIFIED | 81 lines; PatternRegistry with `with_defaults()`, PatternRule, PatternValidator type alias |

### Plan 03-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `crates/kernel/src/policy/streaming/buffer.rs` | AdaptiveTokenBuffer with configurable presets; min 100 lines | ✓ VERIFIED | 141 lines; Small/Medium/Large presets, set_partial_match, emit_oldest, flush_all, UTF-8 boundary handling |
| `crates/kernel/src/policy/streaming/detector.rs` | StreamingDetector; exports ScanResult | ✓ VERIFIED | 278 lines; StreamingDetector, ScanResult enum (NoMatch/PartialMatch/FullMatch), Detection struct, apply_redaction, merge_overlapping |

### Plan 03-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `crates/kernel/src/policy/content_inspection.rs` | ContentInspector; exports inspect_request; min implied | ✓ VERIFIED | 215 lines; ContentInspector struct, InspectionResult with action/redacted_content/detections/original_hash; inspect_request() is substantive |
| `crates/kernel/src/proxy/streaming_relay.rs` | InspectingRelay with incremental inspection; min 150 lines | ✓ VERIFIED | 282 lines; InspectingRelay, relay_with_inspection async method, StreamAction enum, adaptive buffer, sever logic |

### Plan 03-04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `crates/kernel/tests/content_inspection_test.rs` | Integration tests for all Phase 3 success criteria; min 300 lines | ✓ VERIFIED | 868 lines; 25 tests, all pass (0.14s); 5 success criteria covered + SHA-256, KERN-13, context-aware tests |
| `crates/kernel/benches/pattern_matching.rs` | Performance benchmarks; min 50 lines | ✓ VERIFIED | 164 lines; criterion_group with benchmark_pattern_detection, benchmark_redaction_application, benchmark_buffer_operations |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `patterns/default.rs` | `patterns/validators.rs` | `use super::validators::{luhn_check, validate_iban}` | ✓ WIRED | Line 16; luhn_check used at line 155, validate_iban at line 178 as validator closures |
| `streaming/detector.rs` | `patterns/mod.rs` | `use crate::policy::patterns::{PatternRegistry, PatternRule}` | ✓ WIRED | Line 1; PatternRegistry used in StreamingDetector field and constructor |
| `streaming/buffer.rs` | `streaming/detector.rs` | `scan_and_emit` / detector.scan | ✓ WIRED | streaming_relay.rs wires buffer + detector: buffer at line 54, detector.scan at line 61 |
| `proxy/streaming_relay.rs` | `policy/streaming/buffer.rs` | AdaptiveTokenBuffer | ✓ WIRED | Line 7 import; AdaptiveTokenBuffer::new at line 54 |
| `proxy/streaming_relay.rs` | `policy/streaming/detector.rs` | detector.scan | ✓ WIRED | Line 7 import; self.detector.scan at line 61 |
| `proxy/connect.rs` | `policy/content_inspection.rs` | inspect_request call before tunnel | ✗ NOT_WIRED | ContentInspector imported (line 18) and stored in ProxyService (line 292) but `.inspect_request()` is NEVER called in `handle_connect()`. Comment at lines 83-86 explicitly defers to future phase. |
| `tests/content_inspection_test.rs` | `patterns/default.rs` | default_patterns | ✓ WIRED | Line 17: `use kernel::policy::patterns::default::default_patterns`; called at lines 46, 310, 365, 371, 490, 612, 662 |
| `tests/content_inspection_test.rs` | `proxy/streaming_relay.rs` | InspectingRelay | ✓ WIRED | Line 22: `use kernel::proxy::streaming_relay::InspectingRelay`; used at lines 316, 371, 424, 496 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PII-01 | 03-01, 03-03, 03-04 | Detect/redact PII (names, emails, phones, addresses, SSNs) in prompts | ✓ SATISFIED | 12 patterns in default.rs; EMAIL, PHONE(×2), SSN, ADDRESS patterns; 4 SC1 integration tests pass |
| PII-02 | 03-01, 03-03, 03-04 | Detect/redact financial data (credit cards, bank accounts, SWIFT codes) | ✓ SATISFIED | CREDIT_CARD (Luhn), IBAN (mod-97), SWIFT patterns; Luhn-valid card test passes; Luhn-invalid correctly skipped |
| PII-03 | 03-01, 03-03, 03-04 | Detect/redact secrets (AWS keys, API tokens, private keys) in prompts | ✓ SATISFIED | AWS_KEY, OPENAI_KEY, GITHUB_TOKEN, PRIVATE_KEY patterns; Block action on secrets; 3 SC2 block tests pass |
| PII-04 | 03-02, 03-03, 03-04 | Detect/redact PII in streaming responses via sliding window buffer | ✓ SATISFIED | AdaptiveTokenBuffer + StreamingDetector + InspectingRelay; SC3 streaming test passes with email across chunks |
| PII-05 | 03-01, 03-04 | Custom patterns per enterprise (client names, matter numbers, case codes) | ✓ SATISFIED | CustomPattern with regex + examples; size limits for ReDoS; 3 SC5 integration tests pass |
| PII-06 | 03-03, 03-04 | Redaction uses category-tagged placeholders, not full blocking | ✓ SATISFIED | `[REDACTED:{category}]` format from RedactionEngine.create_placeholder(); VerdictAction::Redact returns modified content |
| KERN-05 | 03-02, 03-04 | Sliding window buffer holds 5-10 tokens for multi-token pattern detection | ✓ SATISFIED | AdaptiveTokenBuffer Medium(7-20) default; Small(3-10), Large(10-30); 3 KERN-13 bounded buffer tests pass |
| KERN-06 | 03-03, 03-04 | Kernel severs streaming connection and replaces with `[REDACTED BY INTERDICT POLICY: {RULE_NAME}]` | ✓ SATISFIED | InspectingRelay.relay_with_inspection severs on severe categories; injects custom sever_message; SC4 test passes |
| PLCY-11 | — (ORPHANED) | Prompt injection and jailbreak detection via Layer 2 NLP classifier | ✗ BLOCKED | **No implementation exists.** PLCY-11 appears in ROADMAP Phase 3 requirements list and in 03-04-PLAN.md objective text, but is absent from every plan's `requirements:` frontmatter field and from every summary's `requirements-completed:`. REQUIREMENTS.md still marks PLCY-11 as `[ ]` (pending). |

### PLCY-11 Orphaned Requirement Analysis

PLCY-11 is **orphaned** in this phase:
- **ROADMAP.md Phase 3** lists it as a requirement: `**Requirements**: PII-01, PII-02, PII-03, PII-04, PII-05, PII-06, KERN-05, KERN-06, PLCY-11`
- **03-04-PLAN.md** references it in the objective text but **not** in the `requirements:` frontmatter (`requirements: [PII-01, PII-02, PII-03, PII-04, PII-05, PII-06, KERN-05, KERN-06]`)
- **All four summaries** omit PLCY-11 from `requirements-completed:`
- **REQUIREMENTS.md** still shows `- [ ] **PLCY-11**` (incomplete)
- **Zero implementation** in codebase: no jailbreak/injection detection logic anywhere

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `crates/kernel/src/proxy/connect.rs:83-86` | Explicit deferral comment: "Request body inspection via ContentInspector will be integrated when HTTP body parsing is added. Phase 3 focuses on streaming response inspection." | ⚠️ WARNING | ContentInspector.inspect_request() exists and is tested, but proxy never calls it. Outbound prompt PII interception only works in tests, not in actual proxied traffic. |
| `crates/kernel/src/policy/content_inspection.rs:174-183` | `should_block_categories` hardcodes PRIVATE_KEY/AWS_KEY/OPENAI_KEY as block triggers — comment notes "For Phase 3, block on PRIVATE_KEY and high-severity secrets. Future: make this policy-configurable" | ℹ️ INFO | Works correctly for Phase 3; not a blocker |

---

## Human Verification Required

### 1. Outbound Prompt PII Interception — Real Traffic

**Test:** Configure the Interdict kernel as a proxy, send an AI request containing `Contact user@example.com`, observe request reaching the AI vendor  
**Expected:** Vendor receives `Contact [REDACTED:EMAIL]` — raw email never reaches vendor  
**Why human:** `ContentInspector.inspect_request()` is NOT called in `handle_connect()` — it only exists as plumbing. Real traffic inspection at the proxy tunnel level is deferred. Only unit/integration tests exercise this path.

### 2. End-to-End Streaming PII Redaction

**Test:** Use live streaming AI response containing PII across chunk boundaries (simulate with SSE)  
**Expected:** `InspectingRelay` holds 7-20 tokens, detects cross-chunk PII, client never sees raw PII  
**Why human:** Integration tests use mpsc channels in controlled environments. Real SSE/gRPC streaming through the kernel tunnel is not verified.

### 3. Placeholder Format Acceptance

**Test:** Review placeholder format `[REDACTED:EMAIL]` vs ROADMAP example `[PII:EMAIL]`  
**Expected:** Product owner confirms `[REDACTED:CATEGORY]` format is acceptable  
**Why human:** ROADMAP uses "e.g." for placeholder examples (`[PII:NAME]`, `[FINANCIAL:CARD]`), making it ambiguous whether the format is normative. Implementation uses `[REDACTED:CATEGORY]` consistently. If `[PII:NAME]` format is required, redaction.rs needs updates.

---

## Gaps Summary

**Two gaps block full phase goal achievement:**

**Gap 1 — PLCY-11 (Blocker):** The ROADMAP explicitly lists PLCY-11 as a Phase 3 requirement, but no implementation exists anywhere in the codebase. No plan's `requirements` frontmatter claimed it, no summary marked it complete, and REQUIREMENTS.md still marks it pending. This is an **orphaned requirement** — it appeared in the phase specification but was systematically dropped from execution planning. The 03-04-PLAN.md objective mentions verifying PLCY-11 but the test suite has zero coverage.

**Gap 2 — Request Inspection Wiring (Partial):** The ROADMAP success criterion SC1 and SC2 state that "An AI prompt... is intercepted" — implying real proxy interception, not just library-level detection. `ContentInspector.inspect_request()` is fully implemented and tested in isolation, but is not called in `handle_connect()`. The plan (03-03, Task 3) explicitly acknowledges this deferral. Whether this is a phase gap or an acceptable scope constraint needs clarification. The goal states "outbound prompts" are inspected — if the proxy tunnel does not call the inspector, the goal is only partially achieved.

**Confidence breakdown:**
- Pattern library: ✓ Excellent (12 patterns, validators, custom support, all tested)
- Streaming buffer: ✓ Excellent (adaptive, bounded, UTF-8 safe, KERN-13 compliant)
- Pattern detection: ✓ Excellent (NoMatch/PartialMatch/FullMatch, context-aware, overlap merging)
- Stream severing: ✓ Excellent (KERN-06 compliant, policy message injection working)
- Request inspection (library): ✓ Excellent (SHA-256 hash, redact/block verdicts)
- Request inspection (proxy wiring): ✗ Not wired (plumbing only)
- PLCY-11 implementation: ✗ Zero implementation

---

_Verified: 2026-02-27T03:00:00Z_  
_Verifier: Claude (gsd-verifier)_
