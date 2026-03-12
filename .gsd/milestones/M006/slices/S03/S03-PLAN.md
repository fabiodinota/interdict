# S03: Quality And Developer Experience

**Goal:** Improve developer experience with bootstrap extraction, property-based testing, CI coverage, contributor docs, and Windows build documentation — closing all P2 items from ASSESSMENT.md.
**Demo:** `cargo test -p kernel --test proptest_patterns` runs PII fuzz tests; CI publishes coverage; CONTRIBUTING.md exists with quality gate instructions.

## Must-Haves

- main.rs bootstrapping extracted to bootstrap.rs (ASSESSMENT §1 concern: 533-line main.rs)
- proptest-based fuzz tests for PII pattern library (ASSESSMENT §4 gap: no property-based testing)
- CI coverage reporting — codecov or lcov (ASSESSMENT §6 gap: no coverage reporting)
- CONTRIBUTING.md with setup, quality gates, and PR process (ASSESSMENT §8 gap)
- CHANGELOG.md with version history (ASSESSMENT §8 gap)
- Windows ring build workaround documented (ASSESSMENT §5: local Windows dev environment issue)

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cargo test --workspace --all-targets` — all tests pass including proptest
- `cargo test -p kernel --test proptest_patterns` — proptest suite runs successfully
- `test -f CONTRIBUTING.md && test -f CHANGELOG.md` — both files exist
- CI workflow includes coverage step
- `wc -l crates/kernel/src/main.rs` — significantly reduced from 533 lines

## Observability / Diagnostics

- Runtime signals: none (build-time and documentation changes)
- Inspection surfaces: coverage reports in CI artifacts; proptest regressions file
- Failure visibility: proptest shrinking output on pattern failures pinpoints exact failing input
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: S01 stable pattern library API (infallible init), S02 workspace lints and deny.toml
- New wiring introduced in this slice: CI coverage step, proptest test target
- What remains before the milestone is truly usable end-to-end: nothing — this is the final slice

## Tasks

- [ ] **T01: Extract main.rs bootstrapping into bootstrap.rs** `est:30m`
  - Why: ASSESSMENT §1 flags main.rs at 533 lines doing too much startup orchestration. Extracting bootstrapping improves readability and makes initialization testable.
  - Files: `crates/kernel/src/main.rs`, `crates/kernel/src/bootstrap.rs`, `crates/kernel/src/lib.rs`
  - Do: Create `bootstrap.rs` with a `Bootstrap` struct or `pub async fn bootstrap(config: Config) -> Result<...>` that handles: CA/cert setup, pipeline construction (PolicyPipeline, ContentInspector, PatternRegistry), evidence buffer creation, PolicySetManager + SessionStore init. `main.rs` should call bootstrap, then run the server accept loop + graceful shutdown. Keep the signal handler and accept loop in main.rs. Add `pub mod bootstrap` to lib.rs.
  - Verify: `cargo build -p kernel` compiles; `cargo test -p kernel` — all existing tests pass; `wc -l crates/kernel/src/main.rs` < 200
  - Done when: main.rs is primarily server loop + shutdown; bootstrap.rs handles all initialization

- [ ] **T02: Add proptest for PII pattern fuzzing** `est:45m`
  - Why: ASSESSMENT §4 gap — "No property-based testing. `criterion` benchmarks exist but no `proptest` or `quickcheck` for fuzzing PII patterns." Property tests catch edge cases: ReDoS on pathological input, false positives on random strings, Unicode boundary issues.
  - Files: `crates/kernel/tests/proptest_patterns.rs`, `crates/kernel/Cargo.toml`
  - Do: Add `proptest = "1"` dev-dependency. Create integration test file with properties: (1) `default_patterns()` never panics on arbitrary UTF-8 — feed random strings through `ContentInspector::inspect_request()`, (2) known SSN/email/phone patterns always match on generated valid inputs, (3) random alphanumeric strings don't trigger false positives above a configurable threshold, (4) redaction preserves content length or replaces with deterministic placeholder. Use `ProptestConfig::with_cases(256)` for reasonable CI time.
  - Verify: `cargo test -p kernel --test proptest_patterns` — all properties hold across 256+ cases
  - Done when: proptest suite runs cleanly; no regressions file generated

- [ ] **T03: Add coverage reporting to CI** `est:30m`
  - Why: ASSESSMENT §6 gap — "No coverage reporting — no codecov/lcov integration." Coverage helps identify untested code paths and track quality trends.
  - Files: `.github/workflows/ci-quality-security.yml`
  - Do: Add a CI job that installs `cargo-llvm-cov` and runs `cargo llvm-cov --workspace --lcov --output-path lcov.info`. Upload `lcov.info` as a CI artifact via `actions/upload-artifact@v4`. Optionally add codecov integration if token is available. Mark as `continue-on-error: true` so it's a quality signal, not a gate.
  - Verify: CI workflow YAML includes the coverage job with artifact upload
  - Done when: Coverage step exists in CI workflow and produces lcov artifact

- [ ] **T04: Add CONTRIBUTING.md, CHANGELOG.md, and document Windows ring workaround** `est:20m`
  - Why: ASSESSMENT §8 gap — "No CONTRIBUTING.md or CHANGELOG.md." Plus ASSESSMENT §5: Windows ring build is a known dev environment issue that needs documentation.
  - Files: `CONTRIBUTING.md`, `CHANGELOG.md`
  - Do: **CONTRIBUTING.md** — Prerequisites (Rust 1.80+, Bun 1.x, Docker, OPA CLI optional), setup steps (`cargo build --workspace`, `cd control-plane && bun install`, `cd dashboard && npm ci`), quality gates (`cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo deny check`, Biome for TS), PR process (branch naming, commit convention, required checks), and Windows ring workaround section (install Visual Studio Build Tools with C++ workload, or use WSL). **CHANGELOG.md** — Entries for v1.0 (M001 — kernel, policy engine, content inspection, evidence, control plane API), v1.1 (M002 — identity/security, dashboard, deployment), v1.2 (M003 — trustworthiness hardening).
  - Verify: `test -f CONTRIBUTING.md && test -f CHANGELOG.md` — both exist; content covers all sections
  - Done when: Both files exist with accurate, actionable content; Windows workaround documented

## Files Likely Touched

- `crates/kernel/src/main.rs`
- `crates/kernel/src/bootstrap.rs` (new)
- `crates/kernel/src/lib.rs`
- `crates/kernel/tests/proptest_patterns.rs` (new)
- `crates/kernel/Cargo.toml`
- `.github/workflows/ci-quality-security.yml`
- `CONTRIBUTING.md` (new)
- `CHANGELOG.md` (new)
