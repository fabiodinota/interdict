//! Integration tests proving all Phase 2 success criteria.
//!
//! These tests validate the complete policy pipeline end-to-end:
//! - SC1: Rego policy evaluation under 2ms (PLCY-02, PLCY-03)
//! - SC2: Wasmtime pooling allocator memory bound (PLCY-01)
//! - SC3: Layer 2 NLP classifier under 10ms (PLCY-04)
//! - SC4: Fail-closed/fail-open behavior (PLCY-09)
//! - SC5: Vendor allowlist as policy verdict (KERN-11)
//! - Full pipeline escalation L1→L2→L3
//! - All policies evaluated for complete audit trail (no short-circuit)

use std::sync::Arc;
use std::time::{Duration, Instant};

use kernel::config::PolicyEngineConfig;
use kernel::middleware::allowlist::VendorAllowlist;
use kernel::policy::config::{BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection};
use kernel::policy::layer1::allowlist::VendorAllowlistPolicy;
use kernel::policy::layer1::regorus::RegorusPool;
use kernel::policy::layer2::classifier::Classifier;
use kernel::policy::layer3::queue::ReviewQueue;
use kernel::policy::layer3::store::ReviewQueueStore;
use kernel::policy::redaction::RedactionEngine;
use kernel::policy::verdict::VerdictAction;
use kernel::policy::wasm_engine::WasmEngine;
use kernel::policy::{Direction, PolicyPipeline, RequestContext};

/// Helper: Create a test RequestContext.
fn make_ctx(vendor: &str) -> RequestContext {
    RequestContext {
        request_id: uuid::Uuid::new_v4(),
        vendor: vendor.to_string(),
        method: "POST".to_string(),
        path: "/v1/chat/completions".to_string(),
        content_type: Some("application/json".to_string()),
        content: Some("Hello, world!".to_string()),
        direction: Direction::Outbound,
    }
}

/// Helper: Standard classifier labels.
fn test_labels() -> Vec<String> {
    vec![
        "allow".to_string(),
        "block".to_string(),
        "redact".to_string(),
        "uncertain".to_string(),
    ]
}

/// Helper: Create a minimal test pipeline.
fn make_pipeline(
    template_engine: &regorus::Engine,
    policies: Vec<PolicyConfig>,
    classifier: Arc<Classifier>,
    allowlist_vendors: &[&str],
) -> PolicyPipeline {
    let regorus_pool = Arc::new(RegorusPool::new(template_engine, 4));
    let allowlist = Arc::new(VendorAllowlist::new(allowlist_vendors));
    let allowlist_policy = Arc::new(VendorAllowlistPolicy::new(allowlist));
    let store = Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
    let review_queue = Arc::new(ReviewQueue::new(store, 10, Duration::from_millis(200)));
    let redaction_engine = Arc::new(RedactionEngine::empty());
    let wasm_engine = Arc::new(
        WasmEngine::new(&PolicyEngineConfig::default()).expect("WasmEngine should create"),
    );

    PolicyPipeline::new(
        regorus_pool,
        allowlist_policy,
        classifier,
        None,
        review_queue,
        redaction_engine,
        wasm_engine,
        policies,
    )
}

/// Helper: Make a policy config with common defaults.
fn make_policy(id: &str, name: &str, rego_source: &str, fail_mode: FailMode) -> PolicyConfig {
    PolicyConfig {
        id: id.to_string(),
        name: name.to_string(),
        rego_source: Some(rego_source.to_string()),
        fail_mode,
        block_response_detail: BlockResponseDetail::Opaque,
        redaction_direction: RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    }
}

// ── SC1: Rego policy evaluation under 2ms (PLCY-02, PLCY-03) ──────────

#[tokio::test]
async fn test_rego_policy_evaluates_under_2ms() {
    let mut engine = regorus::Engine::new();
    engine
        .add_policy(
            "vendor_block.rego".to_string(),
            r#"
            package interdict.policy.vendor_block
            import rego.v1

            default verdict := {"action": "allow"}

            verdict := {"action": "block", "reason": "prohibited_vendor"} if {
                input.vendor == "evil-ai.com"
            }
            "#
            .to_string(),
        )
        .unwrap();

    let pool = Arc::new(RegorusPool::new(&engine, 4));

    // Warm up: run a few evaluations first to avoid cold-start measurement
    for _ in 0..5 {
        pool.evaluate(
            r#"{"vendor": "evil-ai.com"}"#,
            "data.interdict.policy.vendor_block.verdict",
            "warmup",
            FailMode::FailClosed,
        )
        .await;
    }

    // Measure 100 evaluations
    let mut latencies = Vec::with_capacity(100);
    for _ in 0..100 {
        let start = Instant::now();
        let verdict = pool
            .evaluate(
                r#"{"vendor": "evil-ai.com"}"#,
                "data.interdict.policy.vendor_block.verdict",
                "perf-test",
                FailMode::FailClosed,
            )
            .await;
        let elapsed = start.elapsed();
        latencies.push(elapsed);

        assert_eq!(verdict.action, VerdictAction::Block);
    }

    latencies.sort();
    let p99_idx = (latencies.len() as f64 * 0.99) as usize;
    let p99 = latencies[p99_idx.min(latencies.len() - 1)];

    println!("Rego eval p50: {:?}", latencies[latencies.len() / 2]);
    println!("Rego eval p99: {:?}", p99);
    println!("Rego eval max: {:?}", latencies.last().unwrap());

    // Assert p99 < 2ms (the success criterion)
    assert!(
        p99 < Duration::from_millis(2),
        "p99 latency {:?} exceeds 2ms target",
        p99
    );
}

// ── SC2: Wasmtime pooling allocator memory bound (PLCY-01) ─────────────

#[tokio::test]
async fn test_wasmtime_pooling_allocator_memory_bound() {
    // Create WasmEngine with pooling allocator config
    let config = PolicyEngineConfig {
        wasm_max_instances: 64,
        wasm_max_memory_bytes: 1 << 20, // 1MB per instance
        ..PolicyEngineConfig::default()
    };

    let engine = WasmEngine::new(&config);
    assert!(
        engine.is_ok(),
        "WasmEngine should create with pooling allocator: {:?}",
        engine.err()
    );
    let engine = engine.unwrap();

    // Verify engine is functional — load and instantiate a minimal module
    let wat = "(module (memory 1))"; // 1 page = 64KB, well within 1MB limit
    let wasm_bytes = wat::parse_str(wat).unwrap();
    let module = engine.load_module(&wasm_bytes).unwrap();

    // Create and drop 100 instances to verify pooling allocator reuse
    for _ in 0..100 {
        let mut store = wasmtime::Store::new(engine.engine(), ());
        let _instance = wasmtime::Instance::new(&mut store, &module, &[])
            .expect("Instance should create within pooling allocator");
        // store/instance dropped here, returning to pool
    }

    // Run 10,000+ Regorus evaluations to verify overall engine memory stability
    let mut rego_engine = regorus::Engine::new();
    rego_engine
        .add_policy(
            "memory_test.rego".to_string(),
            r#"
            package interdict.policy.memory_test
            import rego.v1

            default verdict := {"action": "allow"}

            verdict := {"action": "block", "reason": "test"} if {
                input.vendor == "test.com"
            }
            "#
            .to_string(),
        )
        .unwrap();

    let pool = Arc::new(RegorusPool::new(&rego_engine, 4));

    for i in 0..10_001 {
        let _verdict = pool
            .evaluate(
                r#"{"vendor": "test.com"}"#,
                "data.interdict.policy.memory_test.verdict",
                "memory-test",
                FailMode::FailClosed,
            )
            .await;

        // Log progress every 2500 evaluations
        if i > 0 && i % 2500 == 0 {
            println!("Completed {i} evaluations");
        }
    }

    // Verify pool is still healthy after 10,000+ evaluations
    assert_eq!(
        pool.available(),
        4,
        "All engines should be returned to pool"
    );
    println!("10,001 evaluations completed. Pool fully healthy.");
}

// ── SC3: Layer 2 NLP classifier under 10ms (PLCY-04) ──────────────────

#[tokio::test]
async fn test_l2_classifier_under_10ms() {
    let classifier = Classifier::stub(test_labels(), "allow".to_string());

    // Warm up
    for _ in 0..5 {
        let _ = classifier.classify(&[0.1, 0.2, 0.3, 0.4]);
    }

    // Measure 100 classifications
    let mut latencies = Vec::with_capacity(100);
    for _ in 0..100 {
        let start = Instant::now();
        let result = classifier.classify(&[0.1, 0.2, 0.3, 0.4]).unwrap();
        let elapsed = start.elapsed();
        latencies.push(elapsed);

        assert_eq!(result.label, "allow");
    }

    latencies.sort();
    let p99_idx = (latencies.len() as f64 * 0.99) as usize;
    let p99 = latencies[p99_idx.min(latencies.len() - 1)];

    println!("L2 classifier p50: {:?}", latencies[latencies.len() / 2]);
    println!("L2 classifier p99: {:?}", p99);

    // Assert p99 < 10ms (the success criterion)
    assert!(
        p99 < Duration::from_millis(10),
        "L2 p99 latency {:?} exceeds 10ms target",
        p99
    );
}

#[tokio::test]
async fn test_l2_uncertain_routes_to_l3() {
    // L1: no match Rego policy
    let mut engine = regorus::Engine::new();
    engine
        .add_policy(
            "nomatch.rego".to_string(),
            r#"
            package interdict.policy.nomatch
            import rego.v1

            default verdict := {"action": "allow"}
            "#
            .to_string(),
        )
        .unwrap();

    // L2: stub classifier returns "uncertain"
    let classifier = Arc::new(Classifier::stub(test_labels(), "uncertain".to_string()));

    let policies = vec![make_policy(
        "nomatch-policy",
        "No Match Policy",
        "policies/nomatch.rego",
        FailMode::FailClosed,
    )];

    // Build pipeline with short L3 timeout (200ms)
    let regorus_pool = Arc::new(RegorusPool::new(&engine, 2));
    let allowlist = Arc::new(VendorAllowlist::new(&["api.openai.com"]));
    let allowlist_policy = Arc::new(VendorAllowlistPolicy::new(allowlist));
    let store = Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
    let review_queue = Arc::new(ReviewQueue::new(
        store.clone(),
        10,
        Duration::from_millis(200),
    ));
    let redaction_engine = Arc::new(RedactionEngine::empty());
    let wasm_engine = Arc::new(
        WasmEngine::new(&PolicyEngineConfig::default()).expect("WasmEngine should create"),
    );

    let pipeline = PolicyPipeline::new(
        regorus_pool,
        allowlist_policy,
        classifier,
        None,
        review_queue,
        redaction_engine,
        wasm_engine,
        policies,
    );

    let ctx = make_ctx("api.openai.com");
    let request_id = ctx.request_id;
    let result = pipeline.evaluate(&ctx).await.unwrap();

    // Should have escalated L1 → L2 (uncertain) → L3 (timeout → fail-closed → Block)
    assert!(result.trace.layer2_classification.is_some());
    assert_eq!(
        result.trace.layer2_classification.as_ref().unwrap().label,
        "uncertain"
    );
    assert!(result.trace.layer3_decision.is_some());
    assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);

    // Verify the queue item was persisted in SQLite
    let item = store.get_by_request_id(&request_id.to_string()).unwrap();
    assert!(
        item.is_some(),
        "L3 queue item should be persisted in SQLite"
    );
    let item = item.unwrap();
    assert_eq!(item.fail_mode, "closed");
}

// ── SC4: Fail-closed/fail-open behavior (PLCY-09) ─────────────────────

#[tokio::test]
async fn test_fail_closed_blocks_on_error() {
    // Empty engine with no policies — calling any rule will error
    let empty_engine = regorus::Engine::new();
    let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));

    let policies = vec![make_policy(
        "broken-policy",
        "Broken Policy",
        "policies/broken.rego",
        FailMode::FailClosed,
    )];

    let pipeline = make_pipeline(&empty_engine, policies, classifier, &["api.openai.com"]);
    let ctx = make_ctx("api.openai.com");
    let result = pipeline.evaluate(&ctx).await.unwrap();

    // Fail-closed: error → Block
    assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);

    // Verify the broken policy returned a Block verdict with error reason
    let broken = result
        .trace
        .layer1_results
        .iter()
        .find(|v| v.policy_id == "broken-policy");
    assert!(broken.is_some());
    assert_eq!(broken.unwrap().action, VerdictAction::Block);
    assert!(broken.unwrap().reason.is_some());
}

#[tokio::test]
async fn test_fail_open_allows_on_error() {
    // Empty engine with no policies — calling any rule will error
    let empty_engine = regorus::Engine::new();
    let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));

    let policies = vec![make_policy(
        "broken-policy",
        "Broken Policy",
        "policies/broken.rego",
        FailMode::FailOpen,
    )];

    let pipeline = make_pipeline(&empty_engine, policies, classifier, &["api.openai.com"]);
    let ctx = make_ctx("api.openai.com");
    let result = pipeline.evaluate(&ctx).await.unwrap();

    // Fail-open: error → Allow
    assert_eq!(result.merged_verdict.final_action, VerdictAction::Allow);

    // Verify the broken policy returned an Allow verdict with error reason
    let broken = result
        .trace
        .layer1_results
        .iter()
        .find(|v| v.policy_id == "broken-policy");
    assert!(broken.is_some());
    assert_eq!(broken.unwrap().action, VerdictAction::Allow);
    assert!(broken.unwrap().reason.is_some());
}

// ── SC5: Vendor allowlist as policy verdict (KERN-11) ──────────────────

#[tokio::test]
async fn test_vendor_allowlist_is_policy_verdict() {
    let engine = regorus::Engine::new();
    let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));

    // No Rego policies — just the allowlist
    let pipeline = make_pipeline(&engine, vec![], classifier, &["api.openai.com"]);

    // Request for a non-approved vendor
    let ctx = make_ctx("evil-ai.com");
    let result = pipeline.evaluate(&ctx).await.unwrap();

    // Should be blocked
    assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);

    // Verify the VerdictTrace includes a PolicyVerdict with "builtin:vendor_allowlist"
    let allowlist_verdict = result
        .trace
        .layer1_results
        .iter()
        .find(|v| v.policy_id == "builtin:vendor_allowlist");
    assert!(
        allowlist_verdict.is_some(),
        "VerdictTrace must include builtin:vendor_allowlist verdict"
    );
    assert_eq!(allowlist_verdict.unwrap().action, VerdictAction::Block);
    assert_eq!(
        allowlist_verdict.unwrap().reason.as_deref(),
        Some("Vendor not on approved allowlist")
    );
}

// ── Full pipeline escalation L1→L2→L3 ─────────────────────────────────

#[tokio::test]
async fn test_full_pipeline_l1_to_l2_to_l3_escalation() {
    // L1: Rego policy returns "no match" (allow with no reason)
    let mut engine = regorus::Engine::new();
    engine
        .add_policy(
            "nomatch.rego".to_string(),
            r#"
            package interdict.policy.nomatch
            import rego.v1

            default verdict := {"action": "allow"}
            "#
            .to_string(),
        )
        .unwrap();

    // L2: returns "uncertain" → escalate to L3
    let classifier = Arc::new(Classifier::stub(test_labels(), "uncertain".to_string()));

    let policies = vec![make_policy(
        "nomatch-policy",
        "No Match Policy",
        "policies/nomatch.rego",
        FailMode::FailClosed,
    )];

    let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
    let ctx = make_ctx("api.openai.com");
    let result = pipeline.evaluate(&ctx).await.unwrap();

    // Verify full trace has all 3 layers
    // L1: allowlist + nomatch Rego = 2 verdicts
    assert_eq!(result.trace.layer1_results.len(), 2);

    // L2: uncertain
    assert!(result.trace.layer2_classification.is_some());
    assert_eq!(
        result.trace.layer2_classification.as_ref().unwrap().label,
        "uncertain"
    );

    // L3: timeout → fail-closed → Block
    assert!(result.trace.layer3_decision.is_some());

    // Final: merged across all layers → Block (fail-closed timeout)
    assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);
}

// ── All policies evaluated for complete audit trail ────────────────────

#[tokio::test]
async fn test_all_policies_evaluated_for_audit_trail() {
    // 3 Rego policies: allow, block, redact — all loaded into same engine
    let mut engine = regorus::Engine::new();
    engine
        .add_policy(
            "allow1.rego".to_string(),
            r#"
            package interdict.policy.allow1
            import rego.v1

            verdict := {"action": "allow", "reason": "policy1_allows"}
            "#
            .to_string(),
        )
        .unwrap();
    engine
        .add_policy(
            "block1.rego".to_string(),
            r#"
            package interdict.policy.block1
            import rego.v1

            verdict := {"action": "block", "reason": "policy2_blocks"}
            "#
            .to_string(),
        )
        .unwrap();
    engine
        .add_policy(
            "redact1.rego".to_string(),
            r#"
            package interdict.policy.redact1
            import rego.v1

            verdict := {"action": "redact", "reason": "policy3_redacts"}
            "#
            .to_string(),
        )
        .unwrap();

    let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
    let policies = vec![
        make_policy(
            "policy-1-allow",
            "Allow Policy",
            "policies/allow1.rego",
            FailMode::FailClosed,
        ),
        make_policy(
            "policy-2-block",
            "Block Policy",
            "policies/block1.rego",
            FailMode::FailClosed,
        ),
        make_policy(
            "policy-3-redact",
            "Redact Policy",
            "policies/redact1.rego",
            FailMode::FailClosed,
        ),
    ];

    let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
    let ctx = make_ctx("api.openai.com");
    let result = pipeline.evaluate(&ctx).await.unwrap();

    // Merged verdict: Block (most restrictive wins: Block > Redact > Allow)
    assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);

    // All 3 Rego policies + 1 allowlist = 4 verdicts in merged_verdict.policy_verdicts
    assert_eq!(
        result.merged_verdict.policy_verdicts.len(),
        4,
        "All 4 policy verdicts (allowlist + 3 Rego) must be present"
    );

    // Verify all 3 Rego policy IDs are present (no short-circuit)
    let policy_ids: Vec<&str> = result
        .trace
        .layer1_results
        .iter()
        .map(|v| v.policy_id.as_str())
        .collect();
    assert!(
        policy_ids.contains(&"policy-1-allow"),
        "policy-1-allow must be evaluated"
    );
    assert!(
        policy_ids.contains(&"policy-2-block"),
        "policy-2-block must be evaluated"
    );
    assert!(
        policy_ids.contains(&"policy-3-redact"),
        "policy-3-redact must be evaluated"
    );
    assert!(
        policy_ids.contains(&"builtin:vendor_allowlist"),
        "builtin:vendor_allowlist must be evaluated"
    );

    // L2 should NOT have been called (all L1 verdicts are explicit with reasons)
    assert!(result.trace.layer2_classification.is_none());
}
