# S03: Dependency Cleanup + Constructor Safety — Research

**Date:** 2026-03-15

## Summary

This slice is smaller than initially scoped. Only **2 of the 4 originally-identified unused dependencies are truly removable**: `tower-http` (Rust, kernel) and `uuid` (Rust, evidence-collector). The two TypeScript dependencies — `@sinclair/typebox` and `drizzle-typebox` — require more nuanced handling.

`@sinclair/typebox` is a **required peer dependency** of Elysia (the control-plane framework), which declares it as a non-optional peer (`">= 0.34.0 < 1"`). While there are no direct imports of `@sinclair/typebox` in project source code, Elysia's `t` validator (which IS used extensively throughout the control-plane via `import { t } from "elysia"`) delegates to TypeBox internally. Removing it would break Elysia at runtime. `drizzle-typebox` is genuinely unused and removable, but `@sinclair/typebox` must stay as a peer dependency for Elysia. The `overrides` entry in `package.json` that pins `@sinclair/typebox` to `^0.34.0` should also remain.

The `ProxyService::new()` constructor safety work is straightforward. Production code exclusively uses `ProxyService::with_distribution()` (in `bootstrap.rs`). The bare `new()` constructor is only called in two test functions. Adding a `# Safety` / `# Warning` doc comment, a `tracing::warn!` at construction time, and a per-request warning when `pipeline` is `None` are all clean additions.

## Recommendation

1. **Remove `tower-http`** from `crates/kernel/Cargo.toml` — zero imports confirmed, zero usage in any `.rs` file.
2. **Remove `uuid`** from `crates/evidence-collector/Cargo.toml` — zero usage confirmed across all source files. The `uuid` crate in `crates/kernel/Cargo.toml` IS used (9+ call sites) and must stay.
3. **Remove `drizzle-typebox`** from `control-plane/package.json` — zero imports confirmed.
4. **Keep `@sinclair/typebox`** — it is a required (non-optional) peer dependency of Elysia 1.4.x. The `overrides` block should also stay. Add a comment in `package.json` noting why it's kept.
5. **Add danger-doc** to `ProxyService::new()` with `# ⚠️ Safety` section.
6. **Add `tracing::warn!`** in `ProxyService::new()` body.
7. **Add per-request `tracing::warn_once!`** (or gated warn) in the `call()` method when `pipeline.is_none()`.
8. **Skip `new_enforcing()` constructor** — the builder pattern with `with_distribution()` already serves this role in production. Adding another constructor creates API surface for no benefit.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Detect unused Rust deps | `cargo-machete` / `cargo-udeps` | Automated detection; but manual verification already done here |
| Detect unused JS deps | `depcheck` / `knip` | Could find more unused deps, but manual grep is sufficient for 4 targets |
| TypeBox peer dep verification | `bun pm ls` tree output | Shows dependency graph including peer relationships |

## Existing Code and Patterns

- `crates/kernel/src/proxy/connect.rs` — `ProxyService::new()` at line ~270; `ProxyService::with_distribution()` at line ~310. The `new()` sets `pipeline: None` and creates a stub `EvidenceBuffer`. Only used in test code (2 call sites in `#[cfg(test)]`).
- `crates/kernel/src/bootstrap.rs` line 141 — Production entry point uses `ProxyService::with_distribution()` exclusively, followed by `.with_content_inspector()` and optionally `.with_high_assurance()`.
- `control-plane/src/modules/vendors/model.ts` — Uses `import { t } from "elysia"` which internally delegates to `@sinclair/typebox`. This pattern is repeated across vendors, evidence, reviews, auth, audit, anomalies, and compiler modules.
- `control-plane/bun.lock` — Elysia 1.4.26 declares `@sinclair/typebox` as a required peer (not in `optionalPeers`).

## Constraints

- `@sinclair/typebox` cannot be removed — Elysia's `t` validator requires it at runtime. The `overrides` block in `package.json` pins the version for compatibility.
- `uuid` in kernel crate is heavily used (bootstrap, request_id middleware, evidence bundle, policy modules) — only the evidence-collector copy is unused.
- `tower-http` removal may change `Cargo.lock` — other workspace crates don't depend on it, so it should drop cleanly.
- Existing test suite uses `ProxyService::new()` in two tests (`test_proxy_service_rejects_non_connect`, `test_proxy_service_accepts_connect`). These must continue to work — the `new()` constructor should not be removed, only documented and warned.
- `tracing::warn!` in `new()` will fire during tests — consider using `#[cfg(not(test))]` guard or accepting test log noise.

## Common Pitfalls

- **Removing `@sinclair/typebox` breaks Elysia** — The original assessment listed it as unused because there are no direct imports, but Elysia re-exports TypeBox's `t` object. Removing the peer dep causes runtime failures in validation.
- **Overly noisy per-request warnings** — Using `tracing::warn!` on every request when `pipeline` is `None` will flood logs in test scenarios. Use `std::sync::Once` or `tracing::warn!` with a `target` that can be filtered, or use `warn_once!` pattern (tracing doesn't have built-in warn_once, so use `std::sync::atomic::AtomicBool` or `std::sync::Once`).
- **`cargo build` after removing tower-http** — Must verify no transitive feature activation from `tower-http` is needed. The `tower` crate (which IS used) is independent.

## Open Risks

- The original audit specified "4 unused dependencies" — we can only cleanly remove 3 (`tower-http`, `uuid` from evidence-collector, `drizzle-typebox`). `@sinclair/typebox` must stay. The slice definition says "All 4 unused dependencies removed" but this is factually incorrect for `@sinclair/typebox`. Recommend updating the slice description to reflect 3 removals + 1 documented retention.
- `drizzle-typebox` is a peer dep bridge between `drizzle-orm` and `@sinclair/typebox`. If future development needs Drizzle schema validation with TypeBox types, it would need to be re-added. Current code has no such usage, so removal is safe.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust dependency management | `laurigates/claude-plugins@cargo-machete` | available (53 installs) — not needed for 2 removals |
| Dependency updates | `softaworks/agent-toolkit@dependency-updater` | available (3.4K installs) — out of scope |
| Rust best practices | `rust-skills` | installed |

## Sources

- Elysia 1.4.26 `peerDependencies` includes `@sinclair/typebox >= 0.34.0 < 1` (non-optional) (source: `control-plane/bun.lock`)
- `drizzle-typebox` peer-depends on `@sinclair/typebox >= 0.34.8` (source: `control-plane/bun.lock`)
- Zero imports of `tower_http` in kernel source (source: `rg "tower_http" crates/kernel/src/` — no results)
- Zero imports of `uuid` in evidence-collector source (source: `grep -rn "uuid" crates/evidence-collector/src/` — no results)
- 9+ files in kernel crate use `uuid` (source: `rg "uuid" crates/kernel/src/` — 9 files)
- `ProxyService::new()` used only in 2 test functions; production uses `with_distribution()` (source: `crates/kernel/src/proxy/connect.rs`, `crates/kernel/src/bootstrap.rs`)
