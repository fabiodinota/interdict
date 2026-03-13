use std::collections::HashMap;

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use crate::chain::bundle_content_bytes;
use crate::proto::EvidenceBundle;

/// Result of verifying a single bundle's Ed25519 signature.
#[derive(Debug, Clone)]
pub struct SignatureVerificationResult {
    pub bundle_id: String,
    pub valid: bool,
    pub key_id: String,
    pub dev_signed: bool,
    pub error_detail: Option<String>,
}

/// Aggregated signature verification results.
#[derive(Debug, Clone)]
pub struct SignatureVerificationSummary {
    pub valid: bool,
    pub total_checked: usize,
    pub valid_count: usize,
    pub invalid_count: usize,
    pub results: Vec<SignatureVerificationResult>,
}

/// Verify a single bundle's Ed25519 signature.
///
/// The `public_key` must be the raw 32-byte Ed25519 public key.
pub fn verify_signature(bundle: &EvidenceBundle, public_key: &[u8]) -> SignatureVerificationResult {
    let key_id = bundle.signing_key_id.clone();
    let dev_signed = bundle.dev_signed;
    let bundle_id = bundle.bundle_id.clone();

    let vk = match <[u8; 32]>::try_from(public_key) {
        Ok(bytes) => match VerifyingKey::from_bytes(&bytes) {
            Ok(vk) => vk,
            Err(e) => {
                return SignatureVerificationResult {
                    bundle_id,
                    valid: false,
                    key_id,
                    dev_signed,
                    error_detail: Some(format!("invalid public key: {e}")),
                };
            }
        },
        Err(_) => {
            return SignatureVerificationResult {
                bundle_id,
                valid: false,
                key_id,
                dev_signed,
                error_detail: Some(format!(
                    "public key must be 32 bytes, got {}",
                    public_key.len()
                )),
            };
        }
    };

    let sig_bytes: [u8; 64] = match bundle.signature.as_slice().try_into() {
        Ok(bytes) => bytes,
        Err(_) => {
            return SignatureVerificationResult {
                bundle_id,
                valid: false,
                key_id,
                dev_signed,
                error_detail: Some(format!(
                    "signature must be 64 bytes, got {}",
                    bundle.signature.len()
                )),
            };
        }
    };
    let sig = Signature::from_bytes(&sig_bytes);

    // The content that was signed is the protobuf-encoded bundle with chain/signature fields zeroed.
    let content_bytes = bundle_content_bytes(bundle);

    match vk.verify(&content_bytes, &sig) {
        Ok(()) => SignatureVerificationResult {
            bundle_id,
            valid: true,
            key_id,
            dev_signed,
            error_detail: None,
        },
        Err(e) => SignatureVerificationResult {
            bundle_id,
            valid: false,
            key_id,
            dev_signed,
            error_detail: Some(format!("signature verification failed: {e}")),
        },
    }
}

/// Verify signatures for multiple bundles using a map of key_id -> public_key.
///
/// Public keys are raw 32-byte Ed25519 public keys (not hex-encoded).
pub fn verify_bundle_signatures(
    bundles: &[EvidenceBundle],
    public_keys: &HashMap<String, Vec<u8>>,
) -> SignatureVerificationSummary {
    let mut results = Vec::with_capacity(bundles.len());
    let mut valid_count = 0;
    let mut invalid_count = 0;

    for bundle in bundles {
        let result = match public_keys.get(&bundle.signing_key_id) {
            Some(pk) => verify_signature(bundle, pk),
            None => SignatureVerificationResult {
                bundle_id: bundle.bundle_id.clone(),
                valid: false,
                key_id: bundle.signing_key_id.clone(),
                dev_signed: bundle.dev_signed,
                error_detail: Some(format!(
                    "no public key found for key_id '{}'",
                    bundle.signing_key_id
                )),
            },
        };

        if result.valid {
            valid_count += 1;
        } else {
            invalid_count += 1;
        }
        results.push(result);
    }

    SignatureVerificationSummary {
        valid: invalid_count == 0,
        total_checked: results.len(),
        valid_count,
        invalid_count,
        results,
    }
}

/// Parse a public key file (JSON map of key_id -> hex-encoded public key).
///
/// Returns a map of key_id -> raw 32-byte public key bytes.
pub fn parse_public_key_file(json_str: &str) -> anyhow::Result<HashMap<String, Vec<u8>>> {
    let map: HashMap<String, String> = serde_json::from_str(json_str)
        .map_err(|e| anyhow::anyhow!("invalid public key file JSON: {e}"))?;

    let mut result = HashMap::new();
    for (key_id, hex_pk) in map {
        let bytes = hex::decode(&hex_pk)
            .map_err(|e| anyhow::anyhow!("invalid hex for key_id '{key_id}': {e}"))?;
        result.insert(key_id, bytes);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::EvidenceBundle;
    use ed25519_dalek::{Signer, SigningKey};
    use prost::Message;
    use rand_core::OsRng;
    use sha2::{Digest, Sha256};

    fn make_signed_bundle(signing_key: &SigningKey, key_id: &str) -> EvidenceBundle {
        // Create bundle matching collector flow: chain/sig metadata fields are default/empty
        // when content bytes are computed for signing.
        let mut bundle = EvidenceBundle {
            bundle_id: "test-bundle".to_string(),
            kernel_id: "kernel-1".to_string(),
            actor_identity: "alice".to_string(),
            policy_action: "allow".to_string(),
            schema_version: 1,
            // signing_key_id, dev_signed, chain_hash, previous_hash, sequence_number, signature
            // are all default (empty/zero/false) at this point, matching collector flow.
            ..Default::default()
        };

        // Compute content bytes (with chain/sig fields at default -- matching collector flow).
        let content_bytes = bundle.encode_to_vec();

        // Compute chain hash.
        let mut hasher = Sha256::new();
        hasher.update([0u8; 32]);
        hasher.update(&content_bytes);
        let chain_hash: [u8; 32] = hasher.finalize().into();

        // Sign the content bytes.
        let sig = signing_key.sign(&content_bytes);

        // Now set the chain/sig metadata fields (post-signing, matching collector flow).
        bundle.chain_hash = chain_hash.to_vec();
        bundle.previous_hash = vec![0u8; 32];
        bundle.sequence_number = 1;
        bundle.signature = sig.to_bytes().to_vec();
        bundle.signing_key_id = key_id.to_string();
        bundle.dev_signed = true;

        bundle
    }

    #[test]
    fn valid_signature_passes() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let public_key = signing_key.verifying_key().to_bytes();
        let bundle = make_signed_bundle(&signing_key, "test-key");

        let result = verify_signature(&bundle, &public_key);
        assert!(result.valid, "signature should be valid: {result:?}");
        assert_eq!(result.key_id, "test-key");
        assert!(result.dev_signed);
    }

    #[test]
    fn tampered_bundle_fails_signature() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let public_key = signing_key.verifying_key().to_bytes();
        let mut bundle = make_signed_bundle(&signing_key, "test-key");

        // Tamper with the bundle content.
        bundle.actor_identity = "tampered".to_string();

        let result = verify_signature(&bundle, &public_key);
        assert!(!result.valid, "tampered bundle should fail signature check");
        assert!(result.error_detail.is_some());
    }

    #[test]
    fn missing_public_key_returns_error() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let bundle = make_signed_bundle(&signing_key, "missing-key");

        let public_keys: HashMap<String, Vec<u8>> = HashMap::new();
        let summary = verify_bundle_signatures(&[bundle], &public_keys);

        assert!(!summary.valid);
        assert_eq!(summary.invalid_count, 1);
        assert!(
            summary.results[0]
                .error_detail
                .as_ref()
                .unwrap()
                .contains("no public key found")
        );
    }

    #[test]
    fn dev_signed_flag_reported() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let public_key = signing_key.verifying_key().to_bytes();
        let bundle = make_signed_bundle(&signing_key, "dev-key");

        let result = verify_signature(&bundle, &public_key);
        assert!(result.dev_signed, "dev_signed should be true");
    }

    #[test]
    fn parse_public_key_file_works() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let pk_hex = hex::encode(signing_key.verifying_key().to_bytes());

        let json = format!("{{\"test-key\": \"{pk_hex}\"}}");
        let keys = parse_public_key_file(&json).expect("should parse");
        assert_eq!(keys.len(), 1);
        assert_eq!(keys["test-key"].len(), 32);
    }

    #[test]
    fn wrong_key_fails() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let wrong_key = SigningKey::generate(&mut OsRng);
        let wrong_public_key = wrong_key.verifying_key().to_bytes();
        let bundle = make_signed_bundle(&signing_key, "test-key");

        let result = verify_signature(&bundle, &wrong_public_key);
        assert!(!result.valid, "wrong key should fail");
    }
}
