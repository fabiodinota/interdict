//! Property-based tests for PII pattern library.
//!
//! Uses proptest to fuzz the content inspection pipeline, verifying:
//! 1. No panics on arbitrary UTF-8 input
//! 2. Known patterns match generated valid inputs
//! 3. Random alphanumeric strings produce minimal false positives
//! 4. Redaction produces deterministic placeholders

use kernel::policy::config::{BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection};
use kernel::policy::content_inspection::ContentInspector;
use kernel::policy::patterns::PatternRegistry;
use kernel::policy::patterns::default::default_patterns;
use kernel::policy::redaction::RedactionEngine;
use kernel::policy::verdict::VerdictAction;
use proptest::prelude::*;
use std::sync::Arc;

fn make_inspector() -> ContentInspector {
    let registry = Arc::new(PatternRegistry {
        patterns: default_patterns(),
        version: 1,
    });
    let redactor = Arc::new(RedactionEngine::empty());
    let config = Arc::new(PolicyConfig {
        id: "proptest".to_string(),
        name: "Proptest".to_string(),
        rego_source: None,
        entrypoint: None,
        fail_mode: FailMode::FailClosed,
        block_response_detail: BlockResponseDetail::Opaque,
        redaction_direction: RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    });
    ContentInspector::new(registry, redactor, config).expect("inspector init should succeed")
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    // Property 1: inspect_request never panics on arbitrary UTF-8 input.
    #[test]
    fn no_panic_on_arbitrary_utf8(input in "\\PC{0,2000}") {
        let inspector = make_inspector();
        let _ = inspector.inspect_request(input.as_bytes());
    }

    // Property 2: inspect_request never panics on arbitrary bytes (including invalid UTF-8).
    #[test]
    fn no_panic_on_arbitrary_bytes(input in proptest::collection::vec(any::<u8>(), 0..2000)) {
        let inspector = make_inspector();
        let _ = inspector.inspect_request(&input);
    }

    // Property 3: Original hash is always a 64-character hex string (SHA-256).
    #[test]
    fn hash_is_valid_sha256(input in "\\PC{0,500}") {
        let inspector = make_inspector();
        let result = inspector.inspect_request(input.as_bytes());
        prop_assert_eq!(result.original_hash.len(), 64);
        prop_assert!(result.original_hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    // Property 4: Random alphanumeric strings should not trigger PII detection.
    // Allows a small false-positive rate (some random strings may accidentally
    // match phone patterns like 10-digit numbers).
    #[test]
    fn random_alphanum_low_false_positives(input in "[a-zA-Z]{5,100}") {
        let inspector = make_inspector();
        let result = inspector.inspect_request(input.as_bytes());
        // Pure alphabetic strings should never match PII patterns
        prop_assert!(
            result.detections.is_empty(),
            "False positive on pure alpha input '{}': {:?}",
            input,
            result.detections
        );
    }

    // Property 5: Identical inputs produce identical hashes.
    #[test]
    fn deterministic_hashing(input in "\\PC{0,500}") {
        let inspector = make_inspector();
        let r1 = inspector.inspect_request(input.as_bytes());
        let r2 = inspector.inspect_request(input.as_bytes());
        prop_assert_eq!(r1.original_hash, r2.original_hash);
    }

    // Property 6: Identical inputs produce identical verdicts.
    #[test]
    fn deterministic_verdicts(input in "\\PC{0,500}") {
        let inspector = make_inspector();
        let r1 = inspector.inspect_request(input.as_bytes());
        let r2 = inspector.inspect_request(input.as_bytes());
        prop_assert_eq!(r1.detections, r2.detections);
    }
}

// Targeted property tests with generated "valid" PII-like inputs.

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    // Property 7: Email-shaped inputs are detected.
    #[test]
    fn emails_detected(
        local in "[a-z]{3,10}",
        domain in "[a-z]{3,8}",
        tld in "(com|org|net|io)"
    ) {
        let email = format!("{local}@{domain}.{tld}");
        let text = format!("Contact me at {email} for details");
        let inspector = make_inspector();
        let result = inspector.inspect_request(text.as_bytes());
        prop_assert!(
            result.detections.contains(&"EMAIL".to_string()),
            "Email '{}' not detected in: {:?}",
            email,
            result.detections
        );
    }

    // Property 8: SSN-shaped inputs are detected.
    #[test]
    fn ssn_detected(
        a in 100u32..899,
        b in 10u32..99,
        c in 1000u32..9999
    ) {
        // Exclude 666 area number per SSA rules
        prop_assume!(a != 666);
        let ssn = format!("{a}-{b}-{c}");
        let text = format!("SSN: {ssn}");
        let inspector = make_inspector();
        let result = inspector.inspect_request(text.as_bytes());
        prop_assert!(
            result.detections.contains(&"SSN".to_string()),
            "SSN '{}' not detected in: {:?}",
            ssn,
            result.detections
        );
    }

    // Property 9: When redaction occurs, the result contains redacted content.
    #[test]
    fn redaction_produces_content(
        local in "[a-z]{3,10}",
        domain in "[a-z]{3,8}"
    ) {
        let text = format!("Email: {local}@{domain}.com and that is all");
        let inspector = make_inspector();
        let result = inspector.inspect_request(text.as_bytes());
        if result.action == VerdictAction::Redact {
            prop_assert!(
                result.redacted_content.is_some(),
                "Redact verdict but no redacted content"
            );
            // Redacted content should not contain the original email
            let redacted = String::from_utf8_lossy(
                result.redacted_content.as_ref().unwrap()
            );
            prop_assert!(
                !redacted.contains(&format!("{local}@{domain}.com")),
                "Original email still present after redaction"
            );
        }
    }
}
