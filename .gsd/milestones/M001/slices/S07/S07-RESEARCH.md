# Phase 6.1: Kernel Integration Wiring - Research

**Researched:** 2026-03-01
**Domain:** Rust kernel binary integration wiring (closing cross-phase gaps)
**Confidence:** HIGH

## Summary

Phase 6.1 closes two P0 integration gaps identified in the v1.0 milestone audit. Both gaps are wiring issues where fully-implemented, tested subsystems are not connected to the kernel binary entry points. The ContentInspector (Phase 3) is never instantiated in `main.rs`, so PII detection and injection blocking are dead code at runtime. The PolicySetManager (Phase 6) is loaded for debug logging only, so hot-reloaded policies never drive enforcement.

The fixes are structurally small (5-10 lines in `main.rs` for INT-01, 10-20 lines in `connect.rs` for INT-02) but require careful attention to the constructor signatures, the builder pattern on `ProxyService`, and the interaction between the static `PolicyPipeline` and the dynamic `PolicySet`. The bulk of the work is in writing integration tests that prove PII redaction and hot-reload enforcement work through the running binary, not just in isolation.

**Primary recommendation:** Wire ContentInspector with `default_patterns()` registry into `ProxyService` via `.with_content_inspector()` in `main.rs`, then replace the static `PolicyPipeline` evaluation path with one that derives policies from the live `PolicySet` loaded via `PolicySetManager`. Validate with two end-to-end integration tests using the existing `TestProxy` + `MockBackend` infrastructure.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PII-01 | Kernel detects and redacts PII (names, emails, phones, addresses, SSNs) in prompts | INT-01 fix wires ContentInspector with default_patterns() containing EMAIL, PHONE, SSN, ADDRESS patterns |
| PII-02 | Kernel detects and redacts financial data (credit cards, bank accounts, SWIFT codes) | INT-01 fix wires default_patterns() containing CREDIT_CARD (with Luhn), IBAN, SWIFT patterns |
| PII-03 | Kernel detects and redacts secrets/credentials (AWS keys, API tokens, private keys) | INT-01 fix wires default_patterns() containing AWS_KEY, OPENAI_KEY, GITHUB_TOKEN, PRIVATE_KEY patterns |
| PII-04 | Kernel detects and redacts PII in streaming responses via sliding window buffer | INT-01 fix enables inspecting_relay_outbound branch in handle_connect; InspectingRelay already implemented |
| PII-05 | Custom pattern definitions per enterprise loaded from policy config | ContentInspector already supports custom PatternRegistry; wiring enables runtime use |
| PII-06 | Redaction uses category-tagged placeholders ([REDACTED:CATEGORY]) | RedactionEngine already formats as [REDACTED:CATEGORY]; wiring activates at runtime |
| KERN-05 | Sliding window token buffer holds 5-10 tokens for multi-token pattern detection | AdaptiveTokenBuffer with Small/Medium/Large presets already built; wiring enables in-binary use |
| KERN-06 | Kernel can sever streaming connection mid-response with policy message | inspecting_relay_outbound with select! termination already implemented; wiring activates the code path |
| PLCY-11 | Prompt injection/jailbreak detection via InjectionDetector | InjectionDetector runs before PII scan in ContentInspector.inspect_request(); wiring enables it |
| PLCY-06 | Policy modules hot-reloaded at runtime without restart | INT-02 fix wires PolicySetManager.load() into enforcement path, replacing static empty pipeline |
| CTRL-03 | Policy distribution pushes compiled modules to kernel via gRPC streaming | INT-02 fix ensures distributed PolicySet is actually used for enforcement, completing the push flow |
</phase_requirements>

## Standard Stack

### Core

This phase does not introduce new dependencies. All required libraries are already in the workspace.

| Library | Version | Purpose | Already In Use |
|---------|---------|---------|----------------|
| arc_swap | (workspace) | Lock-free atomic pointer swap for PolicySetManager | Yes (Phase 6) |
| regorus | (workspace) | Rust-native Rego engine for L1 policy evaluation | Yes (Phase 2) |
| tokio | (workspace) | Async runtime, io::split, select! | Yes (Phase 1) |
| hyper/hyper-util | (workspace) | HTTP proxy, upgrades, service trait | Yes (Phase 1) |
| tower | (workspace) | Service middleware stack | Yes (Phase 1) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rcgen | (workspace) | Test CA certificate generation | Integration tests |
| tokio-rustls | (workspace) | TLS in test tunnels | Integration tests |
| sha2 | (workspace) | Content hashing in evidence | Already used |

### Alternatives Considered

None. This phase uses only existing codebase components.

## Architecture Patterns

### Recommended Changes Structure

```
crates/kernel/src/main.rs                    # INT-01: +5 lines (ContentInspector instantiation)
crates/kernel/src/proxy/connect.rs           # INT-02: ~15 lines (PolicySet -> enforcement wiring)
crates/kernel/tests/integration_wiring_test.rs  # New: 2 E2E integration tests
```

### Pattern 1: ContentInspector Instantiation (INT-01)

**What:** Instantiate `ContentInspector` with `PatternRegistry::default_registry()` and wire it into `ProxyService` via the existing `.with_content_inspector()` builder method.

**Current code (main.rs lines 289-298):**
```rust
let proxy_service = proxy::ProxyService::with_distribution(
    cert_cache.clone(),
    pool.clone(),
    config.clone(),
    pipeline,
    evidence_buffer.clone(),
    full_text_storage,
    Some(policy_set_manager),
    Some(session_store),
);
```

**Required change:**
```rust
// Wire ContentInspector (Phase 3 -> Phase 1 gap closure)
let pattern_registry = Arc::new(policy::patterns::PatternRegistry {
    patterns: policy::patterns::default::default_patterns(),
    version: 1,
});
let content_redactor = Arc::new(policy::redaction::RedactionEngine::empty());
let content_policy_config = Arc::new(policy::config::PolicyConfig {
    id: "builtin:content_inspection".to_string(),
    name: "Content Inspection".to_string(),
    rego_source: None,
    fail_mode: policy::config::FailMode::FailClosed,
    block_response_detail: policy::config::BlockResponseDetail::Opaque,
    redaction_direction: policy::config::RedactionDirection::Both,
    background_l2: false,
    enabled: true,
});
let content_inspector = Arc::new(
    policy::content_inspection::ContentInspector::new(
        pattern_registry,
        content_redactor,
        content_policy_config,
    ),
);

let proxy_service = proxy::ProxyService::with_distribution(
    cert_cache.clone(),
    pool.clone(),
    config.clone(),
    pipeline,
    evidence_buffer.clone(),
    full_text_storage,
    Some(policy_set_manager),
    Some(session_store),
)
.with_content_inspector(content_inspector);
```

**Why this works:** The `with_content_inspector()` builder method already exists on `ProxyService` (connect.rs:476-479). When `content_inspector` is `Some`, `handle_connect()` branches into `inspecting_relay_outbound()` instead of `relay::bidirectional()` (connect.rs:285-333). The `ContentInspector::new()` constructor requires `Arc<PatternRegistry>`, `Arc<RedactionEngine>`, and `Arc<PolicyConfig>` -- all types already available.

**Constructor signature (content_inspection.rs:46-58):**
```rust
pub fn new(
    registry: Arc<PatternRegistry>,
    redactor: Arc<RedactionEngine>,
    policy_config: Arc<PolicyConfig>,
) -> Self
```

**Confidence:** HIGH -- all types and methods are verified in source code.

### Pattern 2: PolicySetManager Enforcement Wiring (INT-02)

**What:** Replace the static `PolicyPipeline` evaluation with one that uses policies from the live `PolicySet` loaded via `PolicySetManager`.

**Current code (connect.rs:518-526) -- debug logging only:**
```rust
if let Some(ref psm) = policy_set_manager {
    let current = psm.load();
    tracing::debug!(
        policy_version = current.version,
        policy_count = current.policies.len(),
        "serving request with dynamic policy set"
    );
}
```

**Key challenge:** The current code passes `pipeline` (a static `Arc<PolicyPipeline>`) to `handle_connect()`. The `PolicyPipeline::evaluate()` method uses its own internal `regorus_pool` and `policies` list. To wire the live `PolicySet`, we need to either:

a) Construct a new `PolicyPipeline` per-request from the `PolicySet` (expensive -- creates Regorus pool clone)
b) Pass the `PolicySet`'s `regorus_pool` and `policies` into the existing pipeline evaluate path
c) Use the `PolicySet`'s `regorus_pool` directly for Rego evaluation, bypassing `PolicyPipeline`

**Recommended approach (option a, simplified):** When `policy_set_manager` is present AND the loaded `PolicySet` has policies (version > 0), construct a request-scoped `PolicyPipeline` from the live `PolicySet`'s components. When the `PolicySet` is empty (version 0, no distribution yet), fall back to the static `pipeline`.

**Why option (a):** The `PolicyPipeline::new()` constructor is cheap -- it takes `Arc`-wrapped references. The `RegorusPool`, `WasmEngine`, etc. are all `Arc`-shared, so constructing a new `PolicyPipeline` only allocates the struct itself (~100 bytes). The existing `evaluate()` method, L1/L2/L3 flow, and audit trail generation all continue to work unchanged.

**Sketch:**
```rust
// In ProxyService::call(), before passing pipeline to handle_connect:
let effective_pipeline = if let Some(ref psm) = policy_set_manager {
    let current = psm.load();
    if current.version > 0 && !current.policies.is_empty() {
        tracing::debug!(
            policy_version = current.version,
            policy_count = current.policies.len(),
            "using dynamic policy set for enforcement"
        );
        // Build a request-scoped pipeline from live PolicySet
        Some(Arc::new(PolicyPipeline::new(
            current.regorus_pool.clone(),
            allowlist_policy.clone(),        // from ProxyService fields
            classifier.clone(),              // from ProxyService fields
            background_l2.clone(),           // from ProxyService fields
            review_queue.clone(),            // from ProxyService fields
            redaction_engine.clone(),        // from ProxyService fields
            current.wasm_engine.clone(),
            current.policies.clone(),
        )))
    } else {
        pipeline.clone()  // Fall back to static pipeline
    }
} else {
    pipeline.clone()
};
```

**Issue with this sketch:** `ProxyService` does not currently store the individual pipeline components (`classifier`, `review_queue`, `redaction_engine`, etc.) -- they are encapsulated inside the `Arc<PolicyPipeline>`. To build a new pipeline from `PolicySet`, we would need access to these components.

**Simpler alternative (recommended):** Add `PolicyPipeline` components as shared fields accessible from the `PolicySet`, OR add a method to `PolicyPipeline` like `with_policies(regorus_pool, wasm_engine, policies)` that returns a new pipeline sharing existing L2/L3/redaction resources but using the live L1 policies and Regorus pool.

**Simplest approach (recommended):** Add a method `PolicyPipeline::with_live_set(&self, policy_set: &PolicySet) -> PolicyPipeline` that clones the pipeline but replaces `regorus_pool`, `wasm_engine`, and `policies` with those from the live `PolicySet`. This avoids exposing internal fields and keeps the existing evaluation logic intact.

**Confidence:** HIGH for the overall approach. MEDIUM for the exact API surface -- may need minor adjustments during implementation.

### Pattern 3: Integration Test Architecture

**What:** Two E2E tests proving the wiring works through the running binary.

**Test 1: PII redaction in proxied request (SC3 from phase description)**
- Use `TestProxy` infrastructure (existing in `tests/integration_tests/helpers.rs`)
- BUT: `TestProxy` currently creates `ProxyService::new()` without content inspector
- Need to extend `TestProxy` or create a variant that includes `ContentInspector`
- Flow: Client -> CONNECT -> TLS -> send request containing email -> verify response contains `[REDACTED:EMAIL]` instead of original email
- Challenge: The inspection happens on the outbound tunnel relay, which means the client sends data through the TLS tunnel and the inspector modifies it before forwarding to upstream. The `MockBackend` receives the redacted content.
- Strategy: Create MockBackend that echoes back the request body. Send content with PII through the tunnel. Check that the echoed response does NOT contain the original PII.

**Test 2: Hot-reload policy enforcement (SC4 from phase description)**
- Simulated (without real gRPC server): Directly call `PolicySetManager::swap()` to install a blocking policy, then verify the next request through the proxy is blocked.
- Flow: Create proxy with empty PolicySet -> verify request passes -> swap in a PolicySet with a blocking Rego policy -> verify next request is blocked.
- This tests the INT-02 wiring: that `PolicySetManager.load()` feeds into enforcement.

**Confidence:** MEDIUM -- TestProxy needs extension to support content inspector and dynamic policies. The exact approach depends on how much of the TestProxy infrastructure can be reused vs. needs modification.

### Anti-Patterns to Avoid

- **Full pipeline reconstruction per request:** Do not create brand new `RegorusPool` or `WasmEngine` per request. These are expensive. Use `Arc`-shared references from the `PolicySet`.
- **Breaking backward compatibility:** The static `PolicyPipeline` (from startup config) must still work when `PolicySetManager` is absent or empty. Tests without distribution enabled must not break.
- **Blocking the hot path with clone:** `PolicySet` contains `Vec<PolicyConfig>` which requires cloning. Since policies are small metadata structs and updates are infrequent, this is acceptable. Do NOT clone large Rego source strings per-request.
- **Modifying `handle_connect` signature excessively:** The function already has 10 parameters. Avoid adding more. If the effective pipeline is determined in `ProxyService::call()`, pass it as the existing `pipeline` parameter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pattern registry | Custom pattern list | `default_patterns()` from `policy::patterns::default` | Already covers all PII-01/02/03 categories with validators |
| Atomic policy swap | Manual Mutex/RwLock | `PolicySetManager` (ArcSwap) | Lock-free reads, proven in Phase 6 |
| Request-scoped pipeline | Manual evaluation loop | `PolicyPipeline::evaluate()` | Handles L1/L2/L3 flow, audit trail, redaction |
| Test infrastructure | Custom proxy setup | `TestProxy` + `MockBackend` from helpers.rs | CA generation, TLS, tunnel, already battle-tested |

**Key insight:** Both gaps are wiring issues, not missing functionality. The implementation should only connect existing components -- zero new algorithms or data structures.

## Common Pitfalls

### Pitfall 1: ContentInspector Constructor Mismatch

**What goes wrong:** Passing wrong types to `ContentInspector::new()`. The constructor takes `Arc<PatternRegistry>`, `Arc<RedactionEngine>`, `Arc<PolicyConfig>` -- but the `PolicyConfig` here is the content inspection policy config, not a pipeline policy config. Getting confused between the two.
**Why it happens:** The `PolicyConfig` type is used in two contexts: pipeline policy evaluation and content inspection configuration.
**How to avoid:** Create a dedicated `PolicyConfig` for content inspection with `id: "builtin:content_inspection"`, `rego_source: None`. Do not reuse pipeline policy configs.
**Warning signs:** If `rego_source` is set on the content inspection PolicyConfig, something is wrong.

### Pitfall 2: PolicyPipeline Components Not Accessible

**What goes wrong:** Trying to build a new `PolicyPipeline` from `PolicySet` components, but the existing pipeline's `classifier`, `review_queue`, `redaction_engine` fields are private and not accessible from `ProxyService::call()`.
**Why it happens:** `PolicyPipeline` encapsulates its components. `ProxyService` only holds `Arc<PolicyPipeline>`.
**How to avoid:** Either (a) add a `with_live_set()` method to `PolicyPipeline`, or (b) store the shared components (classifier, review_queue, redaction_engine) as fields on `ProxyService` in addition to the pipeline. Option (a) is cleaner.
**Warning signs:** If you find yourself making `PolicyPipeline` fields `pub`, reconsider the approach.

### Pitfall 3: TestProxy Does Not Support Content Inspector

**What goes wrong:** The existing `TestProxy` creates `ProxyService::new()` (connect.rs:406-418) which does NOT include content inspector or policy set manager. Integration tests using the default TestProxy will NOT exercise the wired code paths.
**Why it happens:** TestProxy was built for Phase 1 tests before content inspection and distribution existed.
**How to avoid:** Either extend `TestProxy` with configuration options for content inspector / policy set manager, or create a separate test helper that builds a fully-wired ProxyService. The cleanest approach is to add a `TestProxyConfig` field for `content_inspector: Option<Arc<ContentInspector>>` and `policy_set_manager: Option<Arc<PolicySetManager>>`.
**Warning signs:** Tests pass but the code path never enters the `if let Some(ref inspector) = content_inspector` branch.

### Pitfall 4: Rego Source Format Mismatch in PolicySet

**What goes wrong:** The `rego_source` field in `PolicyConfig` built from `PolicySet` contains the actual Rego source code (string), but `PolicyPipeline::evaluate()` uses it as a file path to derive the Rego package name (connect.rs:196-204). The path-based package name extraction (`rsplit('/')`) will not work for inline Rego source.
**Why it happens:** Phase 2 Rego policies used filesystem paths; Phase 6 distribution inlines the Rego source.
**How to avoid:** The `RegorusPool` in `PolicySet` is pre-built with the Rego sources already loaded (see `snapshot.rs:66-79`). Policy evaluation should use the entrypoint from distribution metadata, not derive it from the `rego_source` field path. This may require passing the entrypoint alongside the policy config.
**Warning signs:** Rego evaluation errors saying "rule not found" when using distributed policies.

### Pitfall 5: Static Pipeline Fallback Races

**What goes wrong:** When distribution is configured but the first snapshot has not arrived yet (version 0, empty policies), the code falls back to the static pipeline. If a snapshot arrives between the version check and the pipeline construction, the request might use stale data.
**Why it happens:** ArcSwap is lock-free but not transactional.
**How to avoid:** Load the `PolicySet` once via `psm.load()`, use the resulting `Guard` for the entire request. The `Guard` keeps the old reference alive even if a swap happens. This is already the ArcSwap design -- just use the loaded guard consistently.
**Warning signs:** Intermittent test failures where policies appear to "flicker" between old and new.

## Code Examples

### Example 1: ContentInspector Wiring (main.rs)

```rust
// After pipeline creation (line ~170), before ProxyService construction:

// Phase 6.1 INT-01: Wire ContentInspector into ProxyService
let pattern_registry = Arc::new(policy::patterns::PatternRegistry {
    patterns: policy::patterns::default::default_patterns(),
    version: 1,
});
let content_redactor = Arc::new(policy::redaction::RedactionEngine::empty());
let content_policy_config = Arc::new(policy::config::PolicyConfig {
    id: "builtin:content_inspection".to_string(),
    name: "Content Inspection".to_string(),
    rego_source: None,
    fail_mode: policy::config::FailMode::FailClosed,
    block_response_detail: policy::config::BlockResponseDetail::Opaque,
    redaction_direction: policy::config::RedactionDirection::Both,
    background_l2: false,
    enabled: true,
});
let content_inspector = Arc::new(
    policy::content_inspection::ContentInspector::new(
        pattern_registry,
        content_redactor,
        content_policy_config,
    ),
);
tracing::info!("content inspector initialized with default patterns");
```

**Source:** Verified against `crates/kernel/src/policy/content_inspection.rs:46-58` constructor signature.

### Example 2: PolicyPipeline.with_live_set() Method

```rust
// Add to PolicyPipeline impl in policy/mod.rs:

/// Create a new pipeline sharing L2/L3/redaction resources but using
/// the live L1 policies from a hot-reloaded PolicySet.
///
/// Called per-request when PolicySetManager holds a non-empty set.
/// Only the regorus_pool, wasm_engine, and policies list are replaced.
pub fn with_live_set(&self, policy_set: &PolicySet) -> PolicyPipeline {
    PolicyPipeline {
        regorus_pool: policy_set.regorus_pool.clone(),
        allowlist_policy: self.allowlist_policy.clone(),
        classifier: self.classifier.clone(),
        background_l2: None,  // Background L2 is analytics-only, safe to skip
        review_queue: self.review_queue.clone(),
        redaction_engine: self.redaction_engine.clone(),
        wasm_engine: policy_set.wasm_engine.clone(),
        policies: policy_set.policies.clone(),
    }
}
```

**Source:** Based on `PolicyPipeline` struct fields (policy/mod.rs:118-128) and `PolicySet` fields (hot_reload.rs:26-39).

### Example 3: Enforcement Wiring in ProxyService::call() (connect.rs)

```rust
// Replace lines 518-526 with:
let effective_pipeline = if let Some(ref psm) = policy_set_manager {
    let current = psm.load();
    if current.version > 0 && !current.policies.is_empty() {
        tracing::debug!(
            policy_version = current.version,
            policy_count = current.policies.len(),
            "using live policy set for enforcement"
        );
        if let Some(ref base_pipeline) = pipeline {
            Some(Arc::new(base_pipeline.with_live_set(&current)))
        } else {
            pipeline.clone()
        }
    } else {
        tracing::debug!("policy set empty, using static pipeline");
        pipeline.clone()
    }
} else {
    pipeline.clone()
};
```

### Example 4: Integration Test - PII Redaction Through Proxy

```rust
#[tokio::test]
async fn test_pii_redaction_through_proxy() {
    // 1. Create TestProxy with content inspector enabled
    // 2. Create MockBackend that echoes request body
    // 3. Send CONNECT through proxy, then TLS, then HTTP with PII content
    // 4. MockBackend receives the request -- verify it contains [REDACTED:EMAIL]
    // 5. Or: verify the response echoed back has the PII redacted
}
```

**Note:** The exact test implementation depends on how `TestProxy` is extended. See Pitfall 3.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static PolicyPipeline only | ArcSwap PolicySetManager + static fallback | Phase 6 (just completed) | INT-02 wires dynamic set into enforcement |
| Zero-copy relay only | inspecting_relay_outbound with ContentInspector | Phase 3 (completed) | INT-01 activates inspection branch |
| Manual pattern list | `default_patterns()` comprehensive library | Phase 3 (completed) | 12 patterns covering PII/financial/secrets |

**Deprecated/outdated:**
- None. All components are current as of Phase 6 completion.

## Open Questions

1. **Background L2 in request-scoped pipeline**
   - What we know: `with_live_set()` skips `background_l2` (set to None) because `BackgroundL2` is not `Clone` and is analytics-only.
   - What's unclear: Whether skipping background L2 for hot-reloaded policies is acceptable or if it should share the original's background L2.
   - Recommendation: Skip it. Background L2 is fire-and-forget analytics enrichment, not enforcement. Can be wired in Phase 7 if needed.

2. **Rego entrypoint derivation for distributed policies**
   - What we know: `PolicyPipeline::evaluate()` derives the Rego entrypoint from `rego_source` path (line 196-204). Distributed policies have inline Rego source, not file paths.
   - What's unclear: Whether the inline source will cause the entrypoint derivation to fail or produce wrong paths.
   - Recommendation: Verify during implementation. The `rego_source` field from distribution snapshot contains the actual Rego code string, but the entrypoint derivation does `rsplit('/')` which would split on a newline or return the entire string. May need to store the entrypoint separately or use the policy ID as the package name.

3. **TestProxy extension approach**
   - What we know: Current TestProxy creates a bare ProxyService without content inspector or PSM.
   - What's unclear: Whether to extend TestProxyConfig or create a parallel test helper.
   - Recommendation: Extend `TestProxyConfig` with optional `content_inspector` and `policy_set_manager` fields. Keeps existing tests unchanged while enabling new tests.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | cargo test (built-in) |
| Config file | `crates/kernel/Cargo.toml` (test targets) |
| Quick run command | `cargo test -p kernel --test integration_wiring_test` |
| Full suite command | `cargo test --workspace --all-targets` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PII-01 through PII-06 | PII redaction in proxied request | integration | `cargo test -p kernel --test integration_wiring_test::test_pii_redaction_through_proxy` | Wave 0 |
| KERN-05, KERN-06 | Sliding window and stream severing active at runtime | integration | Covered by PII redaction proxy test (branch taken when inspector is Some) | Wave 0 |
| PLCY-11 | Injection detection active at runtime | integration | `cargo test -p kernel --test integration_wiring_test::test_injection_blocked_through_proxy` | Wave 0 |
| PLCY-06, CTRL-03 | Policy hot-reload drives enforcement | integration | `cargo test -p kernel --test integration_wiring_test::test_hot_reload_enforcement` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cargo test -p kernel --test integration_wiring_test`
- **Per wave merge:** `cargo test --workspace --all-targets`
- **Phase gate:** Full suite + `cargo clippy --workspace --all-targets -- -D warnings` + `cargo fmt --all -- --check`

### Wave 0 Gaps

- [ ] `crates/kernel/tests/integration_wiring_test.rs` -- new file covering PII redaction and hot-reload enforcement
- [ ] Possible extension to `crates/kernel/tests/integration_tests/helpers.rs` -- TestProxy with content inspector support

## Sources

### Primary (HIGH confidence)

- `crates/kernel/src/main.rs` -- current binary entry point, lines 80-298 (pipeline + PSM + ProxyService construction)
- `crates/kernel/src/proxy/connect.rs` -- ProxyService struct, call() dispatch, handle_connect() relay branching (lines 388-571)
- `crates/kernel/src/policy/content_inspection.rs` -- ContentInspector constructor and inspect_request() (lines 44-152)
- `crates/kernel/src/policy/hot_reload.rs` -- PolicySetManager load/swap API (lines 46-87)
- `crates/kernel/src/policy/mod.rs` -- PolicyPipeline struct and evaluate() (lines 118-371)
- `crates/kernel/src/policy/distribution/snapshot.rs` -- apply_snapshot/apply_delta (lines 86-224)
- `crates/kernel/src/policy/patterns/default.rs` -- default_patterns() (lines 23-47)
- `crates/kernel/src/proxy/relay.rs` -- inspecting_relay_outbound (lines 65-135)
- `.planning/v1.0-MILESTONE-AUDIT.md` -- INT-01, INT-02 gap definitions with exact code locations
- `crates/kernel/tests/integration_tests/helpers.rs` -- TestProxy and MockBackend infrastructure

### Secondary (MEDIUM confidence)

- `crates/kernel/tests/content_inspection_test.rs` -- existing ContentInspector integration tests (patterns for new tests)
- `crates/kernel/tests/distribution_test.rs` -- existing distribution/hot-reload tests (patterns for new tests)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in workspace, no new dependencies
- Architecture: HIGH -- code paths verified in source, constructor signatures confirmed, builder pattern API exists
- Pitfalls: HIGH -- identified from direct code reading, not speculation
- Integration tests: MEDIUM -- TestProxy extension approach needs validation during implementation

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable codebase, no external dependency changes)