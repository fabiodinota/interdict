# S03: Dependency Cleanup + Constructor Safety

**Slice:** S03 — Dependency Cleanup + Constructor Safety
**Milestone:** M007

## Description

Remove 3 genuinely unused dependencies (`tower-http` from kernel, `uuid` from evidence-collector, `drizzle-typebox` from control-plane), document why `@sinclair/typebox` must stay (Elysia peer dep), and add safety documentation + runtime warnings to `ProxyService::new()` which creates an instance with no policy pipeline.

## Must-Haves

- `tower-http` removed from `crates/kernel/Cargo.toml`
- `uuid` removed from `crates/evidence-collector/Cargo.toml`
- `drizzle-typebox` removed from `control-plane/package.json`
- `@sinclair/typebox` retained with inline comment explaining why
- `ProxyService::new()` has `# ⚠️ Safety` doc comment warning about `pipeline: None`
- `ProxyService::new()` body emits `tracing::warn!` at construction
- Request path emits a one-time warning when `pipeline` is `None`
- `cargo build --workspace` passes
- `bun install && bun test` pass in control-plane
- Existing `ProxyService::new()` test call sites continue to work

## Proof Level

- This slice proves: contract (build + test still pass with fewer deps, constructor warns appropriately)
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cargo build --workspace` — confirms no compile errors after dependency removal
- `cargo test -p kernel --test content_inspection_test` — existing kernel integration tests pass
- `cargo test -p kernel proxy` — the two `ProxyService::new()` test call sites still work
- `cd control-plane && bun install && bun test` — control-plane builds and tests pass
- `rg "tower.http" crates/kernel/Cargo.toml` — no results (removed)
- `rg "uuid" crates/evidence-collector/Cargo.toml` — no results (removed)
- `rg "drizzle-typebox" control-plane/package.json` — no results (removed)
- `rg "sinclair/typebox" control-plane/package.json` — still present with comment
- `rg "⚠️ Safety" crates/kernel/src/proxy/connect.rs` — doc comment exists
- `rg "tracing::warn" crates/kernel/src/proxy/connect.rs` — warns on `new()` and pipeline-None request

## Tasks

- [x] **T01: Remove unused dependencies and add ProxyService constructor safety** `est:30m`
  - Why: Closes the entire slice — removes 3 unused deps, documents the 4th retention, and adds danger-doc + runtime warnings to `ProxyService::new()`.
  - Files: `crates/kernel/Cargo.toml`, `crates/evidence-collector/Cargo.toml`, `control-plane/package.json`, `crates/kernel/src/proxy/connect.rs`
  - Do:
    1. Remove `tower-http` line from `crates/kernel/Cargo.toml` `[dependencies]`
    2. Remove `uuid` line from `crates/evidence-collector/Cargo.toml` `[dependencies]`
    3. Remove `drizzle-typebox` from `control-plane/package.json` `dependencies`
    4. Add comment above `@sinclair/typebox` in `package.json`: `"// Required peer dependency of Elysia — do not remove"`  (use a nearby field or inline comment convention)
    5. Run `cd control-plane && bun install` to update lockfile
    6. Add `# ⚠️ Safety` doc section to `ProxyService::new()` explaining that it creates a service with no policy pipeline, so all requests bypass enforcement — intended only for testing
    7. Add `tracing::warn!("ProxyService created without policy pipeline — all requests will bypass enforcement")` inside `new()` body, guarded by `#[cfg(not(test))]` to avoid test noise
    8. In the `call()` method, add a one-time warning using `std::sync::Once` or `std::sync::atomic::AtomicBool` when `effective_pipeline` is `None` — emits `tracing::warn!` once per process: `"ProxyService handling request with no policy pipeline — enforcement bypassed"`
    9. Verify: `cargo build --workspace`, `cargo test -p kernel proxy`, `cd control-plane && bun test`
  - Verify: `cargo build --workspace && cargo test -p kernel proxy && cd control-plane && bun install && bun test`
  - Done when: All 3 deps removed, `@sinclair/typebox` retained with comment, `ProxyService::new()` has doc + warns, all builds and tests pass.

## Observability / Diagnostics

- **Construction warning:** `ProxyService::new()` emits `tracing::warn!("ProxyService created without policy pipeline — all requests will bypass enforcement")` in non-test builds. Inspect via `RUST_LOG=warn` in production logs.
- **Request-path warning:** A one-time `tracing::warn!("ProxyService handling request with no policy pipeline — enforcement bypassed")` fires on the first request routed through a pipeline-less service. Uses `AtomicBool` so it appears at most once per process.
- **Inspection command:** `RUST_LOG=warn cargo test -p kernel proxy 2>&1 | grep "bypass"` — shows the per-request warning in test output (constructor warning is `cfg(not(test))` gated).
- **Failure state exposed:** A production deployment accidentally using `new()` instead of `with_distribution()` now produces clear log lines instead of silently bypassing all policy.
- **Redaction constraints:** None — these warnings contain no user data, secrets, or policy content.

## Files Likely Touched

- `crates/kernel/Cargo.toml`
- `crates/evidence-collector/Cargo.toml`
- `control-plane/package.json`
- `control-plane/bun.lock`
- `crates/kernel/src/proxy/connect.rs`
