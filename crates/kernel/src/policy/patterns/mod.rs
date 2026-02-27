pub mod custom;
pub mod default;
pub mod validators;

use regex::Regex;
use std::sync::Arc;

/// Type alias for pattern validator functions.
///
/// Validators provide additional checks beyond regex matching (e.g., Luhn checksum
/// for credit cards, IBAN checksum validation).
pub type PatternValidator = Arc<dyn Fn(&str) -> bool + Send + Sync>;

/// A pattern detection rule with optional validator and confidence scoring.
///
/// Pattern rules combine regex matching with optional validation functions
/// (e.g., Luhn check for credit cards) and context-aware confidence scoring.
#[derive(Clone)]
pub struct PatternRule {
    /// Category of the detected content (e.g., "EMAIL", "CREDIT_CARD", "AWS_KEY").
    pub category: String,
    /// Compiled regex pattern to match against content.
    pub pattern: Regex,
    /// Optional validator function for additional validation beyond regex matching.
    /// For example, credit card patterns use Luhn checksum validation.
    pub validator: Option<PatternValidator>,
    /// Base confidence score (0.0-1.0) when pattern matches.
    pub base_confidence: f32,
    /// Keywords that, if present in surrounding context, boost confidence.
    pub context_boosters: Vec<String>,
}

impl std::fmt::Debug for PatternRule {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PatternRule")
            .field("category", &self.category)
            .field("pattern", &self.pattern.as_str())
            .field(
                "validator",
                &if self.validator.is_some() {
                    "Some(..)"
                } else {
                    "None"
                },
            )
            .field("base_confidence", &self.base_confidence)
            .field("context_boosters", &self.context_boosters)
            .finish()
    }
}

/// Registry of all pattern rules available for content inspection.
///
/// Patterns can be loaded from defaults, custom enterprise patterns, or both.
pub struct PatternRegistry {
    /// All registered pattern rules.
    pub patterns: Vec<PatternRule>,
    /// Version number for pattern updates (used for hot-reload).
    pub version: u64,
}

impl PatternRegistry {
    /// Create a registry with comprehensive default patterns covering:
    /// - PII-01: Email, phone, SSN, addresses
    /// - PII-02: Credit cards (with Luhn), IBAN, SWIFT codes
    /// - PII-03: AWS keys, API tokens, private keys
    pub fn with_defaults() -> Self {
        Self {
            patterns: default::default_patterns(),
            version: 1,
        }
    }

    /// Create an empty registry with no patterns.
    pub fn empty() -> Self {
        Self {
            patterns: vec![],
            version: 1,
        }
    }
}
