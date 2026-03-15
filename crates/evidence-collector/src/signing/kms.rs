use super::{SigningError, SigningProvider};
use async_trait::async_trait;
use aws_sdk_kms::Client as KmsClient;
use aws_sdk_kms::types::SigningAlgorithmSpec;

pub struct KmsSigningProvider {
    kms_client: KmsClient,
    key_id: String,
    cached_public_key: Vec<u8>,
}

impl KmsSigningProvider {
    pub async fn new(key_id: String) -> Result<Self, SigningError> {
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        let kms_client = KmsClient::new(&config);
        let response = kms_client
            .get_public_key()
            .key_id(&key_id)
            .send()
            .await
            .map_err(|e| SigningError::KmsError(format!("get_public_key failed: {e}")))?;
        let cached_public_key = response
            .public_key()
            .ok_or_else(|| SigningError::KmsError("kms did not return a public key".to_string()))?
            .as_ref()
            .to_vec();

        Ok(Self {
            kms_client,
            key_id,
            cached_public_key,
        })
    }
}

#[async_trait]
impl SigningProvider for KmsSigningProvider {
    async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError> {
        let response = self
            .kms_client
            .sign()
            .key_id(&self.key_id)
            .signing_algorithm(SigningAlgorithmSpec::from("ED25519_SHA_512"))
            .message(aws_sdk_kms::primitives::Blob::new(message))
            .send()
            .await
            .map_err(|e| SigningError::KmsError(format!("kms sign failed: {e}")))?;

        let signature = response
            .signature()
            .ok_or_else(|| SigningError::KmsError("kms did not return signature".to_string()))?;
        Ok(signature.as_ref().to_vec())
    }

    fn public_key(&self) -> &[u8] {
        &self.cached_public_key
    }

    fn key_id(&self) -> &str {
        &self.key_id
    }

    fn is_dev_key(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use crate::signing::{SigningError, SigningProvider};
    use async_trait::async_trait;

    /// A configurable mock that exercises the `SigningProvider` trait boundary
    /// the same way a KMS provider would — without requiring real AWS SDK mocking.
    struct MockKmsSigningProvider {
        key_id: String,
        public_key: Vec<u8>,
        /// If `Some`, `sign()` returns this error instead of a signature.
        error: Option<SigningError>,
    }

    impl MockKmsSigningProvider {
        fn success() -> Self {
            Self {
                key_id: "arn:aws:kms:us-east-1:123456789:key/mock-id".to_string(),
                public_key: vec![0xAA; 32],
                error: None,
            }
        }

        fn with_error(error: SigningError) -> Self {
            Self {
                key_id: "arn:aws:kms:us-east-1:123456789:key/mock-id".to_string(),
                public_key: vec![0xAA; 32],
                error: Some(error),
            }
        }
    }

    #[async_trait]
    impl SigningProvider for MockKmsSigningProvider {
        async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError> {
            if let Some(ref err) = self.error {
                return Err(SigningError::KmsError(err.to_string()));
            }
            // Return a deterministic fake signature
            let mut sig = b"kms-mock-sig:".to_vec();
            sig.extend_from_slice(message);
            Ok(sig)
        }

        fn public_key(&self) -> &[u8] {
            &self.public_key
        }

        fn key_id(&self) -> &str {
            &self.key_id
        }

        fn is_dev_key(&self) -> bool {
            false
        }
    }

    #[tokio::test]
    async fn mock_kms_sign_success() {
        let provider = MockKmsSigningProvider::success();
        let msg = b"evidence-payload";
        let sig = provider.sign(msg).await.expect("sign succeeds");
        assert!(
            sig.starts_with(b"kms-mock-sig:"),
            "mock signature should have expected prefix"
        );
        assert!(sig.ends_with(msg), "mock signature should include message");
    }

    #[tokio::test]
    async fn mock_kms_throttle_error() {
        let provider = MockKmsSigningProvider::with_error(SigningError::KmsError(
            "ThrottlingException: Rate exceeded".to_string(),
        ));
        let result = provider.sign(b"payload").await;
        assert!(result.is_err(), "throttled KMS must return error");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("ThrottlingException"),
            "error should propagate throttle message, got: {err_msg}"
        );
    }

    #[test]
    fn mock_kms_is_not_dev_key() {
        let provider = MockKmsSigningProvider::success();
        assert!(!provider.is_dev_key(), "KMS provider must NOT be a dev key");
    }
}
