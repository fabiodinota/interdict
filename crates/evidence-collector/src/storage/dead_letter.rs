use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;

use super::clickhouse::EvidenceRow;

/// Returns the dead-letter directory path under `data_dir`.
pub fn dead_letter_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("dead-letter")
}

/// Writes a failed `EvidenceRow` to a dead-letter JSON file.
///
/// File path: `{data_dir}/dead-letter/{timestamp_millis}-{bundle_id}.json`
///
/// The row is serialized as JSON for human-readable inspection and potential
/// manual replay. This is the last-resort safety net after all retry attempts
/// are exhausted.
pub async fn write_dead_letter(data_dir: &Path, bundle_id: &str, row: &EvidenceRow) -> Result<()> {
    let dir = dead_letter_dir(data_dir);
    tokio::fs::create_dir_all(&dir)
        .await
        .context("failed to create dead-letter directory")?;

    let timestamp = Utc::now().timestamp_millis();
    let filename = format!("{timestamp}-{bundle_id}.json");
    let path = dir.join(&filename);

    let json =
        serde_json::to_string_pretty(row).context("failed to serialize EvidenceRow to JSON")?;

    tokio::fs::write(&path, json)
        .await
        .with_context(|| format!("failed to write dead-letter file: {}", path.display()))?;

    tracing::error!(
        path = %path.display(),
        bundle_id = %bundle_id,
        "evidence row written to dead-letter file after exhausting retries"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn make_test_row(bundle_id: &str) -> EvidenceRow {
        let ts = Utc
            .with_ymd_and_hms(2026, 3, 15, 10, 30, 0)
            .single()
            .expect("timestamp");
        EvidenceRow {
            event_date: EvidenceRow::from_timestamp(ts),
            timestamp: ts.timestamp_millis(),
            bundle_id: bundle_id.to_string(),
            kernel_id: "kernel-1".to_string(),
            actor_identity: "analyst@example.com".to_string(),
            department: "fraud".to_string(),
            vendor: "openai".to_string(),
            model: "gpt-4.1".to_string(),
            prompt_hash: "p".repeat(64),
            response_hash: "r".repeat(64),
            prompt_text: String::new(),
            response_text: String::new(),
            policy_action: "allow".to_string(),
            policy_rules_json: "[]".to_string(),
            token_count: 12,
            enforcement_latency_us: 100,
            chain_hash: "a".repeat(64),
            previous_hash: "0".repeat(64),
            sequence_number: 1,
            signature: "b".repeat(128),
            signing_key_id: "key-1".to_string(),
            dev_signed: 1,
            schema_version: 1,
            content_bytes: "deadbeef".to_string(),
        }
    }

    #[tokio::test]
    async fn dead_letter_roundtrip() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let data_dir = tmp.path();
        let bundle_id = "bundle-roundtrip-1";
        let row = make_test_row(bundle_id);

        write_dead_letter(data_dir, bundle_id, &row)
            .await
            .expect("write dead letter");

        // Find the written file
        let dl_dir = dead_letter_dir(data_dir);
        let mut entries: Vec<_> = std::fs::read_dir(&dl_dir)
            .expect("read dir")
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 1, "expected exactly one dead-letter file");

        let file_path = entries.remove(0).path();
        let content = std::fs::read_to_string(&file_path).expect("read file");
        let deserialized: EvidenceRow =
            serde_json::from_str(&content).expect("deserialize dead-letter");

        assert_eq!(row, deserialized, "roundtrip should preserve all fields");
    }

    #[tokio::test]
    async fn dead_letter_creates_file_with_bundle_id() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let data_dir = tmp.path();
        let bundle_id = "my-unique-bundle-42";
        let row = make_test_row(bundle_id);

        write_dead_letter(data_dir, bundle_id, &row)
            .await
            .expect("write dead letter");

        let dl_dir = dead_letter_dir(data_dir);
        let entries: Vec<_> = std::fs::read_dir(&dl_dir)
            .expect("read dir")
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 1);

        let filename = entries[0].file_name().to_string_lossy().to_string();
        assert!(
            filename.contains(bundle_id),
            "filename '{filename}' should contain bundle_id '{bundle_id}'"
        );
        assert!(
            filename.ends_with(".json"),
            "filename '{filename}' should end with .json"
        );
    }
}
