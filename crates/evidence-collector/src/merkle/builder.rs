use std::sync::Arc;

use chrono::{DateTime, Timelike, Utc};
use rs_merkle::{MerkleTree, algorithms::Sha256 as MerkleSha256};
use tokio::sync::Mutex;

use crate::storage::s3::S3Anchor;

#[derive(Debug, Clone)]
pub struct MerkleAnchor {
    pub root: [u8; 32],
    pub bundle_count: usize,
    pub hour: DateTime<Utc>,
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
/// 2. Anchor the root to S3 (if available and non-empty)
/// 3. Reset the builder for the new hour
///
/// Also listens for overflow signals (max leaves exceeded) to trigger sub-hourly
/// finalize+anchor cycles.
pub async fn merkle_rotation_task(
    builder: Arc<Mutex<HourlyMerkleBuilder>>,
    s3_anchor: Option<Arc<S3Anchor>>,
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
                do_rotate(&builder, &s3_anchor).await;
            }
            _ = overflow_rx.recv() => {
                tracing::warn!("sub-hourly merkle rotation triggered by leaf overflow");
                do_rotate(&builder, &s3_anchor).await;
            }
            _ = cancel.cancelled() => {
                tracing::info!("merkle rotation task shutting down");
                // Final rotation on shutdown.
                do_rotate(&builder, &s3_anchor).await;
                break;
            }
        }
    }
}

async fn do_rotate(builder: &Arc<Mutex<HourlyMerkleBuilder>>, s3_anchor: &Option<Arc<S3Anchor>>) {
    let mut guard = builder.lock().await;
    let anchor = guard.finalize();
    let new_hour = Utc::now()
        .with_minute(0)
        .and_then(|dt| dt.with_second(0))
        .and_then(|dt| dt.with_nanosecond(0))
        .unwrap_or_else(Utc::now);
    guard.reset(new_hour);
    drop(guard);

    if let Some(anchor) = anchor {
        tracing::info!(
            hour = %anchor.hour,
            bundle_count = anchor.bundle_count,
            merkle_root = %hex::encode(anchor.root),
            "finalized hourly merkle tree"
        );

        if let Some(s3) = s3_anchor
            && let Err(error) = s3.anchor_merkle_root(&anchor).await
        {
            tracing::error!(error = %error, "failed to anchor merkle root to S3");
        }
    } else {
        tracing::debug!("empty merkle window -- skipping anchor");
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
}
