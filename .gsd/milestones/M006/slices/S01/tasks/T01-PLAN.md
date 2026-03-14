# T01: Replace 12 Regex::new().unwrap() in default.rs with LazyLock

**Estimate:** 30m

## Why
Each `Regex::new().unwrap()` is a panic path on invalid regex. LazyLock compiles once at first access and returns `&'static Regex`.

## Files
- `crates/kernel/src/policy/patterns/default.rs`

## Do
Define each regex as `static RE_EMAIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"...").expect("constant regex"));` at module scope. Update `default_patterns()` to reference `&*RE_EMAIL` etc. The `.expect()` on a constant regex literal is acceptable at module scope because the pattern is a compile-time constant — it cannot fail at runtime. The key change is that it runs once (not per-call) and provides `&'static` references.

## Verify
- `cargo test -p kernel --lib policy::patterns` — all pattern tests pass
- `rg 'Regex::new' crates/kernel/src/policy/patterns/default.rs` shows only LazyLock initializers, not inline `.unwrap()` chains

## Done When
- Zero `.unwrap()` calls in `default.rs` code
- All `Regex::new()` calls inside `LazyLock::new()` closures
- `default_patterns()` references statics, no inline construction
