# T01: Plan 01

**Slice:** S02 — **Milestone:** M001

## Description

Establish the policy engine foundation: verdict types with most-restrictive-wins merge, policy configuration (fail-mode, block response detail, redaction direction), Regorus engine pool for Layer 1 Rego evaluation, and Wasmtime runtime with pooling allocator.

Purpose: Every subsequent plan depends on these core types and evaluation primitives. The verdict merge logic, fail-mode semantics, and Regorus pool are the building blocks that Layer 2, Layer 3, and the pipeline orchestrator compose.

Output: policy/ module tree with verdict.rs, config.rs, layer1/regorus.rs, wasm_engine.rs. Updated Cargo.toml with regorus, wasmtime, sha2, crossbeam-channel, rusqlite dependencies. Updated config.rs and interdict.toml with [policy] section.
