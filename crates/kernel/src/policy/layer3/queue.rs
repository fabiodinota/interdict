//! In-memory review queue with connection hold semantics.
//!
//! When a request escalates to Layer 3, the user's HTTP connection is held
//! via a tokio oneshot channel. A human reviewer submits a verdict through
//! the management API, which is delivered to the waiting connection. If no
//! verdict arrives within the configured timeout, the policy's fail-mode
//! is applied (fail-closed → Block, fail-open → Allow).
//!
//! The semaphore-based concurrency limit prevents resource exhaustion from
//! too many simultaneous L3 holds (Pitfall 6 from Research). All items are
//! persisted to SQLite for dashboard integration.
//!
//! **Bounded channels only (KERN-13):** The oneshot channel is inherently
//! bounded (single value). The semaphore provides the concurrency bound.

use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{Semaphore, TryAcquireError, oneshot};

use super::store::{QueueItem, ReviewQueueStore};
use crate::policy::config::FailMode;
use crate::policy::verdict::{VerdictAction, VerdictTrace};

/// A human reviewer's decision delivered through the review queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanVerdict {
    /// The enforcement action decided by the reviewer.
    pub action: VerdictAction,
    /// Identifier of the reviewer who made the decision.
    pub reviewer_id: String,
    /// Reason provided by the reviewer for their decision.
    pub reason: String,
}

/// In-memory review queue that holds connections until human verdicts arrive.
///
/// Uses oneshot channels for connection hold, a semaphore for concurrency
/// limiting, and DashMap for concurrent access to pending reviews.
pub struct ReviewQueue {
    /// SQLite persistence backend.
    store: Arc<ReviewQueueStore>,
    /// Maps request_id → oneshot sender for delivering verdicts to held connections.
    pending: Arc<DashMap<String, oneshot::Sender<HumanVerdict>>>,
    /// Limits concurrent L3 holds to prevent proxy resource exhaustion.
    semaphore: Arc<Semaphore>,
    /// Default timeout for human review before fail-mode applies.
    default_timeout: Duration,
    /// Test-only: signals after `pending.insert()` so tests can synchronize
    /// on escalation readiness instead of racing against wall-clock sleeps.
    #[cfg(test)]
    pub escalation_notify: Option<tokio::sync::mpsc::UnboundedSender<()>>,
}

impl ReviewQueue {
    /// Create a new review queue.
    ///
    /// # Arguments
    /// * `store` - SQLite persistence backend (shared via Arc).
    /// * `max_pending` - Maximum concurrent L3 holds (semaphore capacity).
    /// * `default_timeout` - How long to wait for a human verdict before fail-mode.
    pub fn new(
        store: Arc<ReviewQueueStore>,
        max_pending: usize,
        default_timeout: Duration,
    ) -> Self {
        Self {
            store,
            pending: Arc::new(DashMap::new()),
            semaphore: Arc::new(Semaphore::new(max_pending)),
            default_timeout,
            #[cfg(test)]
            escalation_notify: None,
        }
    }

    /// Escalate a request to Layer 3 human review.
    ///
    /// This is the core method called when Layer 2 returns 'uncertain'.
    /// It holds the caller's connection until a human verdict arrives or
    /// the timeout expires.
    ///
    /// # Flow
    /// 1. Try to acquire a semaphore permit (non-blocking). If the queue
    ///    is at capacity, immediately return the fail-mode default action.
    /// 2. Create a oneshot channel for the response.
    /// 3. Persist the item to SQLite.
    /// 4. Insert the sender into the pending map.
    /// 5. Await the receiver with timeout.
    /// 6. On verdict: return the reviewer's action.
    ///    On timeout: mark expired in store, return fail-mode default.
    ///    On channel drop: return fail-mode default.
    /// 7. Clean up the pending map entry in all code paths.
    pub async fn escalate(
        &self,
        request_id: uuid::Uuid,
        trace: &VerdictTrace,
        content_hash: &str,
        fail_mode: FailMode,
    ) -> anyhow::Result<VerdictAction> {
        // Step 1: Try acquire semaphore (non-blocking).
        // If at capacity, immediately apply fail-mode — don't queue.
        let _permit = match self.semaphore.try_acquire() {
            Ok(permit) => permit,
            Err(TryAcquireError::NoPermits) => {
                tracing::warn!(
                    request_id = %request_id,
                    "L3 queue at capacity, applying fail-mode"
                );
                return Ok(fail_mode.default_action());
            }
            Err(TryAcquireError::Closed) => {
                return Err(anyhow::anyhow!("L3 review queue semaphore closed"));
            }
        };

        // Step 2: Create oneshot channel for the response.
        let (tx, rx) = oneshot::channel();

        // Step 3: Compute timestamps and persist to SQLite.
        let now = chrono::Utc::now();
        let timeout_at = now + chrono::Duration::from_std(self.default_timeout)?;
        let request_id_str = request_id.to_string();

        let fail_mode_str = match fail_mode {
            FailMode::FailClosed => "closed",
            FailMode::FailOpen => "open",
        };

        let trace_json = serde_json::to_string(trace)?;

        let queue_item = QueueItem {
            id: uuid::Uuid::new_v4().to_string(),
            request_id: request_id_str.clone(),
            pipeline_trace: trace_json,
            content_hash: content_hash.to_string(),
            fail_mode: fail_mode_str.to_string(),
            status: "pending".to_string(),
            created_at: now.to_rfc3339(),
            timeout_at: timeout_at.to_rfc3339(),
            verdict: None,
            reviewer_id: None,
            reviewer_reason: None,
            reviewed_at: None,
        };

        self.store.enqueue(queue_item).await?;

        // Step 4: Insert sender into pending map.
        self.pending.insert(request_id_str.clone(), tx);

        // Signal test harness that the pending entry is ready for verdict submission.
        #[cfg(test)]
        if let Some(ref notify_tx) = self.escalation_notify {
            let _ = notify_tx.send(());
        }

        // Step 5: Await the receiver with timeout.
        let result = tokio::time::timeout(self.default_timeout, rx).await;

        // Step 6 & 7: Handle result and clean up.
        // Always remove from pending map (cleanup on all paths).
        self.pending.remove(&request_id_str);

        match result {
            Ok(Ok(verdict)) => {
                // Human decided — return their action.
                tracing::info!(
                    request_id = %request_id,
                    reviewer_id = %verdict.reviewer_id,
                    action = ?verdict.action,
                    "L3 human verdict received"
                );
                Ok(verdict.action)
            }
            Ok(Err(_)) => {
                // Channel dropped — reviewer disconnected.
                tracing::warn!(
                    request_id = %request_id,
                    "L3 review channel dropped, applying fail-mode"
                );
                Ok(fail_mode.default_action())
            }
            Err(_) => {
                // Timeout — no human decision arrived.
                tracing::warn!(
                    request_id = %request_id,
                    timeout_secs = self.default_timeout.as_secs(),
                    "L3 review timeout, applying fail-mode"
                );
                // Update store status to 'expired' for this specific request.
                if let Err(e) = self.store.expire_timed_out().await {
                    tracing::error!(error = %e, "failed to expire timed-out reviews in store");
                }
                Ok(fail_mode.default_action())
            }
        }
        // _permit is dropped here (RAII), releasing the semaphore slot.
    }

    /// Submit a human verdict for a pending review.
    ///
    /// Called by the management API when a human reviewer decides.
    /// Returns `true` if the verdict was delivered to the waiting connection,
    /// `false` if the request already timed out.
    pub async fn submit_verdict(
        &self,
        request_id: &str,
        verdict: HumanVerdict,
    ) -> anyhow::Result<bool> {
        // Update SQLite store first.
        let action_str = match verdict.action {
            VerdictAction::Allow => "allow",
            VerdictAction::Redact => "redact",
            VerdictAction::Block => "block",
        };
        self.store
            .submit_verdict(
                request_id,
                action_str,
                &verdict.reviewer_id,
                &verdict.reason,
            )
            .await?;

        // Try to deliver the verdict through the oneshot channel.
        if let Some((_, tx)) = self.pending.remove(request_id) {
            // Send the verdict to unblock the held connection.
            // If the receiver was already dropped (timeout race), the send
            // will fail silently — that's fine, the fail-mode was already applied.
            match tx.send(verdict) {
                Ok(()) => Ok(true),
                Err(_) => Ok(false), // Receiver already dropped (timeout race)
            }
        } else {
            // Not in pending map — already timed out.
            Ok(false)
        }
    }

    /// Get the count of currently held connections awaiting review.
    pub fn get_pending_count(&self) -> usize {
        self.pending.len()
    }

    /// Get all pending queue items from the SQLite store.
    ///
    /// Delegates to `store.get_pending()` for the management API.
    pub async fn get_pending_items(&self) -> anyhow::Result<Vec<QueueItem>> {
        self.store.get_pending().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::verdict::{MergedVerdict, PolicyVerdict, VerdictAction};

    /// Create a minimal VerdictTrace for testing.
    fn make_test_trace(request_id: uuid::Uuid) -> VerdictTrace {
        VerdictTrace {
            request_id,
            merged_verdict: MergedVerdict::merge(vec![PolicyVerdict {
                policy_id: "test-policy".to_string(),
                action: VerdictAction::Allow,
                redactions: vec![],
                reason: Some("test".to_string()),
            }]),
            layer1_results: vec![],
            layer2_classification: None,
            layer3_decision: None,
            timestamp: chrono::Utc::now(),
        }
    }

    fn make_queue(timeout_ms: u64, max_pending: usize) -> ReviewQueue {
        let store =
            Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
        ReviewQueue::new(store, max_pending, Duration::from_millis(timeout_ms))
    }

    #[tokio::test]
    async fn test_escalate_holds_connection_until_verdict() {
        let mut queue = make_queue(5000, 10); // 5s timeout
        let (notify_tx, mut notify_rx) = tokio::sync::mpsc::unbounded_channel();
        queue.escalation_notify = Some(notify_tx);
        let queue = Arc::new(queue);
        let request_id = uuid::Uuid::new_v4();
        let trace = make_test_trace(request_id);

        let queue_clone = queue.clone();
        let req_id_str = request_id.to_string();

        // Spawn the escalation in a background task.
        let handle = tokio::spawn(async move {
            queue_clone
                .escalate(request_id, &trace, "hash-abc", FailMode::FailClosed)
                .await
                .unwrap()
        });

        // Wait for the escalation to register in the pending map.
        notify_rx.recv().await.unwrap();

        // Submit a verdict from the "reviewer".
        let delivered = queue
            .submit_verdict(
                &req_id_str,
                HumanVerdict {
                    action: VerdictAction::Allow,
                    reviewer_id: "reviewer-1".to_string(),
                    reason: "looks safe".to_string(),
                },
            )
            .await
            .unwrap();
        assert!(delivered);

        // The escalation should return the submitted verdict.
        let action = handle.await.unwrap();
        assert_eq!(action, VerdictAction::Allow);
    }

    #[tokio::test]
    async fn test_escalate_timeout_returns_fail_mode_closed() {
        let queue = make_queue(100, 10); // 100ms timeout
        let request_id = uuid::Uuid::new_v4();
        let trace = make_test_trace(request_id);

        // Don't submit any verdict — let it timeout.
        let action = queue
            .escalate(request_id, &trace, "hash-abc", FailMode::FailClosed)
            .await
            .unwrap();

        // Fail-closed → Block.
        assert_eq!(action, VerdictAction::Block);
    }

    #[tokio::test]
    async fn test_escalate_timeout_returns_fail_mode_open() {
        let queue = make_queue(100, 10); // 100ms timeout
        let request_id = uuid::Uuid::new_v4();
        let trace = make_test_trace(request_id);

        // Don't submit any verdict — let it timeout.
        let action = queue
            .escalate(request_id, &trace, "hash-abc", FailMode::FailOpen)
            .await
            .unwrap();

        // Fail-open → Allow.
        assert_eq!(action, VerdictAction::Allow);
    }

    #[tokio::test]
    async fn test_escalate_concurrent_limit() {
        let mut queue = make_queue(5000, 2); // Max 2 concurrent
        let (notify_tx, mut notify_rx) = tokio::sync::mpsc::unbounded_channel();
        queue.escalation_notify = Some(notify_tx);
        let queue = Arc::new(queue);
        let mut handles = Vec::new();

        // Fill up both semaphore slots.
        for _ in 0..2 {
            let queue_clone = queue.clone();
            let request_id = uuid::Uuid::new_v4();
            let trace = make_test_trace(request_id);
            handles.push(tokio::spawn(async move {
                queue_clone
                    .escalate(request_id, &trace, "hash", FailMode::FailClosed)
                    .await
                    .unwrap()
            }));
        }

        // Wait for both escalations to acquire permits and register.
        notify_rx.recv().await.unwrap();
        notify_rx.recv().await.unwrap();

        // Third escalation should immediately return fail-mode (no waiting).
        let request_id = uuid::Uuid::new_v4();
        let trace = make_test_trace(request_id);
        let action = queue
            .escalate(request_id, &trace, "hash", FailMode::FailClosed)
            .await
            .unwrap();

        // Should get Block immediately (fail-closed, no permit available).
        assert_eq!(action, VerdictAction::Block);

        // Clean up: drop the queue to close channels for the background tasks.
        drop(queue);
        for h in handles {
            // These will get channel-dropped errors, which is fine.
            let _ = h.await;
        }
    }

    #[tokio::test]
    async fn test_submit_verdict_after_timeout_returns_false() {
        let queue = Arc::new(make_queue(100, 10)); // 100ms timeout
        let request_id = uuid::Uuid::new_v4();
        let trace = make_test_trace(request_id);
        let req_id_str = request_id.to_string();

        // Escalate and wait for timeout.
        let action = queue
            .escalate(request_id, &trace, "hash-abc", FailMode::FailClosed)
            .await
            .unwrap();
        assert_eq!(action, VerdictAction::Block);

        // Now try to submit a verdict — should return false (already timed out).
        let delivered = queue
            .submit_verdict(
                &req_id_str,
                HumanVerdict {
                    action: VerdictAction::Allow,
                    reviewer_id: "late-reviewer".to_string(),
                    reason: "too late".to_string(),
                },
            )
            .await
            .unwrap();
        assert!(!delivered);
    }

    #[tokio::test]
    async fn test_escalate_persists_to_store() {
        let store =
            Arc::new(ReviewQueueStore::new(":memory:").expect("in-memory SQLite should work"));
        let queue = ReviewQueue::new(store.clone(), 10, Duration::from_millis(100));
        let request_id = uuid::Uuid::new_v4();
        let trace = make_test_trace(request_id);

        // Escalate (will timeout since we don't submit a verdict).
        let _ = queue
            .escalate(request_id, &trace, "hash-persist", FailMode::FailClosed)
            .await;

        // Verify the item was persisted to the store.
        let item = store
            .get_by_request_id(&request_id.to_string())
            .await
            .unwrap();
        assert!(item.is_some());
        let item = item.unwrap();
        assert_eq!(item.content_hash, "hash-persist");
        assert_eq!(item.fail_mode, "closed");
    }

    #[tokio::test]
    async fn test_escalate_at_capacity_returns_fail_closed_immediately() {
        // Queue with max_pending=1. First escalation acquires the permit,
        // second should immediately return fail-mode default without blocking.
        let mut queue = make_queue(5000, 1); // max 1 concurrent
        let (notify_tx, mut notify_rx) = tokio::sync::mpsc::unbounded_channel();
        queue.escalation_notify = Some(notify_tx);
        let queue = Arc::new(queue);

        let request_id_1 = uuid::Uuid::new_v4();
        let trace_1 = make_test_trace(request_id_1);
        let queue_clone = queue.clone();

        // Fill the single permit slot.
        let _handle = tokio::spawn(async move {
            queue_clone
                .escalate(request_id_1, &trace_1, "hash-1", FailMode::FailClosed)
                .await
                .unwrap()
        });

        // Wait for the first escalation to acquire the permit.
        notify_rx.recv().await.unwrap();

        // Second escalation with fail-closed: should get Block immediately.
        let request_id_2 = uuid::Uuid::new_v4();
        let trace_2 = make_test_trace(request_id_2);
        let action = queue
            .escalate(request_id_2, &trace_2, "hash-2", FailMode::FailClosed)
            .await
            .unwrap();
        assert_eq!(action, VerdictAction::Block);

        // Pending count should be 1 (only the first request is actually held).
        assert_eq!(queue.get_pending_count(), 1);

        // Clean up: drop queue to unblock the background task.
        drop(queue);
        let _ = _handle.await;
    }

    #[tokio::test]
    async fn test_escalate_at_capacity_returns_fail_open_immediately() {
        // Same as above but with fail-open: should get Allow immediately.
        let mut queue = make_queue(5000, 1); // max 1 concurrent
        let (notify_tx, mut notify_rx) = tokio::sync::mpsc::unbounded_channel();
        queue.escalation_notify = Some(notify_tx);
        let queue = Arc::new(queue);

        let request_id_1 = uuid::Uuid::new_v4();
        let trace_1 = make_test_trace(request_id_1);
        let queue_clone = queue.clone();

        let _handle = tokio::spawn(async move {
            queue_clone
                .escalate(request_id_1, &trace_1, "hash-1", FailMode::FailClosed)
                .await
                .unwrap()
        });

        // Wait for the first escalation to acquire the permit.
        notify_rx.recv().await.unwrap();

        // Second escalation with fail-open: should get Allow immediately.
        let request_id_2 = uuid::Uuid::new_v4();
        let trace_2 = make_test_trace(request_id_2);
        let action = queue
            .escalate(request_id_2, &trace_2, "hash-2", FailMode::FailOpen)
            .await
            .unwrap();
        assert_eq!(action, VerdictAction::Allow);

        drop(queue);
        let _ = _handle.await;
    }
}
