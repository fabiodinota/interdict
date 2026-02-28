use super::{SigningError, SigningProvider};
use async_trait::async_trait;
use aws_sdk_kms::types::SigningAlgorithmSpec;
use aws_sdk_kms::Client as KmsClient;

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
