//! Performance benchmarks for pattern matching and content inspection.
//!
//! Verifies that pattern detection stays within the <2ms policy evaluation
//! budget from Phase 2 requirements (KERN-07). Pattern detection is one
//! component of the full policy pipeline.
//!
//! Benchmarks:
//! - `pattern_detection/*` — Scan various content types for PII
//! - `redaction_apply`     — Apply redaction to pre-detected content
//! - `buffer_push_emit`    — Buffer push+emit throughput

use criterion::{BenchmarkId, Criterion, black_box, criterion_group, criterion_main};
use kernel::policy::patterns::PatternRegistry;
use kernel::policy::patterns::default::default_patterns;
use kernel::policy::redaction::RedactionEngine;
use kernel::policy::streaming::StreamingDetector;
use std::sync::Arc;

fn benchmark_pattern_detection(c: &mut Criterion) {
    let registry = Arc::new(PatternRegistry {
        patterns: default_patterns(),
        version: 1,
    });
    let redactor = Arc::new(RedactionEngine::empty());
    let detector = StreamingDetector::new(registry, redactor);

    let samples = vec![
        (
            "clean_text",
            "This is a completely clean message with no sensitive data whatsoever.",
        ),
        (
            "with_email",
            "Contact me at john.doe@example.com for more information about the project.",
        ),
        (
            "with_phone",
            "You can reach me at 555-123-4567 during business hours on weekdays.",
        ),
        (
            "with_credit_card",
            "Payment via card 4532015112830366 was processed successfully.",
        ),
        (
            "mixed_pii",
            "John Doe, email john@example.com, SSN 123-45-6789, card 4532015112830366.",
        ),
        (
            "with_aws_key",
            "The AWS key AKIAIOSFODNN7EXAMPLE was accidentally committed.",
        ),
        (
            "with_private_key",
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...",
        ),
    ];

    let mut group = c.benchmark_group("pattern_detection");

    for (name, content) in &samples {
        group.bench_with_input(BenchmarkId::from_parameter(name), content, |b, content| {
            b.iter(|| detector.scan(black_box(content)));
        });
    }

    group.finish();
}

fn benchmark_redaction_application(c: &mut Criterion) {
    use kernel::policy::streaming::ScanResult;

    let registry = Arc::new(PatternRegistry {
        patterns: default_patterns(),
        version: 1,
    });
    let redactor = Arc::new(RedactionEngine::empty());
    let detector = StreamingDetector::new(registry, redactor);

    let content =
        "Contact john.doe@example.com or call 555-123-4567 for assistance with order 123-45-6789.";

    // Pre-detect to get detections for the apply benchmark
    let detections = match detector.scan(content) {
        ScanResult::FullMatch(d) => d,
        _ => vec![],
    };

    c.bench_function("redaction_apply", |b| {
        b.iter(|| detector.apply_redaction(black_box(content), black_box(detections.clone())));
    });
}

fn benchmark_buffer_operations(c: &mut Criterion) {
    use bytes::Bytes;
    use kernel::policy::streaming::{AdaptiveTokenBuffer, BufferPreset};

    c.bench_function("buffer_push_emit", |b| {
        b.iter(|| {
            let mut buffer = AdaptiveTokenBuffer::new(BufferPreset::Medium);
            for i in 0..20usize {
                buffer.push(Bytes::from(format!("token{} ", i)));
                let _ = buffer.emit_oldest();
            }
            black_box(buffer.len())
        });
    });
}

fn benchmark_full_inspection(c: &mut Criterion) {
    use kernel::policy::config::{BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection};
    use kernel::policy::content_inspection::ContentInspector;

    let registry = Arc::new(PatternRegistry {
        patterns: default_patterns(),
        version: 1,
    });
    let redactor = Arc::new(RedactionEngine::empty());
    let config = Arc::new(PolicyConfig {
        id: "bench-policy".to_string(),
        name: "Bench Policy".to_string(),
        rego_source: None,
        entrypoint: None,
        fail_mode: FailMode::FailClosed,
        block_response_detail: BlockResponseDetail::Opaque,
        redaction_direction: RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    });

    let inspector =
        ContentInspector::new(registry, redactor, config).expect("inspector should initialize");

    let samples = vec![
        (
            "clean_request",
            "Generate a summary of Q3 earnings reports.",
        ),
        (
            "pii_request",
            "Contact user@example.com or call 555-123-4567 about account 123-45-6789.",
        ),
        (
            "secret_request",
            "Is AKIAIOSFODNN7EXAMPLE a valid AWS access key?",
        ),
    ];

    let mut group = c.benchmark_group("full_content_inspection");

    for (name, content) in &samples {
        group.bench_with_input(BenchmarkId::from_parameter(name), content, |b, content| {
            b.iter(|| inspector.inspect_request(black_box(content.as_bytes())));
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    benchmark_pattern_detection,
    benchmark_redaction_application,
    benchmark_buffer_operations,
    benchmark_full_inspection,
);
criterion_main!(benches);
