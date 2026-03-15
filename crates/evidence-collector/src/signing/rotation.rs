//! Rotating signing provider with atomic key swap.
//!
//! Wraps any [`SigningProvider`] implementation and allows hot-swapping the
//! active key at runtime without restarting the evidence collector.
//!
//! Uses [`arc_swap::ArcSwap`] for lock-free reads on the hot path. The
//! `current()` method returns a loaded `Arc<dyn SigningProvider>` that can
//! be used directly with `sign_bundle()` and other trait consumers.

use std::path::Path;
use std::sync::Arc;

use arc_swap::ArcSwap;
use tracing::info;

use super::{LocalSigningProvider, SigningError, SigningProvider};

/// A wrapper around a signing provider that supports atomic key rotation.
///
/// The evidence collector's `main.rs` wraps the initial provider in this
/// struct. The gRPC service calls `current()` to obtain the active provider
/// for each signing operation, ensuring hot-reloaded keys take effect
/// immediately.
///
/// This type does NOT implement [`SigningProvider`] directly because the
/// trait's sync accessor methods (`public_key() -> &[u8]`, `key_id() -> &str`)
/// return references tied to `&self`, which cannot safely point through an
/// atomic swap. Instead, callers use `current()` to get an `Arc<dyn SigningProvider>`
/// and call trait methods on that.
pub struct RotatingSigningProvider {
    active: ArcSwap<Box<dyn SigningProvider>>,
}

impl RotatingSigningProvider {
    /// Create a new rotating provider wrapping the given initial provider.
    pub fn new(initial: Arc<dyn SigningProvider>) -> Self {
        // Convert Arc<dyn SigningProvider> to Arc<Box<dyn SigningProvider>>
        // by wrapping in a Box. This lets ArcSwap manage the swap.
        let boxed: Box<dyn SigningProvider> = BoxedProviderAdapter(initial).into();
        Self {
            active: ArcSwap::new(Arc::new(boxed)),
        }
    }

    /// Get the currently active signing provider.
    ///
    /// Returns a guard that derefs to the provider. The returned value is
    /// safe to use across `await` points -- the provider remains valid even
    /// if a rotation happens concurrently.
    pub fn current(&self) -> Arc<Box<dyn SigningProvider>> {
        self.active.load_full()
    }

    /// Atomically swap the active signing provider to a new one.
    ///
    /// Logs the old and new key IDs for audit trail purposes.
    pub fn rotate(&self, new_provider: Arc<dyn SigningProvider>) {
        let old = self.active.load();
        let old_key_id = old.key_id().to_string();
        let new_key_id = new_provider.key_id().to_string();

        let boxed: Box<dyn SigningProvider> = BoxedProviderAdapter(new_provider).into();
        self.active.store(Arc::new(boxed));

        info!(
            old_key_id = %old_key_id,
            new_key_id = %new_key_id,
            "signing key rotated"
        );
    }

    /// Hot-reload the signing key from a file path.
    ///
    /// Reads the key file, creates a new [`LocalSigningProvider`], and
    /// atomically swaps it in as the active provider.
    pub fn reload_from_file(&self, key_path: &Path) -> Result<(), SigningError> {
        let new_provider = LocalSigningProvider::from_file(key_path)?;
        self.rotate(Arc::new(new_provider));
        Ok(())
    }
}

/// Adapter that wraps `Arc<dyn SigningProvider>` into a `Box<dyn SigningProvider>`.
///
/// This is needed because `ArcSwap` manages `Arc<T>` and we need `T` to own
/// the provider. The adapter delegates all trait methods to the inner Arc.
struct BoxedProviderAdapter(Arc<dyn SigningProvider>);

impl From<BoxedProviderAdapter> for Box<dyn SigningProvider> {
    fn from(adapter: BoxedProviderAdapter) -> Self {
        Box::new(adapter)
    }
}

#[async_trait::async_trait]
impl SigningProvider for BoxedProviderAdapter {
    async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError> {
        self.0.sign(message).await
    }

    fn public_key(&self) -> &[u8] {
        self.0.public_key()
    }

    fn key_id(&self) -> &str {
        self.0.key_id()
    }

    fn is_dev_key(&self) -> bool {
        self.0.is_dev_key()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    #[tokio::test]
    async fn sign_delegates_to_active_provider() {
        let provider = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;
        let expected_pub = provider.public_key().to_vec();

        let rotating = RotatingSigningProvider::new(provider);
        let current = rotating.current();

        let msg = b"test-evidence-event";
        let sig = current.sign(msg).await.expect("sign");

        // Verify signature using the original public key
        let key_bytes: [u8; 32] = expected_pub.as_slice().try_into().expect("32 bytes");
        let vk = VerifyingKey::from_bytes(&key_bytes).expect("valid pubkey");
        let sig_arr: [u8; 64] = sig.as_slice().try_into().expect("64-byte sig");
        let signature = Signature::from_bytes(&sig_arr);
        assert!(vk.verify(msg, &signature).is_ok());
    }

    #[tokio::test]
    async fn rotate_changes_active_key() {
        let key_a = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;
        let key_b = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;

        let key_a_id = key_a.key_id().to_string();
        let key_b_id = key_b.key_id().to_string();
        let key_b_pub = key_b.public_key().to_vec();
        assert_ne!(key_a_id, key_b_id, "generated keys must differ");

        let rotating = RotatingSigningProvider::new(key_a);
        assert_eq!(rotating.current().key_id(), key_a_id);

        // Rotate to key B
        rotating.rotate(key_b);
        assert_eq!(rotating.current().key_id(), key_b_id);

        // Sign with new key and verify
        let msg = b"post-rotation-event";
        let sig = rotating.current().sign(msg).await.expect("sign with key B");

        let key_bytes: [u8; 32] = key_b_pub.as_slice().try_into().expect("32 bytes");
        let vk = VerifyingKey::from_bytes(&key_bytes).expect("valid pubkey");
        let sig_arr: [u8; 64] = sig.as_slice().try_into().expect("64-byte sig");
        let signature = Signature::from_bytes(&sig_arr);
        assert!(vk.verify(msg, &signature).is_ok());
    }

    #[tokio::test]
    async fn sign_rotate_sign_verify_cycle() {
        let key_a = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;
        let key_b = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;

        let pub_a = key_a.public_key().to_vec();
        let pub_b = key_b.public_key().to_vec();

        let rotating = RotatingSigningProvider::new(key_a);

        // Sign message 1 with key A
        let msg1 = b"evidence-bundle-1";
        let sig1 = rotating.current().sign(msg1).await.expect("sign msg1");

        // Rotate to key B
        rotating.rotate(key_b);

        // Sign message 2 with key B
        let msg2 = b"evidence-bundle-2";
        let sig2 = rotating.current().sign(msg2).await.expect("sign msg2");

        // Verify signature 1 with public key A
        let vk_a =
            VerifyingKey::from_bytes(&<[u8; 32]>::try_from(pub_a.as_slice()).unwrap()).unwrap();
        let s1 = Signature::from_bytes(&<[u8; 64]>::try_from(sig1.as_slice()).unwrap());
        assert!(vk_a.verify(msg1, &s1).is_ok(), "sig1 verifies with key A");

        // Verify signature 2 with public key B
        let vk_b =
            VerifyingKey::from_bytes(&<[u8; 32]>::try_from(pub_b.as_slice()).unwrap()).unwrap();
        let s2 = Signature::from_bytes(&<[u8; 64]>::try_from(sig2.as_slice()).unwrap());
        assert!(vk_b.verify(msg2, &s2).is_ok(), "sig2 verifies with key B");

        // Cross-verify fails: sig1 with key B should fail
        assert!(
            vk_b.verify(msg1, &s1).is_err(),
            "sig1 must NOT verify with key B"
        );
    }

    #[test]
    fn key_id_changes_after_rotation() {
        let key_a = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;
        let key_b = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;

        let id_a = key_a.key_id().to_string();
        let id_b = key_b.key_id().to_string();

        let rotating = RotatingSigningProvider::new(key_a);
        assert_eq!(rotating.current().key_id(), id_a);

        rotating.rotate(key_b);
        assert_eq!(rotating.current().key_id(), id_b);
    }

    #[tokio::test]
    async fn reload_from_file_swaps_key() {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};
        use std::io::Write;

        // Start with a generated key
        let initial = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;
        let initial_key_id = initial.key_id().to_string();
        let rotating = RotatingSigningProvider::new(initial);

        // Write a raw 32-byte key to a temp file
        let mut tmp = tempfile::NamedTempFile::new().expect("create tempfile");
        let key_bytes: [u8; 32] = [0xBBu8; 32];
        tmp.write_all(&key_bytes).expect("write key");
        tmp.flush().expect("flush");

        // Reload from file — this should swap the active key
        rotating
            .reload_from_file(tmp.path())
            .expect("reload_from_file succeeds");

        let new_key_id = rotating.current().key_id().to_string();
        assert_ne!(
            initial_key_id, new_key_id,
            "key_id must change after reload"
        );

        // Verify signing with the new key works
        let msg = b"post-reload-event";
        let sig = rotating.current().sign(msg).await.expect("sign");

        let pub_key = rotating.current().public_key().to_vec();
        let vk =
            VerifyingKey::from_bytes(&<[u8; 32]>::try_from(pub_key.as_slice()).expect("32 bytes"))
                .expect("valid pubkey");
        let sig_arr: [u8; 64] = sig.as_slice().try_into().expect("64-byte sig");
        let signature = Signature::from_bytes(&sig_arr);
        assert!(
            vk.verify(msg, &signature).is_ok(),
            "signature from reloaded key must verify"
        );
    }

    #[tokio::test]
    async fn reload_from_file_nonexistent_preserves_active() {
        // Start with a generated key
        let initial = Arc::new(LocalSigningProvider::generate()) as Arc<dyn SigningProvider>;
        let initial_key_id = initial.key_id().to_string();
        let rotating = RotatingSigningProvider::new(initial);

        // Try to reload from a nonexistent file — should return error
        let bad_path = std::path::Path::new("/tmp/interdict-nonexistent-rotation-key-xyz.key");
        let result = rotating.reload_from_file(bad_path);
        assert!(
            result.is_err(),
            "reload from nonexistent file must return error"
        );

        // Verify original key is still active
        assert_eq!(
            rotating.current().key_id(),
            initial_key_id,
            "original key must remain active after failed reload"
        );

        // Verify signing still works with original key
        let sig = rotating
            .current()
            .sign(b"still-works")
            .await
            .expect("sign with original key");
        assert!(!sig.is_empty(), "signature from original key must be valid");
    }
}
