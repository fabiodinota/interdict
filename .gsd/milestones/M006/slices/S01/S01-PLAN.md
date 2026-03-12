# S01: Production Safety Panic Elimination

**Goal:** Remove all unwrap/expect calls from hot-path initialization code in the kernel, replacing with infallible LazyLock patterns or Result-propagating alternatives.
**Demo:** `cargo test --workspace` passes; grep confirms zero unwrap/expect in default.rs pattern init, injection.rs default init, and regorus.rs semaphore path.

## Must-Haves

- All 12 `Regex::new().unwrap()` in `default.rs` replaced with `LazyLock<Regex>` compiled once at first use
- `InjectionDetector::default()` is infallible — no `.expect()` on regex compilation
- `regorus.rs:83` `.expect("semaphore guarantees")` replaced with `.ok_or_else()` returning fail-mode verdict
- All existing tests pass without modification (API-compatible changes)

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cargo test --workspace --all-targets` — all tests pass
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `rg 'unwrap\(\)|\.expect\(' crates/kernel/src/policy/patterns/default.rs` — zero matches in pattern initialization
- `rg '\.expect\(' crates/kernel/src/policy/layer2/injection.rs` — zero matches
- `rg '\.expect\(' crates/kernel/src/policy/layer1/regorus.rs` — zero matches

## Observability / Diagnostics

- Runtime signals: tracing::error log if a regex fails to compile (should never happen with literals, but defense in depth)
- Inspection surfaces: none
- Failure visibility: Result<> propagation surfaces compile errors at startup with context
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: existing pattern library API, InjectionDetector API, RegorusPool API
- New wiring introduced in this slice: none — API-compatible replacements
- What remains before the milestone is truly usable end-to-end: S02 (security hygiene) and S03 (quality/DX)

## Tasks

- [ ] **T01: Replace 12 Regex::new().unwrap() in default.rs with LazyLock** `est:30m`
  - Why: Each `Regex::new().unwrap()` is a panic path on invalid regex. LazyLock compiles once at first access and returns `&'static Regex`.
  - Files: `crates/kernel/src/policy/patterns/default.rs`
  - Do: Define each regex as `static RE_EMAIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"...").expect("constant regex"));` at module scope. Update `default_patterns()` to reference `&*RE_EMAIL` etc. The `.expect()` on a constant regex literal is acceptable at module scope because the pattern is a compile-time constant — it cannot fail at runtime. The key change is that it runs once (not per-call) and provides `&'static` references.
  - Verify: `cargo test -p kernel --lib policy::patterns` — all 33 pattern tests pass
  - Done when: `rg 'Regex::new' crates/kernel/src/policy/patterns/default.rs` shows only LazyLock initializers, not inline `.unwrap()` chains

- [ ] **T02: Make InjectionDetector::default() infallible with LazyLock** `est:20m`
  - Why: `InjectionDetector::default()` calls `.expect()` on `RegexSet::new()`, which panics if any pattern is malformed.
  - Files: `crates/kernel/src/policy/layer2/injection.rs`
  - Do: Move the three `RegexSet` compilations to `static` `LazyLock<RegexSet>` items. `Default::default()` clones or references the static sets. The `.expect()` is acceptable on the `LazyLock` initializer since the patterns are string literals. Remove the `.expect()` from the `Default` impl body.
  - Verify: `cargo test -p kernel --lib policy::layer2::injection` — all injection tests pass
  - Done when: `rg '\.expect\(' crates/kernel/src/policy/layer2/injection.rs` returns zero matches outside LazyLock initializers

- [ ] **T03: Replace regorus.rs semaphore expect with fail-mode verdict** `est:20m`
  - Why: `regorus.rs:83` has `.expect("semaphore guarantees")` — if the semaphore is poisoned or the pool is empty, the kernel panics instead of returning the configured fail-mode verdict.
  - Files: `crates/kernel/src/policy/layer1/regorus.rs`
  - Do: Replace `.expect("semaphore guarantees")` with `.ok_or_else(|| PolicyError::PoolExhausted)` (or equivalent). On pool exhaustion, return the `FailMode` default verdict (block if fail-closed, allow if fail-open) with a tracing::error log. Add a unit test that verifies pool exhaustion returns a verdict instead of panicking.
  - Verify: `cargo test -p kernel --lib policy::layer1::regorus` — all tests pass including new exhaustion test
  - Done when: `rg '\.expect\(' crates/kernel/src/policy/layer1/regorus.rs` returns zero matches

## Files Likely Touched

- `crates/kernel/src/policy/patterns/default.rs`
- `crates/kernel/src/policy/layer2/injection.rs`
- `crates/kernel/src/policy/layer1/regorus.rs`
- `crates/kernel/src/error.rs` (if new error variant needed)
