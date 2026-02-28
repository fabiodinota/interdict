use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rs_merkle::{MerkleTree, algorithms::Sha256 as MerkleSha256};

use crate::proto::EvidenceBundle;

/// Parsed S3 Merkle anchor from a local JSON file.
#[derive(Debug, Clone)]
pub struct MerkleAnchor {
    pub hour: DateTime<Utc>,
    pub merkle_root: [u8; 32],
    pub bundle_count: usize,
    pub anchored_at: String,
}

/// Result of Merkle root verification.
#[derive(Debug, Clone)]
pub struct MerkleVerificationResult {
    pub valid: bool,
    pub computed_root: String,
    pub expected_root: String,
    pub leaf_count: usize,
    pub error_detail: Option<String>,
}

/// Verify the Merkle root of a set of bundles against an expected root.
///
/// The leaf hashes are the `chain_hash` from each bundle.
pub fn verify_merkle_root(
    bundles: &[EvidenceBundle],
    expected_root: &[u8; 32],
) -> MerkleVerificationResult {
    if bundles.is_empty() {
        return MerkleVerificationResult {
            valid: false,
            computed_root: String::new(),
            expected_root: hex::encode(expected_root),
            leaf_count: 0,
            error_detail: Some("no bundles provided for Merkle verification".to_string()),
        };
    }

    let leaf_hashes: Vec<[u8; 32]> = bundles
        .iter()
        .filter_map(|b| {
            let hash: [u8; 32] = b.chain_hash.as_slice().try_into().ok()?;
            Some(hash)
        })
        .collect();

    if leaf_hashes.len() != bundles.len() {
        return MerkleVerificationResult {
            valid: false,
            computed_root: String::new(),
            expected_root: hex::encode(expected_root),
            leaf_count: leaf_hashes.len(),
            error_detail: Some(format!(
                "some bundles have invalid chain_hash length ({} valid of {} total)",
                leaf_hashes.len(),
                bundles.len()
            )),
        };
    }

    let tree = MerkleTree::<MerkleSha256>::from_leaves(&leaf_hashes);
    match tree.root() {
        Some(computed) => {
            let valid = computed == *expected_root;
            MerkleVerificationResult {
                valid,
                computed_root: hex::encode(computed),
                expected_root: hex::encode(expected_root),
                leaf_count: leaf_hashes.len(),
                error_detail: if valid {
                    None
                } else {
                    Some("Merkle root mismatch".to_string())
                },
            }
        }
        None => MerkleVerificationResult {
            valid: false,
            computed_root: String::new(),
            expected_root: hex::encode(expected_root),
            leaf_count: leaf_hashes.len(),
            error_detail: Some("failed to compute Merkle root".to_string()),
        },
    }
}

/// Compute the Merkle root from a set of bundles without comparing to an expected value.
///
/// Returns the computed root hash, or None if there are no bundles.
pub fn compute_merkle_root(bundles: &[EvidenceBundle]) -> Option<[u8; 32]> {
    let leaf_hashes: Vec<[u8; 32]> = bundles
        .iter()
        .filter_map(|b| b.chain_hash.as_slice().try_into().ok())
        .collect();

    if leaf_hashes.is_empty() {
        return None;
    }

    let tree = MerkleTree::<MerkleSha256>::from_leaves(&leaf_hashes);
    tree.root()
}

/// Read and parse an S3 anchor JSON file from local disk.
///
/// The expected format:
/// ```json
/// {
///   "hour": "2026-02-28T14:00:00Z",
///   "merkle_root": "hex-encoded-32-bytes",
///   "bundle_count": 1234,
///   "anchored_at": "2026-02-28T15:00:01Z"
/// }
/// ```
pub fn verify_against_s3_anchor(anchor_file: &Path) -> Result<MerkleAnchor> {
    let content = std::fs::read_to_string(anchor_file)
        .with_context(|| format!("failed to read anchor file: {}", anchor_file.display()))?;

    parse_anchor_json(&content)
}

/// Parse anchor JSON content into a MerkleAnchor.
pub fn parse_anchor_json(json_str: &str) -> Result<MerkleAnchor> {
    let value: serde_json::Value = serde_json::from_str(json_str).context("invalid anchor JSON")?;

    let hour_str = value["hour"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing 'hour' field in anchor"))?;
    let hour = DateTime::parse_from_rfc3339(hour_str)
        .map(|dt| dt.with_timezone(&Utc))
        .with_context(|| format!("invalid hour timestamp: {hour_str}"))?;

    let root_hex = value["merkle_root"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing 'merkle_root' field in anchor"))?;
    let root_bytes = hex::decode(root_hex).context("invalid merkle_root hex")?;
    let merkle_root: [u8; 32] = root_bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("merkle_root must be 32 bytes"))?;

    let bundle_count = value["bundle_count"].as_u64().unwrap_or(0) as usize;

    let anchored_at = value["anchored_at"].as_str().unwrap_or("").to_string();

    Ok(MerkleAnchor {
        hour,
        merkle_root,
        bundle_count,
        anchored_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::EvidenceBundle;
    use rs_merkle::{MerkleTree, algorithms::Sha256 as MerkleSha256};

    fn make_bundles_with_hashes(hashes: &[[u8; 32]]) -> Vec<EvidenceBundle> {
        hashes
            .iter()
            .enumerate()
            .map(|(i, hash)| EvidenceBundle {
                bundle_id: format!("bundle-{i}"),
                kernel_id: "kernel-1".to_string(),
                chain_hash: hash.to_vec(),
                ..Default::default()
            })
            .collect()
    }

    #[test]
    fn correct_bundles_produce_matching_merkle_root() {
        let hashes: Vec<[u8; 32]> = (0..5)
            .map(|i| {
                let mut h = [0u8; 32];
                h[0] = i;
                h
            })
            .collect();

        let bundles = make_bundles_with_hashes(&hashes);
        let tree = MerkleTree::<MerkleSha256>::from_leaves(&hashes);
        let expected_root = tree.root().unwrap();

        let result = verify_merkle_root(&bundles, &expected_root);
        assert!(result.valid, "Merkle root should match: {result:?}");
        assert_eq!(result.leaf_count, 5);
    }

    #[test]
    fn modified_bundle_changes_root() {
        let mut hashes: Vec<[u8; 32]> = (0..5)
            .map(|i| {
                let mut h = [0u8; 32];
                h[0] = i;
                h
            })
            .collect();

        let tree = MerkleTree::<MerkleSha256>::from_leaves(&hashes);
        let original_root = tree.root().unwrap();

        // Modify one hash.
        hashes[2] = [42u8; 32];
        let bundles = make_bundles_with_hashes(&hashes);

        let result = verify_merkle_root(&bundles, &original_root);
        assert!(!result.valid, "Modified bundle should change Merkle root");
    }

    #[test]
    fn empty_bundle_list_returns_error() {
        let result = verify_merkle_root(&[], &[0u8; 32]);
        assert!(!result.valid);
        assert!(result.error_detail.as_ref().unwrap().contains("no bundles"));
    }

    #[test]
    fn s3_anchor_json_parsing() {
        let json = serde_json::json!({
            "hour": "2026-02-28T14:00:00Z",
            "merkle_root": "aa".repeat(32),
            "bundle_count": 100,
            "anchored_at": "2026-02-28T15:00:01Z"
        });

        let anchor = parse_anchor_json(&json.to_string()).expect("should parse");
        assert_eq!(anchor.bundle_count, 100);
        assert_eq!(anchor.merkle_root, [0xaa; 32]);
        assert_eq!(anchor.hour.to_rfc3339(), "2026-02-28T14:00:00+00:00");
    }

    #[test]
    fn compute_merkle_root_works() {
        let hashes: Vec<[u8; 32]> = (0..3)
            .map(|i| {
                let mut h = [0u8; 32];
                h[0] = i;
                h
            })
            .collect();
        let bundles = make_bundles_with_hashes(&hashes);

        let root = compute_merkle_root(&bundles);
        assert!(root.is_some());

        let tree = MerkleTree::<MerkleSha256>::from_leaves(&hashes);
        assert_eq!(root.unwrap(), tree.root().unwrap());
    }

    #[test]
    fn compute_merkle_root_empty_returns_none() {
        assert!(compute_merkle_root(&[]).is_none());
    }
}
