---
estimated_steps: 9
estimated_files: 5
---

# T01: Remove unused dependencies and add ProxyService constructor safety

**Slice:** S03 — Dependency Cleanup + Constructor Safety
**Milestone:** M007

## Description

Single task covering the full slice: remove 3 genuinely unused dependencies (`tower-http` from kernel, `uuid` from evidence-collector, `drizzle-typebox` from control-plane), document why `@sinclair/typebox` is kept, and add safety documentation + runtime warnings to `ProxyService::new()`.

## Steps

1. Remove `tower-http = { version = "0.6", features = ["trace", "request-id"] }` from `crates/kernel/Cargo.toml` `[dependencies]` section.
2. Remove `uuid = { version = "1", features = ["v4", "serde"] }` from `crates/evidence-collector/Cargo.toml` `[dependencies]` section.
3. Remove `"drizzle-typebox": "^0.2.0"` from `control-plane/package.json` `dependencies`.
4. Add a comment near `@sinclair/typebox` in `control-plane/package.json` explaining it is a required Elysia peer dependency (JSON doesn't support comments, so add a `"//sinclair-typebox"` key or document in a `README` note — check existing comment conventions in the file first).
5. Run `cd control-plane && bun install` to regenerate `bun.lock` without `drizzle-typebox`.
6. In `crates/kernel/src/proxy/connect.rs`, replace the `ProxyService::new()` doc comment with a `# ⚠️ Safety` section warning that this constructor creates a service with `pipeline: None`, meaning all requests bypass policy enforcement. Note it is intended only for test use and that production code should use `with_distribution()`.
7. Inside `ProxyService::new()` body, add `#[cfg(not(test))]` guarded `tracing::warn!("ProxyService created without policy pipeline — all requests will bypass enforcement");` as the first statement.
8. Add a `static` `AtomicBool` (e.g. `NO_PIPELINE_WARNED`) near the top of the `call()` method. When `effective_pipeline` is `None`, check-and-set the flag and emit `tracing::warn!("ProxyService handling request with no policy pipeline — enforcement bypassed")` exactly once per process.
9. Run verification: `cargo build --workspace`, `cargo test -p kernel proxy`, `cargo clippy --workspace -- -D warnings`, and `cd control-plane && bun install && bun test`.

## Must-Haves

- [ ] `tower-http` removed from kernel Cargo.toml
- [ ] `uuid` removed from evidence-collector Cargo.toml
- [ ] `drizzle-typebox` removed from control-plane package.json
- [ ] `@sinclair/typebox` retained with documented rationale
- [ ] `ProxyService::new()` has `⚠️ Safety` doc comment
- [ ] `ProxyService::new()` emits `tracing::warn!` at construction (non-test only)
- [ ] Request path emits one-time `tracing::warn!` when pipeline is None
- [ ] `cargo build --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] `cargo test -p kernel proxy` passes (existing test call sites work)
- [ ] `bun install && bun test` pass in control-plane

## Verification

- `cargo build --workspace` — no compile errors after removing `tower-http` and `uuid`
- `cargo test -p kernel proxy` — the 2 tests using `ProxyService::new()` still pass
- `cargo clippy --workspace -- -D warnings` — no new warnings
- `cd control-plane && bun install && bun test` — lockfile updated, tests pass
- `rg "tower.http" crates/kernel/Cargo.toml` returns nothing
- `rg "uuid" crates/evidence-collector/Cargo.toml` returns nothing
- `rg "drizzle-typebox" control-plane/package.json` returns nothing
- `rg "⚠️ Safety" crates/kernel/src/proxy/connect.rs` finds the doc comment

## Observability Impact

- Signals added: `tracing::warn!` on `ProxyService::new()` construction (non-test) and one-time `tracing::warn!` on first request with no pipeline — makes silent enforcement bypass visible in logs.
- How a future agent inspects this: `RUST_LOG=warn cargo test -p kernel proxy 2>&1 | grep "bypass"` shows the per-request warning fires in tests (the constructor warn is `cfg(not(test))` guarded).
- Failure state exposed: A production deployment accidentally using `new()` instead of `with_distribution()` now produces a clear log line instead of silently bypassing all policy.

## Inputs

- `crates/kernel/Cargo.toml` — contains `tower-http` dependency to remove
- `crates/evidence-collector/Cargo.toml` — contains unused `uuid` dependency to remove
- `control-plane/package.json` — contains `drizzle-typebox` to remove, `@sinclair/typebox` to keep
- `crates/kernel/src/proxy/connect.rs` — `ProxyService::new()` at line ~414, `call()` at line ~515
- S03-RESEARCH.md — confirms which deps are safe to remove and which must stay

## Expected Output

- `crates/kernel/Cargo.toml` — `tower-http` line removed
- `crates/evidence-collector/Cargo.toml` — `uuid` line removed
- `control-plane/package.json` — `drizzle-typebox` removed, `@sinclair/typebox` annotated
- `control-plane/bun.lock` — regenerated without `drizzle-typebox`
- `crates/kernel/src/proxy/connect.rs` — `ProxyService::new()` has safety doc + construction warn + per-request warn-once
