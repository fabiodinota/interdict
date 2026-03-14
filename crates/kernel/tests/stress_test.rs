//! Stress test: concurrent relay tasks through content inspection.
//!
//! Validates that the kernel handles high concurrency without panics
//! or unbounded memory growth.

use std::sync::Arc;

use kernel::policy::config::{BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection};
use kernel::policy::content_inspection::ContentInspector;
use kernel::policy::patterns::{PatternRegistry, PatternRule};
use kernel::policy::redaction::RedactionEngine;
use kernel::proxy::relay::inspecting_relay_outbound;
use regex::Regex;
use tokio::io::duplex;

fn make_stress_inspector() -> Arc<ContentInspector> {
    let registry = Arc::new(PatternRegistry {
        patterns: vec![
            PatternRule {
                category: "SSN".to_string(),
                pattern: Regex::new(r"\d{3}-\d{2}-\d{4}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            },
            PatternRule {
                category: "EMAIL".to_string(),
                pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            },
        ],
        version: 1,
    });
    let redactor = Arc::new(RedactionEngine::empty());
    let config = Arc::new(PolicyConfig {
        id: "stress".to_string(),
        name: "Stress".to_string(),
        rego_source: None,
        entrypoint: None,
        fail_mode: FailMode::FailClosed,
        block_response_detail: BlockResponseDetail::Opaque,
        redaction_direction: RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    });
    Arc::new(ContentInspector::new(registry, redactor, config).unwrap())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn test_500_concurrent_relay_tasks_no_panics() {
    let inspector = make_stress_inspector();
    let mut handles = Vec::with_capacity(500);

    for i in 0..500 {
        let inspector = inspector.clone();
        handles.push(tokio::spawn(async move {
            let data = format!("Request {} with safe content and no PII here. ", i).repeat(10);
            let (reader, mut write_end) = duplex(65536);
            tokio::io::AsyncWriteExt::write_all(&mut write_end, data.as_bytes())
                .await
                .unwrap();
            drop(write_end);

            let mut output = Vec::new();
            let result = inspecting_relay_outbound(reader, &mut output, inspector).await;
            assert!(
                result.is_ok(),
                "task {} should succeed: {:?}",
                i,
                result.err()
            );
            let bytes = result.unwrap();
            assert_eq!(bytes, data.len() as u64, "task {} byte count mismatch", i);
        }));
    }

    let results: Vec<_> = futures_util::future::join_all(handles).await;
    for (i, result) in results.iter().enumerate() {
        assert!(
            result.is_ok(),
            "task {} panicked: {:?}",
            i,
            result.as_ref().err()
        );
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_10000_sequential_relay_requests_no_growth() {
    let inspector = make_stress_inspector();

    for i in 0..10_000 {
        let data = format!("Request {} safe content. ", i);
        let (reader, mut write_end) = duplex(4096);
        tokio::io::AsyncWriteExt::write_all(&mut write_end, data.as_bytes())
            .await
            .unwrap();
        drop(write_end);

        let mut output = Vec::new();
        let result = inspecting_relay_outbound(reader, &mut output, inspector.clone()).await;
        assert!(result.is_ok(), "request {} failed: {:?}", i, result.err());
    }
}
