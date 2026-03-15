# S03: Dependency Cleanup + Constructor Safety — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice removes dependencies and adds code documentation/warnings — all outcomes are verifiable through build commands, grep checks, and test passes without requiring a running service.

## Preconditions

- Rust toolchain installed (`cargo` available)
- Bun installed (`bun` available)
- Repository is at the commit containing S03 changes

## Smoke Test

Run `cargo build --workspace && cd control-plane && bun install && bun test` — all must succeed. This confirms dependency removal didn't break anything and control-plane still builds and tests cleanly.

## Test Cases

### 1. tower-http removed from kernel

1. Open `crates/kernel/Cargo.toml`
2. Search for `tower-http` or `tower_http`
3. **Expected:** No matches found — the dependency has been completely removed.

### 2. uuid removed from evidence-collector

1. Open `crates/evidence-collector/Cargo.toml`
2. Search for `uuid`
3. **Expected:** No matches found — the dependency has been completely removed.

### 3. drizzle-typebox removed from control-plane

1. Open `control-plane/package.json`
2. Search for `drizzle-typebox`
3. **Expected:** No matches found — the package has been removed from dependencies.

### 4. @sinclair/typebox retained with rationale

1. Open `control-plane/package.json`
2. Search for `sinclair/typebox`
3. **Expected:** The package is still listed in `dependencies` with version `^0.34.0`. A root-level `"//dependencies-notes"` object contains an explanation that it is a required peer dependency of Elysia.

### 5. ProxyService::new() has safety documentation

1. Open `crates/kernel/src/proxy/connect.rs`
2. Find the `pub fn new()` method on `ProxyService`
3. **Expected:** A `/// # ⚠️ Safety` doc comment block is present above or within the function, explaining that `pipeline: None` means all requests bypass enforcement and this constructor is intended only for testing.

### 6. Construction-time warning fires in non-test builds

1. In `crates/kernel/src/proxy/connect.rs`, find the `new()` method body
2. **Expected:** A `tracing::warn!("ProxyService created without policy pipeline — all requests will bypass enforcement")` call is present, guarded by `#[cfg(not(test))]` so it does not fire during test runs.

### 7. One-time request-path warning fires when pipeline is None

1. In `crates/kernel/src/proxy/connect.rs`, find the CONNECT request handler
2. **Expected:** A `static` `AtomicBool` (named `NO_PIPELINE_WARNED` or similar) gates a `tracing::warn!` that fires at most once per process when a request is handled with no policy pipeline.

### 8. Workspace builds cleanly after dependency removal

1. Run `cargo build --workspace`
2. **Expected:** Build succeeds with no errors. No unresolved import errors from the removed dependencies.

### 9. Kernel proxy tests still pass

1. Run `cargo test -p kernel --lib -- proxy::connect`
2. **Expected:** All tests pass (8 tests at time of writing). Existing `ProxyService::new()` call sites in tests are unaffected.

### 10. Kernel integration tests still pass

1. Run `cargo test -p kernel --test content_inspection_test`
2. **Expected:** All tests pass (31 tests at time of writing).

### 11. Control-plane builds and tests pass

1. Run `cd control-plane && bun install && bun test`
2. **Expected:** `bun install` completes without errors. `bun test` reports 191 (or more) tests passed, 0 failed.

## Edge Cases

### Bun lockfile reflects removal

1. Open `control-plane/bun.lock`
2. Search for `drizzle-typebox`
3. **Expected:** No matches — the lockfile has been regenerated without this package.

### No source references to removed deps

1. Run `grep -r "tower_http\|tower-http" crates/kernel/src/` (should return no matches)
2. Run `grep -r "use uuid" crates/evidence-collector/src/` (should return no matches)
3. **Expected:** No source file imports the removed dependencies — confirming they were truly unused.

## Failure Signals

- `cargo build --workspace` fails with unresolved import — a removed dependency was actually in use
- `bun install` fails — `@sinclair/typebox` comment key is malformed or inside `dependencies` where bun tries to resolve it as a git URL
- `bun test` has failures — `drizzle-typebox` removal broke a control-plane module
- `cargo test -p kernel --lib -- proxy::connect` fails — safety warning code introduced a compile error or changed test behavior
- Missing `⚠️ Safety` doc or `tracing::warn` in connect.rs — constructor safety changes were not applied

## Requirements Proved By This UAT

- None — this slice is a cleanup/safety improvement that does not advance any tracked requirement.

## Not Proven By This UAT

- Runtime behavior of the `tracing::warn!` calls is not proven at runtime (would require starting the proxy service with `RUST_LOG=warn` and routing traffic). The artifact-driven checks confirm the code is present and compiles correctly.
- Production deployment safety — the warnings help detect accidental `new()` usage but do not prevent it.

## Notes for Tester

- The `#[cfg(not(test))]` guard on the construction warning means you will **not** see the "ProxyService created without policy pipeline" message when running `cargo test`. This is intentional to avoid test log noise.
- The per-request `AtomicBool` warning *will* fire once in tests that exercise the CONNECT handler with a pipeline-less service, since it is not `cfg(not(test))` gated.
- If `bun` is not installed, the control-plane tests can be skipped — they are independent of the Rust changes.
