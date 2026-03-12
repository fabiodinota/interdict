# S02: Policy Engine

**Goal:** Establish the policy engine foundation: verdict types with most-restrictive-wins merge, policy configuration (fail-mode, block response detail, redaction direction), Regorus engine pool for Layer 1 Rego evaluation, and Wasmtime runtime with pooling allocator.
**Demo:** Establish the policy engine foundation: verdict types with most-restrictive-wins merge, policy configuration (fail-mode, block response detail, redaction direction), Regorus engine pool for Layer 1 Rego evaluation, and Wasmtime runtime with pooling allocator.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Establish the policy engine foundation: verdict types with most-restrictive-wins merge, policy configuration (fail-mode, block response detail, redaction direction), Regorus engine pool for Layer 1 Rego evaluation, and Wasmtime runtime with pooling allocator.

Purpose: Every subsequent plan depends on these core types and evaluation primitives. The verdict merge logic, fail-mode semantics, and Regorus pool are the building blocks that Layer 2, Layer 3, and the pipeline orchestrator compose.

Output: policy/ module tree with verdict.rs, config.rs, layer1/regorus.rs, wasm_engine.rs. Updated Cargo.toml with regorus, wasmtime, sha2, crossbeam-channel, rusqlite dependencies. Updated config.rs and interdict.toml with [policy] section.
- [x] **T02: Plan 02**
  - Build Layer 1 allowlist-as-policy, Layer 2 NLP classifier, and the content redaction engine. The vendor allowlist migrates from standalone middleware to a policy verdict in the Layer 1 pipeline. The NLP classifier provides a model-agnostic tract-onnx inference interface with a dedicated 'uncertain/review' output class. The redaction engine applies category-tagged placeholders and computes pre-redaction SHA-256 hashes.

Purpose: These are the evaluation and enforcement primitives that the pipeline orchestrator (Plan 04) composes into the full 3-layer flow. Each can be tested in isolation.

Output: layer1/allowlist.rs (vendor allowlist as L1 policy), layer2/classifier.rs (tract-onnx inference), redaction.rs (category-tagged replacement with SHA-256).
- [x] **T03: Plan 03**
  - Build the Layer 3 human review queue with SQLite persistence, connection-hold semantics, and timeout/fail-mode handling. This is the async escalation path for genuinely ambiguous requests where the NLP classifier returns 'uncertain'.

Purpose: Layer 3 is the safety net for cases that deterministic rules and ML can't resolve. The queue holds the user's connection for 30-60 seconds while waiting for a human reviewer, then applies the policy's fail-mode if no decision arrives. The SQLite backend persists queue state for dashboard integration in Phase 8/9.

Output: layer3/queue.rs (in-memory queue with connection hold via oneshot channels), layer3/store.rs (SQLite persistence layer).
- [x] **T04: Plan 04**
  - Wire the full 3-layer policy pipeline (L1 Regorus → L2 NLP → L3 human queue) into the proxy CONNECT handler. The pipeline orchestrator evaluates all matching policies, merges verdicts with most-restrictive-wins, handles escalation between layers, dispatches background L2 work, and integrates with the proxy to enforce block/allow/redact on intercepted traffic. Integration tests prove all Phase 2 success criteria.

Purpose: This is the culmination of Phase 2 — connecting all the building blocks (verdicts, Regorus, classifier, queue, redaction) into a working pipeline that the proxy enforces on every intercepted AI request. Without this plan, the components are isolated modules that don't affect actual traffic.

Output: PolicyPipeline in policy/mod.rs, proxy integration in connect.rs, integration tests proving all 5 success criteria.

## Files Likely Touched

