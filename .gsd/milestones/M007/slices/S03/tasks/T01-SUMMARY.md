---
id: T01
parent: S03
milestone: M007
provides:
  - Unused dependencies removed from kernel, evidence-collector, and control-plane
  - ProxyService::new() safety documentation and runtime bypass warnings
key_files:
  - crates/kernel/Cargo.toml
  - crates/evidence-collector/Cargo.toml
  - control-plane/package.json
  - crates/kernel/src/proxy/connect.rs
key_decisions:
  - Used root-level "//dependencies-notes" object for @sinclair/typebox rationale since bun resolves "//" keys inside dependencies as git packages
patterns_established:
  - AtomicBool-based warn-once pattern for per-request safety diagnostics in hot path
observability_surfaces:
  - "tracing::warn on ProxyService::new() construction (cfg(not(test)) gated)"
  - "One-time tracing::warn on first request with no policy pipeline (AtomicBool NO_PIPELINE_WARNED)"
duration: 18m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Remove unused dependencies and add ProxyService constructor safety

**Removed 3 unused dependencies (tower-http, uuid, drizzle-typebox), documented @sinclair/typebox retention, and added safety doc + runtime bypass warnings to ProxyService::new().**

## What Happened

1. Removed `tower-http` from `crates/kernel/Cargo.toml` — no source files import it.
2. Removed `uuid` from `crates/evidence-collector/Cargo.toml` — no source files import it.
3. Removed `drizzle-typebox` from `control-plane/package.json` dependencies.
4. Added `"//dependencies-notes"` object at root level of `package.json` documenting that `@sinclair/typebox` is a required Elysia peer dependency. Placing the comment key inside `dependencies` caused bun to attempt git resolution, so it was moved to root level.
5. Ran `bun install` — lockfile regenerated, `drizzle-typebox` removed (1 package removed).
6. Added `# ⚠️ Safety` doc section to `ProxyService::new()` warning that `pipeline: None` bypasses all enforcement.
7. Added `#[cfg(not(test))]` guarded `tracing::warn!` inside `new()` body.
8. Added `static NO_PIPELINE_WARNED: AtomicBool` with check-and-set in the `call()` method, inside the `if req.method() == Method::CONNECT` block, emitting a one-time warning when `effective_pipeline` is `None`.

## Verification

All checks pass:

- `cargo build --workspace` — ✅ no compile errors
- `cargo test -p kernel proxy` — ✅ 62 passed, 0 failed; plus 7 integration tests passed
- `cargo clippy --workspace --all-targets -- -D warnings` — ✅ clean
- `cd control-plane && bun install && bun test` — ✅ 191 tests passed, 0 failed
- `rg "tower.http" crates/kernel/Cargo.toml` — ✅ no results
- `rg "uuid" crates/evidence-collector/Cargo.toml` — ✅ no results
- `rg "drizzle-typebox" control-plane/package.json` — ✅ no results
- `rg "sinclair/typebox" control-plane/package.json` — ✅ present with comment
- `rg "⚠️ Safety" crates/kernel/src/proxy/connect.rs` — ✅ doc comment found
- `rg "tracing::warn" crates/kernel/src/proxy/connect.rs` — ✅ warns on new() and pipeline-None

## Diagnostics

- **Construction warning:** In production (non-test) builds, `ProxyService::new()` emits `tracing::warn!("ProxyService created without policy pipeline — all requests will bypass enforcement")`. Visible with `RUST_LOG=warn`.
- **Request warning:** First request through a pipeline-less service emits `tracing::warn!("ProxyService handling request with no policy pipeline — enforcement bypassed")` once per process via `AtomicBool`.
- **Inspection:** `RUST_LOG=warn` in production logs — any accidental use of `new()` instead of `with_distribution()` will produce clear log lines.

## Deviations

- The `"//sinclair-typebox-note"` comment key was moved from inside `dependencies` to a root-level `"//dependencies-notes"` object because bun treats `//` keys inside `dependencies` as git package URLs and fails to resolve them.
- The `NO_PIPELINE_WARNED` AtomicBool static is placed inside the `if req.method() == Method::CONNECT` block rather than at module scope, since only CONNECT requests go through the tunnel handler where pipeline bypass matters.

## Known Issues

None.

## Files Created/Modified

- `crates/kernel/Cargo.toml` — removed `tower-http` dependency
- `crates/evidence-collector/Cargo.toml` — removed `uuid` dependency
- `control-plane/package.json` — removed `drizzle-typebox`, added `//dependencies-notes` for `@sinclair/typebox` rationale
- `control-plane/bun.lock` — regenerated without `drizzle-typebox`
- `crates/kernel/src/proxy/connect.rs` — added safety doc, construction warn, and per-request warn-once to `ProxyService::new()`
- `.gsd/milestones/M007/slices/S03/S03-PLAN.md` — added Observability section, marked T01 done
