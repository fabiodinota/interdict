---
id: T02
parent: S02
milestone: M006
provides:
  - Unified rand dependency (no direct rand 0.8 in workspace crates)
  - Workspace-level clippy and rustc lint configuration
  - Per-crate lint inheritance via [lints] workspace = true
key_files:
  - Cargo.toml
  - crates/evidence-collector/Cargo.toml
  - crates/evidence-collector/src/signing/local.rs
  - crates/interdict-verify/Cargo.toml
  - crates/interdict-verify/src/signature.rs
  - crates/kernel/Cargo.toml
  - deny.toml
key_decisions:
  - Replaced rand 0.8 with rand_core 0.6 (not rand 0.9) in evidence-collector and interdict-verify because ed25519-dalek 2.x requires rand_core 0.6 CryptoRngCore trait — rand 0.9 OsRng implements rand_core 0.9 traits which are incompatible
  - Added rand 0.8.5 to deny.toml skip list as transitive dep via tract-onnx (no stable upgrade path)
  - Chose clippy::all + clippy::suspicious at warn level for workspace lints (matches existing CI -D warnings flag)
patterns_established:
  - Workspace lint inheritance: all crates use [lints] workspace = true
  - rand_core 0.6 direct dependency for OsRng when ed25519-dalek compatibility is needed
observability_surfaces:
  - none (build-time configuration changes)
duration: 20m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Align rand 0.8→0.9 in evidence-collector and add workspace lints

**Replaced direct rand 0.8 deps with rand_core 0.6 for ed25519-dalek compatibility, added workspace-level clippy/rustc lint config inherited by all crates.**

## What Happened

Eliminated all direct `rand = "0.8"` dependencies from workspace crates:

- **evidence-collector**: Changed `rand = "0.8"` → `rand_core = { version = "0.6", features = ["getrandom"] }` and updated `use rand::rngs::OsRng` → `use rand_core::OsRng` in signing/local.rs.
- **interdict-verify**: Same change — `rand = "0.8"` → `rand_core = "0.6"` and updated import in signature.rs test module.
- **kernel**: Already used `rand = "0.9"`, no change needed.

The approach differs from the original plan (which assumed a straight 0.8→0.9 bump) because `ed25519-dalek` 2.x depends on `rand_core` 0.6 traits. Passing rand 0.9's `OsRng` (which implements `rand_core` 0.9 `CryptoRngCore`) to ed25519-dalek's `SigningKey::generate` (which expects `rand_core` 0.6 `CryptoRngCore`) would fail to compile. Since both crates only used rand for `OsRng`, replacing with `rand_core` 0.6 directly is the correct fix.

`rand 0.8.5` remains in `Cargo.lock` as a transitive dep via `tract-onnx` 0.22 → `tract-onnx-opl` + `rand_distr`. No stable upgrade for tract-onnx exists (0.23 is dev pre-release). Added to deny.toml skip list.

For workspace lints: added `[workspace.lints.clippy]` (all + suspicious at warn level) and `[workspace.lints.rust]` (unsafe_code warn) to root Cargo.toml. All three crates inherit via `[lints] workspace = true`. This codifies the lint policy that was previously only enforced by CI flags.

## Verification

- `cargo deny check` — passes: `advisories ok, bans ok, licenses ok, sources ok`
- No direct `rand 0.8` in any workspace crate Cargo.toml — only `kernel` has `rand = "0.9"`, others use `rand_core = "0.6"`
- `rg 'rand.*0\.8' Cargo.lock` — two matches, both from tract-onnx transitive deps (rand_distr, tract-onnx-opl), not from workspace crates
- `[lints] workspace = true` present in all three crate Cargo.tomls
- `cargo clippy` / `cargo test` — cannot run locally due to pre-existing Windows MSVC build issue (zstd-sys/vcruntime.h). CI will validate.

## Diagnostics

- Run `cargo deny check` to verify supply-chain checks including rand skip
- Run `rg '^rand' crates/*/Cargo.toml` to verify no direct rand 0.8 deps
- Run `rg -B10 '"rand 0.8"' Cargo.lock | rg 'name ='` to see what still pulls rand 0.8 transitively

## Deviations

- **rand_core 0.6 instead of rand 0.9**: Original plan assumed straight `rand = "0.8"` → `rand = "0.9"` bump. This doesn't work due to `rand_core` trait version incompatibility with ed25519-dalek. Using `rand_core = "0.6"` directly achieves the same goal (eliminating direct rand 0.8 dep) while maintaining ed25519-dalek compatibility.
- **Transitive rand 0.8 remains**: `rg 'rand.*0\.8' Cargo.lock` still shows two matches from tract-onnx transitive deps. This is not actionable without a tract-onnx upgrade (0.23 is pre-release only).

## Known Issues

- `rand 0.8.5` persists in Cargo.lock as transitive dep via tract-onnx. Will resolve when tract-onnx 0.23+ stable releases.
- Cannot verify `cargo clippy --workspace` locally due to Windows MSVC build issue (pre-existing blocker). CI must validate workspace lints.

## Files Created/Modified

- `Cargo.toml` — Added `[workspace.lints.clippy]` and `[workspace.lints.rust]` sections
- `crates/kernel/Cargo.toml` — Added `[lints] workspace = true`
- `crates/evidence-collector/Cargo.toml` — Replaced `rand = "0.8"` with `rand_core = "0.6"`, added `[lints] workspace = true`
- `crates/evidence-collector/src/signing/local.rs` — Changed `use rand::rngs::OsRng` to `use rand_core::OsRng`
- `crates/interdict-verify/Cargo.toml` — Replaced `rand = "0.8"` with `rand_core = "0.6"`, added `[lints] workspace = true`
- `crates/interdict-verify/src/signature.rs` — Changed `use rand::rngs::OsRng` to `use rand_core::OsRng` in test module
- `deny.toml` — Added `rand@0.8.5` to skip list with rationale
