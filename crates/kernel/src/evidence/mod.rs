pub mod bundle;
pub mod client;

use std::io::Cursor;
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

#[derive(Debug)]
pub struct EvidenceBuffer {
    tx: mpsc::Sender<RawEvidenceEvent>,
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

impl EvidenceBuffer {
    pub fn new(
        collector_addr: String,
        kernel_id: String,
        mtls: Option<MtlsCerts>,
    ) -> (Self, tokio::task::JoinHandle<()>) {
        let (tx, rx) = mpsc::channel(EVIDENCE_BUFFER_SIZE);
        let handle = tokio::spawn(evidence_flusher(rx, collector_addr, kernel_id, mtls));
        (Self { tx }, handle)
    }

    pub fn try_send(&self, event: RawEvidenceEvent) {
        if let Err(err) = self.tx.try_send(event) {
            match err {
                mpsc::error::TrySendError::Full(_) => {
                    tracing::warn!("evidence buffer full, dropping event");
                }
                mpsc::error::TrySendError::Closed(_) => {
                    tracing::debug!("evidence buffer closed, dropping event");
                }
            }
        }
    }

    pub fn stub() -> Self {
        let (tx, rx) = mpsc::channel(1);
        drop(rx);
        Self { tx }
    }
}

async fn evidence_flusher(
    mut rx: mpsc::Receiver<RawEvidenceEvent>,
    collector_addr: String,
    kernel_id: String,
    mtls: Option<MtlsCerts>,
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

    loop {
        tokio::select! {
            _ = interval.tick() => {
                flush_batch(&mut client, &kernel_id, &mut batch_sequence, &mut batch).await;
            }
            maybe_event = rx.recv() => {
                match maybe_event {
                    Some(event) => batch.push(event),
                    None => {
                        flush_batch(&mut client, &kernel_id, &mut batch_sequence, &mut batch).await;
                        break;
                    }
                }
            }
        }
    }
}

async fn flush_batch(
    client: &mut EvidenceGrpcClient,
    kernel_id: &str,
    batch_sequence: &mut u64,
    batch: &mut Vec<RawEvidenceEvent>,
) {
    if batch.is_empty() {
        return;
    }

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
            batch.clear();
            *batch_sequence += 1;
            return;
        }
    };

    if let Err(err) = client
        .submit_batch(kernel_id, *batch_sequence, compressed)
        .await
    {
        tracing::error!(error = %err, "failed to submit evidence batch");
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
            actor_identity: "anonymous".to_string(),
            department: "unknown".to_string(),
            vendor: "api.openai.com".to_string(),
            model: "unknown".to_string(),
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
        let buffer = EvidenceBuffer { tx };

        buffer.try_send(sample_event());
        let start = Instant::now();
        buffer.try_send(sample_event());
        let elapsed = start.elapsed();

        assert!(elapsed < Duration::from_millis(10));
        let first = rx.recv().await;
        assert!(first.is_some());
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn stub_buffer_silently_drops_events() {
        let buffer = EvidenceBuffer::stub();
        buffer.try_send(sample_event());
    }
}
