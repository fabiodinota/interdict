use std::time::Duration;

use anyhow::{Context, Result};
use tonic::transport::{Certificate, Channel, ClientTlsConfig, Endpoint, Identity};

use super::proto::{
    EvidenceBatch, SubmitResponse, evidence_collector_client::EvidenceCollectorClient,
};

pub struct EvidenceGrpcClient {
    collector_addr: String,
    client: tokio::sync::Mutex<Option<EvidenceCollectorClient<Channel>>>,
    /// Raw cert bytes stored for rebuilding ClientTlsConfig per connection
    /// (ClientTlsConfig is not Clone).
    tls_ca_cert: Option<Vec<u8>>,
    tls_client_cert: Option<Vec<u8>>,
    tls_client_key: Option<Vec<u8>>,
}

impl EvidenceGrpcClient {
    pub fn new(collector_addr: String) -> Self {
        Self {
            collector_addr,
            client: tokio::sync::Mutex::new(None),
            tls_ca_cert: None,
            tls_client_cert: None,
            tls_client_key: None,
        }
    }

    /// Create a new client with mTLS configuration.
    ///
    /// The CA cert, client cert, and client key are stored as raw bytes
    /// so that `ClientTlsConfig` can be rebuilt per connection attempt
    /// (it does not implement `Clone`).
    pub fn with_mtls(
        collector_addr: String,
        ca_cert: Vec<u8>,
        client_cert: Vec<u8>,
        client_key: Vec<u8>,
    ) -> Self {
        Self {
            collector_addr,
            client: tokio::sync::Mutex::new(None),
            tls_ca_cert: Some(ca_cert),
            tls_client_cert: Some(client_cert),
            tls_client_key: Some(client_key),
        }
    }

    pub async fn connect(&mut self) -> Result<()> {
        let addr = self.collector_addr.clone();
        let client = self.connect_inner(&addr).await?;
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

                let addr = self.collector_addr.clone();
                let mut guard = self.client.lock().await;
                *guard = Some(self.connect_inner(&addr).await?);
                drop(guard);

                self.submit_once(batch).await
            }
        }
    }

    async fn submit_once(&self, batch: EvidenceBatch) -> Result<SubmitResponse> {
        let mut guard = self.client.lock().await;
        if guard.is_none() {
            let addr = self.collector_addr.clone();
            *guard = Some(self.connect_inner(&addr).await?);
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

    /// Build a `ClientTlsConfig` from stored cert bytes, if mTLS is configured.
    fn build_tls_config(&self) -> Option<ClientTlsConfig> {
        let ca = self.tls_ca_cert.as_ref()?;
        let cert = self.tls_client_cert.as_ref()?;
        let key = self.tls_client_key.as_ref()?;

        Some(
            ClientTlsConfig::new()
                .ca_certificate(Certificate::from_pem(ca))
                .identity(Identity::from_pem(cert, key))
                .domain_name("evidence-collector"),
        )
    }

    async fn connect_inner(&self, addr: &str) -> Result<EvidenceCollectorClient<Channel>> {
        let mut endpoint = Endpoint::from_shared(addr.to_string())
            .context("invalid evidence collector address")?
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(5));

        if let Some(tls_config) = self.build_tls_config() {
            endpoint = endpoint
                .tls_config(tls_config)
                .context("invalid mTLS config for evidence collector")?;
        }

        let channel = endpoint
            .connect()
            .await
            .with_context(|| format!("failed to connect to evidence collector at {addr}"))?;

        Ok(EvidenceCollectorClient::new(channel))
    }
}
