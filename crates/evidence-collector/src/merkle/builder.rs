use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::{DateTime, Timelike, Utc};
use rs_merkle::{MerkleTree, algorithms::Sha256 as MerkleSha256};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::storage::s3::S3Anchor;

/// Serde helper: serialize/deserialize `[u8; 32]` as a hex string.
mod hex_array {
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&hex::encode(bytes))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 32], D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        let bytes = hex::decode(&s).map_err(serde::de::Error::custom)?;
        bytes
            .try_into()
            .map_err(|_| serde::de::Error::custom("expected 32 bytes"))
    }
}

/// Serde helper: serialize/deserialize `Vec<[u8; 32]>` as a Vec of hex strings.
mod hex_array_vec {
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(hashes: &Vec<[u8; 32]>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeSeq;
        let mut seq = serializer.serialize_seq(Some(hashes.len()))?;
        for h in hashes {
            seq.serialize_element(&hex::encode(h))?;
        }
        seq.end()
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<[u8; 32]>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let strings: Vec<String> = Vec::deserialize(deserializer)?;
        strings
            .into_iter()
            .map(|s| {
                let bytes = hex::decode(&s).map_err(serde::de::Error::custom)?;
                bytes
                    .try_into()
                    .map_err(|_| serde::de::Error::custom("expected 32 bytes"))
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleAnchor {
    #[serde(with = "hex_array")]
    pub root: [u8; 32],
    pub bundle_count: usize,
    pub hour: DateTime<Utc>,
    #[serde(with = "hex_array_vec")]
    pub chain_hashes: Vec<[u8; 32]>,
}

#[derive(Debug)]
pub struct HourlyMerkleBuilder {
    leaf_hashes: Vec<[u8; 32]>,
    hour_start: DateTime<Utc>,
    max_leaves: usize,
}

impl HourlyMerkleBuilder {
    pub fn new(hour_start: DateTime<Utc>, max_leaves: usize) -> Self {
        Self {
            leaf_hashes: Vec::new(),
            hour_start,
            max_leaves,
        }
    }

    /// Add a bundle's chain hash as a Merkle leaf.
    /// Returns `true` if still within the max leaf limit, `false` if exceeded
    /// (signalling that a sub-hourly checkpoint should be triggered).
    pub fn add_bundle_hash(&mut self, hash: [u8; 32]) -> bool {
        self.leaf_hashes.push(hash);
        self.leaf_hashes.len() <= self.max_leaves
    }

    /// Build the Merkle tree from accumulated leaves and return the anchor.
    /// Returns `None` if no leaves were accumulated (empty window -- skip anchoring).
    pub fn finalize(&self) -> Option<MerkleAnchor> {
        if self.leaf_hashes.is_empty() {
            return None;
        }
        let tree = MerkleTree::<MerkleSha256>::from_leaves(&self.leaf_hashes);
        let root = tree.root()?;
        Some(MerkleAnchor {
            root,
            bundle_count: self.leaf_hashes.len(),
            hour: self.hour_start,
            chain_hashes: self.leaf_hashes.clone(),
        })
    }

    /// Clear accumulated leaves and advance to a new hour window.
    pub fn reset(&mut self, new_hour: DateTime<Utc>) {
        self.leaf_hashes.clear();
        self.hour_start = new_hour;
    }

    pub fn hour_start(&self) -> DateTime<Utc> {
        self.hour_start
    }

    pub fn leaf_count(&self) -> usize {
        self.leaf_hashes.len()
    }
}

/// Background task that rotates the Merkle tree on hourly boundaries.
///
/// When the hour ticks over:
/// 1. Finalize the current tree
/// 2. Persist the anchor locally
/// 3. Reset the builder for the new hour
/// 4. Anchor the root to S3 with retry (if available and non-empty)
/// 5. Remove local file on S3 success
///
/// Also listens for overflow signals (max leaves exceeded) to trigger sub-hourly
/// finalize+anchor cycles.
pub async fn merkle_rotation_task(
    builder: Arc<Mutex<HourlyMerkleBuilder>>,
    s3_anchor: Option<Arc<S3Anchor>>,
    data_dir: PathBuf,
    mut overflow_rx: tokio::sync::mpsc::Receiver<()>,
    cancel: tokio_util::sync::CancellationToken,
) {
    // Compute how long until the next hour boundary.
    let next_hour_delay = || -> std::time::Duration {
        let now = Utc::now();
        let secs_into_hour = now.minute() as u64 * 60 + now.second() as u64;
        let secs_remaining = 3600u64.saturating_sub(secs_into_hour);
        std::time::Duration::from_secs(if secs_remaining == 0 {
            3600
        } else {
            secs_remaining
        })
    };

    loop {
        let delay = next_hour_delay();
        tokio::select! {
            _ = tokio::time::sleep(delay) => {
                do_rotate(&builder, &s3_anchor, &data_dir).await;
            }
            _ = overflow_rx.recv() => {
                tracing::warn!("sub-hourly merkle rotation triggered by leaf overflow");
                do_rotate(&builder, &s3_anchor, &data_dir).await;
            }
            _ = cancel.cancelled() => {
                tracing::info!("merkle rotation task shutting down");
                // Final rotation on shutdown.
                do_rotate(&builder, &s3_anchor, &data_dir).await;
                break;
            }
        }
    }
}

/// Maximum S3 upload retry attempts for anchor persistence.
const MAX_S3_RETRY_ATTEMPTS: u32 = 3;
/// Base backoff delay for S3 retries.
const S3_RETRY_BASE_MS: u64 = 500;
/// Maximum backoff delay for S3 retries.
const S3_RETRY_CAP_MS: u64 = 2000;

async fn do_rotate(
    builder: &Arc<Mutex<HourlyMerkleBuilder>>,
    s3_anchor: &Option<Arc<S3Anchor>>,
    data_dir: &Path,
) {
    let mut guard = builder.lock().await;
    let anchor = guard.finalize();
    let new_hour = Utc::now()
        .with_minute(0)
        .and_then(|dt| dt.with_second(0))
        .and_then(|dt| dt.with_nanosecond(0))
        .unwrap_or_else(Utc::now);

    let Some(anchor) = anchor else {
        guard.reset(new_hour);
        tracing::debug!("empty merkle window -- skipping anchor");
        return;
    };

    // Persist anchor locally before resetting the builder — ensures we never
    // lose an anchor even if S3 upload fails.
    let local_path = match super::persistence::persist_anchor(data_dir, &anchor).await {
        Ok(path) => {
            tracing::info!(
                path = %path.display(),
                hour = %anchor.hour,
                "merkle anchor persisted locally"
            );
            path
        }
        Err(error) => {
            tracing::error!(
                error = %error,
                hour = %anchor.hour,
                "failed to persist merkle anchor locally — anchor may be lost"
            );
            // Still reset the builder to avoid infinite accumulation,
            // but we cannot safely proceed with S3 upload.
            guard.reset(new_hour);
            return;
        }
    };

    // Safe to reset now — the anchor is persisted on disk.
    guard.reset(new_hour);
    drop(guard);

    tracing::info!(
        hour = %anchor.hour,
        bundle_count = anchor.bundle_count,
        merkle_root = %hex::encode(anchor.root),
        "finalized hourly merkle tree"
    );

    upload_anchor_to_s3(s3_anchor, &anchor, &local_path).await;
}

/// Attempt S3 upload with exponential backoff; remove local file on success.
pub(crate) async fn upload_anchor_to_s3(
    s3_anchor: &Option<Arc<S3Anchor>>,
    anchor: &MerkleAnchor,
    local_path: &Path,
) {
    let Some(s3) = s3_anchor else {
        tracing::info!(
            hour = %anchor.hour,
            path = %local_path.display(),
            "S3 not configured (dev mode); local anchor file retained"
        );
        return;
    };

    for attempt in 1..=MAX_S3_RETRY_ATTEMPTS {
        match s3.anchor_merkle_root(anchor).await {
            Ok(()) => {
                // S3 confirmed — remove local file.
                if let Err(error) = super::persistence::remove_anchor(local_path).await {
                    tracing::warn!(
                        error = %error,
                        path = %local_path.display(),
                        "failed to remove local anchor file after S3 success"
                    );
                }
                return;
            }
            Err(error) => {
                if attempt < MAX_S3_RETRY_ATTEMPTS {
                    let backoff_ms =
                        std::cmp::min(S3_RETRY_BASE_MS * 2u64.pow(attempt - 1), S3_RETRY_CAP_MS);
                    tracing::warn!(
                        attempt = attempt,
                        max_attempts = MAX_S3_RETRY_ATTEMPTS,
                        backoff_ms = backoff_ms,
                        error = %error,
                        hour = %anchor.hour,
                        "S3 anchor upload failed, retrying"
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                } else {
                    tracing::error!(
                        error = %error,
                        hour = %anchor.hour,
                        path = %local_path.display(),
                        attempts = MAX_S3_RETRY_ATTEMPTS,
                        "S3 anchor upload exhausted retries — local file retained for recovery"
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn hour(h: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 2, 28, h, 0, 0).single().unwrap()
    }

    #[test]
    fn empty_tree_returns_none() {
        let builder = HourlyMerkleBuilder::new(hour(10), 1_000_000);
        assert!(builder.finalize().is_none());
    }

    #[test]
    fn single_leaf_produces_valid_root() {
        let mut builder = HourlyMerkleBuilder::new(hour(10), 1_000_000);
        let hash = [42u8; 32];
        assert!(builder.add_bundle_hash(hash));
        let anchor = builder
            .finalize()
            .expect("single leaf should produce anchor");
        assert_eq!(anchor.bundle_count, 1);
        assert_eq!(anchor.hour, hour(10));
        assert_eq!(anchor.chain_hashes, vec![hash]);
        // Single leaf: root == hash of the leaf itself
        assert_ne!(anchor.root, [0u8; 32]);
    }

    #[test]
    fn multiple_leaves_produce_consistent_root() {
        let mut builder1 = HourlyMerkleBuilder::new(hour(10), 1_000_000);
        let mut builder2 = HourlyMerkleBuilder::new(hour(10), 1_000_000);

        let hashes: Vec<[u8; 32]> = (0..5)
            .map(|i| {
                let mut h = [0u8; 32];
                h[0] = i;
                h
            })
            .collect();

        for h in &hashes {
            builder1.add_bundle_hash(*h);
            builder2.add_bundle_hash(*h);
        }

        let anchor1 = builder1.finalize().unwrap();
        let anchor2 = builder2.finalize().unwrap();
        assert_eq!(
            anchor1.root, anchor2.root,
            "deterministic root for same leaves"
        );
        assert_eq!(anchor1.bundle_count, 5);
    }

    #[test]
    fn finalize_and_reset_produces_different_trees() {
        let mut builder = HourlyMerkleBuilder::new(hour(10), 1_000_000);
        builder.add_bundle_hash([1u8; 32]);
        let anchor_h10 = builder.finalize().unwrap();

        builder.reset(hour(11));
        builder.add_bundle_hash([2u8; 32]);
        let anchor_h11 = builder.finalize().unwrap();

        assert_ne!(
            anchor_h10.root, anchor_h11.root,
            "different leaves => different roots"
        );
        assert_eq!(anchor_h10.hour, hour(10));
        assert_eq!(anchor_h11.hour, hour(11));
    }

    #[test]
    fn max_leaves_triggers_overflow_detection() {
        let mut builder = HourlyMerkleBuilder::new(hour(10), 3);
        assert!(builder.add_bundle_hash([1u8; 32])); // 1 <= 3
        assert!(builder.add_bundle_hash([2u8; 32])); // 2 <= 3
        assert!(builder.add_bundle_hash([3u8; 32])); // 3 <= 3
        assert!(!builder.add_bundle_hash([4u8; 32])); // 4 > 3 -- overflow!
    }

    #[test]
    fn reset_clears_leaves() {
        let mut builder = HourlyMerkleBuilder::new(hour(10), 1_000_000);
        builder.add_bundle_hash([1u8; 32]);
        assert_eq!(builder.leaf_count(), 1);

        builder.reset(hour(11));
        assert_eq!(builder.leaf_count(), 0);
        assert!(builder.finalize().is_none());
    }

    #[test]
    fn finalize_populates_chain_hashes() {
        let mut builder = HourlyMerkleBuilder::new(hour(10), 1_000_000);
        let h1 = [1u8; 32];
        let h2 = [2u8; 32];
        let h3 = [3u8; 32];
        builder.add_bundle_hash(h1);
        builder.add_bundle_hash(h2);
        builder.add_bundle_hash(h3);

        let anchor = builder.finalize().expect("should produce anchor");
        assert_eq!(anchor.chain_hashes.len(), 3);
        assert_eq!(anchor.chain_hashes[0], h1);
        assert_eq!(anchor.chain_hashes[1], h2);
        assert_eq!(anchor.chain_hashes[2], h3);
    }

    #[test]
    fn merkle_anchor_serde_roundtrip() {
        let anchor = MerkleAnchor {
            root: [0xAB; 32],
            bundle_count: 7,
            hour: hour(14),
            chain_hashes: vec![[0x01; 32], [0xFF; 32]],
        };
        let json = serde_json::to_string_pretty(&anchor).expect("serialize");
        let deserialized: MerkleAnchor = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.root, anchor.root);
        assert_eq!(deserialized.bundle_count, anchor.bundle_count);
        assert_eq!(deserialized.hour, anchor.hour);
        assert_eq!(deserialized.chain_hashes, anchor.chain_hashes);
    }
}
