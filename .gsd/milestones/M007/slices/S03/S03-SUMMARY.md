---
id: S03
parent: M007
milestone: M007
provides:
  - 3 unused dependencies removed (tower-http, uuid, drizzle-typebox)
  - @sinclair/typebox retention rationale documented in package.json
  - ProxyService::new() safety documentation with ⚠️ Safety doc comment
  - Runtime bypass warnings (construction + one-time per-request) for pipeline-less ProxyService
key_files:
  - crates/kernel/Cargo.toml
  - crates/evidence-collector/Cargo.toml
  - control-plane/package.json
  - control-plane/bun.lock
  - crates/kernel/src/proxy/connect.rs
key_decisions:
  - D027: Root-level "//dependencies-notes" for package.json dep rationale (bun resolves // keys inside dependencies as git URLs)
  - D028: AtomicBool warn-once pattern for hot-path safety diagnostics
patterns_established:
  - AtomicBool-based warn-once pattern for per-request safety diagnostics in hot path
  - Root-level JSON comment objects for dependency rationale in bun projects
observability_surfaces:
  - "tracing::warn on ProxyService::new() construction (cfg(not(test)) gated)"
  - "One-time tracing::warn on first request with no policy pipeline (AtomicBool NO_PIPELINE_WARNED)"
drill_down_paths:
  - .gsd/milestones/M007/slices/S03/tasks/T01-SUMMARY.md
duration: 18m
verification_result: passed
completed_at: 2026-03-15
---

# S03: Dependency Cleanup + Constructor Safety

**Removed 3 unused dependencies, documented 1 required retention, and added safety documentation + runtime bypass warnings to ProxyService::new().**

## What Happened

Removed `tower-http` from `crates/kernel/Cargo.toml`, `uuid` from `crates/evidence-collector/Cargo.toml`, and `drizzle-typebox` from `control-plane/package.json` — none were imported by any source file. `@sinclair/typebox` was retained because it is a required peer dependency of Elysia; a root-level `"//dependencies-notes"` object documents this rationale (bun treats `//` keys inside `dependencies` as git package URLs, so the comment was placed at root level).

`ProxyService::new()` received a `# ⚠️ Safety` doc comment explaining that it creates a service with `pipeline: None`, bypassing all enforcement. A `tracing::warn!` fires at construction time (gated with `#[cfg(not(test))]` to avoid test noise), and a one-time `tracing::warn!` fires on the first request routed through a pipeline-less service using a `static AtomicBool`. This ensures any accidental production use of `new()` instead of `with_distribution()` produces clear log lines.

## Verification

- `cargo build --workspace` — ✅ no compile errors after dependency removal
- `cargo test -p kernel --test content_inspection_test` — ✅ 31 passed
- `cargo test -p kernel --lib -- proxy::connect` — ✅ 8 passed, all ProxyService test call sites work
- `cd control-plane && bun install && bun test` — ✅ 191 passed, 0 failed
- `tower-http` absent from `crates/kernel/Cargo.toml` — ✅ confirmed
- `uuid` absent from `crates/evidence-collector/Cargo.toml` — ✅ confirmed
- `drizzle-typebox` absent from `control-plane/package.json` — ✅ confirmed
- `@sinclair/typebox` present with rationale comment — ✅ confirmed
- `⚠️ Safety` doc comment in `connect.rs` — ✅ confirmed
- `tracing::warn` calls in `connect.rs` for construction + request path — ✅ confirmed

## Deviations

- The `@sinclair/typebox` comment was placed in a root-level `"//dependencies-notes"` object rather than inline in `dependencies` because bun resolves `//` keys inside `dependencies` as git package URLs and fails. This is documented as D027.
- The `NO_PIPELINE_WARNED` AtomicBool is scoped inside the CONNECT handler block rather than at module scope, since only CONNECT tunnel requests flow through the pipeline bypass path.

## Known Limitations

None — this was a cleanup slice with no functional gaps.

## Follow-ups

None discovered during execution.

## Files Created/Modified

- `crates/kernel/Cargo.toml` — removed `tower-http` dependency
- `crates/evidence-collector/Cargo.toml` — removed `uuid` dependency
- `control-plane/package.json` — removed `drizzle-typebox`, added `//dependencies-notes` for `@sinclair/typebox` rationale
- `control-plane/bun.lock` — regenerated without `drizzle-typebox`
- `crates/kernel/src/proxy/connect.rs` — added safety doc, construction warn, and per-request warn-once

## Forward Intelligence

### What the next slice should know
- Dependency tree is now clean — no unused crates or packages remain. S04/S05 can add new dependencies without worrying about pre-existing unused ones.
- `ProxyService::new()` is intentionally kept for test convenience but now loudly warns in non-test builds. Test code using `new()` is unaffected.

### What's fragile
- The `"//dependencies-notes"` convention is bun-specific — if the project ever migrates to npm/pnpm, the comment could be moved inline using standard `//` keys in `dependencies`.

### Authoritative diagnostics
- `RUST_LOG=warn` in production logs — any `ProxyService` bypass warning means `new()` was used instead of `with_distribution()`. This is the first signal to check for silent enforcement bypass.

### What assumptions changed
- Original plan assumed `@sinclair/typebox` could be removed — investigation confirmed it is a required Elysia peer dependency, so it was retained with documentation.
