//! Custom enterprise pattern support.
//!
//! Allows organizations to define their own patterns for sensitive data
//! specific to their domain (client names, matter numbers, case codes, etc.).
//!
//! Supports two pattern definition methods:
//! - **Regex:** Power users can provide regex patterns directly
//! - **Examples:** Non-technical users can provide example strings, which
//!   are compiled into literal match patterns
//!
//! Size limits prevent ReDoS attacks (Pitfall 5 from research):
//! - Max 1KB regex pattern size
//! - Max 100 examples per pattern
//!
//! Source: Phase 3 research + CONTEXT.md decisions

use regex::Regex;

use super::PatternRule;

/// Source of a custom pattern definition.
#[derive(Debug, Clone)]
pub enum PatternSource {
    /// A regex pattern string (for power users).
    Regex(String),
    /// Example strings to match literally (for non-technical users).
    Examples(Vec<String>),
}

/// A custom pattern defined by an enterprise.
///
/// Custom patterns are managed in the control plane and pushed to kernels
/// via gRPC (xDS pattern from Phase 2 research).
#[derive(Debug, Clone)]
pub struct CustomPattern {
    /// Human-readable name for the pattern.
    pub name: String,
    /// Category for redaction tags (e.g., "MATTER", "CLIENT", "CASE_CODE").
    pub category: String,
    /// Source definition (regex or examples).
    pub source: PatternSource,
    /// Confidence threshold for matches (0.0-1.0).
    pub threshold: f32,
}

impl CustomPattern {
    /// Compile the custom pattern into a PatternRule.
    ///
    /// # Errors
    /// Returns an error if:
    /// - The regex pattern is invalid
    /// - The examples list is empty
    /// - Compilation fails for any reason
    pub fn compile(&self) -> Result<PatternRule, String> {
        match &self.source {
            PatternSource::Regex(pattern_str) => {
                // Compile the provided regex
                let pattern =
                    Regex::new(pattern_str).map_err(|e| format!("invalid regex: {}", e))?;

                Ok(PatternRule {
                    category: self.category.clone(),
                    pattern,
                    validator: None,
                    base_confidence: self.threshold,
                    context_boosters: vec![],
                })
            }
            PatternSource::Examples(examples) => {
                if examples.is_empty() {
                    return Err("examples list cannot be empty".to_string());
                }

                // For Phase 3, example-based patterns use literal matching.
                // Each example is escaped and combined with alternation.
                // Future enhancement: infer patterns from examples using ML.
                let escaped: Vec<String> = examples.iter().map(|ex| regex::escape(ex)).collect();

                let pattern_str = format!(r"({})", escaped.join("|"));
                let pattern = Regex::new(&pattern_str)
                    .map_err(|e| format!("failed to compile examples: {}", e))?;

                Ok(PatternRule {
                    category: self.category.clone(),
                    pattern,
                    validator: None,
                    base_confidence: self.threshold,
                    context_boosters: vec![],
                })
            }
        }
    }
}

/// Validate a custom pattern before accepting it for deployment.
///
/// Enforces size limits to prevent ReDoS attacks:
/// - Max 1KB regex pattern size
/// - Max 100 examples per pattern
///
/// Also validates that the pattern can be compiled successfully.
///
/// # Errors
/// Returns an error if the pattern violates size limits or fails compilation.
pub fn validate_custom_pattern(pattern: &CustomPattern) -> Result<(), String> {
    // Size limits (Pitfall 5 - ReDoS prevention)
    match &pattern.source {
        PatternSource::Regex(s) if s.len() > 1024 => {
            return Err("regex pattern exceeds 1KB limit".to_string());
        }
        PatternSource::Examples(ex) if ex.len() > 100 => {
            return Err("example count exceeds 100".to_string());
        }
        PatternSource::Examples(ex) if ex.is_empty() => {
            return Err("examples list cannot be empty".to_string());
        }
        _ => {}
    }

    // Threshold validation
    if pattern.threshold < 0.0 || pattern.threshold > 1.0 {
        return Err("threshold must be between 0.0 and 1.0".to_string());
    }

    // Attempt compilation to validate
    let _rule = pattern.compile()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_pattern_compilation() {
        let custom = CustomPattern {
            name: "matter_number".to_string(),
            category: "MATTER".to_string(),
            source: PatternSource::Regex(r"\bM\d{6}\b".to_string()),
            threshold: 0.9,
        };

        let rule = custom.compile().unwrap();
        assert_eq!(rule.category, "MATTER");
        assert_eq!(rule.base_confidence, 0.9);
        assert!(rule.pattern.is_match("M123456"));
        assert!(!rule.pattern.is_match("M12345")); // Too short
    }

    #[test]
    fn test_example_pattern_compilation() {
        let custom = CustomPattern {
            name: "client_names".to_string(),
            category: "CLIENT".to_string(),
            source: PatternSource::Examples(vec![
                "Acme Corp".to_string(),
                "Globex Ltd".to_string(),
            ]),
            threshold: 0.95,
        };

        let rule = custom.compile().unwrap();
        assert_eq!(rule.category, "CLIENT");
        assert_eq!(rule.base_confidence, 0.95);
        assert!(rule.pattern.is_match("Acme Corp"));
        assert!(rule.pattern.is_match("Globex Ltd"));
        assert!(!rule.pattern.is_match("Other Corp"));
    }

    #[test]
    fn test_example_pattern_escapes_special_chars() {
        let custom = CustomPattern {
            name: "special_codes".to_string(),
            category: "CODE".to_string(),
            source: PatternSource::Examples(vec!["Code-123".to_string(), "Item (A)".to_string()]),
            threshold: 0.9,
        };

        let rule = custom.compile().unwrap();
        // Special characters should be escaped and match literally
        assert!(rule.pattern.is_match("Code-123"));
        assert!(rule.pattern.is_match("Item (A)"));
    }

    #[test]
    fn test_invalid_regex_pattern() {
        let custom = CustomPattern {
            name: "invalid".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Regex(r"[unclosed".to_string()),
            threshold: 0.9,
        };

        let result = custom.compile();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid regex"));
    }

    #[test]
    fn test_empty_examples_list() {
        let custom = CustomPattern {
            name: "empty".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Examples(vec![]),
            threshold: 0.9,
        };

        let result = custom.compile();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn test_validate_pattern_size_limits() {
        // Regex exceeds 1KB
        let large_regex = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Regex("a".repeat(2000)),
            threshold: 0.9,
        };
        assert!(validate_custom_pattern(&large_regex).is_err());

        // Too many examples
        let too_many_examples = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Examples((0..150).map(|i| format!("item{}", i)).collect()),
            threshold: 0.9,
        };
        assert!(validate_custom_pattern(&too_many_examples).is_err());
    }

    #[test]
    fn test_validate_pattern_threshold() {
        let invalid_threshold = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Regex(r"\btest\b".to_string()),
            threshold: 1.5, // Invalid (>1.0)
        };
        assert!(validate_custom_pattern(&invalid_threshold).is_err());

        let negative_threshold = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Regex(r"\btest\b".to_string()),
            threshold: -0.1, // Invalid (<0.0)
        };
        assert!(validate_custom_pattern(&negative_threshold).is_err());
    }

    #[test]
    fn test_validate_valid_patterns() {
        let valid_regex = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Regex(r"\bM\d{6}\b".to_string()),
            threshold: 0.9,
        };
        assert!(validate_custom_pattern(&valid_regex).is_ok());

        let valid_examples = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Examples(vec!["item1".to_string(), "item2".to_string()]),
            threshold: 0.95,
        };
        assert!(validate_custom_pattern(&valid_examples).is_ok());
    }

    #[test]
    fn test_pattern_validator_is_none_for_custom() {
        let custom = CustomPattern {
            name: "test".to_string(),
            category: "TEST".to_string(),
            source: PatternSource::Regex(r"\btest\b".to_string()),
            threshold: 0.9,
        };

        let rule = custom.compile().unwrap();
        // Custom patterns don't have validators (unlike built-in patterns like credit cards)
        assert!(rule.validator.is_none());
    }
}
