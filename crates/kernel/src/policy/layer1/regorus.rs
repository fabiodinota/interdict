//! Regorus engine pool for Layer 1 Rego policy evaluation.
//!
//! Provides a pre-loaded pool of Regorus engines for fast concurrent
//! policy evaluation. Each engine has policies pre-loaded and is reused
//! across requests via a bounded `ArrayQueue` + `Semaphore` pattern.
//!
//! CRITICAL: Regorus evaluation is synchronous (CPU-bound). All eval calls
//! MUST go through `tokio::task::spawn_blocking` to avoid starving the
//! async runtime (Pitfall 2 from research).

use std::sync::Arc;

use crossbeam_queue::ArrayQueue;
use tokio::sync::Semaphore;

use crate::policy::config::FailMode;
use crate::policy::verdict::{PolicyVerdict, Redaction, VerdictAction};

/// Pool of pre-loaded Regorus engines for concurrent Rego policy evaluation.
///
/// Uses a bounded `ArrayQueue` with a `Semaphore` to limit concurrency.
/// Engines are cloned from a template that has policies pre-loaded,
/// avoiding expensive per-request policy loading.
pub struct RegorusPool {
    engines: Arc<ArrayQueue<regorus::Engine>>,
    semaphore: Arc<Semaphore>,
    pool_size: usize,
}

impl RegorusPool {
    /// Create a new pool by cloning a template engine `size` times.
    ///
    /// The template engine should have all policies and data pre-loaded.
    /// Each clone gets its own copy of the policy set.
    pub fn new(template: &regorus::Engine, size: usize) -> Self {
        let queue = ArrayQueue::new(size);
        for _ in 0..size {
            let _ = queue.push(template.clone());
        }
        Self {
            engines: Arc::new(queue),
            semaphore: Arc::new(Semaphore::new(size)),
            pool_size: size,
        }
    }

    /// Evaluate a Rego rule against the given input JSON.
    ///
    /// Acquires a semaphore permit, pops an engine from the pool, evaluates
    /// the rule in a blocking thread (Regorus is sync), then returns the engine
    /// to the pool.
    ///
    /// # Arguments
    /// * `input_json` - JSON string representing the request context
    /// * `rule` - Fully qualified Rego rule path (e.g., `data.interdict.policy.vendor.verdict`)
    /// * `policy_id` - ID of the policy being evaluated (for verdict construction)
    /// * `fail_mode` - What to do on error (fail-closed → Block, fail-open → Allow)
    pub async fn evaluate(
        &self,
        input_json: &str,
        rule: &str,
        policy_id: &str,
        fail_mode: FailMode,
    ) -> PolicyVerdict {
        // Acquire semaphore permit — bounds concurrency to pool size
        let permit = match self.semaphore.acquire().await {
            Ok(p) => p,
            Err(_) => {
                // Semaphore closed — shouldn't happen in normal operation
                return PolicyVerdict {
                    policy_id: policy_id.to_string(),
                    action: fail_mode.default_action(),
                    redactions: vec![],
                    reason: Some("engine pool semaphore closed".to_string()),
                };
            }
        };

        // Pop an engine from the pool (semaphore guarantees availability)
        let engine = self
            .engines
            .pop()
            .expect("semaphore guarantees engine availability");

        let engines = self.engines.clone();
        let input = input_json.to_string();
        let rule_str = rule.to_string();
        let pid = policy_id.to_string();

        // CRITICAL: Regorus eval is synchronous — use spawn_blocking
        let result = tokio::task::spawn_blocking(move || {
            let mut eng = engine;
            let eval_result = (|| -> anyhow::Result<regorus::Value> {
                eng.set_input_json(&input)?;
                eng.eval_rule(rule_str)
            })();

            // CRITICAL: Always return engine to pool, even on error
            let verdict = match eval_result {
                Ok(value) => parse_rego_verdict(&pid, &value),
                Err(e) => PolicyVerdict {
                    policy_id: pid,
                    action: fail_mode.default_action(),
                    redactions: vec![],
                    reason: Some(format!("rego evaluation error: {}", e)),
                },
            };

            let _ = engines.push(eng);
            verdict
        })
        .await;

        drop(permit);

        match result {
            Ok(verdict) => verdict,
            Err(e) => {
                // spawn_blocking panicked — engine may be lost
                tracing::error!(error = %e, "regorus spawn_blocking panicked");
                PolicyVerdict {
                    policy_id: policy_id.to_string(),
                    action: fail_mode.default_action(),
                    redactions: vec![],
                    reason: Some(format!("engine panicked: {}", e)),
                }
            }
        }
    }

    /// Load a policy into a fresh engine template.
    ///
    /// Creates a new Engine, loads the given Rego source, and returns it.
    /// Use this to build the template engine passed to `RegorusPool::new`.
    pub fn load_policy(policy_id: &str, rego_source: &str) -> anyhow::Result<regorus::Engine> {
        let mut engine = regorus::Engine::new();
        engine.add_policy(policy_id.to_string(), rego_source.to_string())?;
        Ok(engine)
    }

    /// Returns the configured pool size.
    pub fn pool_size(&self) -> usize {
        self.pool_size
    }

    /// Returns the number of engines currently available in the pool.
    pub fn available(&self) -> usize {
        self.engines.len()
    }
}

/// Helper to get a string value from a regorus::Value object by key name.
fn get_str_field(
    obj: &std::collections::BTreeMap<regorus::Value, regorus::Value>,
    key: &str,
) -> Option<String> {
    let key_val = regorus::Value::from(key);
    obj.get(&key_val)
        .and_then(|v| v.as_string().ok())
        .map(|s| s.to_string())
}

/// Parse a Rego verdict Value into a PolicyVerdict.
///
/// Expected Rego output format:
/// ```json
/// {"action": "allow"|"block"|"redact", "reason": "...", "redactions": [...]}
/// ```
///
/// Redactions format:
/// ```json
/// {"category": "SSN", "pattern": "\\d{3}-\\d{2}-\\d{4}", "matched_text": "123-45-6789", "replacement": "[REDACTED:SSN]"}
/// ```
fn parse_rego_verdict(policy_id: &str, value: &regorus::Value) -> PolicyVerdict {
    let Ok(obj) = value.as_object() else {
        return PolicyVerdict {
            policy_id: policy_id.to_string(),
            action: VerdictAction::Allow,
            redactions: vec![],
            reason: None,
        };
    };

    let action_str = get_str_field(obj, "action");

    let action = match action_str.as_deref() {
        Some("block") => VerdictAction::Block,
        Some("redact") => VerdictAction::Redact,
        Some("allow") => VerdictAction::Allow,
        _ => VerdictAction::Allow,
    };

    let reason = get_str_field(obj, "reason");
    let redactions = parse_redactions(obj);

    PolicyVerdict {
        policy_id: policy_id.to_string(),
        action,
        redactions,
        reason,
    }
}

/// Parse redactions array from a Rego verdict object.
fn parse_redactions(
    obj: &std::collections::BTreeMap<regorus::Value, regorus::Value>,
) -> Vec<Redaction> {
    let key_val = regorus::Value::from("redactions");
    let Some(redactions_val) = obj.get(&key_val) else {
        return vec![];
    };

    let Ok(arr) = redactions_val.as_array() else {
        return vec![];
    };

    arr.iter()
        .filter_map(|item| {
            let item_obj = item.as_object().ok()?;

            let category = get_str_field(item_obj, "category")?;
            let pattern = get_str_field(item_obj, "pattern").unwrap_or_default();
            let matched_text = get_str_field(item_obj, "matched_text").unwrap_or_default();
            let replacement = get_str_field(item_obj, "replacement")
                .unwrap_or_else(|| format!("[REDACTED:{}]", category));

            Some(Redaction {
                category,
                pattern,
                matched_text,
                replacement,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_allow_engine() -> regorus::Engine {
        let mut engine = regorus::Engine::new();
        engine
            .add_policy(
                "allow_policy.rego".to_string(),
                r#"
                package interdict.policy.test
                import rego.v1

                default verdict := {"action": "allow"}
                "#
                .to_string(),
            )
            .unwrap();
        engine
    }

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

    fn create_redact_engine() -> regorus::Engine {
        let mut engine = regorus::Engine::new();
        engine
            .add_policy(
                "redact_policy.rego".to_string(),
                r#"
                package interdict.policy.redact
                import rego.v1

                default verdict := {"action": "allow"}

                verdict := v if {
                    input.vendor == "api.openai.com"
                    v := {
                        "action": "redact",
                        "reason": "sensitive content detected",
                        "redactions": [
                            {
                                "category": "SSN",
                                "pattern": "\\d{3}-\\d{2}-\\d{4}",
                                "matched_text": "123-45-6789",
                                "replacement": "[REDACTED:SSN]"
                            }
                        ]
                    }
                }
                "#
                .to_string(),
            )
            .unwrap();
        engine
    }

    #[tokio::test]
    async fn test_regorus_evaluate_allow_verdict() {
        let engine = create_allow_engine();
        let pool = RegorusPool::new(&engine, 2);

        let verdict = pool
            .evaluate(
                r#"{"vendor": "api.openai.com"}"#,
                "data.interdict.policy.test.verdict",
                "test-allow-policy",
                FailMode::FailClosed,
            )
            .await;

        assert_eq!(verdict.action, VerdictAction::Allow);
        assert_eq!(verdict.policy_id, "test-allow-policy");
    }

    #[tokio::test]
    async fn test_regorus_evaluate_block_verdict() {
        let engine = create_block_engine();
        let pool = RegorusPool::new(&engine, 2);

        let verdict = pool
            .evaluate(
                r#"{"vendor": "evil-ai.com"}"#,
                "data.interdict.policy.block.verdict",
                "test-block-policy",
                FailMode::FailClosed,
            )
            .await;

        assert_eq!(verdict.action, VerdictAction::Block);
        assert_eq!(verdict.reason, Some("prohibited_vendor".to_string()));
    }

    #[tokio::test]
    async fn test_regorus_evaluate_redact_verdict() {
        let engine = create_redact_engine();
        let pool = RegorusPool::new(&engine, 2);

        let verdict = pool
            .evaluate(
                r#"{"vendor": "api.openai.com"}"#,
                "data.interdict.policy.redact.verdict",
                "test-redact-policy",
                FailMode::FailClosed,
            )
            .await;

        assert_eq!(verdict.action, VerdictAction::Redact);
        assert_eq!(verdict.redactions.len(), 1);
        assert_eq!(verdict.redactions[0].category, "SSN");
        assert_eq!(verdict.redactions[0].replacement, "[REDACTED:SSN]");
    }

    #[tokio::test]
    async fn test_regorus_pool_concurrent_evaluations() {
        let engine = create_allow_engine();
        let pool = Arc::new(RegorusPool::new(&engine, 4));

        let mut handles = vec![];
        for i in 0..10 {
            let pool = pool.clone();
            handles.push(tokio::spawn(async move {
                pool.evaluate(
                    &format!(r#"{{"vendor": "vendor-{}", "request_id": {}}}"#, i, i),
                    "data.interdict.policy.test.verdict",
                    &format!("policy-{}", i),
                    FailMode::FailClosed,
                )
                .await
            }));
        }

        let results: Vec<_> = futures_util::future::join_all(handles)
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(results.len(), 10);
        for verdict in &results {
            assert_eq!(verdict.action, VerdictAction::Allow);
        }

        // Pool should be fully restored after all evaluations
        assert_eq!(pool.available(), 4);
    }

    #[tokio::test]
    async fn test_regorus_pool_returns_engine_on_error() {
        let engine = create_allow_engine();
        let pool = RegorusPool::new(&engine, 2);

        // Invalid input should not crash, and engine should be returned to pool
        let verdict = pool
            .evaluate(
                "not valid json {{{",
                "data.interdict.policy.test.verdict",
                "error-policy",
                FailMode::FailClosed,
            )
            .await;

        // Should get fail-closed action on error
        assert_eq!(verdict.action, VerdictAction::Block);
        assert!(verdict.reason.is_some());

        // Pool should still be usable — engine was returned
        let verdict2 = pool
            .evaluate(
                r#"{"vendor": "test"}"#,
                "data.interdict.policy.test.verdict",
                "after-error-policy",
                FailMode::FailClosed,
            )
            .await;

        assert_eq!(verdict2.action, VerdictAction::Allow);
        assert_eq!(pool.available(), 2);
    }

    #[test]
    fn test_load_policy_creates_engine() {
        let engine = RegorusPool::load_policy(
            "test.rego",
            r#"
            package test
            import rego.v1
            default allow := true
            "#,
        );
        assert!(engine.is_ok());
    }

    #[test]
    fn test_load_policy_invalid_rego_returns_error() {
        let engine = RegorusPool::load_policy("bad.rego", "this is not valid rego at all!!!");
        assert!(engine.is_err());
    }
}
