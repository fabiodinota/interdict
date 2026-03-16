use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};

use super::builder::{MerkleAnchor, upload_anchor_to_s3};
use crate::storage::s3::S3Anchor;

/// Returns the merkle-anchors directory path under `data_dir`.
pub fn anchor_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("merkle-anchors")
}

/// Persist a `MerkleAnchor` as a JSON file in `{data_dir}/merkle-anchors/`.
///
/// File name is derived from the anchor's hour: `YYYY-MM-DDTHH.json`.
/// Returns the path of the written file.
pub async fn persist_anchor(data_dir: &Path, anchor: &MerkleAnchor) -> Result<PathBuf> {
    let dir = anchor_dir(data_dir);
    tokio::fs::create_dir_all(&dir)
        .await
        .context("failed to create merkle-anchors directory")?;

    let filename = format!("{}.json", anchor.hour.format("%Y-%m-%dT%H"));
    let path = dir.join(&filename);

    let json =
        serde_json::to_string_pretty(anchor).context("failed to serialize MerkleAnchor to JSON")?;

    tokio::fs::write(&path, json)
        .await
        .with_context(|| format!("failed to write merkle anchor file: {}", path.display()))?;

    Ok(path)
}

/// Load all pending anchor files from `{data_dir}/merkle-anchors/`.
///
/// Only `.json` files are considered. Invalid/corrupt files are logged and skipped.
pub async fn load_pending_anchors(data_dir: &Path) -> Vec<(PathBuf, MerkleAnchor)> {
    let dir = anchor_dir(data_dir);
    let mut results = Vec::new();

    let mut entries = match tokio::fs::read_dir(&dir).await {
        Ok(entries) => entries,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(
                    error = %error,
                    path = %dir.display(),
                    "failed to read merkle-anchors directory"
                );
            }
            return results;
        }
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();

        // Only process .json files.
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match tokio::fs::read_to_string(&path).await {
            Ok(c) => c,
            Err(error) => {
                tracing::warn!(
                    error = %error,
                    path = %path.display(),
                    "failed to read pending anchor file, skipping"
                );
                continue;
            }
        };

        match serde_json::from_str::<MerkleAnchor>(&content) {
            Ok(anchor) => results.push((path, anchor)),
            Err(error) => {
                tracing::warn!(
                    error = %error,
                    path = %path.display(),
                    "corrupt or invalid anchor file, skipping"
                );
            }
        }
    }

    results
}

/// Remove a persisted anchor file from disk.
pub async fn remove_anchor(path: &Path) -> Result<()> {
    tokio::fs::remove_file(path)
        .await
        .with_context(|| format!("failed to remove anchor file: {}", path.display()))
}

/// Recover pending anchor files at startup by re-attempting S3 upload.
///
/// Called from `main.rs` after S3 initialization, before the gRPC server starts.
/// Each pending anchor gets 3 S3 upload attempts with exponential backoff.
/// On success the local file is removed; on failure it remains for next startup.
pub async fn recover_pending_anchors(data_dir: &Path, s3_anchor: &Option<Arc<S3Anchor>>) {
    let pending = load_pending_anchors(data_dir).await;

    if pending.is_empty() {
        tracing::info!("no pending merkle anchors to recover");
        return;
    }

    tracing::info!(
        count = pending.len(),
        "found pending merkle anchors — starting recovery"
    );

    if s3_anchor.is_none() {
        tracing::info!(
            count = pending.len(),
            "S3 not configured; skipping anchor recovery (files retained)"
        );
        return;
    }

    let mut success = 0u32;
    let mut failed = 0u32;

    for (path, anchor) in &pending {
        tracing::info!(
            hour = %anchor.hour,
            path = %path.display(),
            "recovering pending merkle anchor"
        );
        upload_anchor_to_s3(s3_anchor, anchor, path).await;

        // Check if the file was removed (indicates S3 success).
        if !path.exists() {
            success += 1;
        } else {
            failed += 1;
        }
    }

    tracing::info!(
        total = pending.len(),
        success = success,
        failed = failed,
        "merkle anchor recovery complete"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn make_test_anchor(hour_h: u32) -> MerkleAnchor {
        MerkleAnchor {
            root: [0xAB; 32],
            bundle_count: 5,
            hour: Utc
                .with_ymd_and_hms(2026, 3, 15, hour_h, 0, 0)
                .single()
                .unwrap(),
            chain_hashes: vec![[0x01; 32], [0x02; 32], [0x03; 32]],
        }
    }

    #[tokio::test]
    async fn persist_and_load_roundtrip() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let data_dir = tmp.path();

        let anchor = make_test_anchor(14);
        let path = persist_anchor(data_dir, &anchor).await.expect("persist");

        assert!(path.exists(), "anchor file should exist after persist");

        let loaded = load_pending_anchors(data_dir).await;
        assert_eq!(loaded.len(), 1, "should load exactly one anchor");

        let (loaded_path, loaded_anchor) = &loaded[0];
        assert_eq!(loaded_path, &path);
        assert_eq!(loaded_anchor.root, anchor.root);
        assert_eq!(loaded_anchor.bundle_count, anchor.bundle_count);
        assert_eq!(loaded_anchor.hour, anchor.hour);
        assert_eq!(loaded_anchor.chain_hashes, anchor.chain_hashes);
    }

    #[tokio::test]
    async fn persist_and_remove() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let data_dir = tmp.path();

        let anchor = make_test_anchor(10);
        let path = persist_anchor(data_dir, &anchor).await.expect("persist");
        assert!(path.exists());

        remove_anchor(&path).await.expect("remove");
        assert!(!path.exists());

        let loaded = load_pending_anchors(data_dir).await;
        assert!(loaded.is_empty(), "should be empty after removal");
    }

    #[tokio::test]
    async fn corrupt_file_skipped() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let dir = anchor_dir(tmp.path());
        tokio::fs::create_dir_all(&dir).await.expect("create dir");

        // Write invalid JSON.
        let corrupt_path = dir.join("2026-03-15T10.json");
        tokio::fs::write(&corrupt_path, "{ not valid json !!!")
            .await
            .expect("write corrupt file");

        let loaded = load_pending_anchors(tmp.path()).await;
        assert!(
            loaded.is_empty(),
            "corrupt file should be skipped, not loaded"
        );
    }

    #[tokio::test]
    async fn empty_file_skipped() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let dir = anchor_dir(tmp.path());
        tokio::fs::create_dir_all(&dir).await.expect("create dir");

        // Write zero-length file.
        let empty_path = dir.join("2026-03-15T11.json");
        tokio::fs::write(&empty_path, "")
            .await
            .expect("write empty file");

        let loaded = load_pending_anchors(tmp.path()).await;
        assert!(
            loaded.is_empty(),
            "empty file should be skipped, not loaded"
        );
    }

    #[tokio::test]
    async fn non_json_file_skipped() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let dir = anchor_dir(tmp.path());
        tokio::fs::create_dir_all(&dir).await.expect("create dir");

        // Write a .txt file — should be ignored.
        let txt_path = dir.join("notes.txt");
        tokio::fs::write(&txt_path, "some notes")
            .await
            .expect("write txt file");

        // Also write a valid anchor to confirm filtering works.
        let anchor = make_test_anchor(12);
        persist_anchor(tmp.path(), &anchor)
            .await
            .expect("persist anchor");

        let loaded = load_pending_anchors(tmp.path()).await;
        assert_eq!(
            loaded.len(),
            1,
            "should load only the .json anchor, not the .txt"
        );
    }
}
