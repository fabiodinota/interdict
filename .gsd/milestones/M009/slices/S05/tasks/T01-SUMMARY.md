---
id: T01
parent: S05
milestone: M009
provides:
  - unsafe_code deny enforcement at workspace level
  - corrected cert validity comment in generate-internal-ca.sh
  - lint-staged Rust handler with cargo fmt --check and graceful fallback
key_files:
  - Cargo.toml
  - docker/certs/generate-internal-ca.sh
  - package.json
key_decisions:
  - none — all three changes were plan-prescribed with no ambiguity
patterns_established:
  - none
observability_surfaces:
  - cargo clippy output now fails on any unattributed unsafe usage (compile-time enforcement)
  - lint-staged prints "[lint-staged] cargo not found" when cargo is absent (developer-visible on commit)
duration: 5m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Workspace unsafe_code deny, cert comment fix, lint-staged improvement

**Promoted `unsafe_code` lint from warn to deny, fixed stale 10-year cert comment to 1-year, and replaced lint-staged Rust no-op with `cargo fmt --check` + fallback.**

## What Happened

Three independent config edits, each in a separate file:

1. **Cargo.toml** — Changed `unsafe_code = "warn"` to `unsafe_code = "deny"` in `[workspace.lints.rust]`. All five existing `#[allow(unsafe_code)]` sites across kernel, evidence-collector, and interdict-verify were already in place. Clippy passes clean.

2. **docker/certs/generate-internal-ca.sh** — Fixed line 35 comment from "10-year validity" to "1-year validity", matching the actual `--days 365` parameter and D059.

3. **package.json** — Replaced the lint-staged Rust echo no-op with `sh -c 'command -v cargo >/dev/null 2>&1 && cargo fmt -- --check || echo "[lint-staged] cargo not found — skipping Rust format check (run in WSL2 or install Rust)"'`. Runs format check when cargo is available, gives a clear message when it's not.

Also added missing Observability sections to S05-PLAN.md and T01-PLAN.md per pre-flight requirements.

## Verification

- `cargo clippy --workspace --all-targets -- -D warnings` — **passed** (clean build, no warnings)
- `grep -c "10-year" docker/certs/generate-internal-ca.sh` — **returned 0** (stale comment gone)
- `grep "1-year" docker/certs/generate-internal-ca.sh` — **matched** line 35 and two other existing 1-year references
- `grep "cargo fmt" package.json` — **matched** new lint-staged handler
- `grep "unsafe_code" Cargo.toml` — **shows `deny`**

### Slice-level verification (partial — T01 is first of four tasks):
- ✅ `cargo clippy --workspace --all-targets -- -D warnings` — passes with `unsafe_code = "deny"`
- ⬜ `docker compose config` — not yet (T02)
- ⬜ `helm lint helm/interdict` — not yet (T03)
- ✅ `grep -c "10-year" docker/certs/generate-internal-ca.sh` returns `0`
- ⬜ CI workflow SHA256 inspection — not yet (T04)

## Diagnostics

- Compile-time: any future `unsafe` usage without `#[allow(unsafe_code)]` produces a hard error in `cargo clippy` / `cargo build`
- Commit hook: lint-staged Rust handler output visible in terminal during `git commit`
- No persisted state or runtime diagnostics — these are config-level changes

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `Cargo.toml` — `unsafe_code` lint level changed from `warn` to `deny`
- `docker/certs/generate-internal-ca.sh` — comment on line 35 corrected from "10-year" to "1-year"
- `package.json` — lint-staged Rust handler replaced with `cargo fmt --check` + fallback
- `.gsd/milestones/M009/slices/S05/S05-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M009/slices/S05/tasks/T01-PLAN.md` — added Observability Impact section
