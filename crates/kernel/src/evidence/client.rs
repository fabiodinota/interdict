use std::time::Duration;

use anyhow::{Context, Result};
use tonic::transport::{Channel, Endpoint};

use super::proto::{
    EvidenceBatch, SubmitResponse, evidence_collector_client::EvidenceCollectorClient,
};

pub struct EvidenceGrpcClient {
    collector_addr: String,
    client: tokio::sync::Mutex<Option<EvidenceCollectorClient<Channel>>>,
}

impl EvidenceGrpcClient {
    pub fn new(collector_addr: String) -> Self {
        Self {
            collector_addr,
            client: tokio::sync::Mutex::new(None),
        }
    }

    pub async fn connect(&mut self) -> Result<()> {
        let client = Self::connect_inner(&self.collector_addr).await?;
        *self.client.get_mut() = Some(client);
        Ok(())
    }

    pub async fn submit_batch(
        &self,
        kernel_id: &str,
        batch_sequence: u64,
        compressed_payload: Vec<u8>,
    ) -> Result<SubmitResponse> {
        let batch = EvidenceBatch {
            compressed_payload,
            kernel_id: kernel_id.to_string(),
            batch_sequence,
        };

        match self.submit_once(batch.clone()).await {
            Ok(response) => Ok(response),
            Err(first_err) => {
                tracing::warn!(
                    error = %first_err,
                    "evidence submit failed, reconnecting and retrying"
                );

                let mut guard = self.client.lock().await;
                *guard = Some(Self::connect_inner(&self.collector_addr).await?);
                drop(guard);

                self.submit_once(batch).await
            }
        }
    }

    async fn submit_once(&self, batch: EvidenceBatch) -> Result<SubmitResponse> {
        let mut guard = self.client.lock().await;
        if guard.is_none() {
            *guard = Some(Self::connect_inner(&self.collector_addr).await?);
        }

        let client = guard
            .as_mut()
            .context("gRPC client missing after connect")?;
        let request_stream = futures_util::stream::iter(vec![batch]);

        let response = client
            .submit_evidence(request_stream)
            .await
            .context("collector SubmitEvidence RPC failed")?
            .into_inner();

        Ok(response)
    }

    async fn connect_inner(addr: &str) -> Result<EvidenceCollectorClient<Channel>> {
        let endpoint = Endpoint::from_shared(addr.to_string())
            .context("invalid evidence collector address")?
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(5));

        let channel = endpoint
            .connect()
            .await
            .with_context(|| format!("failed to connect to evidence collector at {addr}"))?;

        Ok(EvidenceCollectorClient::new(channel))
    }
}
