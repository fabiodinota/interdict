# S03: Pii Detection Content Inspection

**Goal:** Build comprehensive pattern library for PII, financial data, and secrets detection with multi-pattern acceleration and validation.
**Demo:** Build comprehensive pattern library for PII, financial data, and secrets detection with multi-pattern acceleration and validation.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Build comprehensive pattern library for PII, financial data, and secrets detection with multi-pattern acceleration and validation.

Purpose: Provide battle-tested detection patterns covering all common PII/financial/secret types (PII-01, PII-02, PII-03) and custom enterprise pattern support (PII-05). This is the foundation for all content inspection — patterns must be accurate, fast, and extensible.

Output: Pattern library module with default patterns, validators, custom pattern support, and aho-corasick multi-pattern acceleration.
- [x] **T02: Plan 02**
  - Implement adaptive streaming buffer and incremental pattern detection for streaming response inspection.

Purpose: Enable PII detection in streaming AI responses (PII-04) without buffering the entire response. The adaptive buffer holds back 5-10 tokens (KERN-05) and grows only when a partial pattern match is detected, balancing latency and accuracy per user decisions.

Output: Streaming inspection module with adaptive buffer, pattern detection, and partial match handling.
- [x] **T03: Plan 03**
  - Integrate pattern detection into request/response inspection with streaming buffer, redaction application, and stream severing.

Purpose: Complete the content inspection pipeline by integrating pattern library (03-01) and streaming buffer (03-02) into the proxy flow. Outbound prompts are inspected synchronously, inbound responses are inspected incrementally with adaptive buffering, and severe violations sever the stream.

Output: Full content inspection integrated into proxy with request inspection, streaming response inspection, and policy-driven stream severing.
- [x] **T04: Plan 04**
  - Comprehensive integration tests and benchmarks proving all Phase 3 success criteria.

Purpose: Verify that all requirements (PII-01 through PII-06, KERN-05, KERN-06, PLCY-11) are met with end-to-end tests covering pattern detection, redaction, streaming inspection, and stream severing. Benchmarks verify performance characteristics.

Output: Integration test suite proving all 5 Phase 3 success criteria and performance benchmarks.
- [x] **T05: Plan 05**
  - Implement prompt injection and jailbreak detection via Layer 2 NLP heuristic classifier, closing the PLCY-11 orphaned requirement.

Purpose: PLCY-11 is listed as a Phase 3 requirement in ROADMAP.md but was systematically dropped from all plan execution. This gap closure implements the detection using heuristic string patterns (as specified for Phase 3 — full ML classifier is a future phase) and wires it into ContentInspector.

Output: InjectionDetector module with 3 pattern categories (direct injection, jailbreak, indirect injection), wired into ContentInspector so inject/jailbreak prompts return Block action. Integration tests prove PLCY-11 coverage.
- [x] **T06: Plan 06**
  - Wire ContentInspector.inspect_request() into the CONNECT tunnel handler so outbound prompts are actually inspected before reaching the AI vendor — closing the partial gap where the inspector existed but was never called in the proxy hot path.

Purpose: ROADMAP SC1/SC2 state that prompts "are intercepted" — this requires the proxy tunnel to call the inspector. The 03-03 plan explicitly deferred this; this gap closure implements it. Uses tokio::io::split to create read/write halves of TLS streams so outbound data (client→upstream) passes through ContentInspector before forwarding.

Output: connect.rs spawned task calls inspect_request on accumulated outbound data; relay.rs gets an inspecting_relay_outbound helper; #[allow(dead_code)] removed from content_inspector field.

## Files Likely Touched

