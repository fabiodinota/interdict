use crate::signing::{SigningError, SigningProvider};

#[derive(Debug, Clone)]
pub struct SignedBundle {
    pub signature: Vec<u8>,
    pub signing_key_id: String,
    pub dev_signed: bool,
}

pub async fn sign_bundle(
    provider: &dyn SigningProvider,
    bundle_bytes: &[u8],
) -> Result<SignedBundle, SigningError> {
    let signature = provider.sign(bundle_bytes).await?;
    Ok(SignedBundle {
        signature,
        signing_key_id: provider.key_id().to_string(),
        dev_signed: provider.is_dev_key(),
    })
}

#[cfg(test)]
mod tests {
    use super::sign_bundle;
    use crate::signing::{SigningError, SigningProvider};
    use async_trait::async_trait;

    struct MockSigningProvider {
        key_id: String,
        dev: bool,
        public_key: Vec<u8>,
    }

    #[async_trait]
    impl SigningProvider for MockSigningProvider {
        async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError> {
            let mut sig = b"mock-signature:".to_vec();
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
            self.dev
        }
    }

    #[tokio::test]
    async fn sign_bundle_delegates_to_provider() {
        let provider = MockSigningProvider {
            key_id: "mock-key-id".to_string(),
            dev: true,
            public_key: vec![1, 2, 3],
        };
        let payload = b"bundle-bytes";
        let signed = sign_bundle(&provider, payload).await.expect("signs");

        assert_eq!(signed.signing_key_id, "mock-key-id");
        assert!(signed.dev_signed);
        assert!(signed.signature.starts_with(b"mock-signature:"));
        assert!(signed.signature.ends_with(payload));
    }

    // --- Error propagation and dev_signed=false tests ---

    /// A mock that always returns an error from `sign()`.
    struct FailingMockProvider;

    #[async_trait]
    impl SigningProvider for FailingMockProvider {
        async fn sign(&self, _message: &[u8]) -> Result<Vec<u8>, SigningError> {
            Err(SigningError::KmsError(
                "ThrottlingException: simulated KMS failure".to_string(),
            ))
        }

        fn public_key(&self) -> &[u8] {
            &[]
        }

        fn key_id(&self) -> &str {
            "failing-mock"
        }

        fn is_dev_key(&self) -> bool {
            false
        }
    }

    #[tokio::test]
    async fn sign_bundle_propagates_provider_error() {
        let provider = FailingMockProvider;
        let result = sign_bundle(&provider, b"evidence-payload").await;
        assert!(
            result.is_err(),
            "sign_bundle must propagate provider errors"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("ThrottlingException"),
            "error message should propagate through, got: {err_msg}"
        );
    }

    #[tokio::test]
    async fn sign_bundle_reports_non_dev_key() {
        let provider = MockSigningProvider {
            key_id: "prod-key-id".to_string(),
            dev: false,
            public_key: vec![9, 8, 7],
        };
        let signed = sign_bundle(&provider, b"production-bundle")
            .await
            .expect("signs");
        assert!(
            !signed.dev_signed,
            "dev_signed must be false when provider is not a dev key"
        );
        assert_eq!(signed.signing_key_id, "prod-key-id");
    }
}
