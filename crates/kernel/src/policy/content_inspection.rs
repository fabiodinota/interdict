//! Content inspection orchestrator integrating pattern detection, redaction, and policy verdicts.
//!
//! The `ContentInspector` orchestrates the full content inspection flow:
//! 1. Compute SHA-256 hash of original content (before any modification, per CONTEXT.md)
//! 2. Scan content with pattern detection
//! 3. Apply redaction for detected patterns
//! 4. Determine verdict based on detected categories (Block for severe, Redact for PII)

use crate::policy::config::PolicyConfig;
use crate::policy::patterns::PatternRegistry;
use crate::policy::redaction::RedactionEngine;
use crate::policy::streaming::StreamingDetector;
use crate::policy::verdict::VerdictAction;
use bytes::Bytes;
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// Content inspector orchestrating pattern detection, redaction, and verdicts.
pub struct ContentInspector {
    detector: Arc<StreamingDetector>,
    #[allow(dead_code)]
    redactor: Arc<RedactionEngine>,
    #[allow(dead_code)]
    policy_config: Arc<PolicyConfig>,
}

/// Result of inspecting content.
#[derive(Debug)]
pub struct InspectionResult {
    /// Final verdict action (Allow, Redact, or Block).
    pub action: VerdictAction,
    /// Redacted content if action is Redact.
    pub redacted_content: Option<Bytes>,
    /// Categories detected (e.g., ["EMAIL", "AWS_KEY"]).
    pub detections: Vec<String>,
    /// SHA-256 hash of original content (before any modification).
    pub original_hash: String,
    /// Human-readable reason for the verdict.
    pub reason: String,
}

impl ContentInspector {
    /// Create a new content inspector.
    pub fn new(
        registry: Arc<PatternRegistry>,
        redactor: Arc<RedactionEngine>,
        policy_config: Arc<PolicyConfig>,
    ) -> Self {
        let detector = Arc::new(StreamingDetector::new(registry, redactor.clone()));
        Self {
            detector,
            redactor,
            policy_config,
        }
    }

    /// Inspect request content synchronously.
    ///
    /// Request content is complete (not streaming), so we scan the entire content
    /// and return a verdict with optional redacted content.
    pub fn inspect_request(&self, content: &[u8]) -> InspectionResult {
        // Convert to string (handle invalid UTF-8 gracefully)
        let text = String::from_utf8_lossy(content);

        // Compute SHA-256 before any modification (user decision from CONTEXT.md)
        let mut hasher = Sha256::new();
        hasher.update(content);
        let original_hash = format!("{:x}", hasher.finalize());

        // Scan for patterns
        let scan_result = self.detector.scan(&text);

        match scan_result {
            crate::policy::streaming::ScanResult::NoMatch => InspectionResult {
                action: VerdictAction::Allow,
                redacted_content: None,
                detections: vec![],
                original_hash,
                reason: "no sensitive content detected".to_string(),
            },
            crate::policy::streaming::ScanResult::PartialMatch => {
                // Request content is complete (not streaming), no partials expected
                InspectionResult {
                    action: VerdictAction::Allow,
                    redacted_content: None,
                    detections: vec![],
                    original_hash,
                    reason: "no complete pattern matches".to_string(),
                }
            }
            crate::policy::streaming::ScanResult::FullMatch(detections) => {
                let categories: Vec<String> =
                    detections.iter().map(|d| d.category.clone()).collect();

                // Apply redaction
                let redacted = self.detector.apply_redaction(&text, detections);

                // Check if any detected categories should trigger blocking
                let should_block = self.should_block_categories(&categories);

                if should_block {
                    InspectionResult {
                        action: VerdictAction::Block,
                        redacted_content: None,
                        detections: categories,
                        original_hash,
                        reason: "severe content violation detected".to_string(),
                    }
                } else {
                    let num_categories = categories.len();
                    InspectionResult {
                        action: VerdictAction::Redact,
                        redacted_content: Some(Bytes::from(redacted)),
                        detections: categories,
                        original_hash,
                        reason: format!("redacted {} categories", num_categories),
                    }
                }
            }
        }
    }

    /// Determine if detected categories should trigger blocking.
    ///
    /// For Phase 3, block on high-severity secrets (PRIVATE_KEY, AWS_KEY, OPENAI_KEY).
    /// Future: make this policy-configurable.
    fn should_block_categories(&self, categories: &[String]) -> bool {
        categories
            .iter()
            .any(|cat| matches!(cat.as_str(), "PRIVATE_KEY" | "AWS_KEY" | "OPENAI_KEY"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::config::{BlockResponseDetail, FailMode, RedactionDirection};
    use crate::policy::patterns::{PatternRegistry, PatternRule};
    use regex::Regex;

    fn make_test_config() -> PolicyConfig {
        PolicyConfig {
            id: "test-policy".to_string(),
            name: "Test Policy".to_string(),
            rego_source: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: BlockResponseDetail::Opaque,
            redaction_direction: RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }
    }

    #[test]
    fn test_inspect_request_no_match() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let config = Arc::new(make_test_config());

        let inspector = ContentInspector::new(registry, redactor, config);
        let result = inspector.inspect_request(b"Hello world");

        assert!(matches!(result.action, VerdictAction::Allow));
        assert!(result.detections.is_empty());
    }

    #[test]
    fn test_inspect_request_with_pii() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "EMAIL".to_string(),
                pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            }],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let config = Arc::new(make_test_config());

        let inspector = ContentInspector::new(registry, redactor, config);
        let result = inspector.inspect_request(b"Contact user@example.com");

        assert!(matches!(result.action, VerdictAction::Redact));
        assert_eq!(result.detections, vec!["EMAIL"]);
        assert!(result.redacted_content.is_some());
        assert!(!result.original_hash.is_empty());
    }

    #[test]
    fn test_inspect_request_blocks_secrets() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "AWS_KEY".to_string(),
                pattern: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
                validator: None,
                base_confidence: 1.0,
                context_boosters: vec![],
            }],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let config = Arc::new(make_test_config());

        let inspector = ContentInspector::new(registry, redactor, config);
        let result = inspector.inspect_request(b"Key: AKIAIOSFODNN7EXAMPLE");

        assert!(matches!(result.action, VerdictAction::Block));
        assert_eq!(result.detections, vec!["AWS_KEY"]);
    }
}
