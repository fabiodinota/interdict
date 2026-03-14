use std::time::Duration;

use anyhow::{Context, Result};
use tonic::transport::{Certificate, Channel, ClientTlsConfig, Endpoint, Identity};

use super::proto::{
    SubmitEvidenceRequest, SubmitEvidenceResponse,
    evidence_collector_service_client::EvidenceCollectorServiceClient,
};

pub struct EvidenceGrpcClient {
    collector_addr: String,
    client: tokio::sync::Mutex<Option<EvidenceCollectorServiceClient<Channel>>>,
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
    ) -> Result<SubmitEvidenceResponse> {
        let batch = SubmitEvidenceRequest {
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

    async fn submit_once(&self, batch: SubmitEvidenceRequest) -> Result<SubmitEvidenceResponse> {
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

    async fn connect_inner(&self, addr: &str) -> Result<EvidenceCollectorServiceClient<Channel>> {
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

        Ok(EvidenceCollectorServiceClient::new(channel))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evidence_client_construction() {
        let client = EvidenceGrpcClient::new("http://127.0.0.1:50051".to_string());
        assert_eq!(client.collector_addr, "http://127.0.0.1:50051");
        assert!(client.tls_ca_cert.is_none());
    }

    #[test]
    fn test_evidence_client_with_mtls() {
        let client = EvidenceGrpcClient::with_mtls(
            "https://collector.internal:50051".to_string(),
            b"ca-cert".to_vec(),
            b"client-cert".to_vec(),
            b"client-key".to_vec(),
        );
        assert!(client.tls_ca_cert.is_some());
        assert!(client.tls_client_cert.is_some());
        assert!(client.tls_client_key.is_some());
        assert!(client.build_tls_config().is_some());
    }

    #[test]
    fn test_evidence_client_no_mtls_no_tls_config() {
        let client = EvidenceGrpcClient::new("http://127.0.0.1:50051".to_string());
        assert!(client.build_tls_config().is_none());
    }

    #[tokio::test]
    async fn test_evidence_client_connect_failure() {
        let mut client = EvidenceGrpcClient::new("http://127.0.0.1:1".to_string());
        let result = client.connect().await;
        assert!(result.is_err(), "connecting to invalid address should fail");
    }

    #[tokio::test]
    async fn test_evidence_client_submit_batch_failure() {
        let client = EvidenceGrpcClient::new("http://127.0.0.1:1".to_string());
        let result = client.submit_batch("test-kernel", 0, vec![1, 2, 3]).await;
        assert!(result.is_err(), "submitting to invalid address should fail");
    }
}
