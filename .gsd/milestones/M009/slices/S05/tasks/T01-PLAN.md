# T01: Workspace unsafe_code deny, cert comment fix, lint-staged improvement

## Description

Three independent quick config fixes grouped into one task because each is a small edit in a different file with no cross-dependencies. Closes assessment findings L-25 (unsafe_code still warn), L-22 (stale cert comment), and improves developer workflow (lint-staged Rust handler).

## Steps

1. Open `Cargo.toml` (workspace root). Change line 11 from `unsafe_code = "warn"` to `unsafe_code = "deny"`. All per-crate `#[allow(unsafe_code)]` attributes are already in place:
   - `crates/kernel/build.rs` — `#[allow(unsafe_code)]` on `set_var` for PROTOC
   - `crates/evidence-collector/build.rs` — `#[allow(unsafe_code)]`
   - `crates/interdict-verify/build.rs` — `#[allow(unsafe_code)]`
   - `crates/kernel/src/policy/wasm_engine.rs` — `#[allow(unsafe_code)]` on both fns
   - `crates/evidence-collector/src/config.rs` — `#[allow(unsafe_code)]` on test helper

2. Open `docker/certs/generate-internal-ca.sh`. On line 35, change the comment from:
   ```
   # 1. Internal CA (10-year validity, ECDSA P-256)
   ```
   to:
   ```
   # 1. Internal CA (1-year validity, ECDSA P-256)
   ```
   This matches D059 which already reduced CA validity to 1 year.

3. Open `package.json`. In the `lint-staged` section, find the `"crates/**/*.rs"` entry (around line 21). Replace:
   ```json
   "crates/**/*.rs": [
     "echo Rust files staged -- cargo fmt/clippy checked in CI or run locally via WSL2"
   ]
   ```
   with:
   ```json
   "crates/**/*.rs": [
     "sh -c 'command -v cargo >/dev/null 2>&1 && cargo fmt -- --check || echo \"[lint-staged] cargo not found — skipping Rust format check (run in WSL2 or install Rust)\"'"
   ]
   ```
   This runs `cargo fmt --check` when cargo is available and gives a clear message when it's not (common on Windows without WSL).

## Must-Haves

- `unsafe_code = "deny"` in workspace `[workspace.lints.clippy]`
- Stale "10-year" comment replaced with "1-year" in generate-internal-ca.sh
- lint-staged Rust handler attempts `cargo fmt -- --check` with graceful fallback

## Verification

```bash
cargo clippy --workspace --all-targets -- -D warnings
grep -c "10-year" docker/certs/generate-internal-ca.sh  # must return 0
grep "1-year" docker/certs/generate-internal-ca.sh       # must match
grep "cargo fmt" package.json                             # must show new handler
```

## Inputs

- `Cargo.toml` — line 11: `unsafe_code = "warn"`
- `docker/certs/generate-internal-ca.sh` — line 35: stale "10-year" comment
- `package.json` — lines 20-22: lint-staged Rust no-op echo

## Expected Output

- `Cargo.toml` line 11 reads `unsafe_code = "deny"`
- `docker/certs/generate-internal-ca.sh` line 35 reads `# 1. Internal CA (1-year validity, ECDSA P-256)`
- `package.json` lint-staged Rust entry runs `cargo fmt -- --check` with fallback
- `cargo clippy --workspace --all-targets -- -D warnings` passes
