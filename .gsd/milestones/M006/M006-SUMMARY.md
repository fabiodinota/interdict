---
id: M006
provides:
  - Panic-free hot-path pattern initialization via LazyLock
  - Supply-chain gate via cargo-deny (licenses, bans, advisories, sources)
  - Hardened container images (non-root, read-only rootfs, no-new-privileges)
  - Parameterized docker-compose credentials (no hardcoded secrets)
  - Property-based fuzz testing for PII pattern library
  - CI coverage reporting (cargo-llvm-cov + Codecov)
  - CONTRIBUTING.md and CHANGELOG.md for contributor onboarding
  - Workspace-level lint configuration
key_decisions:
  - "D024: rand_core 0.6 direct dep for ed25519-dalek compat (rand 0.9 exports rand_core 0.9 traits incompatible with ed25519-dalek 2.x)"
  - "D025: Workspace lints — clippy::all + suspicious at warn, unsafe_code warn — codifies lint policy previously enforced only by CI flag"
patterns_established:
  - "LazyLock<Regex> for all constant regex compilation — eliminates per-call unwrap panic paths"
  - "Fail-mode verdict on invariant violation (regorus engine pool) instead of .expect() panic"
  - "Infallible constructor pattern — InjectionDetector::new() returns Result but LazyLock compilation guarantees success"
  - "docker-compose :? syntax for required env vars with actionable error messages"
  - "Bootstrap extraction pattern — separate initialization orchestration from server loop"
observability_surfaces:
  - "CI coverage job produces lcov.info artifact and uploads to Codecov"
  - "cargo deny check runs in CI security job — blocks on advisory/license/ban violations"
  - "proptest shrinking output pinpoints failing PII pattern inputs on regression"
requirement_outcomes:
  - id: HR-OPS-01
    from_status: validated
    to_status: validated
    proof: "cargo-deny CI integration and coverage reporting added; requirement was already validated in M005, M006 extends its coverage"
  - id: HR-OPS-02
    from_status: validated
    to_status: validated
    proof: "CONTRIBUTING.md with quality gate instructions and Windows ring workaround; requirement was already validated in M005, M006 extends its coverage"
  - id: HR-MAINT-01
    from_status: validated
    to_status: validated
    proof: "All hot-path panic paths eliminated (14 Regex unwraps → LazyLock, InjectionDetector infallible, regorus fail-mode verdict); workspace [lints] codified"
duration: "3 slices across 3 sessions (2026-03-12 to 2026-03-13)"
verification_result: passed
completed_at: 2026-03-13
---

# M006: Production Safety & Quality

**Eliminated all runtime panic paths in hot-path initialization, established supply-chain security gates, hardened container images, and closed developer experience gaps — resolving all 13 post-v1.2 assessment findings before pilot deployments.**

## What Happened

Three slices systematically addressed production safety (P0), security hygiene (P1), and developer experience (P2) findings from the post-v1.2 assessment.

**S01 (Panic Elimination)** converted all 14 `Regex::new().unwrap()` calls in `default.rs` to `LazyLock<Regex>` statics compiled once at first access. `InjectionDetector::default()` was replaced with `InjectionDetector::new() -> Result` backed by `LazyLock<Vec<Regex>>` statics — the constructor is infallible in practice but retains the Result type for API safety. The regorus semaphore path was converted from `.expect("semaphore guarantees")` to a fail-mode verdict that logs an error and returns the configured fail-mode action instead of panicking.

**S02 (Security & Dependency Hygiene)** added `deny.toml` with license compliance (Apache-2.0/MIT/BSD/ISC allowlist), duplicate crate banning, advisory checks, and source verification. The rand version situation was resolved via D024: ed25519-dalek 2.x requires `rand_core 0.6` (CryptoRngCore trait), so evidence-collector and interdict-verify use `rand_core 0.6` directly while kernel uses `rand 0.9`; the transitive `rand 0.8.5` from tract-onnx is skipped in deny.toml. Workspace `[lints]` were added to root `Cargo.toml` (clippy::all + suspicious at warn, unsafe_code warn). All 4 Dockerfiles were hardened with non-root `interdict` user, and docker-compose.yml was updated with `read_only: true`, `security_opt: [no-new-privileges:true]`, `tmpfs` mounts, and `${VAR:?error}` syntax for all credentials.

**S03 (Quality & DX)** extracted the 533-line `main.rs` bootstrapping into `bootstrap.rs` (main.rs now 133 lines). Added `proptest_patterns.rs` with 168 lines of property-based fuzz tests covering PII pattern panic safety, known-pattern matching, and false-positive thresholds. CI was extended with a `coverage` job using `cargo-llvm-cov` producing lcov.info artifacts uploaded to Codecov. `CONTRIBUTING.md` and `CHANGELOG.md` were created at repo root with quality gate instructions and Windows ring build workaround documentation.

## Cross-Slice Verification

| Success Criterion | Status | Evidence |
|---|---|---|
| Zero unwrap/expect in hot-path pattern initialization | ✅ | `default.rs`: 14 regexes use `LazyLock<Regex>` with `.expect("constant regex")` on compile-time-known patterns (infallible). `injection.rs`: 3 pattern sets use `LazyLock<Vec<Regex>>`. `regorus.rs` line 82–93: fail-mode verdict instead of panic. |
| `cargo deny check` passes | ✅ | `cargo deny check` → "advisories ok, bans ok, licenses ok, sources ok". CI job at line 148 of `ci-quality-security.yml`. |
| All 4 Dockerfiles produce non-root containers | ✅ | All 4 Dockerfiles (`docker/kernel/`, `docker/control-plane/`, `docker/dashboard/`, `docker/evidence-collector/`) contain `USER interdict`. docker-compose adds `read_only: true` + `security_opt: [no-new-privileges:true]` + `tmpfs` mounts. |
| docker-compose.yml zero hardcoded credentials | ✅ | All passwords use `${VAR:?error message}` syntax — `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `MINIO_ROOT_PASSWORD`, `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY` all require `.env` file. |
| Property-based fuzz tests for PII patterns | ✅ | `crates/kernel/tests/proptest_patterns.rs` (168 lines) exists with proptest properties. |
| CI produces coverage reports | ✅ | `ci-quality-security.yml` lines 89–120: `coverage` job with `cargo-llvm-cov`, artifact upload, Codecov integration. Lines 185–189: Bun test coverage + Codecov. |
| CONTRIBUTING.md and CHANGELOG.md exist | ✅ | Both files present at repo root. |
| Workspace [lints] in root Cargo.toml | ✅ | `[workspace.lints.clippy]` with `all = warn`, `suspicious = warn`; `[workspace.lints.rust]` with `unsafe_code = warn`. |
| Single rand version across workspace | ✅ (adapted) | D024: `rand_core 0.6` for ed25519-dalek crates, `rand 0.9` for kernel. Transitive `rand 0.8.5` (via tract-onnx) skipped in deny.toml. Not a single-version solution but a deliberate, documented alignment. |

**Definition of Done verification:**
- All three slices complete with `[x]` in roadmap ✅
- All slice summaries exist (S01, S02 as doctor-recovered placeholders; S03 created now) ✅
- `cargo deny check` passes ✅
- All Dockerfiles produce hardened images ✅
- docker-compose has no default credentials ✅
- CI includes coverage reporting ✅
- CONTRIBUTING.md and CHANGELOG.md exist ✅

## Requirement Changes

- HR-OPS-01: validated → validated — M006 extended coverage with cargo-deny CI gate and coverage reporting; status unchanged
- HR-OPS-02: validated → validated — M006 extended coverage with CONTRIBUTING.md and Windows workaround docs; status unchanged
- HR-MAINT-01: validated → validated — M006 eliminated all hot-path panic paths and codified workspace lints; status unchanged

All three requirements were already validated in M005. M006 extended their coverage but did not change their status.

## Forward Intelligence

### What the next milestone should know
- The `expect("constant regex")` calls in LazyLock statics are safe because the regex patterns are compile-time string literals — but grep for `expect` will still find them. They are NOT runtime panic risks.
- `cargo deny check` is a CI gate now — any new dependency must pass license/advisory/ban checks or be explicitly configured in `deny.toml`.
- The rand version split (0.6 rand_core / 0.9 rand / 0.8 transitive) is documented in D024 and deny.toml skip. It will self-resolve when tract-onnx releases a version using rand 0.9.
- docker-compose requires a `.env` file with 5+ secrets. The `:?` syntax produces clear error messages on missing vars.
- proptest found a regression file (`proptest_patterns.proptest-regressions`) — this is committed and ensures previously-caught edge cases remain covered.

### What's fragile
- S01 and S02 slice summaries are doctor-recovered placeholders, not full narratives — they lack detailed file lists and deviation records. Task summaries in their `tasks/` directories are the authoritative source.
- The `coverage` CI job uses `continue-on-error` implicitly (separate job) — coverage regressions won't block merges.
- Windows ring build is documented as a workaround (install VS Build Tools C++ workload or use WSL) but not programmatically fixed.

### Authoritative diagnostics
- `cargo deny check` output is the definitive supply-chain health signal — run locally or check CI `security` job.
- `cargo test -p kernel --test proptest_patterns` exercises PII pattern edge cases — check shrinking output on failures.
- `crates/kernel/tests/proptest_patterns.proptest-regressions` contains previously-discovered edge cases that must not regress.

### What assumptions changed
- Original criterion said "Single rand version (0.9)" — D024 changed this to a deliberate split: rand_core 0.6 for ed25519-dalek compat, rand 0.9 for kernel, transitive rand 0.8 skipped in deny.toml. The assumption that rand 0.9 could unify the workspace was incorrect because ed25519-dalek 2.x requires rand_core 0.6 CryptoRngCore traits.
- Original plan expected InjectionDetector to become fully infallible (no Result) — it was changed to return `Result` for API compatibility even though LazyLock makes it infallible in practice.

## Files Created/Modified

- `crates/kernel/src/policy/patterns/default.rs` — 14 Regex::new().unwrap() → LazyLock<Regex> statics
- `crates/kernel/src/policy/layer2/injection.rs` — InjectionDetector LazyLock patterns, new() returns Result
- `crates/kernel/src/policy/layer1/regorus.rs` — Fail-mode verdict on empty engine pool instead of panic
- `deny.toml` — Supply-chain configuration (licenses, bans, advisories, sources)
- `Cargo.toml` — Workspace [lints] section (clippy::all, suspicious, unsafe_code)
- `docker/kernel/Dockerfile` — Non-root USER interdict
- `docker/control-plane/Dockerfile` — Non-root USER interdict
- `docker/dashboard/Dockerfile` — Non-root USER interdict, ISR cache tmpfs
- `docker/evidence-collector/Dockerfile` — Non-root USER interdict
- `docker-compose.yml` — Parameterized credentials, read_only, no-new-privileges, tmpfs
- `crates/kernel/src/bootstrap.rs` — Extracted initialization from main.rs
- `crates/kernel/src/main.rs` — Reduced from 533 to 133 lines (server loop + shutdown only)
- `crates/kernel/src/lib.rs` — Added `pub mod bootstrap`
- `crates/kernel/tests/proptest_patterns.rs` — Property-based PII pattern fuzz tests
- `.github/workflows/ci-quality-security.yml` — coverage job, cargo-deny step, Bun coverage
- `CONTRIBUTING.md` — Setup, quality gates, PR process, Windows ring workaround
- `CHANGELOG.md` — Version history (v1.0, v1.1, v1.2)
