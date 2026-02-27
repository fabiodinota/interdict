//! SQLite persistence layer for the human review queue.
//!
//! Uses WAL mode for concurrent read access (dashboard queries alongside
//! queue writes) and busy_timeout for transient write contention handling.
//! All queue items are persisted for audit trail and dashboard integration
//! in Phase 8/9.
//!
//! The `Connection` is wrapped in `std::sync::Mutex` to make `ReviewQueueStore`
//! `Send + Sync`, enabling safe sharing across async tasks via `Arc`.

use std::sync::Mutex;

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
/// Thread-safe via `Mutex<Connection>` — enables sharing across async tasks
/// with `Arc<ReviewQueueStore>`.
pub struct ReviewQueueStore {
    conn: Mutex<Connection>,
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
            conn: Mutex::new(conn),
        })
    }

    /// Insert a new queue item into the review queue.
    ///
    /// Fails with UNIQUE constraint violation if `request_id` already exists.
    pub fn enqueue(&self, item: &QueueItem) -> anyhow::Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
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
    }

    /// Get all pending review items, ordered by creation time (oldest first).
    pub fn get_pending(&self) -> anyhow::Result<Vec<QueueItem>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
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
    }

    /// Look up a queue item by its request_id.
    pub fn get_by_request_id(&self, request_id: &str) -> anyhow::Result<Option<QueueItem>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
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
    }

    /// Submit a human verdict for a pending review item.
    ///
    /// Only updates items with status='pending'. Returns `true` if the item
    /// was successfully updated, `false` if it was already reviewed or expired.
    pub fn submit_verdict(
        &self,
        request_id: &str,
        verdict: &str,
        reviewer_id: &str,
        reason: &str,
    ) -> anyhow::Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
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
    }

    /// Mark all timed-out pending items as expired.
    ///
    /// Called periodically by the queue manager. Returns the number
    /// of items that were expired.
    pub fn expire_timed_out(&self) -> anyhow::Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
        let updated = conn.execute(
            "UPDATE review_queue
             SET status = 'expired'
             WHERE status = 'pending' AND timeout_at < datetime('now')",
            [],
        )?;
        Ok(updated)
    }

    /// Delete old reviewed/expired items for storage hygiene.
    ///
    /// Only deletes items with status 'reviewed' or 'expired' that are
    /// older than `older_than_days` days.
    pub fn cleanup_old(&self, older_than_days: i64) -> anyhow::Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("mutex poisoned: {e}"))?;
        let deleted = conn.execute(
            "DELETE FROM review_queue
             WHERE status IN ('reviewed', 'expired')
               AND created_at < datetime('now', ?1)",
            params![format!("-{older_than_days} days")],
        )?;
        Ok(deleted)
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

    #[test]
    fn test_store_enqueue_and_get_pending() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_test_item("req-001");

        store.enqueue(&item).unwrap();

        let pending = store.get_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].request_id, "req-001");
        assert_eq!(pending[0].status, "pending");
        assert_eq!(pending[0].content_hash, "sha256-abc123");
    }

    #[test]
    fn test_store_submit_verdict_updates_status() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_test_item("req-002");
        store.enqueue(&item).unwrap();

        let updated = store
            .submit_verdict("req-002", "block", "reviewer-1", "contains PII")
            .unwrap();
        assert!(updated);

        // Should no longer appear in pending
        let pending = store.get_pending().unwrap();
        assert!(pending.is_empty());

        // Verify the stored verdict
        let reviewed = store.get_by_request_id("req-002").unwrap().unwrap();
        assert_eq!(reviewed.status, "reviewed");
        assert_eq!(reviewed.verdict.as_deref(), Some("block"));
        assert_eq!(reviewed.reviewer_id.as_deref(), Some("reviewer-1"));
        assert_eq!(reviewed.reviewer_reason.as_deref(), Some("contains PII"));
        assert!(reviewed.reviewed_at.is_some());
    }

    #[test]
    fn test_store_submit_verdict_only_pending() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_expired_item("req-003");
        store.enqueue(&item).unwrap();

        // Expire it first
        store.expire_timed_out().unwrap();

        // Now try to submit a verdict on the expired item
        let updated = store
            .submit_verdict("req-003", "allow", "reviewer-2", "false alarm")
            .unwrap();
        assert!(!updated); // Should return false — item is expired, not pending
    }

    #[test]
    fn test_store_expire_timed_out() {
        let store = ReviewQueueStore::new(":memory:").unwrap();

        // One expired, one not expired
        let expired = make_expired_item("req-004");
        let active = make_test_item("req-005");
        store.enqueue(&expired).unwrap();
        store.enqueue(&active).unwrap();

        let count = store.expire_timed_out().unwrap();
        assert_eq!(count, 1);

        // Only the active item should remain pending
        let pending = store.get_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].request_id, "req-005");

        // Expired item should have status='expired'
        let expired_item = store.get_by_request_id("req-004").unwrap().unwrap();
        assert_eq!(expired_item.status, "expired");
    }

    #[test]
    fn test_store_get_by_request_id() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item = make_test_item("req-006");
        store.enqueue(&item).unwrap();

        let found = store.get_by_request_id("req-006").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().request_id, "req-006");

        let not_found = store.get_by_request_id("nonexistent").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_store_unique_request_id() {
        let store = ReviewQueueStore::new(":memory:").unwrap();
        let item1 = make_test_item("req-007");
        store.enqueue(&item1).unwrap();

        // Duplicate request_id should fail with UNIQUE constraint
        let item2 = QueueItem {
            id: "different-id".to_string(),
            ..make_test_item("req-007")
        };
        let result = store.enqueue(&item2);
        assert!(result.is_err());
    }
}
