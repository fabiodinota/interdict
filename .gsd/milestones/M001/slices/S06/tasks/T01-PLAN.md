# T01: Plan 01

**Slice:** S06 — **Milestone:** M001

## Description

Create the foundational types, proto schema, and kernel-side modules for Phase 6: the policy distribution proto, ArcSwap-based hot-reload PolicySet, three-level hierarchy resolver, and bounded session context store.

Purpose: These are the building blocks that the distribution client (Plan 02), control plane server (Plan 03), and integration tests (Plan 04) all depend on. Without these contracts and data structures, nothing else can be wired.

Output: Proto file, three new kernel Rust modules (hot_reload, hierarchy, session), updated build.rs and Cargo.toml, updated config and policy mod.
