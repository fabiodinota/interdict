---
id: S03
milestone: M007
status: ready
---

# S03: Dependency Cleanup + Constructor Safety — Context

## Goal

Remove all unused dependencies across Rust and TypeScript, and document/guard the dangerous `ProxyService::new()` constructor that bypasses policy enforcement.

## Why this Slice

4 unused dependencies were identified in the assessment, adding unnecessary supply-chain surface. The `ProxyService::new()` constructor (SEC-01) allows creating a proxy without a policy pipeline, silently forwarding all requests unfiltered. Both are hygiene items with no dependencies on other slices and can run in parallel with S01/S02.

## Scope

### In Scope

- Remove `tower-http` from `crates/kernel/Cargo.toml` (zero imports verified)
- Verify `uuid` usage in `crates/evidence-collector/Cargo.toml` — remove if truly unused, document if needed
- Remove `@sinclair/typebox` from `control-plane/package.json` (zero imports)
- Remove `drizzle-typebox` from `control-plane/package.json` (zero imports)
- Add prominent doc comment to `ProxyService::new()` warning about policy bypass
- Add `tracing::warn!` at startup when pipeline is `None`
- Consider adding `ProxyService::new_enforcing(pipeline)` constructor
- Add per-request warning in `else` branch of `if let Some(ref pipeline)` check

### Out of Scope

- Dependency version upgrades (not in scope)
- Architectural changes to ProxyService
- Adding new dependencies

## Constraints

- `cargo build --workspace` must succeed after dependency removal
- `bun install && bun test` must succeed after TypeScript dependency removal
- ProxyService changes must not break any existing tests
- Warning log format must match existing tracing patterns

## Integration Points

### Consumes

- `crates/kernel/Cargo.toml` — Rust dependency manifest
- `crates/evidence-collector/Cargo.toml` — evidence-collector dependency manifest
- `control-plane/package.json` — TypeScript dependency manifest
- `crates/kernel/src/proxy/connect.rs` — ProxyService constructor

### Produces

- Leaner dependency manifests (reduced supply-chain surface)
- `ProxyService::new()` with danger-doc and runtime warning
- Optional `ProxyService::new_enforcing()` constructor for safe usage

## Open Questions

- `uuid` crate — need to verify if it's actually unused or used transitively
- `new_enforcing()` API — need to check if callers can easily adopt it without breaking the existing startup flow
