# S06: Policy Distribution Kernel Integration

**Goal:** Create the foundational types, proto schema, and kernel-side modules for Phase 6: the policy distribution proto, ArcSwap-based hot-reload PolicySet, three-level hierarchy resolver, and bounded session context store.
**Demo:** Create the foundational types, proto schema, and kernel-side modules for Phase 6: the policy distribution proto, ArcSwap-based hot-reload PolicySet, three-level hierarchy resolver, and bounded session context store.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Create the foundational types, proto schema, and kernel-side modules for Phase 6: the policy distribution proto, ArcSwap-based hot-reload PolicySet, three-level hierarchy resolver, and bounded session context store.

Purpose: These are the building blocks that the distribution client (Plan 02), control plane server (Plan 03), and integration tests (Plan 04) all depend on. Without these contracts and data structures, nothing else can be wired.

Output: Proto file, three new kernel Rust modules (hot_reload, hierarchy, session), updated build.rs and Cargo.toml, updated config and policy mod.
- [x] **T02: Plan 02**
  - Wire the kernel's distribution gRPC client, refactor the PolicyPipeline to use ArcSwap-based hot-reload, integrate session context tracking into the proxy request flow, and spawn the distribution client from main.rs.

Purpose: This is the kernel-side integration that enables real-time policy updates from the control plane. After this plan, the kernel can connect to a gRPC distribution server, receive policy pushes, hot-reload them without restart, and track session context for multi-turn violation detection.

Output: Distribution client module (3 files), updated proxy/connect.rs with PolicySetManager, updated main.rs with distribution client spawn and session store.
- [x] **T03: Plan 03**
  - Build the control plane gRPC distribution server that pushes compiled policy modules to connected kernels in real-time via server-streaming.

Purpose: This is the control plane side of CTRL-03. When a compliance officer updates a policy and the compiler produces a new Wasm module, the distribution server broadcasts the update to all connected kernel instances without polling.

Output: Distribution module (3 files), updated compiler worker with broadcast hook, updated index.ts with gRPC server startup.
- [x] **T04: Plan 04**
  - Validate all Phase 6 requirements with integration tests covering policy distribution end-to-end, hierarchy resolution, session context tracking, and the four ROADMAP success criteria.

Purpose: Prove that the system works as specified before moving to Phase 7. These tests serve as regression guards for the distribution pipeline, hot-reload mechanics, hierarchy model, and session context features.

Output: Two integration test files validating all Phase 6 success criteria.

## Files Likely Touched

