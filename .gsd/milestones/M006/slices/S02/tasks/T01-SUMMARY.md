---
id: T01
parent: S02
milestone: M006
provides:
  - deny.toml with license compliance, advisory, duplicate detection, and source restrictions
  - CI cargo-deny step is unconditional (no skip condition)
  - Workspace crates have license + publish metadata
key_files:
  - deny.toml
  - crates/kernel/Cargo.toml
  - crates/evidence-collector/Cargo.toml
  - crates/interdict-verify/Cargo.toml
key_decisions:
  - Used LicenseRef-Proprietary + publish=false for workspace crates rather than relying on cargo-deny private crate detection (which broke between v0.16→v0.18)
  - Ignored RUSTSEC-2024-0436 (paste unmaintained) — transitive via clickhouse, not actionable from workspace
  - Set allow-wildcard-paths=true to permit path-only workspace dependencies without version specifiers
patterns_established:
  - All new workspace crates must add license=LicenseRef-Proprietary, publish=false, and a matching [[licenses.exceptions]] in deny.toml
observability_surfaces:
  - cargo deny check output (CI step in security job)
duration: 30m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Add deny.toml with license compliance and duplicate detection

**Fixed deny.toml to pass `cargo deny check` with license allowlist, advisory database, duplicate detection, and source restrictions.**

## What Happened

The deny.toml file already existed from a prior session but had multiple issues preventing `cargo deny check` from passing:

1. **SPDX syntax error**: `MPL-2.0+` is an expression operator, not a license ID. Fixed to `MPL-2.0`.
2. **Deprecated config key**: `unmaintained = "warn"` was removed in cargo-deny v0.14+. Removed.
3. **Unlicensed workspace crates**: The `[licenses.private]` section with empty `registries = []` doesn't cover path dependencies in cargo-deny v0.18. Added `license = "LicenseRef-Proprietary"` and `publish = false` to all 3 workspace crate manifests, plus matching `[[licenses.exceptions]]` entries.
4. **Wildcard path deps**: `wildcards = "deny"` flagged workspace path-only deps. Added `allow-wildcard-paths = true`.
5. **Unmaintained advisory**: `paste` crate (RUSTSEC-2024-0436) is transitive through clickhouse. Added to advisory ignore list with justification.

The CI workflow's cargo-deny step was already unconditional — no changes needed there.

## Verification

- `cargo deny check` → exit 0: `advisories ok, bans ok, licenses ok, sources ok`
- CI step confirmed unconditional (no `if:` condition on the "Cargo deny" step)
- Duplicate detection active as warnings (30+ transitive dups flagged, all expected — rand 0.8/0.9 split tracked for T02)

### Slice verification (partial — T01 is task 1 of 4):
- ✅ `cargo deny check` — passes
- ⏳ `cargo clippy --workspace` — pre-existing Windows build env issue (zstd-sys), not T01-related
- ⏳ `rg 'rand.*0.8' Cargo.lock` — still present (T02 scope)
- ⏳ Docker checks — T03/T04 scope

## Diagnostics

- Run `cargo deny check` to verify all supply-chain checks pass
- Run `cargo deny check --show-stats` for detailed crate graph statistics
- Duplicate warnings in cargo-deny output show all version splits and their dependency trees

## Deviations

- Added `license` and `publish` fields to all 3 workspace crate Cargo.toml files (not in original task plan, but required to make deny.toml work with cargo-deny v0.18)
- Installed cargo-deny v0.18.9 prebuilt binary (local toolchain couldn't compile it due to Windows msvcrt.lib linker issue)

## Known Issues

- RUSTSEC-2024-0436 (paste unmaintained) is suppressed — upstream clickhouse must migrate to pastey
- 30+ duplicate crate warnings from transitive deps (rand 0.8/0.9 split is T02; others are ecosystem-level and not actionable)
- Two unused license allowances warned: BSD-1-Clause and one other — harmless, kept for future deps

## Files Created/Modified

- `deny.toml` — Fixed SPDX syntax, removed deprecated keys, added advisory ignore, wildcard path allowance, and workspace crate exceptions
- `crates/kernel/Cargo.toml` — Added `license = "LicenseRef-Proprietary"` and `publish = false`
- `crates/evidence-collector/Cargo.toml` — Added `license = "LicenseRef-Proprietary"` and `publish = false`
- `crates/interdict-verify/Cargo.toml` — Added `license = "LicenseRef-Proprietary"` and `publish = false`
