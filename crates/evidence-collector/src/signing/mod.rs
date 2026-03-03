pub mod kms;
pub mod local;
pub mod rotation;

use async_trait::async_trait;
use thiserror::Error;

pub use kms::KmsSigningProvider;
pub use local::LocalSigningProvider;
pub use rotation::RotatingSigningProvider;

#[derive(Debug, Error)]
pub enum SigningError {
    #[error("kms signing error: {0}")]
    KmsError(String),
    #[error("local signing key error: {0}")]
    LocalKeyError(String),
}

#[async_trait]
pub trait SigningProvider: Send + Sync {
    async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError>;
    fn public_key(&self) -> &[u8];
    fn key_id(&self) -> &str;
    fn is_dev_key(&self) -> bool;
}
