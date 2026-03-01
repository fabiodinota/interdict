//! Integration tests for session context and slow-leak detection (Phase 6 Plan 04).
//!
//! Validates ROADMAP success criterion SC4 (multi-turn slow-leak detection),
//! session TTL expiry, max entries eviction, session ID resolution (header
//! and inferred), false-positive resistance, and session boundary time windows.

use std::time::Duration;

use http::HeaderMap;

use kernel::policy::session::{
    DetectionState, ExchangeRecord, SessionConfig, SessionStore, resolve_session_id,
};
use kernel::policy::verdict::VerdictAction;

// ── Helpers ───────────────────────────────────────────────────────────

fn make_exchange(verdict: VerdictAction, categories: Vec<&str>) -> ExchangeRecord {
    ExchangeRecord {
        request_hash: "req-hash".to_string(),
        response_hash: "res-hash".to_string(),
        timestamp: chrono::Utc::now(),
        verdict,
        categories_detected: categories.into_iter().map(|s| s.to_string()).collect(),
    }
}

fn slow_leak_config() -> SessionConfig {
    SessionConfig {
        max_sessions: 100,
        session_ttl: Duration::from_secs(3600),
        cleanup_interval: Duration::from_secs(60),
        slow_leak_category_threshold: 3,
        slow_leak_exchange_threshold: 3,
        redaction_volume_threshold: 5,
        risk_score_threshold: 10.0,
    }
}

// ── SC4: Multi-turn slow-leak detection ─────────────────────────────

#[test]
fn test_sc4_multi_turn_slow_leak_detection() {
    let config = slow_leak_config();
    let store = SessionStore::new(config.clone());

    // Create a session
    store.get_or_create("session-slow-leak", "user-1", "api.openai.com");

    // Exchange 1: EMAIL detected -> not escalated
    let result1 = store.record_exchange(
        "session-slow-leak",
        make_exchange(VerdictAction::Redact, vec!["EMAIL"]),
    );
    assert_eq!(result1, Some(false), "Exchange 1 should not escalate");

    // Exchange 2: PHONE detected -> not escalated
    let result2 = store.record_exchange(
        "session-slow-leak",
        make_exchange(VerdictAction::Redact, vec!["PHONE"]),
    );
    assert_eq!(result2, Some(false), "Exchange 2 should not escalate");

    // Exchange 3: SSN detected -> ESCALATED (3 distinct categories across 3 exchanges)
    let result3 = store.record_exchange(
        "session-slow-leak",
        make_exchange(VerdictAction::Redact, vec!["SSN"]),
    );
    assert_eq!(
        result3,
        Some(true),
        "Exchange 3 should escalate: 3 distinct PII categories across 3 exchanges"
    );
}

// ── False positive: single category across many exchanges ───────────

#[test]
fn test_session_no_false_positive_single_category() {
    let config = SessionConfig {
        slow_leak_category_threshold: 3,
        slow_leak_exchange_threshold: 3,
        redaction_volume_threshold: 100, // High threshold to avoid volume trigger
        risk_score_threshold: 100.0,     // High threshold to avoid risk trigger
        ..slow_leak_config()
    };
    let store = SessionStore::new(config);

    store.get_or_create("session-fp", "user-1", "api.openai.com");

    // Record 5 exchanges all with only EMAIL category
    for i in 0..5 {
        let result = store.record_exchange(
            "session-fp",
            make_exchange(VerdictAction::Redact, vec!["EMAIL"]),
        );
        assert_eq!(
            result,
            Some(false),
            "Exchange {} with single category should NOT escalate",
            i + 1
        );
    }
}

// ── Volume threshold escalation ─────────────────────────────────────

#[test]
fn test_session_volume_threshold() {
    let config = SessionConfig {
        redaction_volume_threshold: 5,
        slow_leak_category_threshold: 100, // High to avoid slow-leak trigger
        risk_score_threshold: 100.0,       // High to avoid risk trigger
        ..slow_leak_config()
    };
    let store = SessionStore::new(config);

    store.get_or_create("session-volume", "user-1", "api.openai.com");

    // Record 4 redaction exchanges -> not escalated
    for i in 0..4 {
        let result = store.record_exchange(
            "session-volume",
            make_exchange(VerdictAction::Redact, vec![]),
        );
        assert_eq!(
            result,
            Some(false),
            "Exchange {} (volume {}/5) should not escalate",
            i + 1,
            i + 1
        );
    }

    // Record 5th redaction -> escalated (total_redactions >= 5)
    let result = store.record_exchange(
        "session-volume",
        make_exchange(VerdictAction::Redact, vec![]),
    );
    assert_eq!(
        result,
        Some(true),
        "Exchange 5 should escalate: volume threshold reached"
    );
}

// ── Session TTL expiry ──────────────────────────────────────────────

#[test]
fn test_session_ttl_expiry() {
    let config = SessionConfig {
        session_ttl: Duration::from_millis(100),
        max_sessions: 100,
        ..slow_leak_config()
    };
    let store = SessionStore::new(config);

    // Add a session
    store.get_or_create("session-ttl", "user-1", "api.openai.com");
    assert_eq!(store.session_count(), 1);

    // Wait for TTL to expire
    std::thread::sleep(Duration::from_millis(150));

    // Cleanup should remove it
    store.cleanup_expired();
    assert_eq!(store.session_count(), 0);
}

// ── Max entries eviction ────────────────────────────────────────────

#[test]
fn test_session_max_entries_eviction() {
    let config = SessionConfig {
        max_sessions: 2,
        session_ttl: Duration::from_secs(3600), // Long TTL so nothing expires
        ..slow_leak_config()
    };
    let store = SessionStore::new(config);

    // Add sessions "a", "b" — at capacity
    store.get_or_create("a", "user-a", "vendor-a");
    std::thread::sleep(Duration::from_millis(10)); // Ensure different timestamps
    store.get_or_create("b", "user-b", "vendor-b");
    assert_eq!(store.session_count(), 2);

    // Add session "c" — should evict oldest ("a")
    std::thread::sleep(Duration::from_millis(10));
    store.get_or_create("c", "user-c", "vendor-c");

    assert_eq!(store.session_count(), 2);
    // "c" should exist (most recent)
    let entry_c = store.get_or_create("c", "user-c", "vendor-c");
    assert_eq!(entry_c.session_id, "c");
}

// ── Session ID from header ──────────────────────────────────────────

#[test]
fn test_session_id_from_header() {
    let mut headers = HeaderMap::new();
    headers.insert("x-session-id", "custom-123".parse().unwrap());

    let session_id = resolve_session_id(&headers, "user-1", "api.openai.com");
    assert_eq!(session_id, "custom-123");
}

// ── Session ID inferred without header ──────────────────────────────

#[test]
fn test_session_id_inferred_without_header() {
    let headers = HeaderMap::new();

    // Call with user_id="user1", vendor="openai"
    let session_id1 = resolve_session_id(&headers, "user1", "openai");

    // Should return a deterministic hash-based ID
    assert!(!session_id1.is_empty());
    assert!(session_id1.contains('-'));

    // Call again with same params -> same ID (deterministic)
    let session_id2 = resolve_session_id(&headers, "user1", "openai");
    assert_eq!(session_id1, session_id2);

    // Call with different user_id -> different ID
    let session_id3 = resolve_session_id(&headers, "user2", "openai");
    assert_ne!(session_id1, session_id3);
}

// ── Session boundary: time window verification ──────────────────────

#[test]
fn test_session_boundary_30min_window() {
    let headers = HeaderMap::new();

    // The inferred session ID format is "{identity_hash}-{time_bucket}"
    // where time_bucket = now_secs / 1800
    // Two calls within the same 30-min window should produce the same session ID
    let id1 = resolve_session_id(&headers, "user-boundary", "vendor-boundary");
    let id2 = resolve_session_id(&headers, "user-boundary", "vendor-boundary");
    assert_eq!(
        id1, id2,
        "Same user+vendor within same time window should produce same session ID"
    );

    // Verify the format: 16-char hex hash + "-" + time bucket
    let parts: Vec<&str> = id1.splitn(2, '-').collect();
    assert_eq!(parts.len(), 2);
    assert_eq!(parts[0].len(), 16, "Identity hash should be 16 hex chars");
    assert!(
        parts[0].chars().all(|c| c.is_ascii_hexdigit()),
        "Identity hash should be valid hex"
    );
    assert!(
        parts[1].parse::<u64>().is_ok(),
        "Time bucket should be a valid number"
    );

    // The time bucket should correspond to current_secs / 1800
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let expected_bucket = now_secs / 1800;
    let actual_bucket: u64 = parts[1].parse().unwrap();
    // Allow a 1-bucket tolerance in case we cross a boundary during test
    assert!(
        actual_bucket == expected_bucket || actual_bucket == expected_bucket + 1,
        "Time bucket {} should be close to expected {}",
        actual_bucket,
        expected_bucket
    );
}

// ── DetectionState unit integration ─────────────────────────────────

#[test]
fn test_detection_state_tracks_categories_across_exchanges() {
    let config = SessionConfig::default();
    let mut state = DetectionState::default();

    // Verify initial state
    assert_eq!(state.total_redactions, 0);
    assert!(state.categories_seen.is_empty());
    assert_eq!(state.exchange_count, 0);
    assert!(!state.should_escalate(&config));

    // Exchange 1: SSN
    state.update(&make_exchange(VerdictAction::Redact, vec!["SSN"]));
    assert_eq!(state.exchange_count, 1);
    assert_eq!(state.total_redactions, 1);
    assert!(state.categories_seen.contains("SSN"));
    assert!(!state.should_escalate(&config));

    // Exchange 2: EMAIL
    state.update(&make_exchange(VerdictAction::Redact, vec!["EMAIL"]));
    assert_eq!(state.exchange_count, 2);
    assert_eq!(state.categories_seen.len(), 2);
    assert!(!state.should_escalate(&config));

    // Exchange 3: PHONE -> triggers slow-leak (3 categories, 3 exchanges)
    state.update(&make_exchange(VerdictAction::Redact, vec!["PHONE"]));
    assert_eq!(state.exchange_count, 3);
    assert_eq!(state.categories_seen.len(), 3);
    assert!(state.should_escalate(&config));
}
