<overview>
Rust rules for kernel, evidence-collector, and any future Rust crates in Interdict. Apply to all .rs files. Layer on top of core rules. Apply to all .rs files. Layer on top of core rules.
</overview>

<section name="error-handling">
<rule id="result-option" name="Result/Option Handling">
- .unwrap() in non-test code -> Medium ("use ? operator or .expect('reason') with meaningful message")
- .unwrap() in test code -> Low (acceptable, but .expect() is still preferred)
- .expect() without a descriptive message -> Low ("explain why this shouldn't fail")
- Ignoring Result with let _ = fallible_call() without a comment explaining why -> Medium
- unwrap_or_default() hiding a real error -> Low ("consider logging the error before defaulting")
- match on Result/Option where ? or combinators (.map, .and_then) would be cleaner -> Low
</rule>

<rule id="error-types" name="Error Types">
- Using String as an error type -> Medium ("define proper error types with thiserror or manual impl Error")
- Box&lt;dyn Error&gt; in library code -> Medium ("use typed errors; Box&lt;dyn Error&gt; is fine in main/binary crates")
- Error type that doesn't implement std::error::Error -> Medium
- Error variants without enough context for debugging -> Low ("include the value that caused the error")
- Missing #[from] on thiserror variants for common conversions -> Low
</rule>

<rule id="panic-safety" name="Panic Safety">
- panic!() / todo!() / unimplemented!() in production code paths -> High ("handle the error, don't crash")
- unreachable!() that is actually reachable under edge cases -> High
- assert!() in non-test code for runtime conditions -> Medium ("return error instead of asserting")
- Index access (array[i]) without bounds check where array.get(i) would be safer -> Low
- Slice indexing on user-controlled index -> High ("potential panic -- validate bounds")
</rule>
</section>

<section name="ownership-borrowing">
<rule id="unnecessary-cloning" name="Unnecessary Cloning">
- .clone() where a borrow would suffice -> Low ("borrow instead of clone")
- .clone() inside a loop -> Medium ("likely performance issue -- restructure to avoid cloning per iteration")
- .to_string() / .to_owned() when &amp;str would work -> Low
- String parameters where &amp;str would accept both owned and borrowed -> Low ("accept impl AsRef&lt;str&gt; or &amp;str")
</rule>

<rule id="lifetime-clarity" name="Lifetime Clarity">
- Elided lifetimes that make the borrow relationship unclear -> Low ("add explicit lifetime for clarity")
- Structs holding references (&amp;'a T) when they should own the data -> Medium ("if the struct outlives the input, own the data")
- 'static lifetime on types that don't need it -> Low
</rule>

<rule id="smart-pointers" name="Smart Pointers">
- Rc/Arc where a reference would suffice -> Low ("unnecessary reference counting")
- Arc&lt;Mutex&lt;T&gt;&gt; where Mutex&lt;T&gt; alone would work (single-threaded context) -> Low
- Box&lt;T&gt; for small types that could live on the stack -> Low
- Missing Arc on shared state across async tasks -> High ("data race potential")
</rule>
</section>

<section name="concurrency-async">
<rule id="async-patterns" name="Async Patterns">
- Blocking operations (std::fs, std::net, thread::sleep) inside async functions -> High ("use tokio::fs, tokio::net, tokio::time::sleep")
- Spawning tasks without JoinHandle management -> Medium ("task may be silently dropped")
- tokio::spawn without error handling on the JoinHandle -> Medium
- Holding a MutexGuard across an .await point -> High ("deadlock risk -- restructure to release lock before await")
- Using std::sync::Mutex instead of tokio::sync::Mutex in async code -> High (if held across await)
</rule>

<rule id="thread-safety" name="Thread Safety">
- Send / Sync bounds missing on types shared across threads -> High (compiler usually catches, but flag in unsafe contexts)
- unsafe impl Send / unsafe impl Sync without documented safety invariants -> High
- Mutable global state (static mut) -> High ("use once_cell::sync::Lazy / std::sync::OnceLock or inject state")
</rule>

<rule id="channel-patterns" name="Channel Patterns">
- Unbounded channels (mpsc::unbounded_channel) in production code -> Medium ("use bounded channel to apply backpressure")
- Dropping the sender side of a channel without signaling completion -> Low
</rule>
</section>

<section name="unsafe-code">
<rule id="unsafe-blocks" name="Unsafe Blocks">
- unsafe block without a // SAFETY: comment -> High ("document the safety invariants")
- unsafe block that could be replaced with safe code -> Medium ("remove unsafe if a safe alternative exists")
- unsafe used for FFI without proper null checks and lifetime management -> High
- unsafe used to bypass borrow checker instead of restructuring -> High ("redesign the ownership model")
</rule>

<rule id="raw-pointers" name="Raw Pointers">
- Dereferencing raw pointers without validity checks -> High
- Transmute between unrelated types -> High ("almost always wrong -- use proper conversion")
- std::mem::forget to leak memory intentionally without strong justification -> Medium
</rule>
</section>

<section name="api-design">
<rule id="public-api" name="Public API">
- Public functions without /// doc comments -> Low (for utilities), Medium (for core daemon APIs)
- Public types without /// doc comments and usage examples -> Medium
- Returning impl Trait when a concrete type would be more useful to callers -> Low
- pub on fields that should be behind a constructor/builder -> Medium ("encapsulate -- use pub(crate) or a builder")
- Missing #[must_use] on functions that return important values -> Low
</rule>

<rule id="type-design" name="Type Design">
- Structs with boolean fields (boolean trap) -> Low ("consider an enum for clarity")
- Newtype pattern not used for domain types (e.g., ClientId(String) vs raw String) -> Low ("newtypes prevent mixing up IDs")
- Enum variants without data when they should carry context -> Low
- Large enums (>10 variants) that could be split -> Low
</rule>

<rule id="builder-pattern" name="Builder Pattern">
- Structs with >5 fields in the constructor -> Low ("consider a builder pattern")
- Builder that allows invalid states -> Medium ("validate on .build() and return Result")
</rule>
</section>

<section name="interdict-kernel">
<rule id="governance" name="Governance">
Activates when daemon code exists.
- Container launch or proxy initialization without preceding policy_engine::evaluate() call -> High (Interdict architecture rule)
- policy_engine::evaluate() result not checked (must be Ok before proceeding) -> High
- Enforcement bypass via feature flag or config toggle -> High ("policy enforcement is mandatory, never optional")
</rule>

<rule id="rust-security" name="Security">
- Secrets loaded into String (use secrecy::SecretString or zeroize on drop) -> Medium
- File paths from external input used without canonicalization and containment check -> High (Interdict evidence rule)
- exec::Command or std::process::Command without argument sanitization -> High
- Network connections without TLS -> Medium (internal services may be exempt)
- Hard-coded domains or IPs -> High (pet peeve #1)
</rule>

<rule id="resource-management" name="Resource Management">
- Missing timeout on external calls (HTTP, gRPC, IPC) -> Medium
- Missing graceful shutdown handler (tokio::signal or ctrlc) -> Medium
- File handles or network connections not properly closed on error paths -> Medium
- Missing rate limiting on exposed endpoints -> Medium (Interdict rule)
</rule>
</section>

<section name="dependencies-cargo">
<rule id="cargo-rules" name="Dependencies and Cargo">
- unwrap() in build.rs -> Low (common but fragile)
- Feature flags not documented in Cargo.toml -> Low
- [dependencies] without version constraints -> Medium ("pin or constrain versions")
- Using * version requirements -> High ("pin dependencies")
- Large dependency tree for a simple task -> Low ("evaluate if a lighter alternative exists")
- unsafe in transitive dependencies without audit -> Info ("run cargo audit and cargo deny")
</rule>
</section>

<section name="testing">
<rule id="rust-testing" name="Testing">
- Tests that don't clean up resources (temp files, spawned processes) -> Medium
- Missing #[should_panic] annotation on tests that verify panic behavior -> Low
- #[ignore] tests without a comment explaining why -> Low
- Integration tests in src/ instead of tests/ -> Low ("integration tests belong in the tests/ directory")
- Missing proptest or fuzz testing for parsing/validation code -> Info ("consider property-based testing")
</rule>
</section>

<section name="clippy-formatting">
<rule id="clippy-fmt" name="Clippy and Formatting">
- Code that wouldn't pass cargo clippy -- -W clippy::all -W clippy::pedantic -> Low (informational)
- #[allow(clippy::...)] without a comment explaining why the lint is suppressed -> Low
- Non-rustfmt-formatted code -> Low ("run cargo fmt")
- dbg!() macro left in code -> Medium ("remove debug macro")
</rule>
</section>
