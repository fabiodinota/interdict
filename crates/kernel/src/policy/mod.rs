//! Policy evaluation engine for the Interdict kernel proxy.
//!
//! Implements a 3-layer policy pipeline:
//! - **Layer 1:** Deterministic rules (Rego via Regorus, vendor allowlist)
//! - **Layer 2:** NLP classifier (ONNX model via tract) for ambiguous cases
//! - **Layer 3:** Human review queue for genuinely uncertain requests
//!
//! All matching policies are evaluated (no short-circuiting). Verdicts are merged
//! using most-restrictive-wins: Block > Redact > Allow. Overlapping redactions
//! are unioned additively.
//!
//! The `PolicyPipeline` is the central orchestrator that the proxy calls for
//! every intercepted request. It drives the 3-layer flow and returns a
//! `PipelineResult` with the merged verdict, full trace, and optional redaction.

pub mod config;
pub mod content_inspection;
pub mod distribution;
pub mod hierarchy;
pub mod hot_reload;
pub mod layer1;
pub mod layer2;
pub mod layer3;
pub mod patterns;
pub mod redaction;
pub mod session;
pub mod streaming;
pub mod verdict;
pub mod wasm_engine;

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::policy::config::{FailMode, PolicyConfig};
use crate::policy::layer1::allowlist::VendorAllowlistPolicy;
use crate::policy::layer1::regorus::RegorusPool;
use crate::policy::layer2::classifier::{BackgroundL2, Classifier, L2WorkItem};
use crate::policy::layer3::queue::ReviewQueue;
use crate::policy::redaction::{RedactionEngine, RedactionResult};
use crate::policy::verdict::{
    ClassificationResult, MergedVerdict, PolicyVerdict, VerdictAction, VerdictTrace,
};
use crate::policy::wasm_engine::WasmEngine;

/// Direction of the intercepted traffic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    /// Outbound: prompt sent from employee to AI vendor.
    Outbound,
    /// Inbound: response received from AI vendor.
    Inbound,
}

/// Request context carried through the entire policy pipeline.
///
/// Contains the metadata and content needed for policy evaluation,
/// redaction decisions, and audit trail generation.
#[derive(Debug, Clone)]
pub struct RequestContext {
    /// Unique identifier for this request (correlates across layers).
    pub request_id: uuid::Uuid,
    /// Target AI vendor domain (e.g., "api.openai.com").
    pub vendor: String,
    /// HTTP method (e.g., "POST", "GET").
    pub method: String,
    /// Request path (e.g., "/v1/chat/completions").
    pub path: String,
    /// Content-Type header if present.
    pub content_type: Option<String>,
    /// Body content if available (for redaction evaluation).
    pub content: Option<String>,
    /// Direction: outbound (prompt) or inbound (response).
    pub direction: Direction,
}

/// Result of the full policy pipeline evaluation for a single request.
#[derive(Debug, Clone)]
pub struct PipelineResult {
    /// Merged verdict from all layers that were evaluated.
    pub merged_verdict: MergedVerdict,
    /// Full verdict trace for audit purposes.
    pub trace: VerdictTrace,
    /// Redaction result if the final action is Redact and content was available.
    pub redaction_result: Option<RedactionResult>,
}

/// Extract a simple feature vector from a RequestContext for L2 classification.
///
/// This is a placeholder for Phase 2 — actual feature engineering depends
/// on the model selected in Phase 5+. Returns a fixed-size vector of zeros.
fn extract_features(_ctx: &RequestContext) -> Vec<f32> {
    vec![0.0; 16]
}

/// Build a JSON input string from a RequestContext for Rego policy evaluation.
fn build_rego_input(ctx: &RequestContext) -> String {
    let direction = match ctx.direction {
        Direction::Outbound => "outbound",
        Direction::Inbound => "inbound",
    };
    serde_json::json!({
        "vendor": ctx.vendor,
        "method": ctx.method,
        "path": ctx.path,
        "content_type": ctx.content_type,
        "content": ctx.content,
        "direction": direction,
    })
    .to_string()
}

/// The central 3-layer policy pipeline orchestrator.
///
/// Called by the proxy for every intercepted request. Drives the
/// L1 (Rego + allowlist) → L2 (NLP) → L3 (human review) flow,
/// merging verdicts with most-restrictive-wins.
pub struct PolicyPipeline {
    regorus_pool: Arc<RegorusPool>,
    allowlist_policy: Arc<VendorAllowlistPolicy>,
    classifier: Arc<Classifier>,
    background_l2: Option<BackgroundL2>,
    review_queue: Arc<ReviewQueue>,
    redaction_engine: Arc<RedactionEngine>,
    #[allow(dead_code)]
    wasm_engine: Arc<WasmEngine>,
    policies: Vec<PolicyConfig>,
}

impl PolicyPipeline {
    /// Create a new PolicyPipeline with all components.
    ///
    /// Constructed at startup in main.rs. All components are shared via Arc.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        regorus_pool: Arc<RegorusPool>,
        allowlist_policy: Arc<VendorAllowlistPolicy>,
        classifier: Arc<Classifier>,
        background_l2: Option<BackgroundL2>,
        review_queue: Arc<ReviewQueue>,
        redaction_engine: Arc<RedactionEngine>,
        wasm_engine: Arc<WasmEngine>,
        policies: Vec<PolicyConfig>,
    ) -> Self {
        Self {
            regorus_pool,
            allowlist_policy,
            classifier,
            background_l2,
            review_queue,
            redaction_engine,
            wasm_engine,
            policies,
        }
    }

    /// Create a request-scoped pipeline from a hot-reloaded PolicySet.
    ///
    /// Shares L2 classifier, L3 review queue, redaction engine, and allowlist
    /// from the base pipeline. Replaces regorus_pool, wasm_engine, and policies
    /// with those from the live PolicySet.
    ///
    /// Background L2 is not shared (not Clone, analytics-only -- acceptable
    /// per research open question 1).
    pub fn with_live_set(&self, policy_set: &hot_reload::PolicySet) -> PolicyPipeline {
        PolicyPipeline {
            regorus_pool: policy_set.regorus_pool.clone(),
            allowlist_policy: self.allowlist_policy.clone(),
            classifier: self.classifier.clone(),
            background_l2: None,
            review_queue: self.review_queue.clone(),
            redaction_engine: self.redaction_engine.clone(),
            wasm_engine: policy_set.wasm_engine.clone(),
            policies: policy_set.policies.clone(),
        }
    }

    /// Evaluate the full 3-layer policy pipeline for a request.
    ///
    /// # Flow
    ///
    /// 1. **Vendor allowlist** (always first in L1) — Block if not on list
    /// 2. **Layer 1 Rego policies** — Evaluate ALL matching policies (no short-circuit)
    /// 3. **Merge L1 verdicts** — Most-restrictive-wins
    ///    - If explicit verdict (Block/Redact or all explicit Allow): enforce, optional background L2
    ///    - If any "no match": escalate to L2
    /// 4. **Layer 2 NLP** (foreground) — Classify ambiguous requests
    ///    - "uncertain" → escalate to L3
    ///    - "block"/"allow"/"redact" → add verdict, re-merge
    /// 5. **Layer 3 human review** — Hold connection until verdict or timeout
    /// 6. **Build PipelineResult** — Apply redaction if needed
    pub async fn evaluate(&self, ctx: &RequestContext) -> anyhow::Result<PipelineResult> {
        let mut all_verdicts: Vec<PolicyVerdict> = Vec::new();
        let mut l2_classification: Option<ClassificationResult> = None;
        let mut l3_decision: Option<verdict::HumanDecision> = None;

        // ── Step 1: Vendor allowlist (always first) ──────────────────────
        let allowlist_verdict = self.allowlist_policy.evaluate(ctx);
        all_verdicts.push(allowlist_verdict);

        // ── Step 2: Layer 1 — Evaluate ALL matching Rego policies ────────
        // CRITICAL: No short-circuit. Even if one blocks, evaluate ALL for audit trail.
        let input_json = build_rego_input(ctx);

        for policy in &self.policies {
            if !policy.enabled {
                continue;
            }

            let rego_source = match &policy.rego_source {
                Some(src) => src.clone(),
                None => continue, // No Rego source for this policy
            };

            // Determine the Rego rule path for evaluation.
            //
            // For distributed policies, the entrypoint is explicitly set from
            // the proto (e.g., "data.interdict.policy.pol1.verdict").
            // For filesystem-loaded policies, derive from the filename convention:
            // "policies/vendor.rego" -> "data.interdict.policy.vendor.verdict"
            let rule = if let Some(ref entrypoint) = policy.entrypoint {
                // Normalize: convert slash-separated paths to Rego dot notation
                // and ensure the "data." prefix is present.
                // e.g. "interdict/policy/verdict" -> "data.interdict.policy.verdict"
                let normalized = entrypoint.replace('/', ".");
                if normalized.starts_with("data.") {
                    normalized
                } else {
                    format!("data.{}", normalized)
                }
            } else {
                format!(
                    "data.interdict.policy.{}.verdict",
                    rego_source
                        .trim_end_matches(".rego")
                        .rsplit('/')
                        .next()
                        .unwrap_or("unknown")
                )
            };

            let verdict = self
                .regorus_pool
                .evaluate(&input_json, &rule, &policy.id, policy.fail_mode)
                .await;

            all_verdicts.push(verdict);
        }

        // ── Step 3: Merge L1 verdicts ────────────────────────────────────
        let l1_verdicts = all_verdicts.clone();
        let l1_merged = MergedVerdict::merge(all_verdicts.clone());

        // Check if any Rego policy returned "no match" (Allow with no reason,
        // indicating the rule didn't match rather than explicitly allowing).
        // The allowlist verdict always has a reason, so we skip it.
        let has_no_match = l1_verdicts
            .iter()
            .skip(1)
            .any(|v| v.action == VerdictAction::Allow && v.reason.is_none());

        // Explicit verdict: Block, Redact, or all explicit Allows (no "no match").
        // Also treat "no content" as explicit: content-level policies (PII, etc.)
        // can't meaningfully escalate to L2/L3 without a body to inspect, so we
        // enforce the L1 verdict (allow/block) immediately at CONNECT time.
        let has_explicit_verdict = l1_merged.final_action == VerdictAction::Block
            || l1_merged.final_action == VerdictAction::Redact
            || !has_no_match
            || ctx.content.is_none();

        if has_explicit_verdict {
            // Enforce L1 verdict immediately.
            // Dispatch background L2 for analytics if configured.
            let should_dispatch = self.policies.iter().any(|p| p.background_l2 && p.enabled);
            if should_dispatch && let Some(ref bg) = self.background_l2 {
                bg.submit(L2WorkItem {
                    request_id: ctx.request_id,
                    input_features: extract_features(ctx),
                    result_tx: None, // fire-and-forget
                });
            }

            // Build result from L1 only
            return self.build_result(ctx, l1_merged, &l1_verdicts, l2_classification, l3_decision);
        }

        // ── Step 4: Layer 2 — NLP classification (foreground) ────────────
        let features = extract_features(ctx);
        let classification = self.classifier.classify(&features)?;

        l2_classification = Some(classification.clone());

        if classification.label == "uncertain" {
            // ── Step 5: Layer 3 — Human review (connection hold) ─────────

            // Determine fail mode — use the first policy's fail mode, or default
            let fail_mode = self
                .policies
                .first()
                .map(|p| p.fail_mode)
                .unwrap_or(FailMode::FailClosed);

            // Build a preliminary trace for the reviewer
            let preliminary_merged = MergedVerdict::merge(all_verdicts.clone());
            let preliminary_trace = VerdictTrace {
                request_id: ctx.request_id,
                merged_verdict: preliminary_merged,
                layer1_results: l1_verdicts.clone(),
                layer2_classification: l2_classification.clone(),
                layer3_decision: None,
                timestamp: chrono::Utc::now(),
            };

            // Compute content hash for the review item
            let content_hash = ctx
                .content
                .as_deref()
                .map(|c| {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(c.as_bytes());
                    format!("{:x}", hasher.finalize())
                })
                .unwrap_or_else(|| "no-content".to_string());

            let l3_action = self
                .review_queue
                .escalate(ctx.request_id, &preliminary_trace, &content_hash, fail_mode)
                .await?;

            // Create a verdict from the L3 decision
            let l3_verdict = PolicyVerdict {
                policy_id: "layer3:human_review".to_string(),
                action: l3_action,
                redactions: vec![],
                reason: Some("Layer 3 human review decision".to_string()),
            };
            all_verdicts.push(l3_verdict);

            l3_decision = Some(verdict::HumanDecision {
                action: l3_action,
                reviewer_id: "system".to_string(),
                reason: "L3 escalation result".to_string(),
                decided_at: chrono::Utc::now(),
            });
        } else {
            // L2 returned a definitive classification — create verdict from it
            let l2_action = match classification.label.as_str() {
                "block" => VerdictAction::Block,
                "redact" => VerdictAction::Redact,
                _ => VerdictAction::Allow, // "allow" or unknown → Allow
            };

            let l2_verdict = PolicyVerdict {
                policy_id: "layer2:nlp_classifier".to_string(),
                action: l2_action,
                redactions: vec![],
                reason: Some(format!(
                    "L2 classification: {} (confidence: {:.2})",
                    classification.label, classification.confidence
                )),
            };
            all_verdicts.push(l2_verdict);
        }

        // Final merge with all verdicts (L1 + L2 and/or L3)
        let final_merged = MergedVerdict::merge(all_verdicts.clone());

        self.build_result(
            ctx,
            final_merged,
            &l1_verdicts,
            l2_classification,
            l3_decision,
        )
    }

    /// Build the final PipelineResult, applying redaction if needed.
    fn build_result(
        &self,
        ctx: &RequestContext,
        merged: MergedVerdict,
        l1_results: &[PolicyVerdict],
        l2_classification: Option<ClassificationResult>,
        l3_decision: Option<verdict::HumanDecision>,
    ) -> anyhow::Result<PipelineResult> {
        // Apply redaction if final action is Redact and content is available
        let redaction_result = if merged.final_action == VerdictAction::Redact {
            ctx.content
                .as_deref()
                .map(|content| self.redaction_engine.apply(content))
        } else {
            None
        };

        let trace = VerdictTrace {
            request_id: ctx.request_id,
            merged_verdict: merged.clone(),
            layer1_results: l1_results.to_vec(),
            layer2_classification: l2_classification,
            layer3_decision: l3_decision,
            timestamp: chrono::Utc::now(),
        };

        Ok(PipelineResult {
            merged_verdict: merged,
            trace,
            redaction_result,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::allowlist::VendorAllowlist;
    use crate::policy::layer3::store::ReviewQueueStore;
    use std::time::Duration;

    /// Create a test RequestContext.
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

    /// Create a Regorus engine that always blocks vendor "evil-ai.com".
    fn create_block_engine() -> regorus::Engine {
        let mut engine = regorus::Engine::new();
        engine
            .add_policy(
                "block_policy.rego".to_string(),
                r#"
                package interdict.policy.block
                import rego.v1

                default verdict := {"action": "allow"}

                verdict := {"action": "block", "reason": "prohibited_vendor"} if {
                    input.vendor == "evil-ai.com"
                }
                "#
                .to_string(),
            )
            .unwrap();
        engine
    }

    /// Create a Regorus engine that always allows.
    fn create_allow_engine() -> regorus::Engine {
        let mut engine = regorus::Engine::new();
        engine
            .add_policy(
                "allow_policy.rego".to_string(),
                r#"
                package interdict.policy.allow_all
                import rego.v1

                default verdict := {"action": "allow", "reason": "explicit_allow"}
                "#
                .to_string(),
            )
            .unwrap();
        engine
    }

    /// Create a Regorus engine with broken Rego that will fail evaluation.
    fn create_broken_engine() -> regorus::Engine {
        // Use a valid engine but we'll call with a non-existent rule
        let mut engine = regorus::Engine::new();
        engine
            .add_policy(
                "broken.rego".to_string(),
                r#"
                package interdict.policy.broken
                import rego.v1

                default verdict := {"action": "allow"}
                "#
                .to_string(),
            )
            .unwrap();
        engine
    }

    /// Build a minimal test pipeline.
    fn make_pipeline(
        template_engine: &regorus::Engine,
        policies: Vec<PolicyConfig>,
        classifier: Arc<Classifier>,
        allowlist_vendors: &[&str],
    ) -> PolicyPipeline {
        let regorus_pool = Arc::new(RegorusPool::new(template_engine, 2));
        let allowlist = Arc::new(VendorAllowlist::new(allowlist_vendors));
        let allowlist_policy = Arc::new(VendorAllowlistPolicy::new(allowlist));
        let store =
            Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
        let review_queue = Arc::new(ReviewQueue::new(store, 10, Duration::from_millis(200)));
        let redaction_engine = Arc::new(RedactionEngine::empty());
        let wasm_engine = Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
        );

        PolicyPipeline::new(
            regorus_pool,
            allowlist_policy,
            classifier,
            None, // no background L2 for tests
            review_queue,
            redaction_engine,
            wasm_engine,
            policies,
        )
    }

    fn test_labels() -> Vec<String> {
        vec![
            "allow".to_string(),
            "block".to_string(),
            "redact".to_string(),
            "uncertain".to_string(),
        ]
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_l1_block_enforced_immediately() {
        let engine = create_block_engine();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies = vec![PolicyConfig {
            id: "block-evil".to_string(),
            name: "Block Evil AI".to_string(),
            rego_source: Some("policies/block.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        let pipeline = make_pipeline(&engine, policies, classifier, &["evil-ai.com"]);
        let ctx = make_ctx("evil-ai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);
        // L2 should NOT have been called (explicit L1 verdict)
        assert!(result.trace.layer2_classification.is_none());
        assert!(result.trace.layer3_decision.is_none());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_l1_allow_with_background_l2() {
        let engine = create_allow_engine();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let bg_classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let bg = BackgroundL2::new(bg_classifier, 1, 10);

        let policies = vec![PolicyConfig {
            id: "allow-all".to_string(),
            name: "Allow All".to_string(),
            rego_source: Some("policies/allow_all.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: true,
            enabled: true,
        }];

        let regorus_pool = Arc::new(RegorusPool::new(&engine, 2));
        let allowlist = Arc::new(VendorAllowlist::new(&["api.openai.com"]));
        let allowlist_policy = Arc::new(VendorAllowlistPolicy::new(allowlist));
        let store =
            Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
        let review_queue = Arc::new(ReviewQueue::new(store, 10, Duration::from_millis(200)));
        let redaction_engine = Arc::new(RedactionEngine::empty());
        let wasm_engine = Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
        );

        let pipeline = PolicyPipeline::new(
            regorus_pool,
            allowlist_policy,
            classifier,
            Some(bg),
            review_queue,
            redaction_engine,
            wasm_engine,
            policies,
        );

        let ctx = make_ctx("api.openai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        assert_eq!(result.merged_verdict.final_action, VerdictAction::Allow);
        // L2 not called in foreground (explicit allow)
        assert!(result.trace.layer2_classification.is_none());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_l1_no_match_escalates_to_l2() {
        // Use an engine that returns allow with no reason (indicating "no match")
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

        let classifier = Arc::new(Classifier::stub(test_labels(), "block".to_string()));
        let policies = vec![PolicyConfig {
            id: "nomatch-policy".to_string(),
            name: "No Match Policy".to_string(),
            rego_source: Some("policies/nomatch.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
        let ctx = make_ctx("api.openai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // L2 should have been called because L1 returned "no match" (allow with no reason)
        assert!(result.trace.layer2_classification.is_some());
        // L2 stub returns "block", so final should be Block
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_l2_uncertain_escalates_to_l3() {
        // L1 returns no match, L2 returns uncertain → L3
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

        let classifier = Arc::new(Classifier::stub(test_labels(), "uncertain".to_string()));
        let policies = vec![PolicyConfig {
            id: "nomatch-policy".to_string(),
            name: "No Match Policy".to_string(),
            rego_source: Some("policies/nomatch.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
        let ctx = make_ctx("api.openai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // L2 was called and returned "uncertain"
        assert!(result.trace.layer2_classification.is_some());
        assert_eq!(
            result.trace.layer2_classification.as_ref().unwrap().label,
            "uncertain"
        );

        // L3 decision should exist (timeout → fail-closed → Block)
        assert!(result.trace.layer3_decision.is_some());
        // With fail-closed and 200ms timeout, should be Block
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_fail_closed_on_error() {
        // Use an engine but call with a bad rule path to trigger evaluation error
        let _engine = create_broken_engine();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies = vec![PolicyConfig {
            id: "broken-policy".to_string(),
            name: "Broken Policy".to_string(),
            rego_source: Some("policies/broken.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        // Use an engine with no policies loaded — calling a non-existent rule
        // triggers an evaluation error, exercising the fail-closed path.
        let empty_engine = regorus::Engine::new();
        let regorus_pool = Arc::new(RegorusPool::new(&empty_engine, 2));
        let allowlist = Arc::new(VendorAllowlist::new(&["api.openai.com"]));
        let allowlist_policy = Arc::new(VendorAllowlistPolicy::new(allowlist));
        let store =
            Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
        let review_queue = Arc::new(ReviewQueue::new(store, 10, Duration::from_millis(200)));
        let redaction_engine = Arc::new(RedactionEngine::empty());
        let wasm_engine = Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
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
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // The Rego eval should fail (no policy loaded) and fail-closed → Block
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);
        // Find the broken policy verdict
        let broken = result
            .trace
            .layer1_results
            .iter()
            .find(|v| v.policy_id == "broken-policy");
        assert!(broken.is_some());
        assert_eq!(broken.unwrap().action, VerdictAction::Block);
        assert!(broken.unwrap().reason.is_some());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_fail_open_on_error() {
        let empty_engine = regorus::Engine::new();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies = vec![PolicyConfig {
            id: "broken-policy".to_string(),
            name: "Broken Policy".to_string(),
            rego_source: Some("policies/broken.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailOpen,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        let regorus_pool = Arc::new(RegorusPool::new(&empty_engine, 2));
        let allowlist = Arc::new(VendorAllowlist::new(&["api.openai.com"]));
        let allowlist_policy = Arc::new(VendorAllowlistPolicy::new(allowlist));
        let store =
            Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
        let review_queue = Arc::new(ReviewQueue::new(store, 10, Duration::from_millis(200)));
        let redaction_engine = Arc::new(RedactionEngine::empty());
        let wasm_engine = Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
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
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // Fail-open + error → Allow
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Allow);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_all_policies_evaluated_no_shortcircuit() {
        // Load 3 policies into the same engine: allow, block, and allow again
        // All 3 should appear in the verdict trace (no short-circuit)
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
                "allow2.rego".to_string(),
                r#"
                package interdict.policy.allow2
                import rego.v1

                verdict := {"action": "allow", "reason": "policy3_allows"}
                "#
                .to_string(),
            )
            .unwrap();

        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies = vec![
            PolicyConfig {
                id: "policy-1-allow".to_string(),
                name: "Allow Policy 1".to_string(),
                rego_source: Some("policies/allow1.rego".to_string()),
                entrypoint: None,
                fail_mode: FailMode::FailClosed,
                block_response_detail: config::BlockResponseDetail::Opaque,
                redaction_direction: config::RedactionDirection::Both,
                background_l2: false,
                enabled: true,
            },
            PolicyConfig {
                id: "policy-2-block".to_string(),
                name: "Block Policy".to_string(),
                rego_source: Some("policies/block1.rego".to_string()),
                entrypoint: None,
                fail_mode: FailMode::FailClosed,
                block_response_detail: config::BlockResponseDetail::Opaque,
                redaction_direction: config::RedactionDirection::Both,
                background_l2: false,
                enabled: true,
            },
            PolicyConfig {
                id: "policy-3-allow".to_string(),
                name: "Allow Policy 2".to_string(),
                rego_source: Some("policies/allow2.rego".to_string()),
                entrypoint: None,
                fail_mode: FailMode::FailClosed,
                block_response_detail: config::BlockResponseDetail::Opaque,
                redaction_direction: config::RedactionDirection::Both,
                background_l2: false,
                enabled: true,
            },
        ];

        let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
        let ctx = make_ctx("api.openai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // Final action should be Block (most restrictive wins)
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);

        // All 3 Rego policies + 1 allowlist = 4 verdicts in L1 results
        assert_eq!(result.trace.layer1_results.len(), 4);

        // Verify all 3 Rego policy IDs are present
        let policy_ids: Vec<&str> = result
            .trace
            .layer1_results
            .iter()
            .map(|v| v.policy_id.as_str())
            .collect();
        assert!(policy_ids.contains(&"policy-1-allow"));
        assert!(policy_ids.contains(&"policy-2-block"));
        assert!(policy_ids.contains(&"policy-3-allow"));
        assert!(policy_ids.contains(&"builtin:vendor_allowlist"));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_empty_policy_set_allows() {
        // No Rego policies configured — only the allowlist verdict is produced.
        // With no Rego policies returning "no match", the pipeline treats this as
        // an explicit L1 verdict and returns Allow (from the allowlist alone).
        let engine = regorus::Engine::new();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies: Vec<PolicyConfig> = vec![];

        let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
        let ctx = make_ctx("api.openai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        assert_eq!(result.merged_verdict.final_action, VerdictAction::Allow);
        assert!(result.merged_verdict.redactions.is_empty());
        // Only allowlist verdict — no Rego policies evaluated
        assert_eq!(result.trace.layer1_results.len(), 1);
        assert_eq!(
            result.trace.layer1_results[0].policy_id,
            "builtin:vendor_allowlist"
        );
        // L2 and L3 should not have been invoked
        assert!(result.trace.layer2_classification.is_none());
        assert!(result.trace.layer3_decision.is_none());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_disabled_policy_skipped() {
        // A policy with enabled=false should not appear in evaluation results.
        let engine = create_block_engine();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies = vec![PolicyConfig {
            id: "disabled-block".to_string(),
            name: "Disabled Block Policy".to_string(),
            rego_source: Some("policies/block.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: false, // disabled
        }];

        let pipeline = make_pipeline(&engine, policies, classifier, &["evil-ai.com"]);
        let ctx = make_ctx("evil-ai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // The disabled policy should not produce a verdict.
        // Only the allowlist verdict should be present.
        let rego_verdicts: Vec<&PolicyVerdict> = result
            .trace
            .layer1_results
            .iter()
            .filter(|v| v.policy_id == "disabled-block")
            .collect();
        assert!(
            rego_verdicts.is_empty(),
            "disabled policy should not appear in results"
        );

        // With the evil vendor on the allowlist and the block policy disabled,
        // the result should be Allow (only the allowlist verdict matters).
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Allow);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_error_plus_allow_merges_to_block() {
        // One policy errors (fail-closed -> Block) and another succeeds with Allow.
        // Most-restrictive-wins: Block should win.
        let mut engine = regorus::Engine::new();
        engine
            .add_policy(
                "good.rego".to_string(),
                r#"
                package interdict.policy.good
                import rego.v1

                verdict := {"action": "allow", "reason": "explicitly_allowed"}
                "#
                .to_string(),
            )
            .unwrap();

        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let policies = vec![
            PolicyConfig {
                id: "error-policy".to_string(),
                name: "Error Policy".to_string(),
                rego_source: Some("policies/nonexistent.rego".to_string()),
                entrypoint: Some("data.interdict.policy.does_not_exist.verdict".to_string()),
                fail_mode: FailMode::FailClosed,
                block_response_detail: config::BlockResponseDetail::Opaque,
                redaction_direction: config::RedactionDirection::Both,
                background_l2: false,
                enabled: true,
            },
            PolicyConfig {
                id: "good-policy".to_string(),
                name: "Good Policy".to_string(),
                rego_source: Some("policies/good.rego".to_string()),
                entrypoint: None,
                fail_mode: FailMode::FailClosed,
                block_response_detail: config::BlockResponseDetail::Opaque,
                redaction_direction: config::RedactionDirection::Both,
                background_l2: false,
                enabled: true,
            },
        ];

        let pipeline = make_pipeline(&engine, policies, classifier, &["api.openai.com"]);
        let ctx = make_ctx("api.openai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();

        // The erroring policy should produce Block (fail-closed).
        // The good policy should produce Allow.
        // Most-restrictive-wins: Block should be the final action.
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Block);

        // Verify both policy IDs appear in the trace
        let policy_ids: Vec<&str> = result
            .trace
            .layer1_results
            .iter()
            .map(|v| v.policy_id.as_str())
            .collect();
        assert!(policy_ids.contains(&"error-policy"));
        assert!(policy_ids.contains(&"good-policy"));

        // The error-policy should have Block action
        let error_v = result
            .trace
            .layer1_results
            .iter()
            .find(|v| v.policy_id == "error-policy")
            .unwrap();
        assert_eq!(error_v.action, VerdictAction::Block);

        // The good-policy should have Allow action
        let good_v = result
            .trace
            .layer1_results
            .iter()
            .find(|v| v.policy_id == "good-policy")
            .unwrap();
        assert_eq!(good_v.action, VerdictAction::Allow);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_pipeline_with_live_set_swaps_policies() {
        // Create a pipeline with an allow-all policy, then swap to a block policy
        // via with_live_set and verify the new evaluation uses the block policy.
        let allow_engine = create_allow_engine();
        let classifier = Arc::new(Classifier::stub(test_labels(), "allow".to_string()));
        let allow_policies = vec![PolicyConfig {
            id: "allow-original".to_string(),
            name: "Original Allow".to_string(),
            rego_source: Some("policies/allow_all.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        let pipeline = make_pipeline(&allow_engine, allow_policies, classifier, &["evil-ai.com"]);

        // Verify baseline: allow-all should produce Allow
        let ctx = make_ctx("evil-ai.com");
        let result = pipeline.evaluate(&ctx).await.unwrap();
        assert_eq!(result.merged_verdict.final_action, VerdictAction::Allow);

        // Build a new PolicySet with a block policy
        let block_engine = create_block_engine();
        let block_pool = Arc::new(RegorusPool::new(&block_engine, 2));
        let block_wasm = Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
        );
        let block_policies = vec![PolicyConfig {
            id: "block-swapped".to_string(),
            name: "Swapped Block".to_string(),
            rego_source: Some("policies/block.rego".to_string()),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: config::BlockResponseDetail::Opaque,
            redaction_direction: config::RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }];

        let live_set = hot_reload::PolicySet {
            regorus_pool: block_pool,
            wasm_engine: block_wasm,
            hierarchy: crate::policy::hierarchy::HierarchyResolver::new(vec![]),
            policies: block_policies,
            version: 2,
            content_hashes: std::collections::HashMap::new(),
        };

        // Swap to the new policy set
        let swapped_pipeline = pipeline.with_live_set(&live_set);

        // Evaluate with the swapped pipeline — should now block evil-ai.com
        let result2 = swapped_pipeline.evaluate(&ctx).await.unwrap();
        assert_eq!(result2.merged_verdict.final_action, VerdictAction::Block);

        // Verify the new policy ID appears in the trace
        let policy_ids: Vec<&str> = result2
            .trace
            .layer1_results
            .iter()
            .map(|v| v.policy_id.as_str())
            .collect();
        assert!(policy_ids.contains(&"block-swapped"));
        assert!(
            !policy_ids.contains(&"allow-original"),
            "old policy should not appear after swap"
        );
    }
}
