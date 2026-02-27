//! Comprehensive default pattern library covering PII, financial data, and secrets.
//!
//! This module provides battle-tested detection patterns for:
//! - PII-01: Personal information (email, phone, SSN, addresses)
//! - PII-02: Financial data (credit cards with Luhn, IBAN, SWIFT)
//! - PII-03: Secrets and credentials (AWS keys, API tokens, private keys)
//!
//! All patterns are Unicode-aware and include validators where appropriate
//! to reduce false positives.
//!
//! Source: Phase 3 research + PII detection best practices

use regex::Regex;
use std::sync::Arc;

use super::PatternRule;
use super::validators::{luhn_check, validate_iban};

/// Build the comprehensive default pattern library.
///
/// Returns a vector of all default patterns covering common PII, financial
/// data, and secrets detection use cases.
pub fn default_patterns() -> Vec<PatternRule> {
    vec![
        // ═══════════════════════════════════════════════════════════════
        // PII-01: Personal Information
        // ═══════════════════════════════════════════════════════════════
        email_pattern(),
        phone_us_pattern(),
        phone_international_pattern(),
        ssn_pattern(),
        address_pattern(),
        // ═══════════════════════════════════════════════════════════════
        // PII-02: Financial Data
        // ═══════════════════════════════════════════════════════════════
        credit_card_pattern(),
        iban_pattern(),
        swift_pattern(),
        // ═══════════════════════════════════════════════════════════════
        // PII-03: Secrets and Credentials
        // ═══════════════════════════════════════════════════════════════
        aws_access_key_pattern(),
        openai_key_pattern(),
        github_token_pattern(),
        private_key_pattern(),
    ]
}

// ═══════════════════════════════════════════════════════════════════════
// PII-01: Personal Information Patterns
// ═══════════════════════════════════════════════════════════════════════

/// Email address pattern (Unicode-aware).
///
/// Matches common email formats including internationalized domains.
fn email_pattern() -> PatternRule {
    PatternRule {
        category: "EMAIL".to_string(),
        pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
        validator: None,
        base_confidence: 0.95,
        context_boosters: vec![
            "email".to_string(),
            "contact".to_string(),
            "mailto".to_string(),
        ],
    }
}

/// US phone number pattern.
///
/// Matches formats: (123) 456-7890, 123-456-7890, 123.456.7890
fn phone_us_pattern() -> PatternRule {
    PatternRule {
        category: "PHONE".to_string(),
        pattern: Regex::new(r"\b(\(\d{3}\)\s?|\d{3}[-.])?\d{3}[-.]\d{4}\b").unwrap(),
        validator: None,
        base_confidence: 0.85,
        context_boosters: vec![
            "phone".to_string(),
            "tel".to_string(),
            "call".to_string(),
            "mobile".to_string(),
        ],
    }
}

/// International phone number pattern.
///
/// Matches formats with country codes: +1 123-456-7890, +44 20 1234 5678
fn phone_international_pattern() -> PatternRule {
    PatternRule {
        category: "PHONE".to_string(),
        pattern: Regex::new(
            r"\+\d{1,3}[\s.-]+(\(\d{1,4}\)|\d{1,4})[\s.-]+\d{2,4}[\s.-]*\d{2,4}[\s.-]*\d{0,4}\b",
        )
        .unwrap(),
        validator: None,
        base_confidence: 0.9,
        context_boosters: vec![
            "phone".to_string(),
            "tel".to_string(),
            "call".to_string(),
            "mobile".to_string(),
        ],
    }
}

/// US Social Security Number pattern.
///
/// Matches format: 123-45-6789
fn ssn_pattern() -> PatternRule {
    PatternRule {
        category: "SSN".to_string(),
        pattern: Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(),
        validator: None,
        base_confidence: 0.95,
        context_boosters: vec![
            "ssn".to_string(),
            "social".to_string(),
            "security".to_string(),
        ],
    }
}

/// US address pattern.
///
/// Matches format: 123 Main St, City, ST 12345
fn address_pattern() -> PatternRule {
    PatternRule {
        category: "ADDRESS".to_string(),
        pattern: Regex::new(r"\d+\s+[\w\s]+,\s+[\w\s]+,\s+[A-Z]{2}\s+\d{5}(-\d{4})?").unwrap(),
        validator: None,
        base_confidence: 0.8,
        context_boosters: vec![
            "address".to_string(),
            "street".to_string(),
            "zip".to_string(),
        ],
    }
}

// ═══════════════════════════════════════════════════════════════════════
// PII-02: Financial Data Patterns
// ═══════════════════════════════════════════════════════════════════════

/// Credit card number pattern with Luhn validation.
///
/// Matches 13-19 digit card numbers with optional spaces/dashes.
/// Uses Luhn checksum validation to reduce false positives.
fn credit_card_pattern() -> PatternRule {
    PatternRule {
        category: "CREDIT_CARD".to_string(),
        pattern: Regex::new(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b").unwrap(),
        validator: Some(Arc::new(|text: &str| luhn_check(text))),
        base_confidence: 0.9,
        context_boosters: vec![
            "card".to_string(),
            "credit".to_string(),
            "payment".to_string(),
            "visa".to_string(),
            "mastercard".to_string(),
        ],
    }
}

/// IBAN (International Bank Account Number) pattern with checksum validation.
///
/// Matches format: GB82 WEST 1234 5698 7654 32
/// Uses mod-97 checksum validation per ISO 13616.
fn iban_pattern() -> PatternRule {
    PatternRule {
        category: "IBAN".to_string(),
        pattern: Regex::new(
            r"\b[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{0,18}\b",
        )
        .unwrap(),
        validator: Some(Arc::new(|text: &str| validate_iban(text))),
        base_confidence: 0.95,
        context_boosters: vec![
            "iban".to_string(),
            "bank".to_string(),
            "account".to_string(),
        ],
    }
}

/// SWIFT/BIC code pattern.
///
/// Matches format: ABCDUS33XXX (8 or 11 characters)
fn swift_pattern() -> PatternRule {
    PatternRule {
        category: "SWIFT".to_string(),
        pattern: Regex::new(r"\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b").unwrap(),
        validator: None,
        base_confidence: 0.85,
        context_boosters: vec!["swift".to_string(), "bic".to_string(), "bank".to_string()],
    }
}

// ═══════════════════════════════════════════════════════════════════════
// PII-03: Secrets and Credentials Patterns
// ═══════════════════════════════════════════════════════════════════════

/// AWS Access Key ID pattern.
///
/// Matches format: AKIA followed by 16 alphanumeric characters
fn aws_access_key_pattern() -> PatternRule {
    PatternRule {
        category: "AWS_KEY".to_string(),
        pattern: Regex::new(r"\bAKIA[0-9A-Z]{16}\b").unwrap(),
        validator: None,
        base_confidence: 1.0,
        context_boosters: vec!["aws".to_string(), "access".to_string(), "key".to_string()],
    }
}

/// OpenAI API key pattern.
///
/// Matches format: sk- followed by 48+ characters
fn openai_key_pattern() -> PatternRule {
    PatternRule {
        category: "OPENAI_KEY".to_string(),
        pattern: Regex::new(r"\bsk-[a-zA-Z0-9]{48,}\b").unwrap(),
        validator: None,
        base_confidence: 1.0,
        context_boosters: vec!["openai".to_string(), "api".to_string(), "key".to_string()],
    }
}

/// GitHub personal access token or secret pattern.
///
/// Matches formats: ghp_ or ghs_ followed by 36 characters
fn github_token_pattern() -> PatternRule {
    PatternRule {
        category: "GITHUB_TOKEN".to_string(),
        pattern: Regex::new(r"\bgh[ps]_[a-zA-Z0-9]{36,}\b").unwrap(),
        validator: None,
        base_confidence: 1.0,
        context_boosters: vec!["github".to_string(), "token".to_string(), "pat".to_string()],
    }
}

/// Private key pattern (RSA, EC, OpenSSH).
///
/// Matches BEGIN PRIVATE KEY headers
fn private_key_pattern() -> PatternRule {
    PatternRule {
        category: "PRIVATE_KEY".to_string(),
        pattern: Regex::new(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----").unwrap(),
        validator: None,
        base_confidence: 1.0,
        context_boosters: vec!["private".to_string(), "key".to_string(), "pem".to_string()],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_patterns_count() {
        let patterns = default_patterns();
        // Should have at least 12 patterns (4 PII-01, 3 PII-02, 4 PII-03)
        assert!(patterns.len() >= 12);
    }

    #[test]
    fn test_email_pattern() {
        let pattern = email_pattern();
        assert!(pattern.pattern.is_match("user@example.com"));
        assert!(pattern.pattern.is_match("john.doe@company.co.uk"));
        assert!(!pattern.pattern.is_match("not-an-email"));
    }

    #[test]
    fn test_phone_us_pattern() {
        let pattern = phone_us_pattern();
        assert!(pattern.pattern.is_match("(123) 456-7890"));
        assert!(pattern.pattern.is_match("123-456-7890"));
        assert!(pattern.pattern.is_match("123.456.7890"));
        assert!(!pattern.pattern.is_match("12-3456"));
    }

    #[test]
    fn test_phone_international_pattern() {
        let pattern = phone_international_pattern();
        assert!(pattern.pattern.is_match("+1 123-456-7890"));
        assert!(pattern.pattern.is_match("+44 20 1234 5678"));
        assert!(pattern.pattern.is_match("+33 1 23 45 67 89"));
    }

    #[test]
    fn test_ssn_pattern() {
        let pattern = ssn_pattern();
        assert!(pattern.pattern.is_match("123-45-6789"));
        assert!(!pattern.pattern.is_match("12-345-6789")); // Wrong format
    }

    #[test]
    fn test_address_pattern() {
        let pattern = address_pattern();
        assert!(
            pattern
                .pattern
                .is_match("123 Main Street, Springfield, IL 62701")
        );
        assert!(
            pattern
                .pattern
                .is_match("456 Oak Ave, Los Angeles, CA 90001-1234")
        );
    }

    #[test]
    fn test_credit_card_pattern_with_validator() {
        let pattern = credit_card_pattern();

        // Valid card (matches pattern)
        assert!(pattern.pattern.is_match("4532015112830366"));

        // Validator should accept valid Luhn
        if let Some(ref validator) = pattern.validator {
            assert!(validator("4532015112830366")); // Valid
            assert!(!validator("1234567812345678")); // Invalid Luhn
        }
    }

    #[test]
    fn test_iban_pattern_with_validator() {
        let pattern = iban_pattern();

        // Valid IBAN (matches pattern)
        assert!(pattern.pattern.is_match("GB82 WEST 1234 5698 7654 32"));

        // Validator should check checksum
        if let Some(ref validator) = pattern.validator {
            assert!(validator("GB82WEST12345698765432")); // Valid
            assert!(!validator("GB82WEST12345698765433")); // Invalid checksum
        }
    }

    #[test]
    fn test_swift_pattern() {
        let pattern = swift_pattern();
        assert!(pattern.pattern.is_match("ABCDUS33XXX")); // 11 characters
        assert!(pattern.pattern.is_match("ABCDUS33")); // 8 characters
        assert!(!pattern.pattern.is_match("ABC123")); // Too short
    }

    #[test]
    fn test_aws_key_pattern() {
        let pattern = aws_access_key_pattern();
        assert!(pattern.pattern.is_match("AKIAIOSFODNN7EXAMPLE"));
        assert!(!pattern.pattern.is_match("AKIA123")); // Too short
    }

    #[test]
    fn test_openai_key_pattern() {
        let pattern = openai_key_pattern();
        assert!(
            pattern
                .pattern
                .is_match("sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL")
        );
        assert!(!pattern.pattern.is_match("sk-short")); // Too short
    }

    #[test]
    fn test_github_token_pattern() {
        let pattern = github_token_pattern();
        assert!(
            pattern
                .pattern
                .is_match("ghp_1234567890abcdefghijklmnopqrstuvwxyz")
        );
        assert!(
            pattern
                .pattern
                .is_match("ghs_1234567890abcdefghijklmnopqrstuvwxyz")
        );
        assert!(!pattern.pattern.is_match("github_token_123")); // Wrong format
    }

    #[test]
    fn test_private_key_pattern() {
        let pattern = private_key_pattern();
        assert!(pattern.pattern.is_match("-----BEGIN PRIVATE KEY-----"));
        assert!(pattern.pattern.is_match("-----BEGIN RSA PRIVATE KEY-----"));
        assert!(pattern.pattern.is_match("-----BEGIN EC PRIVATE KEY-----"));
        assert!(
            pattern
                .pattern
                .is_match("-----BEGIN OPENSSH PRIVATE KEY-----")
        );
    }

    #[test]
    fn test_all_patterns_have_categories() {
        let patterns = default_patterns();
        for pattern in patterns {
            assert!(!pattern.category.is_empty());
        }
    }

    #[test]
    fn test_all_patterns_have_valid_confidence() {
        let patterns = default_patterns();
        for pattern in patterns {
            assert!(pattern.base_confidence >= 0.0 && pattern.base_confidence <= 1.0);
        }
    }
}
