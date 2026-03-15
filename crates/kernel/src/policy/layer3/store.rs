//! SQLite persistence layer for the human review queue.
//!
//! Uses WAL mode for concurrent read access (dashboard queries alongside
//! queue writes) and busy_timeout for transient write contention handling.
//! All queue items are persisted for audit trail and dashboard integration
//! in Phase 8/9.
//!
//! The `Connection` is wrapped in `Arc<Mutex<_>>` and all SQLite work is
//! executed via `tokio::task::spawn_blocking` so async callers never block a
//! Tokio worker thread.

use std::sync::{Arc, Mutex};

use rusqlite::{Connection, Result as SqlResult, params};

/// A single item in the review queue, as persisted in SQLite.
#[derive(Debug, Clone)]
pub struct QueueItem {
    /// Unique identifier for this queue entry.
    pub id: String,
    /// Request identifier (correlates with RequestContext).
    pub request_id: String,
    /// JSON-serialized VerdictTrace for reviewer context.
    pub pipeline_trace: String,
    /// SHA-256 hash of pre-redaction content for audit correlation.
    pub content_hash: String,
    /// Policy fail-mode: "closed" or "open".
    pub fail_mode: String,
    /// Queue status: "pending", "reviewed", "expired", "rejected".
    pub status: String,
    /// ISO 8601 timestamp when the item was enqueued.
    pub created_at: String,
    /// ISO 8601 timestamp when the review timeout expires.
    pub timeout_at: String,
    /// Human verdict action: "allow", "block", or "redact". NULL until reviewed.
    pub verdict: Option<String>,
    /// Identifier of the reviewer who decided. NULL until reviewed.
    pub reviewer_id: Option<String>,
    /// Reason provided by the reviewer. NULL until reviewed.
    pub reviewer_reason: Option<String>,
    /// ISO 8601 timestamp when the verdict was submitted. NULL until reviewed.
    pub reviewed_at: Option<String>,
}

/// SQLite-backed persistence for the human review queue.
///
/// Uses WAL mode for concurrent reads and busy_timeout for write contention.
/// All operations use parameterized queries to prevent SQL injection.
///
/// Thread-safe via `Arc<Mutex<Connection>>`; all database work is offloaded to
/// the blocking thread pool before touching SQLite.
pub struct ReviewQueueStore {
    conn: Arc<Mutex<Connection>>,
}

impl ReviewQueueStore {
    /// Open (or create) the review queue database at the given path.
    ///
    /// Sets WAL journal mode for concurrent reads and busy_timeout
    /// for handling transient write contention.
    ///
    /// # Arguments
    /// * `db_path` - Path to the SQLite database file (or `:memory:` for tests).
    pub fn new(db_path: &str) -> anyhow::Result<Self> {
        let conn = Connection::open(db_path)?;

        // WAL mode: critical for concurrent reads (dashboard queries
        // while queue writes happen). Per Research Pitfall 5.
        conn.pragma_update(None, "journal_mode", "WAL")?;

        // Busy timeout: handle transient write contention without
        // immediate SQLITE_BUSY errors.
        conn.pragma_update(None, "busy_timeout", 5000)?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS review_queue (
                id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL UNIQUE,
                pipeline_trace TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                fail_mode TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                timeout_at TEXT NOT NULL,
                verdict TEXT,
                reviewer_id TEXT,
                reviewer_reason TEXT,
                reviewed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_review_queue_status
                ON review_queue(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_review_queue_timeout
                ON review_queue(status, timeout_at);
            CREATE INDEX IF NOT EXISTS idx_review_queue_request
                ON review_queue(request_id);",
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    async fn run_db<T, F>(&self, operation: F) -> anyhow::Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> anyhow::Result<T> + Send + 'static,
    {
        let conn = Arc::clone(&self.conn);

        tokio::task::spawn_blocking(move || {
            let conn = conn
                .lock()
                .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
            operation(&conn)
        })
        .await
        .map_err(|e| anyhow::anyhow!("sqlite task failed: {e}"))?
    }

    /// Insert a new queue item into the review queue.
    ///
    /// Fails with UNIQUE constraint violation if `request_id` already exists.
    pub async fn enqueue(&self, item: QueueItem) -> anyhow::Result<()> {
        self.run_db(move |conn| {
            conn.execute(
                "INSERT INTO review_queue
                 (id, request_id, pipeline_trace, content_hash, fail_mode,
                  status, created_at, timeout_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    item.id,
                    item.request_id,
                    item.pipeline_trace,
                    item.content_hash,
                    item.fail_mode,
                    item.status,
                    item.created_at,
                    item.timeout_at,
                ],
            )?;
            Ok(())
        })
        .await
    }

    /// Get all pending review items, ordered by creation time (oldest first).
    pub async fn get_pending(&self) -> anyhow::Result<Vec<QueueItem>> {
        self.run_db(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, request_id, pipeline_trace, content_hash, fail_mode,
                        status, created_at, timeout_at, verdict, reviewer_id,
                        reviewer_reason, reviewed_at
                 FROM review_queue
                 WHERE status = 'pending'
                 ORDER BY created_at ASC",
            )?;

            let items = stmt
                .query_map([], |row| {
                    Ok(QueueItem {
                        id: row.get(0)?,
                        request_id: row.get(1)?,
                        pipeline_trace: row.get(2)?,
                        content_hash: row.get(3)?,
                        fail_mode: row.get(4)?,
                        status: row.get(5)?,
                        created_at: row.get(6)?,
                        timeout_at: row.get(7)?,
                        verdict: row.get(8)?,
                        reviewer_id: row.get(9)?,
                        reviewer_reason: row.get(10)?,
                        reviewed_at: row.get(11)?,
                    })
                })?
                .collect::<SqlResult<Vec<_>>>()?;

            Ok(items)
        })
        .await
    }

    /// Look up a queue item by its request_id.
    pub async fn get_by_request_id(&self, request_id: &str) -> anyhow::Result<Option<QueueItem>> {
        let request_id = request_id.to_string();

        self.run_db(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, request_id, pipeline_trace, content_hash, fail_mode,
                        status, created_at, timeout_at, verdict, reviewer_id,
                        reviewer_reason, reviewed_at
                 FROM review_queue
                 WHERE request_id = ?1",
            )?;

            let item = stmt
                .query_row(params![request_id], |row| {
                    Ok(QueueItem {
                        id: row.get(0)?,
                        request_id: row.get(1)?,
                        pipeline_trace: row.get(2)?,
                        content_hash: row.get(3)?,
                        fail_mode: row.get(4)?,
                        status: row.get(5)?,
                        created_at: row.get(6)?,
                        timeout_at: row.get(7)?,
                        verdict: row.get(8)?,
                        reviewer_id: row.get(9)?,
                        reviewer_reason: row.get(10)?,
                        reviewed_at: row.get(11)?,
                    })
                })
                .optional()?;

            Ok(item)
        })
        .await
    }

    /// Submit a human verdict for a pending review item.
    ///
    /// Only updates items with status='pending'. Returns `true` if the item
    /// was successfully updated, `false` if it was already reviewed or expired.
    pub async fn submit_verdict(
        &self,
        request_id: &str,
        verdict: &str,
        reviewer_id: &str,
        reason: &str,
    ) -> anyhow::Result<bool> {
        let request_id = request_id.to_string();
        let verdict = verdict.to_string();
        let reviewer_id = reviewer_id.to_string();
        let reason = reason.to_string();

        self.run_db(move |conn| {
            let updated = conn.execute(
                "UPDATE review_queue
                 SET status = 'reviewed',
                     verdict = ?1,
                     reviewer_id = ?2,
                     reviewer_reason = ?3,
                     reviewed_at = datetime('now')
                 WHERE request_id = ?4 AND status = 'pending'",
                params![verdict, reviewer_id, reason, request_id],
            )?;
            Ok(updated > 0)
        })
        .await
    }

    /// Mark all timed-out pending items as expired.
    ///
    /// Called periodically by the queue manager. Returns the number
    /// of items that were expired.
    pub async fn expire_timed_out(&self) -> anyhow::Result<usize> {
        self.run_db(|conn| {
            let updated = conn.execute(
                "UPDATE review_queue
                 SET status = 'expired'
                 WHERE status = 'pending' AND timeout_at < datetime('now')",
                [],
            )?;
            Ok(updated)
        })
        .await
    }

    /// Delete old reviewed/expired items for storage hygiene.
    ///
    /// Only deletes items with status 'reviewed' or 'expired' that are
    /// older than `older_than_days` days.
    pub async fn cleanup_old(&self, older_than_days: i64) -> anyhow::Result<usize> {
        self.run_db(move |conn| {
            let deleted = conn.execute(
                "DELETE FROM review_queue
                 WHERE status IN ('reviewed', 'expired')
                   AND created_at < datetime('now', ?1)",
                params![format!("-{older_than_days} days")],
            )?;
            Ok(deleted)
        })
        .await
    }
}

/// Extension trait to make `query_row` return `Option` instead of error on no rows.
trait OptionalRow {
    fn optional(self) -> SqlResult<Option<QueueItem>>;
}

impl OptionalRow for SqlResult<QueueItem> {
    fn optional(self) -> SqlResult<Option<QueueItem>> {
        match self {
            Ok(item) => Ok(Some(item)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_item(request_id: &str) -> QueueItem {
        QueueItem {
            id: format!("id-{request_id}"),
            request_id: request_id.to_string(),
            pipeline_trace: r#"{"request_id":"test","merged_verdict":{}}"#.to_string(),
            content_hash: "sha256-abc123".to_string(),
            fail_mode: "closed".to_string(),
            status: "pending".to_string(),
            created_at: "2026-02-26T20:00:00Z".to_string(),
            timeout_at: "2099-12-31T23:59:59Z".to_string(), // far future — won't expire
            verdict: None,
            reviewer_id: None,
            reviewer_reason: None,
            reviewed_at: None,
        }
    }

    fn make_expired_item(request_id: &str) -> QueueItem {
        QueueItem {
            id: format!("id-{request_id}"),
            request_id: request_id.to_string(),
            pipeline_trace: r#"{"request_id":"test","merged_verdict":{}}"#.to_string(),
            content_hash: "sha256-abc123".to_string(),
            fail_mode: "closed".to_string(),
            status: "pending".to_string(),
            created_at: "2020-01-01T00:00:00Z".to_string(),
            timeout_at: "2020-01-01T00:00:30Z".to_string(), // far past — already expired
            verdict: None,
            reviewer_id: None,
            reviewer_reason: None,
            reviewed_at: None,
        }
    }

    #[tokio::test]
    async fn test_store_enqueue_and_get_pending() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_test_item("req-001");

        store.enqueue(item).await.unwrap();

        let pending = store.get_pending().await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].request_id, "req-001");
        assert_eq!(pending[0].status, "pending");
        assert_eq!(pending[0].content_hash, "sha256-abc123");
    }

    #[tokio::test]
    async fn test_store_submit_verdict_updates_status() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_test_item("req-002");
        store.enqueue(item).await.unwrap();

        let updated = store
            .submit_verdict("req-002", "block", "reviewer-1", "contains PII")
            .await
            .unwrap();
        assert!(updated);

        // Should no longer appear in pending
        let pending = store.get_pending().await.unwrap();
        assert!(pending.is_empty());

        // Verify the stored verdict
        let reviewed = store.get_by_request_id("req-002").await.unwrap().unwrap();
        assert_eq!(reviewed.status, "reviewed");
        assert_eq!(reviewed.verdict.as_deref(), Some("block"));
        assert_eq!(reviewed.reviewer_id.as_deref(), Some("reviewer-1"));
        assert_eq!(reviewed.reviewer_reason.as_deref(), Some("contains PII"));
        assert!(reviewed.reviewed_at.is_some());
    }

    #[tokio::test]
    async fn test_store_submit_verdict_only_pending() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_expired_item("req-003");
        store.enqueue(item).await.unwrap();

        // Expire it first
        store.expire_timed_out().await.unwrap();

        // Now try to submit a verdict on the expired item
        let updated = store
            .submit_verdict("req-003", "allow", "reviewer-2", "false alarm")
            .await
            .unwrap();
        assert!(!updated); // Should return false — item is expired, not pending
    }

    #[tokio::test]
    async fn test_store_expire_timed_out() {
        let store = ReviewQueueStore::new(":memory:").unwrap();

        // One expired, one not expired
        let expired = make_expired_item("req-004");
        let active = make_test_item("req-005");
        store.enqueue(expired).await.unwrap();
        store.enqueue(active).await.unwrap();

        let count = store.expire_timed_out().await.unwrap();
        assert_eq!(count, 1);

        // Only the active item should remain pending
        let pending = store.get_pending().await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].request_id, "req-005");

        // Expired item should have status='expired'
        let expired_item = store.get_by_request_id("req-004").await.unwrap().unwrap();
        assert_eq!(expired_item.status, "expired");
    }

    #[tokio::test]
    async fn test_store_get_by_request_id() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_test_item("req-006");
        store.enqueue(item).await.unwrap();

        let found = store.get_by_request_id("req-006").await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().request_id, "req-006");

        let not_found = store.get_by_request_id("nonexistent").await.unwrap();
        assert!(not_found.is_none());
    }

    #[tokio::test]
    async fn test_store_unique_request_id() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item1 = make_test_item("req-007");
        store.enqueue(item1).await.unwrap();

        // Duplicate request_id should fail with UNIQUE constraint
        let item2 = QueueItem {
            id: "different-id".to_string(),
            ..make_test_item("req-007")
        };
        let result = store.enqueue(item2).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_store_get_pending_empty_returns_empty_vec() {
        // A fresh store with no enqueued items should return an empty vec.
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let pending = store.get_pending().await.unwrap();
        assert!(pending.is_empty());
    }

    #[tokio::test]
    async fn test_store_expire_removes_only_timed_out_entries() {
        // Add two expired items and one active item.
        // expire_timed_out should only mark the expired ones.
        let store = ReviewQueueStore::new(":memory:").unwrap();

        let expired_1 = make_expired_item("req-exp-1");
        let expired_2 = make_expired_item("req-exp-2");
        let active = make_test_item("req-active");

        store.enqueue(expired_1).await.unwrap();
        store.enqueue(expired_2).await.unwrap();
        store.enqueue(active).await.unwrap();

        // Before expiration: 3 pending items.
        let pending_before = store.get_pending().await.unwrap();
        assert_eq!(pending_before.len(), 3);

        // Expire timed-out entries.
        let expired_count = store.expire_timed_out().await.unwrap();
        assert_eq!(expired_count, 2);

        // After expiration: only the active item remains pending.
        let pending_after = store.get_pending().await.unwrap();
        assert_eq!(pending_after.len(), 1);
        assert_eq!(pending_after[0].request_id, "req-active");

        // Verify both expired items have status='expired'.
        let exp1 = store.get_by_request_id("req-exp-1").await.unwrap().unwrap();
        assert_eq!(exp1.status, "expired");

        let exp2 = store.get_by_request_id("req-exp-2").await.unwrap().unwrap();
        assert_eq!(exp2.status, "expired");

        // Verify active item is still pending.
        let act = store
            .get_by_request_id("req-active")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(act.status, "pending");
    }

    /// Helper: create a test item with a specific `created_at` timestamp.
    fn make_item_at(request_id: &str, created_at: &str) -> QueueItem {
        QueueItem {
            id: format!("id-{request_id}"),
            request_id: request_id.to_string(),
            pipeline_trace: r#"{"request_id":"test","merged_verdict":{}}"#.to_string(),
            content_hash: "sha256-abc123".to_string(),
            fail_mode: "closed".to_string(),
            status: "pending".to_string(),
            created_at: created_at.to_string(),
            timeout_at: "2099-12-31T23:59:59Z".to_string(),
            verdict: None,
            reviewer_id: None,
            reviewer_reason: None,
            reviewed_at: None,
        }
    }

    #[tokio::test]
    async fn test_cleanup_old_deletes_reviewed_and_expired() {
        let store = ReviewQueueStore::new(":memory:").unwrap();

        // Enqueue two old items (created_at 2020) and one recent pending item.
        let old_1 = make_expired_item("req-old-reviewed");
        let old_2 = make_expired_item("req-old-expired");
        let recent = make_test_item("req-recent-pending");
        store.enqueue(old_1).await.unwrap();
        store.enqueue(old_2).await.unwrap();
        store.enqueue(recent).await.unwrap();

        // Mark old_1 as reviewed via submit_verdict.
        let reviewed = store
            .submit_verdict("req-old-reviewed", "allow", "reviewer-1", "ok")
            .await
            .unwrap();
        assert!(reviewed);

        // Mark old_2 as expired via expire_timed_out (its timeout_at is 2020).
        let expired_count = store.expire_timed_out().await.unwrap();
        assert_eq!(expired_count, 1);

        // Verify we have 1 reviewed, 1 expired, 1 pending before cleanup.
        let old_reviewed = store
            .get_by_request_id("req-old-reviewed")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(old_reviewed.status, "reviewed");
        let old_expired = store
            .get_by_request_id("req-old-expired")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(old_expired.status, "expired");

        // cleanup_old(1) — delete reviewed/expired items older than 1 day.
        // The old items (created_at 2020) are well past 1 day; the pending
        // item is recent but wouldn't be deleted regardless (wrong status).
        let deleted = store.cleanup_old(1).await.unwrap();
        assert_eq!(
            deleted, 2,
            "should delete both old reviewed and old expired items"
        );

        // Pending item survives.
        let pending = store.get_pending().await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].request_id, "req-recent-pending");

        // Old items are gone.
        let gone_reviewed = store.get_by_request_id("req-old-reviewed").await.unwrap();
        assert!(
            gone_reviewed.is_none(),
            "old reviewed item should be deleted"
        );
        let gone_expired = store.get_by_request_id("req-old-expired").await.unwrap();
        assert!(gone_expired.is_none(), "old expired item should be deleted");
    }

    #[tokio::test]
    async fn test_cleanup_old_preserves_recent_reviewed() {
        let store = ReviewQueueStore::new(":memory:").unwrap();

        // Enqueue a recent item (created_at 2026) and review it.
        let item = make_test_item("req-recent");
        store.enqueue(item).await.unwrap();
        let reviewed = store
            .submit_verdict("req-recent", "block", "reviewer-1", "policy violation")
            .await
            .unwrap();
        assert!(reviewed);

        // cleanup_old(9999) — huge threshold; the item (created_at 2026)
        // is far too recent to be older than 9999 days from now.
        let deleted = store.cleanup_old(9999).await.unwrap();
        assert_eq!(deleted, 0, "recent reviewed item should NOT be deleted");

        // Verify the item still exists.
        let still_there = store.get_by_request_id("req-recent").await.unwrap();
        assert!(
            still_there.is_some(),
            "recent reviewed item should survive cleanup"
        );
        assert_eq!(still_there.unwrap().status, "reviewed");
    }

    #[tokio::test]
    async fn test_get_pending_returns_oldest_first() {
        let store = ReviewQueueStore::new(":memory:").unwrap();

        // Enqueue 3 items with distinct created_at timestamps, inserted
        // out of order to ensure the query sorts, not insertion order.
        let middle = make_item_at("req-middle", "2025-06-15T12:00:00Z");
        let oldest = make_item_at("req-oldest", "2024-01-01T00:00:00Z");
        let newest = make_item_at("req-newest", "2026-03-01T08:00:00Z");

        store.enqueue(middle).await.unwrap();
        store.enqueue(oldest).await.unwrap();
        store.enqueue(newest).await.unwrap();

        let pending = store.get_pending().await.unwrap();
        assert_eq!(pending.len(), 3);
        assert_eq!(
            pending[0].request_id, "req-oldest",
            "first item should be the oldest (2024)"
        );
        assert_eq!(
            pending[1].request_id, "req-middle",
            "second item should be the middle (2025)"
        );
        assert_eq!(
            pending[2].request_id, "req-newest",
            "third item should be the newest (2026)"
        );
    }
}
