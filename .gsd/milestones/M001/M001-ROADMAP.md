# M001: MVP

**Vision:** Interdict.

## Success Criteria


## Slices

- [x] **S01: Kernel Proxy Foundation** `risk:medium` `depends:[]`
  > After this: Create the Rust workspace, kernel crate with all dependencies, configuration loading, TLS certificate infrastructure, vendor allowlist middleware, structured logging, and error types.
- [x] **S02: Policy Engine** `risk:medium` `depends:[S01]`
  > After this: Establish the policy engine foundation: verdict types with most-restrictive-wins merge, policy configuration (fail-mode, block response detail, redaction direction), Regorus engine pool for Layer 1 Rego evaluation, and Wasmtime runtime with pooling allocator.
- [x] **S03: Pii Detection Content Inspection** `risk:medium` `depends:[S02]`
  > After this: Build comprehensive pattern library for PII, financial data, and secrets detection with multi-pattern acceleration and validation.
- [x] **S04: Evidence Collector** `risk:medium` `depends:[S03]`
  > After this: Scaffold the evidence-collector and interdict-verify workspace crates, define the protobuf schema, and implement core cryptographic primitives (hash chain + signing providers).
- [x] **S05: Control Plane Api Core** `risk:medium` `depends:[S04]`
  > After this: Scaffold the Bun + Elysia control plane project with all database schemas, connection clients, and shared infrastructure utilities.
- [x] **S06: Policy Distribution Kernel Integration** `risk:medium` `depends:[S05]`
  > After this: Create the foundational types, proto schema, and kernel-side modules for Phase 6: the policy distribution proto, ArcSwap-based hot-reload PolicySet, three-level hierarchy resolver, and bounded session context store.
- [x] **S07: Kernel Integration Wiring** `risk:medium` `depends:[S06]`
  > After this: Wire ContentInspector and live PolicySet into the kernel binary entry points, closing the 2 P0 integration gaps (INT-01, INT-02) from the v1.
