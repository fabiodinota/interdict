# T02: Plan 02

**Slice:** S02 — **Milestone:** M001

## Description

Build Layer 1 allowlist-as-policy, Layer 2 NLP classifier, and the content redaction engine. The vendor allowlist migrates from standalone middleware to a policy verdict in the Layer 1 pipeline. The NLP classifier provides a model-agnostic tract-onnx inference interface with a dedicated 'uncertain/review' output class. The redaction engine applies category-tagged placeholders and computes pre-redaction SHA-256 hashes.

Purpose: These are the evaluation and enforcement primitives that the pipeline orchestrator (Plan 04) composes into the full 3-layer flow. Each can be tested in isolation.

Output: layer1/allowlist.rs (vendor allowlist as L1 policy), layer2/classifier.rs (tract-onnx inference), redaction.rs (category-tagged replacement with SHA-256).
