# Handoff Document — Interdict CI Fixes & Dependency Audit

<original_task>
Two tasks were completed in this session:

1. **Clean worktree with structured commits** — Organize all uncommitted changes into logical, well-named commits and push them.
2. **Fix all failing CI jobs** — Resolve `cargo fmt` and `cargo clippy` failures on the `codex/outline-security-review-steps` branch.
3. **Dependency audit** — Thorough review of all dependencies across all 4 Rust crates and 2 TypeScript packages to identify unused or questionable dependencies.
</original_task>

<work_completed>
## Task 1: Structured Commits (COMPLETE)

Organized ~19 modified/untracked files into 5 logical commits, all pushed:

1. `d0d1ab6` **chore(infra)**: `.dockerignore` (recursive node_modules, .next globs), `.gitignore` (.env.test.example), `docker-compose.yml` (INTERDICT_EVIDENCE_COLLECTOR_ADDR alias)
2. `2376f5e` **fix(kernel)**: Rego entrypoint normalization (slash->dot, data. prefix), content-less verdict handling at CONNECT time, `phone_international_00_pattern`, length-preserving redaction (`***` instead of `[REDACTED:X]`)
3. `7864e96` **fix(control-plane)**: Drizzle `.cause` unwrap for duplicate detection, `pgDb` fallback in regulatory module, paginated response shape `{ data: { items, nextCursor } }`, PDF `pageAdded` recursion guard, `parseDateTimeBestEffort` in ClickHouse queries, default entrypoint normalized to `data.interdict.policy.verdict`
4. `77ccfbd` **fix(dashboard)**: Policy/PolicyVersion types to snake_case, PolicyRow/PolicyVersionHistory/PolicyWizard field name updates, VendorList `data.items` shape, proxy route `force-dynamic` export
5. `ccde909` **chore(scripts)**: Test probe scripts (`probe.mjs`, `probe.py`, `probe.sh`, `.env.test.example`)

## Task 2: CI Fixes (IN PROGRESS — last commit pushed, CI still running)

Three commits pushed to fix CI failures:

6. `5bb21c5` **style(rust)**: `cargo fmt` fixes in 5 files:
   - `crates/evidence-collector/src/config.rs:110` — single-line `unwrap_or_default()`
   - `crates/evidence-collector/src/signing/rotation.rs:188,196` — `VerifyingKey::from_bytes` reformatted
   - `crates/evidence-collector/src/main.rs:62` — `ClickHouseWriter::new()` multi-line args
   - `crates/kernel/src/evidence/mod.rs:77` — `EvidenceGrpcClient::with_mtls()` multi-line args
   - `crates/kernel/src/main.rs:252,275` — `.await` on separate line, `EvidenceBuffer::new()` multi-line

7. `241a527` **fix(evidence-collector)**: `v.to_ascii_lowercase() == "true"` -> `v.eq_ignore_ascii_case("true")` at config.rs:130 (clippy::manual_ignore_case_cmp)

8. `95d1531` **fix(evidence-collector)**: Rust 2024 edition requires explicit `unsafe {}` blocks inside `unsafe fn` bodies. Wrapped `remove_var` calls in `clear_collector_env()` with `unsafe {}`. Also removed empty line after doc comment (clippy::empty_line_after_doc_comments).

**CI run 22802071856 is still in progress** — this is the run triggered by commit `95d1531`. Previous runs failed on: (1) cargo fmt, (2) clippy manual_ignore_case_cmp, (3) clippy empty_line_after_doc_comments + Rust 2024 unsafe fn semantics. Each was fixed iteratively.

## Task 3: Dependency Audit (COMPLETE — analysis only, no changes applied)

### Confirmed UNUSED — safe to remove:
| Dependency | Location | Evidence |
|---|---|---|
| `tower-http` | `crates/kernel/Cargo.toml` | Zero imports in kernel src |
| `uuid` | `crates/evidence-collector/Cargo.toml` | Zero imports in evidence-collector src |
| `@sinclair/typebox` | `control-plane/package.json` | Zero imports (also remove `overrides` entry) |
| `drizzle-typebox` | `control-plane/package.json` | Zero imports |

### Feature-gate candidates (heavy, used in 1 file each):
| Dependency | Location | Used in | Concern |
|---|---|---|---|
| `tract-onnx` | kernel | `policy/layer2/classifier.rs` | Heaviest dep — full ML runtime |
| `wasmtime` | kernel | `policy/wasm_engine.rs` | Full Wasm JIT, huge compile time |
| `rusqlite` (bundled) | kernel | `policy/layer3/store.rs` | Bundles SQLite C into proxy binary |
| `aws-sdk-s3` + `aws-sdk-kms` + `aws-config` | evidence-collector | `storage/s3.rs`, `signing/kms.rs` | 3 AWS SDKs, irrelevant for air-gapped |
| `tikv-jemallocator` | kernel | `main.rs` | Linux-only, needs `#[cfg]` guard |

### All other deps verified as actively used:
- **Kernel**: 35/36 deps used (only `tower-http` unused)
- **Evidence-collector**: 19/20 deps used (only `uuid` unused)
- **Control-plane**: 9/11 deps used (`@sinclair/typebox`, `drizzle-typebox` unused)
- **Dashboard**: 15/15 deps all used (`react-dom` is peer dep, no direct imports but required)
</work_completed>

<work_remaining>
## Immediate (high confidence, zero risk):

1. **Check CI run 22802071856** — verify the latest push passes all 3 quality matrix jobs (sidecar, air-gapped, vpc-native). If it fails, read logs and fix.
   - `gh run view 22802071856`
   - If it passes: done with CI fixes
   - If it fails: `gh run view 22802071856 --log-failed | grep -E "(error|-->)" | head -30`

2. **Remove unused dependencies** (4 removals):
   - `crates/kernel/Cargo.toml`: delete `tower-http = { version = "0.6", features = ["trace", "request-id"] }`
   - `crates/evidence-collector/Cargo.toml`: delete `uuid = { version = "1", features = ["v4", "serde"] }`
   - `control-plane/package.json`: delete `"@sinclair/typebox": "^0.34.0"` from dependencies AND `"overrides"` block
   - `control-plane/package.json`: delete `"drizzle-typebox": "^0.2.0"` from dependencies

3. **Commit and push** the dependency removals, then verify CI still passes.

## Medium-term (requires design decision):

4. **Feature-gate heavy kernel deps** — Add optional Cargo features:
   - `features = ["ml-classifier"]` gating `tract-onnx` + related L2 classifier code
   - `features = ["wasm-policies"]` gating `wasmtime` + wasm_engine.rs
   - `features = ["l3-sqlite"]` gating `rusqlite` + L3 store
   - This requires `#[cfg(feature = "...")]` annotations on the modules that use them

5. **Feature-gate AWS deps** in evidence-collector:
   - `features = ["aws"]` gating `aws-sdk-s3`, `aws-sdk-kms`, `aws-config`
   - Allows air-gapped builds without AWS SDK compilation

6. **Guard `tikv-jemallocator`** with `#[cfg(target_os = "linux")]` if not already done.
</work_remaining>

<attempted_approaches>
## CI Fix Iteration History

1. **First attempt**: Ran `cargo fmt --all` locally — failed because no Rust toolchain installed on Windows/MSYS2. Had to manually apply fmt fixes by reading CI diff output and using Edit tool.

2. **cargo fmt fixes (commit 5bb21c5)**: Successfully fixed all 5 files. CI passed fmt check but then failed on clippy.

3. **First clippy fix (commit 241a527)**: Fixed `manual_ignore_case_cmp` at config.rs:130. CI passed that lint but revealed NEW clippy errors that were masked by the first failure:
   - `empty_line_after_doc_comments` at config.rs:145
   - `E0133: call to unsafe function requires unsafe block` — 14 instances of `std::env::remove_var` inside `unsafe fn clear_collector_env()` (Rust 2024 edition change)

4. **Second clippy fix (commit 95d1531)**: Fixed both issues — removed blank line between doc comment and fn signature, wrapped `remove_var` calls in `unsafe {}` block inside the `unsafe fn`. CI run still in progress.

5. **Branch switch accident**: User accidentally switched to `master` mid-edit. Detected via `git status`, restored the file with `git restore`, and switched back to `codex/outline-security-review-steps`.

## Key Insight — Rust 2024 Edition
The `edition = "2024"` in Cargo.toml changes `unsafe fn` semantics: the function body is NO LONGER an implicit unsafe block. Each unsafe operation inside must be wrapped in its own `unsafe {}`. This affected `std::env::remove_var` (13 calls) and `std::env::set_var` (already wrapped by previous author). The `set_var` calls in test functions were already in explicit `unsafe {}` blocks, only `clear_collector_env`'s body was missing the inner block.
</attempted_approaches>

<critical_context>
## Project Structure
- **Rust workspace**: `crates/kernel`, `crates/evidence-collector`, `crates/interdict-verify`
- **TypeScript**: `control-plane` (Bun + Elysia), `dashboard` (Next.js 15)
- **All Rust crates use `edition = "2024"`** — important for unsafe semantics

## CI Pipeline
- Workflow: `.github/workflows/ci-quality-security.yml`
- Matrix: 3 deployment modes (`sidecar`, `air-gapped`, `vpc-native`) via `INTERDICT_DEPLOYMENT_MODE` env var
- Jobs: security scan -> quality (Format check -> Clippy -> Tests -> Content inspection integration gate)
- Clippy runs with `-D warnings` (warnings are errors)
- No local Rust toolchain available — must rely on CI for verification

## Branch
- Working branch: `codex/outline-security-review-steps`
- Base/main branch: `master`
- Remote: `origin` -> `https://github.com/fabiodinota/interdict.git`

## Environment
- Platform: Windows (MSYS2/Git Bash)
- No `cargo` available locally — all Rust verification must happen via CI
- Bun is the JS runtime for control-plane
- Node/npm for dashboard (Next.js)

## Architecture Invariants (from CLAUDE.md)
- Rust-only data plane hot path
- Strict control-plane/data-plane separation
- Deterministic policy logic only (no LLM in enforcement)
- Fail-closed defaults for high-risk profiles
- Pre-mutation evidence hashing
- No plaintext secrets in logs
- Streaming-first enforcement
- VPC-native, sidecar, and air-gapped compatibility
</critical_context>

<current_state>
## Status Summary

| Item | Status |
|---|---|
| Structured commits (Task 1) | COMPLETE — 5 commits pushed |
| CI fmt fixes | COMPLETE — commit `5bb21c5` |
| CI clippy fix 1 (ignore_case) | COMPLETE — commit `241a527` |
| CI clippy fix 2 (unsafe blocks) | PUSHED — commit `95d1531`, CI run `22802071856` in progress |
| Dependency audit analysis | COMPLETE — report delivered to user |
| Dependency removals | NOT STARTED — user asked "want me to apply?" but hasn't confirmed |
| Feature-gating heavy deps | NOT STARTED — design discussion needed |

## Git State
- Branch: `codex/outline-security-review-steps`
- Working tree: clean
- Up to date with `origin/codex/outline-security-review-steps`
- 8 commits ahead of previous state (d0d1ab6..95d1531)

## Open Questions
1. Did CI run `22802071856` pass? Must check before proceeding.
2. Does user want to apply the 4 unused dependency removals?
3. Does user want to pursue feature-gating the heavy deps (tract-onnx, wasmtime, rusqlite, AWS SDKs)?
4. Is there a PR open for this branch, or should one be created?
</current_state>
