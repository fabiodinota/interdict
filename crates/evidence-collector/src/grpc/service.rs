use std::sync::Arc;

use anyhow::{Context, Result, anyhow};
use chrono::{TimeZone, Utc};
use prost::Message;
use prost::bytes::Buf;
use tokio::sync::{Mutex, mpsc};
use tonic::{Request, Response, Status, Streaming};

use crate::chain::{hasher::ChainManager, signer};
use crate::merkle::builder::HourlyMerkleBuilder;
use crate::signing::RotatingSigningProvider;
use crate::storage::clickhouse::{ClickHouseWriter, EvidenceRow};

use super::proto::{
    EvidenceBundle, SubmitEvidenceRequest, SubmitEvidenceResponse,
    evidence_collector_service_server::EvidenceCollectorService,
};

pub struct EvidenceCollectorGrpcService {
    chain_manager: Arc<Mutex<ChainManager>>,
    signing_provider: Arc<RotatingSigningProvider>,
    clickhouse_writer: Arc<ClickHouseWriter>,
    merkle_builder: Arc<Mutex<HourlyMerkleBuilder>>,
    merkle_overflow_tx: Option<mpsc::Sender<()>>,
}

impl EvidenceCollectorGrpcService {
    pub fn new(
        chain_manager: Arc<Mutex<ChainManager>>,
        signing_provider: Arc<RotatingSigningProvider>,
        clickhouse_writer: Arc<ClickHouseWriter>,
        merkle_builder: Arc<Mutex<HourlyMerkleBuilder>>,
        merkle_overflow_tx: Option<mpsc::Sender<()>>,
    ) -> Self {
        Self {
            chain_manager,
            signing_provider,
            clickhouse_writer,
            merkle_builder,
            merkle_overflow_tx,
        }
    }

    async fn process_bundle(&self, kernel_id: &str, mut bundle: EvidenceBundle) -> Result<()> {
        validate_kernel_id(kernel_id).context("invalid batch kernel_id")?;
        if bundle.kernel_id != kernel_id {
            return Err(anyhow!(
                "bundle kernel_id does not match enclosing batch kernel_id"
            ));
        }

        let bundle_bytes = bundle.encode_to_vec();

        let (chain_hash, sequence_number, previous_hash) = self
            .chain_manager
            .lock()
            .await
            .link(kernel_id, &bundle_bytes);

        let current_signer = self.signing_provider.current();
        let signed = signer::sign_bundle(&**current_signer, &bundle_bytes).await?;

        bundle.chain_hash = chain_hash.to_vec();
        bundle.previous_hash = previous_hash.to_vec();
        bundle.sequence_number = sequence_number;
        bundle.signature = signed.signature.clone();
        bundle.signing_key_id = signed.signing_key_id.clone();
        bundle.dev_signed = signed.dev_signed;

        let row = map_bundle_to_row(
            &bundle,
            &chain_hash,
            &previous_hash,
            &signed.signature,
            &bundle_bytes,
        )?;
        self.clickhouse_writer.write(row).await?;

        let mut builder = self.merkle_builder.lock().await;
        let within_limit = builder.add_bundle_hash(chain_hash);
        if !within_limit {
            tracing::warn!(
                kernel_id = kernel_id,
                sequence_number = sequence_number,
                "hourly merkle leaf cap exceeded; requesting sub-hourly anchor rotation"
            );
            if let Some(tx) = &self.merkle_overflow_tx {
                let _ = tx.try_send(());
            }
        }

        tracing::info!(
            kernel_id = kernel_id,
            bundle_id = %bundle.bundle_id,
            sequence_number = sequence_number,
            "accepted evidence bundle"
        );

        Ok(())
    }
}

#[tonic::async_trait]
impl EvidenceCollectorService for EvidenceCollectorGrpcService {
    async fn submit_evidence(
        &self,
        request: Request<Streaming<SubmitEvidenceRequest>>,
    ) -> Result<Response<SubmitEvidenceResponse>, Status> {
        let mut stream = request.into_inner();
        let mut accepted_count = 0u64;
        let mut rejected_count = 0u64;

        loop {
            match stream.message().await {
                Ok(Some(batch)) => {
                    if let Err(error) = validate_kernel_id(&batch.kernel_id) {
                        rejected_count += 1;
                        tracing::warn!(
                            kernel_id = %batch.kernel_id,
                            batch_sequence = batch.batch_sequence,
                            error = %error,
                            "rejected evidence batch with invalid kernel_id"
                        );
                        continue;
                    }

                    let bundles = match decode_bundles_payload(&batch.compressed_payload) {
                        Ok(bundles) => bundles,
                        Err(error) => {
                            rejected_count += 1;
                            tracing::warn!(
                                kernel_id = %batch.kernel_id,
                                batch_sequence = batch.batch_sequence,
                                error = %error,
                                "rejected evidence batch"
                            );
                            continue;
                        }
                    };

                    for bundle in bundles {
                        let bundle_id = bundle.bundle_id.clone();

                        match self.process_bundle(&batch.kernel_id, bundle).await {
                            Ok(()) => {
                                accepted_count += 1;
                            }
                            Err(error) => {
                                rejected_count += 1;
                                tracing::warn!(
                                    kernel_id = %batch.kernel_id,
                                    batch_sequence = batch.batch_sequence,
                                    bundle_id = %bundle_id,
                                    error = %error,
                                    "rejected evidence bundle"
                                );
                            }
                        }
                    }
                }
                Ok(None) => break,
                Err(error) => {
                    tracing::warn!(error = %error, "streaming receive failure from evidence kernel client");
                    return Err(Status::internal("failed receiving evidence stream"));
                }
            }
        }

        Ok(Response::new(SubmitEvidenceResponse {
            accepted_count,
            rejected_count,
            error_message: if rejected_count == 0 {
                String::new()
            } else {
                "some bundles were rejected".to_string()
            },
        }))
    }
}

fn decode_bundles_payload(compressed_payload: &[u8]) -> Result<Vec<EvidenceBundle>> {
    let decoded = zstd::decode_all(compressed_payload)
        .context("zstd decompression failed for evidence payload")?;

    let mut bundles = Vec::new();
    let mut input = prost::bytes::Bytes::from(decoded);
    while input.has_remaining() {
        bundles.push(EvidenceBundle::decode_length_delimited(&mut input)?);
    }

    if bundles.is_empty() {
        return Err(anyhow!("evidence batch payload decoded to zero bundles"));
    }

    Ok(bundles)
}

fn map_bundle_to_row(
    bundle: &EvidenceBundle,
    chain_hash: &[u8; 32],
    previous_hash: &[u8; 32],
    signature: &[u8],
    content_bytes: &[u8],
) -> Result<EvidenceRow> {
    let timestamp = bundle_timestamp(bundle)?;

    Ok(EvidenceRow {
        event_date: EvidenceRow::from_timestamp(timestamp),
        timestamp: timestamp.timestamp_millis(),
        bundle_id: bundle.bundle_id.clone(),
        kernel_id: bundle.kernel_id.clone(),
        actor_identity: bundle.actor_identity.clone(),
        department: bundle.department.clone(),
        vendor: bundle.vendor.clone(),
        model: bundle.model.clone(),
        prompt_hash: bundle.prompt_hash.clone(),
        response_hash: bundle.response_hash.clone(),
        prompt_text: bundle.prompt_text.clone(),
        response_text: bundle.response_text.clone(),
        policy_action: bundle.policy_action.clone(),
        policy_rules_json: bundle.policy_rules_json.clone(),
        token_count: bundle.token_count,
        enforcement_latency_us: bundle.enforcement_latency_us,
        chain_hash: hex::encode(chain_hash),
        previous_hash: hex::encode(previous_hash),
        sequence_number: bundle.sequence_number,
        signature: hex::encode(signature),
        signing_key_id: bundle.signing_key_id.clone(),
        dev_signed: u8::from(bundle.dev_signed),
        schema_version: bundle.schema_version,
        content_bytes: hex::encode(content_bytes),
    })
}

fn bundle_timestamp(bundle: &EvidenceBundle) -> Result<chrono::DateTime<Utc>> {
    let timestamp = bundle
        .timestamp
        .as_ref()
        .context("evidence bundle missing timestamp")?;

    Utc.timestamp_opt(timestamp.seconds, timestamp.nanos as u32)
        .single()
        .ok_or_else(|| anyhow!("evidence bundle timestamp is invalid"))
}

fn validate_kernel_id(kernel_id: &str) -> Result<()> {
    if kernel_id.is_empty() || kernel_id.len() > 128 {
        return Err(anyhow!("kernel_id must be between 1 and 128 characters"));
    }

    if !kernel_id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(anyhow!(
            "kernel_id may only contain ASCII letters, digits, hyphens, and underscores"
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{bundle_timestamp, decode_bundles_payload, map_bundle_to_row, validate_kernel_id};
    use crate::grpc::proto::EvidenceBundle;
    use prost::Message;
    use prost_types::Timestamp;

    #[test]
    fn decode_zstd_payload_into_multiple_bundles() {
        let b1 = EvidenceBundle {
            bundle_id: "a".to_string(),
            kernel_id: "k".to_string(),
            timestamp: Some(Timestamp {
                seconds: 1_772_236_800,
                nanos: 0,
            }),
            ..Default::default()
        };
        let b2 = EvidenceBundle {
            bundle_id: "b".to_string(),
            kernel_id: "k".to_string(),
            timestamp: Some(Timestamp {
                seconds: 1_772_236_801,
                nanos: 0,
            }),
            ..Default::default()
        };

        let mut payload = Vec::new();
        b1.encode_length_delimited(&mut payload)
            .expect("encode bundle1");
        b2.encode_length_delimited(&mut payload)
            .expect("encode bundle2");

        let compressed = zstd::encode_all(payload.as_slice(), 3).expect("compress payload");
        let decoded = decode_bundles_payload(&compressed).expect("decode bundles");
        assert_eq!(decoded.len(), 2);
        assert_eq!(decoded[0].bundle_id, "a");
        assert_eq!(decoded[1].bundle_id, "b");
    }

    #[test]
    fn map_bundle_to_clickhouse_row_encodes_hashes() {
        let bundle = EvidenceBundle {
            bundle_id: "bundle-1".to_string(),
            kernel_id: "kernel-1".to_string(),
            timestamp: Some(Timestamp {
                seconds: 1_772_236_800,
                nanos: 0,
            }),
            actor_identity: "analyst".to_string(),
            department: "fraud".to_string(),
            vendor: "openai".to_string(),
            model: "gpt".to_string(),
            prompt_hash: "p".repeat(64),
            response_hash: "r".repeat(64),
            policy_action: "allow".to_string(),
            policy_rules_json: "[]".to_string(),
            token_count: 42,
            enforcement_latency_us: 100,
            sequence_number: 5,
            signing_key_id: "k-1".to_string(),
            schema_version: 1,
            ..Default::default()
        };
        let content = b"test-content-bytes";
        let row = map_bundle_to_row(&bundle, &[1u8; 32], &[0u8; 32], &[2u8; 64], content)
            .expect("map to row");

        assert_eq!(row.chain_hash, "01".repeat(32));
        assert_eq!(row.previous_hash, "00".repeat(32));
        assert_eq!(row.signature, "02".repeat(64));
        assert_eq!(row.content_bytes, hex::encode(content));
    }

    #[test]
    fn map_bundle_to_row_requires_timestamp() {
        let bundle = EvidenceBundle {
            bundle_id: "bundle-1".to_string(),
            kernel_id: "kernel-1".to_string(),
            ..Default::default()
        };

        let error = map_bundle_to_row(&bundle, &[1u8; 32], &[0u8; 32], &[2u8; 64], b"bytes")
            .expect_err("missing timestamp should fail");
        assert!(error.to_string().contains("missing timestamp"));
    }

    #[test]
    fn validate_kernel_id_rejects_invalid_characters() {
        let error = validate_kernel_id("kernel/1").expect_err("invalid kernel id should fail");
        assert!(error.to_string().contains("kernel_id"));
    }

    #[test]
    fn validate_kernel_id_rejects_empty_and_oversized_values() {
        let empty = validate_kernel_id("").expect_err("empty kernel id should fail");
        assert!(empty.to_string().contains("kernel_id"));

        let oversized_id = "k".repeat(129);
        let oversized =
            validate_kernel_id(&oversized_id).expect_err("oversized kernel id should fail");
        assert!(oversized.to_string().contains("kernel_id"));
    }

    #[test]
    fn validate_kernel_id_accepts_safe_identifier_characters() {
        validate_kernel_id("kernel_1-prod").expect("safe kernel id should pass");
    }

    #[test]
    fn bundle_timestamp_rejects_invalid_timestamp() {
        let bundle = EvidenceBundle {
            timestamp: Some(Timestamp {
                seconds: i64::MAX,
                nanos: 0,
            }),
            ..Default::default()
        };

        let error = bundle_timestamp(&bundle).expect_err("invalid timestamp should fail");
        assert!(error.to_string().contains("timestamp"));
    }
}
