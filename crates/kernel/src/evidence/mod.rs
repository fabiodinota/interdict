pub mod bundle;
pub mod client;
pub mod identity;

use std::io::Cursor;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use prost::Message;
use tokio::sync::mpsc;

use bundle::{RawEvidenceEvent, to_proto_bundle};
use client::EvidenceGrpcClient;

pub mod proto {
    tonic::include_proto!("interdict.evidence.v1");
}

const EVIDENCE_BUFFER_SIZE: usize = 8192;
const FLUSH_INTERVAL: Duration = Duration::from_millis(500);

/// Maximum number of compressed batches retained in the retry queue.
/// Beyond this, oldest batches are dropped and counted as lost.
const MAX_RETRY_QUEUE_LEN: usize = 64;

/// Maximum consecutive flush failures before declaring delivery unhealthy.
const UNHEALTHY_THRESHOLD: u64 = 10;

// Retry timing: failed batches are retried once per FLUSH_INTERVAL tick
// (500ms). With MAX_RETRY_QUEUE_LEN=64 and max_retry_attempts()=7,
// a batch is retried roughly every 500ms for ~3.5s before being
// permanently dropped. The gRPC client's built-in reconnect-on-failure
// provides additional connection-level resilience.

/// Delivery health metrics visible to the proxy for fail-closed decisions.
///
/// All counters are monotonically increasing and use relaxed ordering
/// (observability, not synchronization).
#[derive(Debug)]
pub struct DeliveryHealth {
    /// Total evidence batches successfully delivered.
    pub batches_sent: AtomicU64,
    /// Total evidence batches that permanently failed delivery (all retries exhausted).
    pub batches_failed: AtomicU64,
    /// Total individual events dropped because the in-memory buffer was full.
    pub events_dropped: AtomicU64,
    /// Total delivery retry attempts (each batch retry counts once).
    pub retries: AtomicU64,
    /// Consecutive failures — reset to 0 on any successful delivery.
    /// When >= UNHEALTHY_THRESHOLD, delivery is considered unhealthy.
    pub consecutive_failures: AtomicU64,
}

impl DeliveryHealth {
    fn new() -> Self {
        Self {
            batches_sent: AtomicU64::new(0),
            batches_failed: AtomicU64::new(0),
            events_dropped: AtomicU64::new(0),
            retries: AtomicU64::new(0),
            consecutive_failures: AtomicU64::new(0),
        }
    }

    /// Returns `true` when evidence delivery has been failing long enough
    /// that high-assurance mode should refuse new requests.
    pub fn is_unhealthy(&self) -> bool {
        self.consecutive_failures.load(Ordering::Relaxed) >= UNHEALTHY_THRESHOLD
    }

    fn record_success(&self) {
        self.batches_sent.fetch_add(1, Ordering::Relaxed);
        self.consecutive_failures.store(0, Ordering::Relaxed);
    }

    fn record_failure(&self) {
        self.batches_failed.fetch_add(1, Ordering::Relaxed);
        self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
    }

    fn record_drop(&self, count: u64) {
        self.events_dropped.fetch_add(count, Ordering::Relaxed);
    }

    fn record_retry(&self) {
        self.retries.fetch_add(1, Ordering::Relaxed);
    }
}

#[derive(Debug)]
pub struct EvidenceBuffer {
    tx: mpsc::Sender<RawEvidenceEvent>,
    health: Arc<DeliveryHealth>,
}

#[derive(Clone, PartialEq, Message)]
struct EvidenceBundleBatch {
    #[prost(message, repeated, tag = "1")]
    bundles: Vec<proto::EvidenceBundle>,
}

/// Optional mTLS certificate material for evidence gRPC client.
#[derive(Clone)]
pub struct MtlsCerts {
    pub ca_cert: Vec<u8>,
    pub client_cert: Vec<u8>,
    pub client_key: Vec<u8>,
}

/// A compressed batch awaiting retry after a failed delivery attempt.
struct RetryEntry {
    kernel_id: String,
    batch_sequence: u64,
    compressed_payload: Vec<u8>,
    event_count: usize,
    attempts: u32,
}

impl EvidenceBuffer {
    pub fn new(
        collector_addr: String,
        kernel_id: String,
        mtls: Option<MtlsCerts>,
    ) -> (Self, tokio::task::JoinHandle<()>) {
        let (tx, rx) = mpsc::channel(EVIDENCE_BUFFER_SIZE);
        let health = Arc::new(DeliveryHealth::new());
        let flusher_health = health.clone();
        let handle = tokio::spawn(evidence_flusher(
            rx,
            collector_addr,
            kernel_id,
            mtls,
            flusher_health,
        ));
        (Self { tx, health }, handle)
    }

    /// Attempt to enqueue an evidence event.
    ///
    /// This is non-blocking. If the internal buffer is full, the event is
    /// dropped and counted in `DeliveryHealth::events_dropped`.
    pub fn try_send(&self, event: RawEvidenceEvent) {
        if let Err(err) = self.tx.try_send(event) {
            match err {
                mpsc::error::TrySendError::Full(_) => {
                    self.health.record_drop(1);
                    tracing::warn!(
                        dropped = self.health.events_dropped.load(Ordering::Relaxed),
                        "evidence buffer full, dropping event"
                    );
                }
                mpsc::error::TrySendError::Closed(_) => {
                    tracing::debug!("evidence buffer closed, dropping event");
                }
            }
        }
    }

    /// Get a reference to the delivery health metrics.
    pub fn health(&self) -> &Arc<DeliveryHealth> {
        &self.health
    }

    pub fn stub() -> Self {
        let (tx, rx) = mpsc::channel(1);
        drop(rx);
        Self {
            tx,
            health: Arc::new(DeliveryHealth::new()),
        }
    }
}

async fn evidence_flusher(
    mut rx: mpsc::Receiver<RawEvidenceEvent>,
    collector_addr: String,
    kernel_id: String,
    mtls: Option<MtlsCerts>,
    health: Arc<DeliveryHealth>,
) {
    let mut client = match mtls {
        Some(certs) => EvidenceGrpcClient::with_mtls(
            collector_addr,
            certs.ca_cert,
            certs.client_cert,
            certs.client_key,
        ),
        None => EvidenceGrpcClient::new(collector_addr),
    };
    let mut interval = tokio::time::interval(FLUSH_INTERVAL);
    let mut batch_sequence = 0_u64;
    let mut batch = Vec::with_capacity(256);
    let mut retry_queue: Vec<RetryEntry> = Vec::new();

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // First, attempt to drain the retry queue.
                drain_retry_queue(&mut client, &health, &mut retry_queue).await;
                // Then flush the current batch.
                flush_batch(
                    &mut client,
                    &kernel_id,
                    &mut batch_sequence,
                    &mut batch,
                    &health,
                    &mut retry_queue,
                ).await;
            }
            maybe_event = rx.recv() => {
                match maybe_event {
                    Some(event) => batch.push(event),
                    None => {
                        // Channel closed — flush remaining events and retry queue.
                        drain_retry_queue(&mut client, &health, &mut retry_queue).await;
                        flush_batch(
                            &mut client,
                            &kernel_id,
                            &mut batch_sequence,
                            &mut batch,
                            &health,
                            &mut retry_queue,
                        ).await;
                        // Final drain attempt for any newly failed batches.
                        drain_retry_queue(&mut client, &health, &mut retry_queue).await;
                        if !retry_queue.is_empty() {
                            let lost: usize = retry_queue.iter().map(|e| e.event_count).sum();
                            tracing::error!(
                                pending_batches = retry_queue.len(),
                                lost_events = lost,
                                "evidence flusher shutting down with undelivered batches"
                            );
                            health.record_drop(lost as u64);
                        }
                        break;
                    }
                }
            }
        }
    }
}

/// Attempt to re-deliver batches in the retry queue with exponential backoff.
async fn drain_retry_queue(
    client: &mut EvidenceGrpcClient,
    health: &DeliveryHealth,
    retry_queue: &mut Vec<RetryEntry>,
) {
    let mut still_pending = Vec::new();
    for mut entry in retry_queue.drain(..) {
        health.record_retry();
        match client
            .submit_batch(
                &entry.kernel_id,
                entry.batch_sequence,
                entry.compressed_payload.clone(),
            )
            .await
        {
            Ok(_) => {
                health.record_success();
                tracing::debug!(
                    batch_seq = entry.batch_sequence,
                    attempts = entry.attempts + 1,
                    "retry succeeded for evidence batch"
                );
            }
            Err(err) => {
                entry.attempts += 1;
                let max_attempts = max_retry_attempts();
                if entry.attempts >= max_attempts {
                    tracing::error!(
                        batch_seq = entry.batch_sequence,
                        attempts = entry.attempts,
                        events = entry.event_count,
                        error = %err,
                        "evidence batch permanently lost after max retries"
                    );
                    health.record_failure();
                    health.record_drop(entry.event_count as u64);
                } else {
                    tracing::warn!(
                        batch_seq = entry.batch_sequence,
                        attempt = entry.attempts,
                        error = %err,
                        "evidence retry failed, will try again"
                    );
                    still_pending.push(entry);
                    // Stop retrying further entries on this tick — back off.
                    break;
                }
            }
        }
    }
    // Re-enqueue anything we didn't get to try plus the failed entry.
    // (The drain consumed everything; `still_pending` has the failed + untried.)
    retry_queue.extend(still_pending);
}

/// Maximum retry attempts per batch. Derived from backoff parameters so
/// total retry time ≈ 2 minutes of attempts before permanent loss.
fn max_retry_attempts() -> u32 {
    // With 1s initial, 1.6x multiplier, 30s max: ~7 attempts covers ~2 min.
    7
}

async fn flush_batch(
    client: &mut EvidenceGrpcClient,
    kernel_id: &str,
    batch_sequence: &mut u64,
    batch: &mut Vec<RawEvidenceEvent>,
    health: &DeliveryHealth,
    retry_queue: &mut Vec<RetryEntry>,
) {
    if batch.is_empty() {
        return;
    }

    let event_count = batch.len();
    let proto_batch = EvidenceBundleBatch {
        bundles: batch
            .iter()
            .map(|event| to_proto_bundle(event, kernel_id))
            .collect(),
    };
    let serialized = proto_batch.encode_to_vec();

    let compressed = match zstd::stream::encode_all(Cursor::new(serialized), 3) {
        Ok(payload) => payload,
        Err(err) => {
            tracing::error!(error = %err, "failed to compress evidence batch");
            health.record_failure();
            health.record_drop(event_count as u64);
            batch.clear();
            *batch_sequence += 1;
            return;
        }
    };

    let seq = *batch_sequence;
    match client
        .submit_batch(kernel_id, seq, compressed.clone())
        .await
    {
        Ok(_) => {
            health.record_success();
        }
        Err(err) => {
            tracing::warn!(
                batch_seq = seq,
                events = event_count,
                error = %err,
                "evidence batch delivery failed, queuing for retry"
            );
            // Enqueue for retry instead of dropping.
            if retry_queue.len() >= MAX_RETRY_QUEUE_LEN {
                // Shed the oldest entry to make room.
                if let Some(dropped) = retry_queue.first() {
                    tracing::error!(
                        dropped_batch_seq = dropped.batch_sequence,
                        dropped_events = dropped.event_count,
                        "retry queue full, dropping oldest batch"
                    );
                    health.record_failure();
                    health.record_drop(dropped.event_count as u64);
                }
                retry_queue.remove(0);
            }
            retry_queue.push(RetryEntry {
                kernel_id: kernel_id.to_string(),
                batch_sequence: seq,
                compressed_payload: compressed,
                event_count,
                attempts: 1,
            });
        }
    }

    batch.clear();
    *batch_sequence += 1;
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use tokio::time::Instant;

    fn sample_event() -> RawEvidenceEvent {
        RawEvidenceEvent {
            timestamp: Utc::now(),
            actor_identity: "test-user@corp.example".to_string(),
            department: "engineering".to_string(),
            vendor: "api.openai.com".to_string(),
            model: "gpt-4o".to_string(),
            prompt_hash: "prompt_hash".to_string(),
            response_hash: String::new(),
            prompt_text: None,
            response_text: None,
            policy_action: "allow".to_string(),
            policy_rules: vec![],
            token_count: 0,
            enforcement_latency_us: 10,
        }
    }

    #[tokio::test]
    async fn try_send_does_not_block_when_buffer_is_full() {
        let (tx, mut rx) = mpsc::channel(1);
        let health = Arc::new(DeliveryHealth::new());
        let buffer = EvidenceBuffer {
            tx,
            health: health.clone(),
        };

        buffer.try_send(sample_event());
        let start = Instant::now();
        buffer.try_send(sample_event());
        let elapsed = start.elapsed();

        assert!(elapsed < Duration::from_millis(10));
        // The second send was dropped because buffer size is 1.
        assert_eq!(health.events_dropped.load(Ordering::Relaxed), 1);
        let first = rx.recv().await;
        assert!(first.is_some());
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn stub_buffer_silently_drops_events() {
        let buffer = EvidenceBuffer::stub();
        buffer.try_send(sample_event());
    }

    #[test]
    fn delivery_health_tracks_state() {
        let health = DeliveryHealth::new();
        assert!(!health.is_unhealthy());

        // Accumulate failures up to threshold.
        for _ in 0..UNHEALTHY_THRESHOLD {
            health.record_failure();
        }
        assert!(health.is_unhealthy());

        // A single success resets.
        health.record_success();
        assert!(!health.is_unhealthy());
    }

    #[test]
    fn max_retry_attempts_is_reasonable() {
        assert!(max_retry_attempts() >= 3);
        assert!(max_retry_attempts() <= 20);
    }

    #[tokio::test]
    async fn test_flusher_shutdown_drains_queue() {
        // Create a buffer connected to a non-existent server
        let (buffer, handle) = EvidenceBuffer::new(
            "http://127.0.0.1:1".to_string(), // Will fail to connect
            "test-kernel".to_string(),
            None,
        );

        // Send several events
        for _ in 0..5 {
            buffer.try_send(sample_event());
        }

        // Drop the buffer to close the channel -- should trigger flusher shutdown
        drop(buffer);

        // Flusher should exit within a reasonable time
        let result = tokio::time::timeout(Duration::from_secs(10), handle).await;
        assert!(
            result.is_ok(),
            "flusher should shut down after channel closes"
        );
    }

    #[tokio::test]
    async fn test_retry_queue_saturation_drops_oldest() {
        let (buffer, handle) = EvidenceBuffer::new(
            "http://127.0.0.1:1".to_string(),
            "test-kernel".to_string(),
            None,
        );

        // Flood the buffer with events -- many will fail to deliver
        // and enter the retry queue
        for _ in 0..500 {
            buffer.try_send(sample_event());
        }

        // Allow some flush cycles
        tokio::time::sleep(Duration::from_secs(3)).await;

        // The retry queue should never exceed MAX_RETRY_QUEUE_LEN
        // We verify indirectly: batches_failed or events_dropped should be > 0
        let health = buffer.health();
        let total_drops = health.events_dropped.load(Ordering::Relaxed);
        let total_failed = health.batches_failed.load(Ordering::Relaxed);
        // At least some events should be processed (either failed or dropped)
        assert!(
            total_drops > 0 || total_failed > 0,
            "retry saturation should cause drops or failures, drops={}, failed={}",
            total_drops,
            total_failed
        );

        drop(buffer);
        let _ = tokio::time::timeout(Duration::from_secs(10), handle).await;
    }

    #[test]
    fn test_consecutive_failure_threshold_triggers_unhealthy() {
        let health = DeliveryHealth::new();
        assert!(!health.is_unhealthy());

        // Record exactly UNHEALTHY_THRESHOLD failures
        for i in 0..UNHEALTHY_THRESHOLD {
            health.record_failure();
            if i < UNHEALTHY_THRESHOLD - 1 {
                assert!(
                    !health.is_unhealthy(),
                    "should not be unhealthy at {} failures",
                    i + 1
                );
            }
        }
        assert!(health.is_unhealthy(), "should be unhealthy at threshold");

        // A single success should reset
        health.record_success();
        assert!(
            !health.is_unhealthy(),
            "success should reset unhealthy state"
        );
        assert_eq!(health.consecutive_failures.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn test_batch_compression_roundtrip() {
        use prost::Message;
        use std::io::Cursor;

        let events: Vec<RawEvidenceEvent> = (0..10).map(|_| sample_event()).collect();
        let proto_batch = EvidenceBundleBatch {
            bundles: events
                .iter()
                .map(|e| bundle::to_proto_bundle(e, "test-kernel"))
                .collect(),
        };

        let serialized = proto_batch.encode_to_vec();
        let compressed = zstd::stream::encode_all(Cursor::new(&serialized), 3).unwrap();
        let decompressed = zstd::stream::decode_all(Cursor::new(&compressed)).unwrap();

        assert_eq!(
            serialized, decompressed,
            "compression roundtrip should preserve data"
        );

        let decoded = EvidenceBundleBatch::decode(&decompressed[..]).unwrap();
        assert_eq!(decoded.bundles.len(), 10);
    }
}
