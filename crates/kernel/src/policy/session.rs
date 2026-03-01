//! Bounded session context store for multi-turn conversation tracking.
//!
//! Tracks per-session state across multiple request/response exchanges,
//! enabling detection of slow-leak data exfiltration patterns where
//! sensitive information is extracted gradually across a conversation.
//!
//! Session boundaries are determined by explicit headers (`X-Session-Id`,
//! `X-Conversation-Id`) when available, or inferred from a deterministic
//! hash of `user_id + vendor + time_window` for uncooperative clients.
//!
//! Memory is bounded via:
//! - Maximum session count with LRU eviction
//! - TTL-based expiry with periodic cleanup
//! - Per-session exchange history (bounded by session lifetime)

use std::collections::HashSet;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use sha2::{Digest, Sha256};

use crate::policy::verdict::VerdictAction;

/// A single request/response exchange within a session.
#[derive(Debug, Clone)]
pub struct ExchangeRecord {
    /// SHA-256 hash of the prompt content.
    pub request_hash: String,
    /// SHA-256 hash of the response content (empty string if not yet available).
    pub response_hash: String,
    /// When this exchange occurred.
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Policy verdict for this exchange.
    pub verdict: VerdictAction,
    /// PII categories detected in this exchange (e.g., "SSN", "EMAIL").
    pub categories_detected: Vec<String>,
}

/// Cumulative detection state tracking exfiltration signals across a session.
#[derive(Debug, Clone)]
pub struct DetectionState {
    /// Total redactions applied in this session.
    pub total_redactions: u32,
    /// Distinct PII categories seen across all exchanges.
    pub categories_seen: HashSet<String>,
    /// Cumulative risk score accumulated across exchanges.
    pub cumulative_risk_score: f32,
    /// Total number of exchanges recorded.
    pub exchange_count: u32,
}

impl Default for DetectionState {
    fn default() -> Self {
        Self {
            total_redactions: 0,
            categories_seen: HashSet::new(),
            cumulative_risk_score: 0.0,
            exchange_count: 0,
        }
    }
}

impl DetectionState {
    /// Update detection state with a new exchange record.
    ///
    /// Increments counters, adds detected categories, and bumps the risk
    /// score based on detected PII categories.
    pub fn update(&mut self, record: &ExchangeRecord) {
        self.exchange_count += 1;
        if record.verdict == VerdictAction::Redact {
            self.total_redactions += 1;
        }
        for cat in &record.categories_detected {
            self.categories_seen.insert(cat.clone());
        }
        // Each detected category contributes to risk score
        self.cumulative_risk_score += record.categories_detected.len() as f32 * 0.5;
    }

    /// Check if slow-leak exfiltration thresholds are exceeded.
    ///
    /// Returns true if any of the following are detected:
    /// - Multiple distinct PII categories across multiple exchanges (slow-leak pattern)
    /// - High volume of redactions within a single session
    /// - Cumulative risk score exceeds threshold
    pub fn should_escalate(&self, config: &SessionConfig) -> bool {
        // Pattern 1: Diverse PII categories across multiple exchanges
        if self.categories_seen.len() >= config.slow_leak_category_threshold
            && self.exchange_count >= config.slow_leak_exchange_threshold as u32
        {
            return true;
        }

        // Pattern 2: High volume redaction pattern
        if self.total_redactions >= config.redaction_volume_threshold {
            return true;
        }

        // Pattern 3: Cumulative risk threshold exceeded
        if self.cumulative_risk_score >= config.risk_score_threshold {
            return true;
        }

        false
    }
}

/// A tracked session containing exchange history and detection state.
#[derive(Debug, Clone)]
pub struct SessionEntry {
    /// Unique session identifier.
    pub session_id: String,
    /// User who owns this session.
    pub user_id: String,
    /// AI vendor for this session.
    pub vendor: String,
    /// Ordered list of exchanges in this session.
    pub exchanges: Vec<ExchangeRecord>,
    /// Cumulative detection state.
    pub detection_state: DetectionState,
    /// When this session was first created.
    pub created_at: Instant,
    /// When the last activity occurred (for TTL and LRU).
    pub last_activity: Instant,
}

/// Configuration for session tracking behavior and escalation thresholds.
#[derive(Debug, Clone)]
pub struct SessionConfig {
    /// Maximum number of concurrent sessions tracked.
    pub max_sessions: usize,
    /// Time-to-live for idle sessions.
    pub session_ttl: Duration,
    /// Interval between cleanup sweeps.
    pub cleanup_interval: Duration,
    /// Minimum distinct PII categories for slow-leak detection.
    pub slow_leak_category_threshold: usize,
    /// Minimum exchanges for slow-leak detection.
    pub slow_leak_exchange_threshold: usize,
    /// Redaction count threshold for volume-based escalation.
    pub redaction_volume_threshold: u32,
    /// Cumulative risk score threshold for escalation.
    pub risk_score_threshold: f32,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            max_sessions: 10_000,
            session_ttl: Duration::from_secs(1800), // 30 minutes
            cleanup_interval: Duration::from_secs(60),
            slow_leak_category_threshold: 3,
            slow_leak_exchange_threshold: 3,
            redaction_volume_threshold: 5,
            risk_score_threshold: 3.0,
        }
    }
}

/// Bounded, concurrent session context store.
///
/// Uses `DashMap` for lock-free concurrent access from multiple async
/// tasks. Bounded by maximum session count (LRU eviction) and TTL
/// (periodic cleanup).
pub struct SessionStore {
    sessions: DashMap<String, SessionEntry>,
    config: SessionConfig,
}

impl SessionStore {
    /// Create a new session store with the given configuration.
    pub fn new(config: SessionConfig) -> Self {
        Self {
            sessions: DashMap::new(),
            config,
        }
    }

    /// Get an existing session or create a new one.
    ///
    /// Returns a clone of the session entry. If the session does not exist,
    /// a new empty session is created (after evicting if at capacity).
    pub fn get_or_create(&self, session_id: &str, user_id: &str, vendor: &str) -> SessionEntry {
        if let Some(entry) = self.sessions.get(session_id) {
            return entry.value().clone();
        }

        // Evict if at capacity before creating new session
        self.evict_if_full();

        let now = Instant::now();
        let entry = SessionEntry {
            session_id: session_id.to_string(),
            user_id: user_id.to_string(),
            vendor: vendor.to_string(),
            exchanges: Vec::new(),
            detection_state: DetectionState::default(),
            created_at: now,
            last_activity: now,
        };

        self.sessions.insert(session_id.to_string(), entry.clone());
        entry
    }

    /// Record a new exchange in an existing session.
    ///
    /// Updates the detection state and last_activity timestamp.
    /// Returns `Some(should_escalate)` if the session exists, `None` if not found.
    pub fn record_exchange(&self, session_id: &str, record: ExchangeRecord) -> Option<bool> {
        let mut entry = self.sessions.get_mut(session_id)?;
        entry.detection_state.update(&record);
        entry.exchanges.push(record);
        entry.last_activity = Instant::now();
        let should_escalate = entry.detection_state.should_escalate(&self.config);
        Some(should_escalate)
    }

    /// Remove expired sessions whose last activity exceeds the TTL.
    ///
    /// Called periodically by a background task.
    pub fn cleanup_expired(&self) {
        let ttl = self.config.session_ttl;
        let now = Instant::now();
        self.sessions
            .retain(|_, entry| now.duration_since(entry.last_activity) < ttl);
    }

    /// Get the current number of tracked sessions.
    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    /// Evict the oldest session (by last_activity) if at or above max capacity.
    ///
    /// LRU eviction ensures bounded memory usage.
    pub fn evict_if_full(&self) {
        if self.sessions.len() < self.config.max_sessions {
            return;
        }

        // Find the session with the oldest last_activity
        let oldest_key = self
            .sessions
            .iter()
            .min_by_key(|entry| entry.value().last_activity)
            .map(|entry| entry.key().clone());

        if let Some(key) = oldest_key {
            self.sessions.remove(&key);
        }
    }
}

/// Resolve a session ID from HTTP headers or infer from context.
///
/// Strategy:
/// 1. Check for explicit `X-Session-Id` or `X-Conversation-Id` header
/// 2. If not found, generate deterministic ID from `sha256(user_id + vendor)`
///    truncated to 16 hex chars, combined with a 30-minute time window bucket
///
/// The dual approach handles both cooperative clients (with headers) and
/// uncooperative clients (inferred from identity + time window).
pub fn resolve_session_id(headers: &http::HeaderMap, user_id: &str, vendor: &str) -> String {
    // Check for explicit session headers
    if let Some(session_id) = headers
        .get("x-session-id")
        .or_else(|| headers.get("x-conversation-id"))
        && let Ok(value) = session_id.to_str()
        && !value.is_empty()
    {
        return value.to_string();
    }

    // Infer from user_id + vendor + 30-minute time window
    let window_seconds: u64 = 1800; // 30 minutes
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let time_bucket = now_secs / window_seconds;

    let mut hasher = Sha256::new();
    hasher.update(user_id.as_bytes());
    hasher.update(vendor.as_bytes());
    let identity_hash = format!("{:x}", hasher.finalize());
    let truncated = &identity_hash[..16];

    format!("{}-{}", truncated, time_bucket)
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderMap;

    fn make_exchange(verdict: VerdictAction, categories: Vec<&str>) -> ExchangeRecord {
        ExchangeRecord {
            request_hash: "req-hash".to_string(),
            response_hash: "res-hash".to_string(),
            timestamp: chrono::Utc::now(),
            verdict,
            categories_detected: categories.into_iter().map(|s| s.to_string()).collect(),
        }
    }

    fn test_config() -> SessionConfig {
        SessionConfig {
            max_sessions: 3,                         // Small for testing
            session_ttl: Duration::from_millis(100), // Short TTL for testing
            cleanup_interval: Duration::from_millis(50),
            ..SessionConfig::default()
        }
    }

    #[test]
    fn test_get_or_create_new_session() {
        let store = SessionStore::new(test_config());
        let entry = store.get_or_create("session-1", "user-1", "api.openai.com");

        assert_eq!(entry.session_id, "session-1");
        assert_eq!(entry.user_id, "user-1");
        assert_eq!(entry.vendor, "api.openai.com");
        assert!(entry.exchanges.is_empty());
        assert_eq!(entry.detection_state.exchange_count, 0);
        assert_eq!(store.session_count(), 1);
    }

    #[test]
    fn test_get_or_create_existing_session() {
        let store = SessionStore::new(test_config());

        // Create initial session
        let entry1 = store.get_or_create("session-1", "user-1", "api.openai.com");
        assert_eq!(entry1.session_id, "session-1");

        // Record an exchange to modify the session
        store.record_exchange("session-1", make_exchange(VerdictAction::Allow, vec![]));

        // Get existing session
        let entry2 = store.get_or_create("session-1", "user-1", "api.openai.com");
        assert_eq!(entry2.session_id, "session-1");
        assert_eq!(entry2.exchanges.len(), 1); // Should have the recorded exchange
        assert_eq!(store.session_count(), 1); // Still just one session
    }

    #[test]
    fn test_record_exchange_updates_detection_state() {
        let store = SessionStore::new(test_config());
        store.get_or_create("session-1", "user-1", "api.openai.com");

        let result = store.record_exchange(
            "session-1",
            make_exchange(VerdictAction::Redact, vec!["SSN", "EMAIL"]),
        );

        assert!(result.is_some());
        // Not yet at escalation threshold (need 3 categories + 3 exchanges)
        assert!(!result.unwrap());

        // Verify state was updated
        let entry = store.get_or_create("session-1", "user-1", "api.openai.com");
        assert_eq!(entry.detection_state.exchange_count, 1);
        assert_eq!(entry.detection_state.total_redactions, 1);
        assert!(entry.detection_state.categories_seen.contains("SSN"));
        assert!(entry.detection_state.categories_seen.contains("EMAIL"));
    }

    #[test]
    fn test_record_exchange_nonexistent_session() {
        let store = SessionStore::new(test_config());
        let result =
            store.record_exchange("nonexistent", make_exchange(VerdictAction::Allow, vec![]));
        assert!(result.is_none());
    }

    #[test]
    fn test_cleanup_expired_removes_stale_entries() {
        let store = SessionStore::new(SessionConfig {
            session_ttl: Duration::from_millis(50),
            ..test_config()
        });

        store.get_or_create("session-1", "user-1", "vendor-1");
        store.get_or_create("session-2", "user-2", "vendor-2");
        assert_eq!(store.session_count(), 2);

        // Wait for TTL to expire
        std::thread::sleep(Duration::from_millis(60));

        store.cleanup_expired();
        assert_eq!(store.session_count(), 0);
    }

    #[test]
    fn test_cleanup_expired_keeps_active_entries() {
        let store = SessionStore::new(SessionConfig {
            session_ttl: Duration::from_millis(200),
            ..test_config()
        });

        store.get_or_create("session-1", "user-1", "vendor-1");

        // Wait a bit but not past TTL
        std::thread::sleep(Duration::from_millis(50));

        // Refresh session-1 by recording an exchange
        store.record_exchange("session-1", make_exchange(VerdictAction::Allow, vec![]));

        // Create session-2 (will be fresh)
        store.get_or_create("session-2", "user-2", "vendor-2");

        // Wait a bit more - session-2 is still fresh
        std::thread::sleep(Duration::from_millis(50));

        store.cleanup_expired();
        // Both should survive (session-1 refreshed, session-2 still within TTL)
        assert_eq!(store.session_count(), 2);
    }

    #[test]
    fn test_evict_if_full_removes_oldest() {
        let store = SessionStore::new(SessionConfig {
            max_sessions: 2,
            ..test_config()
        });

        store.get_or_create("session-1", "user-1", "vendor-1");
        // Small delay to ensure session-1 has an older last_activity
        std::thread::sleep(Duration::from_millis(10));
        store.get_or_create("session-2", "user-2", "vendor-2");

        // At capacity (2/2). Adding a third should evict session-1 (oldest).
        store.get_or_create("session-3", "user-3", "vendor-3");

        assert_eq!(store.session_count(), 2);
        // session-1 should have been evicted (oldest last_activity)
        let entry = store.sessions.get("session-1");
        assert!(entry.is_none(), "session-1 should have been evicted");
        // session-2 and session-3 should remain
        assert!(store.sessions.get("session-2").is_some());
        assert!(store.sessions.get("session-3").is_some());
    }

    #[test]
    fn test_should_escalate_slow_leak_categories() {
        let config = SessionConfig::default();
        let mut state = DetectionState::default();

        // Exchange 1: SSN detected
        state.update(&make_exchange(VerdictAction::Redact, vec!["SSN"]));
        assert!(!state.should_escalate(&config));

        // Exchange 2: EMAIL detected
        state.update(&make_exchange(VerdictAction::Redact, vec!["EMAIL"]));
        assert!(!state.should_escalate(&config));

        // Exchange 3: PHONE detected (3 categories + 3 exchanges = slow-leak)
        state.update(&make_exchange(VerdictAction::Redact, vec!["PHONE"]));
        assert!(state.should_escalate(&config));
    }

    #[test]
    fn test_should_escalate_high_volume_redactions() {
        let config = SessionConfig::default();
        let mut state = DetectionState::default();

        // 5 redactions with same category (not slow-leak by categories, but high volume)
        for _ in 0..5 {
            state.update(&make_exchange(VerdictAction::Redact, vec!["SSN"]));
        }

        assert!(state.should_escalate(&config));
    }

    #[test]
    fn test_should_escalate_risk_score_threshold() {
        let config = SessionConfig::default();
        let mut state = DetectionState::default();

        // Each category contributes 0.5 to risk score
        // 6 categories in one exchange = 3.0 risk score
        state.update(&make_exchange(
            VerdictAction::Redact,
            vec!["SSN", "EMAIL", "PHONE", "ADDRESS", "DOB", "NAME"],
        ));

        assert!(state.should_escalate(&config));
    }

    #[test]
    fn test_should_not_escalate_below_threshold() {
        let config = SessionConfig::default();
        let mut state = DetectionState::default();

        // 2 categories, 2 exchanges, 2 redactions, low risk
        state.update(&make_exchange(VerdictAction::Redact, vec!["SSN"]));
        state.update(&make_exchange(VerdictAction::Redact, vec!["EMAIL"]));

        assert!(!state.should_escalate(&config));
    }

    #[test]
    fn test_resolve_session_id_with_session_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-session-id", "explicit-session-123".parse().unwrap());

        let session_id = resolve_session_id(&headers, "user-1", "api.openai.com");
        assert_eq!(session_id, "explicit-session-123");
    }

    #[test]
    fn test_resolve_session_id_with_conversation_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-conversation-id", "conv-456".parse().unwrap());

        let session_id = resolve_session_id(&headers, "user-1", "api.openai.com");
        assert_eq!(session_id, "conv-456");
    }

    #[test]
    fn test_resolve_session_id_session_takes_priority() {
        let mut headers = HeaderMap::new();
        headers.insert("x-session-id", "session-header".parse().unwrap());
        headers.insert("x-conversation-id", "conv-header".parse().unwrap());

        let session_id = resolve_session_id(&headers, "user-1", "api.openai.com");
        assert_eq!(session_id, "session-header");
    }

    #[test]
    fn test_resolve_session_id_inferred_without_header() {
        let headers = HeaderMap::new();

        let session_id = resolve_session_id(&headers, "user-1", "api.openai.com");

        // Should be deterministic hash + time bucket
        assert!(!session_id.is_empty());
        assert!(session_id.contains('-'));

        // Same inputs should produce same session ID
        let session_id2 = resolve_session_id(&headers, "user-1", "api.openai.com");
        assert_eq!(session_id, session_id2);

        // Different user should produce different session ID
        let session_id3 = resolve_session_id(&headers, "user-2", "api.openai.com");
        assert_ne!(session_id, session_id3);
    }

    #[test]
    fn test_resolve_session_id_inferred_format() {
        let headers = HeaderMap::new();

        let session_id = resolve_session_id(&headers, "user-1", "api.openai.com");

        // Format: 16-char hex hash + "-" + time bucket number
        let parts: Vec<&str> = session_id.splitn(2, '-').collect();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].len(), 16);
        // Hash part should be valid hex
        assert!(parts[0].chars().all(|c| c.is_ascii_hexdigit()));
        // Time bucket should be a number
        assert!(parts[1].parse::<u64>().is_ok());
    }

    #[test]
    fn test_detection_state_default() {
        let state = DetectionState::default();
        assert_eq!(state.total_redactions, 0);
        assert!(state.categories_seen.is_empty());
        assert_eq!(state.cumulative_risk_score, 0.0);
        assert_eq!(state.exchange_count, 0);
    }

    #[test]
    fn test_detection_state_update_allow_no_redaction() {
        let mut state = DetectionState::default();
        state.update(&make_exchange(VerdictAction::Allow, vec![]));

        assert_eq!(state.exchange_count, 1);
        assert_eq!(state.total_redactions, 0);
        assert!(state.categories_seen.is_empty());
        assert_eq!(state.cumulative_risk_score, 0.0);
    }
}
