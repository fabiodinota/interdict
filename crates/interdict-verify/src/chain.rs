use sha2::{Digest, Sha256};
use std::collections::HashMap;

use crate::proto::EvidenceBundle;

/// Result of verifying a single kernel's hash chain.
#[derive(Debug, Clone)]
pub struct KernelChainResult {
    pub kernel_id: String,
    pub valid: bool,
    pub bundles_checked: usize,
    pub first_invalid_sequence: Option<u64>,
    pub error_detail: Option<String>,
}

/// Aggregated result across all kernels.
#[derive(Debug, Clone)]
pub struct ChainVerificationResult {
    pub valid: bool,
    pub kernel_results: Vec<KernelChainResult>,
    pub total_bundles_checked: usize,
}

/// Verify the hash chain integrity of a collection of evidence bundles.
///
/// Bundles are grouped by `kernel_id` and verified independently per kernel.
/// Each kernel's chain must have contiguous sequence numbers starting at 1,
/// with each bundle's `chain_hash` equal to SHA-256(previous_hash || bundle_content_bytes).
pub fn verify_chain(bundles: &[EvidenceBundle]) -> ChainVerificationResult {
    if bundles.is_empty() {
        return ChainVerificationResult {
            valid: true,
            kernel_results: Vec::new(),
            total_bundles_checked: 0,
        };
    }

    // Group bundles by kernel_id.
    let mut by_kernel: HashMap<String, Vec<&EvidenceBundle>> = HashMap::new();
    for bundle in bundles {
        by_kernel
            .entry(bundle.kernel_id.clone())
            .or_default()
            .push(bundle);
    }

    let mut kernel_results = Vec::new();
    let mut all_valid = true;
    let mut total_checked = 0;

    for (kernel_id, mut kernel_bundles) in by_kernel {
        // Sort by sequence_number within each kernel.
        kernel_bundles.sort_by_key(|b| b.sequence_number);

        let result = verify_kernel_chain(&kernel_id, &kernel_bundles);
        total_checked += result.bundles_checked;
        if !result.valid {
            all_valid = false;
        }
        kernel_results.push(result);
    }

    // Sort results by kernel_id for deterministic output.
    kernel_results.sort_by(|a, b| a.kernel_id.cmp(&b.kernel_id));

    ChainVerificationResult {
        valid: all_valid,
        kernel_results,
        total_bundles_checked: total_checked,
    }
}

fn verify_kernel_chain(kernel_id: &str, sorted_bundles: &[&EvidenceBundle]) -> KernelChainResult {
    if sorted_bundles.is_empty() {
        return KernelChainResult {
            kernel_id: kernel_id.to_string(),
            valid: true,
            bundles_checked: 0,
            first_invalid_sequence: None,
            error_detail: None,
        };
    }

    // Check sequence numbers are contiguous starting at 1.
    for (i, bundle) in sorted_bundles.iter().enumerate() {
        let expected_seq = (i as u64) + 1;
        if bundle.sequence_number != expected_seq {
            return KernelChainResult {
                kernel_id: kernel_id.to_string(),
                valid: false,
                bundles_checked: i,
                first_invalid_sequence: Some(bundle.sequence_number),
                error_detail: Some(format!(
                    "sequence gap: expected {expected_seq}, found {}",
                    bundle.sequence_number
                )),
            };
        }
    }

    // Verify chain hash linkage.
    for (i, bundle) in sorted_bundles.iter().enumerate() {
        let expected_previous = if i == 0 {
            [0u8; 32]
        } else {
            let prev = sorted_bundles[i - 1];
            let prev_hash: [u8; 32] = match prev.chain_hash.as_slice().try_into() {
                Ok(h) => h,
                Err(_) => {
                    return KernelChainResult {
                        kernel_id: kernel_id.to_string(),
                        valid: false,
                        bundles_checked: i,
                        first_invalid_sequence: Some(bundle.sequence_number),
                        error_detail: Some(format!(
                            "previous bundle chain_hash is not 32 bytes (seq {})",
                            prev.sequence_number
                        )),
                    };
                }
            };
            prev_hash
        };

        // Verify the previous_hash field matches what we expect.
        let bundle_prev: [u8; 32] = match bundle.previous_hash.as_slice().try_into() {
            Ok(h) => h,
            Err(_) => {
                return KernelChainResult {
                    kernel_id: kernel_id.to_string(),
                    valid: false,
                    bundles_checked: i,
                    first_invalid_sequence: Some(bundle.sequence_number),
                    error_detail: Some(format!(
                        "bundle previous_hash is not 32 bytes (seq {})",
                        bundle.sequence_number
                    )),
                };
            }
        };

        if bundle_prev != expected_previous {
            return KernelChainResult {
                kernel_id: kernel_id.to_string(),
                valid: false,
                bundles_checked: i,
                first_invalid_sequence: Some(bundle.sequence_number),
                error_detail: Some(format!(
                    "previous_hash mismatch at seq {}: expected {}, found {}",
                    bundle.sequence_number,
                    hex::encode(expected_previous),
                    hex::encode(bundle_prev)
                )),
            };
        }

        // Recompute: chain_hash = SHA-256(previous_hash || content_bytes)
        let content_bytes = bundle_content_bytes(bundle);
        if !verify_single_bundle_hash(bundle, &expected_previous, &content_bytes) {
            return KernelChainResult {
                kernel_id: kernel_id.to_string(),
                valid: false,
                bundles_checked: i,
                first_invalid_sequence: Some(bundle.sequence_number),
                error_detail: Some(format!(
                    "chain_hash mismatch at seq {}: recomputed hash does not match stored chain_hash",
                    bundle.sequence_number
                )),
            };
        }
    }

    KernelChainResult {
        kernel_id: kernel_id.to_string(),
        valid: true,
        bundles_checked: sorted_bundles.len(),
        first_invalid_sequence: None,
        error_detail: None,
    }
}

/// Verify a single bundle's chain hash.
///
/// Recomputes SHA-256(expected_previous || content_bytes) and compares to bundle.chain_hash.
pub fn verify_single_bundle(bundle: &EvidenceBundle, expected_previous: &[u8; 32]) -> bool {
    let content_bytes = bundle_content_bytes(bundle);
    verify_single_bundle_hash(bundle, expected_previous, &content_bytes)
}

fn verify_single_bundle_hash(
    bundle: &EvidenceBundle,
    expected_previous: &[u8; 32],
    content_bytes: &[u8],
) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(expected_previous);
    hasher.update(content_bytes);
    let computed: [u8; 32] = hasher.finalize().into();

    let stored: [u8; 32] = match bundle.chain_hash.as_slice().try_into() {
        Ok(h) => h,
        Err(_) => return false,
    };

    computed == stored
}

/// Extract the content bytes used for chain hashing from a bundle.
///
/// The content bytes are the protobuf-encoded bundle with chain/signature fields zeroed,
/// matching how the collector computes the chain hash before setting those fields.
pub fn bundle_content_bytes(bundle: &EvidenceBundle) -> Vec<u8> {
    use prost::Message;
    let mut clean = bundle.clone();
    clean.chain_hash = Vec::new();
    clean.previous_hash = Vec::new();
    clean.sequence_number = 0;
    clean.signature = Vec::new();
    clean.signing_key_id = String::new();
    clean.dev_signed = false;
    clean.encode_to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::EvidenceBundle;
    use prost::Message;
    use sha2::{Digest, Sha256};

    fn make_chain(count: usize, kernel_id: &str) -> Vec<EvidenceBundle> {
        let mut bundles = Vec::new();
        let mut previous_hash = [0u8; 32];

        for i in 0..count {
            let mut bundle = EvidenceBundle {
                bundle_id: format!("bundle-{i}"),
                kernel_id: kernel_id.to_string(),
                sequence_number: 0,
                chain_hash: Vec::new(),
                previous_hash: Vec::new(),
                signature: Vec::new(),
                signing_key_id: String::new(),
                dev_signed: false,
                actor_identity: format!("user-{i}"),
                policy_action: "allow".to_string(),
                schema_version: 1,
                ..Default::default()
            };

            // Compute content bytes (with chain fields zeroed).
            let content_bytes = bundle.encode_to_vec();

            // Compute chain hash.
            let mut hasher = Sha256::new();
            hasher.update(previous_hash);
            hasher.update(&content_bytes);
            let chain_hash: [u8; 32] = hasher.finalize().into();

            bundle.chain_hash = chain_hash.to_vec();
            bundle.previous_hash = previous_hash.to_vec();
            bundle.sequence_number = (i as u64) + 1;

            previous_hash = chain_hash;
            bundles.push(bundle);
        }

        bundles
    }

    #[test]
    fn valid_chain_of_five_passes() {
        let bundles = make_chain(5, "kernel-1");
        let result = verify_chain(&bundles);
        assert!(result.valid, "chain should be valid: {result:?}");
        assert_eq!(result.total_bundles_checked, 5);
        assert_eq!(result.kernel_results.len(), 1);
        assert!(result.kernel_results[0].valid);
    }

    #[test]
    fn tampered_bundle_detected() {
        let mut bundles = make_chain(5, "kernel-1");
        // Tamper with bundle at index 2 (seq 3).
        bundles[2].actor_identity = "tampered-user".to_string();

        let result = verify_chain(&bundles);
        assert!(!result.valid, "chain should be invalid after tamper");
        let kr = &result.kernel_results[0];
        assert!(!kr.valid);
        assert_eq!(kr.first_invalid_sequence, Some(3));
        assert!(
            kr.error_detail
                .as_ref()
                .unwrap()
                .contains("chain_hash mismatch")
        );
    }

    #[test]
    fn sequence_gap_detected() {
        let mut bundles = make_chain(5, "kernel-1");
        // Create a gap: skip sequence 3.
        bundles[2].sequence_number = 4;
        bundles[3].sequence_number = 5;
        bundles[4].sequence_number = 6;

        let result = verify_chain(&bundles);
        assert!(!result.valid);
        let kr = &result.kernel_results[0];
        assert!(!kr.valid);
        assert!(kr.error_detail.as_ref().unwrap().contains("sequence gap"));
    }

    #[test]
    fn multiple_kernels_verified_independently() {
        let mut bundles_a = make_chain(3, "kernel-a");
        let bundles_b = make_chain(4, "kernel-b");

        // Interleave bundles.
        let mut all_bundles = Vec::new();
        all_bundles.append(&mut bundles_a);
        all_bundles.extend(bundles_b);

        let result = verify_chain(&all_bundles);
        assert!(result.valid);
        assert_eq!(result.kernel_results.len(), 2);
        assert_eq!(result.total_bundles_checked, 7);
    }

    #[test]
    fn empty_bundles_are_valid() {
        let result = verify_chain(&[]);
        assert!(result.valid);
        assert_eq!(result.total_bundles_checked, 0);
    }

    #[test]
    fn single_bundle_verification_works() {
        let bundles = make_chain(1, "kernel-1");
        let result = verify_single_bundle(&bundles[0], &[0u8; 32]);
        assert!(result);
    }

    #[test]
    fn single_bundle_verification_fails_with_wrong_previous() {
        let bundles = make_chain(1, "kernel-1");
        let result = verify_single_bundle(&bundles[0], &[1u8; 32]);
        assert!(!result);
    }
}
