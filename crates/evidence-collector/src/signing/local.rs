use super::{SigningError, SigningProvider};
use async_trait::async_trait;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

#[derive(Debug)]
pub struct LocalSigningProvider {
    signing_key: SigningKey,
    public_key: [u8; 32],
    key_id: String,
    is_dev: bool,
}

impl LocalSigningProvider {
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        Self::from_signing_key(signing_key, true)
    }

    pub fn from_file(path: &Path) -> Result<Self, SigningError> {
        let raw = fs::read(path)
            .map_err(|e| SigningError::LocalKeyError(format!("failed reading key file: {e}")))?;

        let decoded = if raw.starts_with(b"-----BEGIN") {
            decode_pem(&raw)?
        } else {
            raw
        };

        let signing_key = if decoded.len() == 32 {
            let bytes: [u8; 32] = decoded
                .as_slice()
                .try_into()
                .map_err(|_| SigningError::LocalKeyError("invalid 32-byte key".to_string()))?;
            SigningKey::from_bytes(&bytes)
        } else if decoded.len() >= 64 {
            let bytes: [u8; 32] = decoded[..32].try_into().map_err(|_| {
                SigningError::LocalKeyError("invalid 64-byte key payload".to_string())
            })?;
            SigningKey::from_bytes(&bytes)
        } else {
            return Err(SigningError::LocalKeyError(
                "unsupported key format; expected 32-byte raw secret or PEM payload".to_string(),
            ));
        };

        Ok(Self::from_signing_key(signing_key, false))
    }

    fn from_signing_key(signing_key: SigningKey, is_dev: bool) -> Self {
        let public_key = signing_key.verifying_key().to_bytes();
        let mut hasher = Sha256::new();
        hasher.update(public_key);
        let digest: [u8; 32] = hasher.finalize().into();
        let key_id = hex::encode(&digest[..16]);

        Self {
            signing_key,
            public_key,
            key_id,
            is_dev,
        }
    }
}

fn decode_pem(raw: &[u8]) -> Result<Vec<u8>, SigningError> {
    let text = std::str::from_utf8(raw)
        .map_err(|e| SigningError::LocalKeyError(format!("invalid pem utf-8: {e}")))?;
    let payload: String = text
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(payload.as_bytes())
        .map_err(|e| SigningError::LocalKeyError(format!("invalid pem base64 payload: {e}")))?;

    // PKCS8 Ed25519 DER envelope is exactly 48 bytes.
    // Validate ASN.1 OID before extracting the 32-byte key.
    if decoded.len() == 48 {
        // OID 1.3.101.112 (id-EdDSA / Ed25519) at bytes 7..12
        const ED25519_OID: [u8; 5] = [0x06, 0x03, 0x2b, 0x65, 0x70];
        if decoded[7..12] == ED25519_OID {
            return Ok(decoded[16..48].to_vec());
        }
        return Err(SigningError::LocalKeyError(
            "unrecognized PKCS8 key type: OID does not match Ed25519 (1.3.101.112)".to_string(),
        ));
    }

    Ok(decoded)
}

#[async_trait]
impl SigningProvider for LocalSigningProvider {
    async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError> {
        Ok(self.signing_key.sign(message).to_bytes().to_vec())
    }

    fn public_key(&self) -> &[u8] {
        &self.public_key
    }

    fn key_id(&self) -> &str {
        &self.key_id
    }

    fn is_dev_key(&self) -> bool {
        self.is_dev
    }
}

#[cfg(test)]
mod tests {
    use super::LocalSigningProvider;
    use crate::signing::SigningProvider;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    use std::io::Write;

    /// Helper: sign a message with a provider and verify against its public key.
    async fn sign_and_verify(provider: &LocalSigningProvider, msg: &[u8]) {
        let sig = provider.sign(msg).await.expect("sign succeeds");
        let key_bytes: [u8; 32] = provider
            .public_key()
            .try_into()
            .expect("32-byte public key");
        let vk = VerifyingKey::from_bytes(&key_bytes).expect("valid pubkey");
        let sig_arr: [u8; 64] = sig.as_slice().try_into().expect("64-byte signature");
        let signature = Signature::from_bytes(&sig_arr);
        assert!(
            vk.verify(msg, &signature).is_ok(),
            "signature must verify against provider's public key"
        );
    }

    #[tokio::test]
    async fn generated_key_signs_and_verifies() {
        let provider = LocalSigningProvider::generate();
        sign_and_verify(&provider, b"integrity-event").await;
    }

    #[tokio::test]
    async fn distinct_messages_produce_distinct_signatures() {
        let provider = LocalSigningProvider::generate();
        let sig_a = provider.sign(b"a").await.expect("sign a");
        let sig_b = provider.sign(b"b").await.expect("sign b");
        assert_ne!(sig_a, sig_b);
    }

    #[tokio::test]
    async fn wrong_public_key_fails_verification() {
        let provider_a = LocalSigningProvider::generate();
        let provider_b = LocalSigningProvider::generate();
        let msg = b"event";
        let sig = provider_a.sign(msg).await.expect("signs");

        let key_bytes: [u8; 32] = provider_b
            .public_key()
            .try_into()
            .expect("32-byte public key");
        let vk_wrong = VerifyingKey::from_bytes(&key_bytes).expect("valid pubkey");
        let sig_arr: [u8; 64] = sig.as_slice().try_into().expect("64-byte signature");
        let signature = Signature::from_bytes(&sig_arr);
        assert!(vk_wrong.verify(msg, &signature).is_err());
    }

    // --- from_file() tests ---

    #[tokio::test]
    async fn from_file_raw_32_byte_key() {
        let mut tmp = tempfile::NamedTempFile::new().expect("create tempfile");
        // Use a deterministic 32-byte secret key
        let key_bytes: [u8; 32] = [42u8; 32];
        tmp.write_all(&key_bytes).expect("write key");
        tmp.flush().expect("flush");

        let provider =
            LocalSigningProvider::from_file(tmp.path()).expect("from_file succeeds for raw key");
        sign_and_verify(&provider, b"raw-key-evidence").await;
    }

    #[tokio::test]
    async fn from_file_pem_encoded_key() {
        use base64::Engine;
        let key_bytes: [u8; 32] = [7u8; 32];
        let b64 = base64::engine::general_purpose::STANDARD.encode(key_bytes);
        let pem = format!("-----BEGIN PRIVATE KEY-----\n{b64}\n-----END PRIVATE KEY-----\n");

        let mut tmp = tempfile::NamedTempFile::new().expect("create tempfile");
        tmp.write_all(pem.as_bytes()).expect("write pem");
        tmp.flush().expect("flush");

        let provider =
            LocalSigningProvider::from_file(tmp.path()).expect("from_file succeeds for PEM key");
        sign_and_verify(&provider, b"pem-key-evidence").await;
    }

    #[tokio::test]
    async fn from_file_invalid_format_returns_error() {
        let mut tmp = tempfile::NamedTempFile::new().expect("create tempfile");
        // Write 16 bytes — wrong length, not 32 and not ≥64
        tmp.write_all(&[0xABu8; 16]).expect("write");
        tmp.flush().expect("flush");

        let result = LocalSigningProvider::from_file(tmp.path());
        assert!(result.is_err(), "16-byte file must be rejected");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("unsupported key format"),
            "error should mention unsupported format, got: {err_msg}"
        );
    }

    #[tokio::test]
    async fn from_file_missing_file_returns_error() {
        let path = std::path::Path::new("/tmp/interdict-nonexistent-key-file-abc123.key");
        let result = LocalSigningProvider::from_file(path);
        assert!(result.is_err(), "nonexistent file must return error");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("failed reading key file"),
            "error should mention file reading failure, got: {err_msg}"
        );
    }

    // --- is_dev_key() tests ---

    #[test]
    fn is_dev_key_false_for_file_loaded() {
        let mut tmp = tempfile::NamedTempFile::new().expect("create tempfile");
        tmp.write_all(&[99u8; 32]).expect("write");
        tmp.flush().expect("flush");

        let provider = LocalSigningProvider::from_file(tmp.path()).expect("from_file");
        assert!(
            !provider.is_dev_key(),
            "file-loaded provider must NOT be a dev key"
        );
    }

    #[test]
    fn is_dev_key_true_for_generated() {
        let provider = LocalSigningProvider::generate();
        assert!(
            provider.is_dev_key(),
            "generated provider must be a dev key"
        );
    }

    // --- key_id determinism ---

    #[test]
    fn key_id_is_deterministic() {
        let key_bytes: [u8; 32] = [55u8; 32];

        let mut tmp1 = tempfile::NamedTempFile::new().expect("create tempfile");
        tmp1.write_all(&key_bytes).expect("write");
        tmp1.flush().expect("flush");

        let mut tmp2 = tempfile::NamedTempFile::new().expect("create tempfile");
        tmp2.write_all(&key_bytes).expect("write");
        tmp2.flush().expect("flush");

        let p1 = LocalSigningProvider::from_file(tmp1.path()).expect("from_file 1");
        let p2 = LocalSigningProvider::from_file(tmp2.path()).expect("from_file 2");

        assert_eq!(
            p1.key_id(),
            p2.key_id(),
            "same key bytes must produce same key_id"
        );
    }

    // --- PEM ASN.1 OID validation tests ---

    /// Build a valid PKCS8 Ed25519 DER envelope (48 bytes).
    /// Structure: SEQUENCE { SEQUENCE { OID 1.3.101.112 }, OCTET STRING { OCTET STRING { 32-byte key } } }
    fn build_pkcs8_ed25519_der(key: &[u8; 32]) -> Vec<u8> {
        let mut der = vec![
            0x30, 0x2e, // SEQUENCE, 46 bytes
            0x02, 0x01, 0x00, // INTEGER version 0
            0x30, 0x05, // SEQUENCE, 5 bytes (AlgorithmIdentifier)
            0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (Ed25519)
            0x04, 0x22, // OCTET STRING, 34 bytes
            0x04, 0x20, // OCTET STRING, 32 bytes (actual key)
        ];
        der.extend_from_slice(key);
        assert_eq!(der.len(), 48);
        der
    }

    #[test]
    fn test_decode_pem_valid_pkcs8() {
        use base64::Engine;
        let key_bytes: [u8; 32] = [0xAA; 32];
        let der = build_pkcs8_ed25519_der(&key_bytes);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&der);
        let pem = format!("-----BEGIN PRIVATE KEY-----\n{b64}\n-----END PRIVATE KEY-----\n");

        let decoded = super::decode_pem(pem.as_bytes()).expect("valid PKCS8 Ed25519 should decode");
        assert_eq!(
            decoded.len(),
            32,
            "should extract 32-byte key from PKCS8 envelope"
        );
        assert_eq!(
            decoded,
            key_bytes.to_vec(),
            "extracted key must match input"
        );
    }

    #[test]
    fn test_decode_pem_invalid_oid() {
        use base64::Engine;
        let key_bytes: [u8; 32] = [0xBB; 32];
        let mut der = build_pkcs8_ed25519_der(&key_bytes);
        // Corrupt the OID: change bytes 7..12 to a bogus OID
        der[7] = 0x06;
        der[8] = 0x03;
        der[9] = 0x2b;
        der[10] = 0x65;
        der[11] = 0x71; // 0x71 instead of 0x70 — wrong OID
        let b64 = base64::engine::general_purpose::STANDARD.encode(&der);
        let pem = format!("-----BEGIN PRIVATE KEY-----\n{b64}\n-----END PRIVATE KEY-----\n");

        let result = super::decode_pem(pem.as_bytes());
        assert!(result.is_err(), "wrong OID must be rejected");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("unrecognized PKCS8 key type"),
            "error should mention unrecognized key type, got: {err_msg}"
        );
    }

    #[test]
    fn test_decode_pem_raw_32_byte() {
        use base64::Engine;
        let key_bytes: [u8; 32] = [0xCC; 32];
        let b64 = base64::engine::general_purpose::STANDARD.encode(key_bytes);
        let pem = format!("-----BEGIN PRIVATE KEY-----\n{b64}\n-----END PRIVATE KEY-----\n");

        let decoded =
            super::decode_pem(pem.as_bytes()).expect("32-byte raw key should pass through");
        assert_eq!(
            decoded.len(),
            32,
            "raw 32-byte key should pass through unchanged"
        );
        assert_eq!(decoded, key_bytes.to_vec());
    }
}
