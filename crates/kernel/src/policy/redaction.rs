//! Content redaction engine with category-tagged placeholders and SHA-256 hashing.
//!
//! The redaction engine applies pattern-based content replacements using
//! category-tagged placeholders (e.g., `[REDACTED:SSN]`, `[REDACTED:EMAIL]`).
//! A SHA-256 hash of the original content is always computed BEFORE any
//! redaction modifies the content, per the locked decision in CONTEXT.md.
//!
//! This enables downstream consumers and auditors to:
//! - See what type of content was removed (via category tags)
//! - Verify what was redacted (via SHA-256 hash of original)

use regex::Regex;
use sha2::{Digest, Sha256};

/// A single redaction rule: a named category and a regex pattern.
///
/// When the pattern matches, the matched text is replaced with
/// `[REDACTED:{category}]` (e.g., `[REDACTED:SSN]`).
pub struct RedactionRule {
    /// Category name (e.g., "SSN", "EMAIL", "API_KEY").
    pub category: String,
    /// Compiled regex pattern to match against content.
    pub pattern: Regex,
}

/// A single redaction that was applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedRedaction {
    /// Category of the redacted content.
    pub category: String,
    /// The original text that was matched.
    pub matched_text: String,
    /// The replacement string (e.g., `[REDACTED:SSN]`).
    pub replacement: String,
}

/// Result of applying redaction to content.
#[derive(Debug, Clone)]
pub struct RedactionResult {
    /// SHA-256 hash of the original content (before any redaction).
    pub original_hash: String,
    /// The content after redaction has been applied.
    pub redacted_content: String,
    /// List of all redactions that were applied.
    pub redactions: Vec<AppliedRedaction>,
}

/// Engine that applies redaction rules to content.
///
/// Computes a SHA-256 hash of the original content before any modification,
/// then applies each rule's regex pattern, replacing matches with
/// category-tagged placeholders.
pub struct RedactionEngine {
    rules: Vec<RedactionRule>,
}

impl RedactionEngine {
    /// Create a `RedactionEngine` from a list of rules.
    pub fn from_rules(rules: Vec<RedactionRule>) -> Self {
        Self { rules }
    }

    /// Create an empty `RedactionEngine` with no rules.
    ///
    /// Returns content unchanged but still computes the SHA-256 hash.
    pub fn empty() -> Self {
        Self { rules: vec![] }
    }

    /// Create a redaction placeholder for a category.
    ///
    /// Used by StreamingDetector to generate placeholders for detected patterns.
    /// The placeholder is length-preserving: it replaces each character in the
    /// original with `*` so the byte count stays identical. This is critical
    /// for raw HTTP tunnel redaction where Content-Length must not change.
    pub fn create_placeholder(&self, _category: &str, original: &str) -> String {
        "*".repeat(original.len())
    }

    /// Apply all redaction rules to the given content.
    ///
    /// **IMPORTANT:** The SHA-256 hash is computed FIRST, before any
    /// redaction modifies the content. This ensures the hash always
    /// represents the original, unmodified content.
    pub fn apply(&self, content: &str) -> RedactionResult {
        // Step 1: Compute SHA-256 hash of ORIGINAL content (before any modification)
        let hash = {
            let mut hasher = Sha256::new();
            hasher.update(content.as_bytes());
            format!("{:x}", hasher.finalize())
        };

        // Step 2: Apply each rule sequentially
        let mut redacted = content.to_string();
        let mut applied_redactions = Vec::new();

        for rule in &self.rules {
            let replacement = format!("[REDACTED:{}]", rule.category);

            // Collect all matches before replacing to record matched text
            let matches: Vec<String> = rule
                .pattern
                .find_iter(&redacted)
                .map(|m| m.as_str().to_string())
                .collect();

            if !matches.is_empty() {
                // Replace all occurrences
                redacted = rule
                    .pattern
                    .replace_all(&redacted, &replacement)
                    .to_string();

                for matched_text in matches {
                    applied_redactions.push(AppliedRedaction {
                        category: rule.category.clone(),
                        matched_text,
                        replacement: replacement.clone(),
                    });
                }
            }
        }

        RedactionResult {
            original_hash: hash,
            redacted_content: redacted,
            redactions: applied_redactions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ssn_rule() -> RedactionRule {
        RedactionRule {
            category: "SSN".to_string(),
            pattern: Regex::new(r"\d{3}-\d{2}-\d{4}").unwrap(),
        }
    }

    fn email_rule() -> RedactionRule {
        RedactionRule {
            category: "EMAIL".to_string(),
            pattern: Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap(),
        }
    }

    #[test]
    fn test_redact_ssn_pattern() {
        let engine = RedactionEngine::from_rules(vec![ssn_rule()]);
        let result = engine.apply("My SSN is 123-45-6789 and that's private.");

        assert_eq!(
            result.redacted_content,
            "My SSN is [REDACTED:SSN] and that's private."
        );
        assert_eq!(result.redactions.len(), 1);
        assert_eq!(result.redactions[0].category, "SSN");
        assert_eq!(result.redactions[0].matched_text, "123-45-6789");
        assert_eq!(result.redactions[0].replacement, "[REDACTED:SSN]");
    }

    #[test]
    fn test_redact_email_pattern() {
        let engine = RedactionEngine::from_rules(vec![email_rule()]);
        let result = engine.apply("Contact user@example.com for details.");

        assert_eq!(
            result.redacted_content,
            "Contact [REDACTED:EMAIL] for details."
        );
        assert_eq!(result.redactions.len(), 1);
        assert_eq!(result.redactions[0].category, "EMAIL");
        assert_eq!(result.redactions[0].matched_text, "user@example.com");
    }

    #[test]
    fn test_redact_multiple_matches() {
        let engine = RedactionEngine::from_rules(vec![ssn_rule(), email_rule()]);
        let result =
            engine.apply("SSN: 123-45-6789, email: user@example.com, another SSN: 987-65-4321");

        assert_eq!(
            result.redacted_content,
            "SSN: [REDACTED:SSN], email: [REDACTED:EMAIL], another SSN: [REDACTED:SSN]"
        );
        assert_eq!(result.redactions.len(), 3);

        // Two SSN redactions
        let ssn_redactions: Vec<_> = result
            .redactions
            .iter()
            .filter(|r| r.category == "SSN")
            .collect();
        assert_eq!(ssn_redactions.len(), 2);

        // One email redaction
        let email_redactions: Vec<_> = result
            .redactions
            .iter()
            .filter(|r| r.category == "EMAIL")
            .collect();
        assert_eq!(email_redactions.len(), 1);
    }

    #[test]
    fn test_redact_preserves_non_matching_content() {
        let engine = RedactionEngine::from_rules(vec![ssn_rule(), email_rule()]);
        let result = engine.apply("This text has no sensitive data at all.");

        assert_eq!(
            result.redacted_content,
            "This text has no sensitive data at all."
        );
        assert!(result.redactions.is_empty());
    }

    #[test]
    fn test_redact_computes_sha256_of_original() {
        let original = "My SSN is 123-45-6789 and that's private.";
        let engine = RedactionEngine::from_rules(vec![ssn_rule()]);
        let result = engine.apply(original);

        // Compute expected SHA-256 hash of the original content
        let mut hasher = Sha256::new();
        hasher.update(original.as_bytes());
        let expected_hash = format!("{:x}", hasher.finalize());

        assert_eq!(result.original_hash, expected_hash);

        // Verify the hash is of the ORIGINAL content, not the redacted content
        let mut redacted_hasher = Sha256::new();
        redacted_hasher.update(result.redacted_content.as_bytes());
        let redacted_hash = format!("{:x}", redacted_hasher.finalize());

        // These MUST be different (proving hash was computed before redaction)
        assert_ne!(result.original_hash, redacted_hash);
    }

    #[test]
    fn test_redact_empty_engine_returns_content_unchanged() {
        let engine = RedactionEngine::empty();
        let original = "This content should pass through completely unchanged.";
        let result = engine.apply(original);

        assert_eq!(result.redacted_content, original);
        assert!(result.redactions.is_empty());

        // Hash should still be computed even with no rules
        assert!(!result.original_hash.is_empty());

        // Verify hash correctness
        let mut hasher = Sha256::new();
        hasher.update(original.as_bytes());
        let expected_hash = format!("{:x}", hasher.finalize());
        assert_eq!(result.original_hash, expected_hash);
    }
}
