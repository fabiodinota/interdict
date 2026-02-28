use anyhow::{Context, Result};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::types::ObjectLockMode;
use chrono::{DateTime, Utc};

use crate::merkle::builder::MerkleAnchor;

/// S3 Object Lock WORM anchor for Merkle root hashes.
///
/// In production, the target bucket must have Object Lock enabled.
/// In dev mode (empty bucket name), S3 operations are skipped with a warning.
pub struct S3Anchor {
    client: S3Client,
    bucket: String,
    retention_days: u32,
}

impl S3Anchor {
    pub async fn new(bucket: &str, region: &str, retention_days: u32) -> Result<Self> {
        let config = if region.is_empty() {
            aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await
        } else {
            aws_config::defaults(aws_config::BehaviorVersion::latest())
                .region(aws_config::Region::new(region.to_owned()))
                .load()
                .await
        };

        let client = S3Client::new(&config);

        // In production mode, verify bucket has Object Lock enabled.
        if !bucket.is_empty() {
            match client
                .get_object_lock_configuration()
                .bucket(bucket)
                .send()
                .await
            {
                Ok(_) => {
                    tracing::info!(bucket = bucket, "S3 Object Lock verified on bucket");
                }
                Err(error) => {
                    tracing::warn!(
                        bucket = bucket,
                        error = %error,
                        "could not verify S3 Object Lock configuration; \
                         ensure bucket has Object Lock enabled for WORM compliance"
                    );
                }
            }
        } else {
            tracing::warn!("no S3 bucket configured; merkle root anchoring disabled (dev mode)");
        }

        Ok(Self {
            client,
            bucket: bucket.to_owned(),
            retention_days,
        })
    }

    /// Anchor a Merkle root hash to S3 with Object Lock Compliance mode.
    ///
    /// S3 key format: `merkle-anchors/YYYY/MM/DD/HH.json`
    /// Retention: configured TTL (default 7 years) from the anchor hour.
    pub async fn anchor_merkle_root(&self, anchor: &MerkleAnchor) -> Result<()> {
        if self.bucket.is_empty() {
            tracing::warn!(
                hour = %anchor.hour,
                merkle_root = %hex::encode(anchor.root),
                "skipping S3 anchor (no bucket configured -- dev mode)"
            );
            return Ok(());
        }

        let key = s3_key_for_hour(&anchor.hour);

        let body = serde_json::json!({
            "hour": anchor.hour.to_rfc3339(),
            "merkle_root": hex::encode(anchor.root),
            "bundle_count": anchor.bundle_count,
            "anchored_at": Utc::now().to_rfc3339(),
        });

        let retention_until = anchor.hour + chrono::Duration::days(i64::from(self.retention_days));

        let body_bytes = serde_json::to_vec(&body).context("serialize anchor JSON")?;

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(body_bytes.into())
            .content_type("application/json")
            .object_lock_mode(ObjectLockMode::Compliance)
            .object_lock_retain_until_date(aws_sdk_s3::primitives::DateTime::from_millis(
                retention_until.timestamp_millis(),
            ))
            .object_lock_legal_hold_status(aws_sdk_s3::types::ObjectLockLegalHoldStatus::Off)
            .send()
            .await
            .context("failed to PUT merkle anchor to S3")?;

        tracing::info!(
            bucket = %self.bucket,
            key = key,
            merkle_root = %hex::encode(anchor.root),
            bundle_count = anchor.bundle_count,
            retention_until = %retention_until,
            "anchored merkle root to S3 with WORM compliance"
        );

        Ok(())
    }

    /// Verify a previously anchored Merkle root by reading it from S3.
    pub async fn verify_anchor(&self, hour: &DateTime<Utc>) -> Result<Option<MerkleAnchor>> {
        if self.bucket.is_empty() {
            return Ok(None);
        }

        let key = s3_key_for_hour(hour);

        let response = match self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(_) => return Ok(None),
        };

        let bytes = response
            .body
            .collect()
            .await
            .context("read S3 anchor body")?
            .into_bytes();

        let value: serde_json::Value =
            serde_json::from_slice(&bytes).context("parse S3 anchor JSON")?;

        let root_hex = value["merkle_root"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("missing merkle_root in anchor"))?;
        let root_bytes = hex::decode(root_hex).context("decode merkle_root hex")?;
        let root: [u8; 32] = root_bytes
            .try_into()
            .map_err(|_| anyhow::anyhow!("merkle_root is not 32 bytes"))?;

        let bundle_count = value["bundle_count"].as_u64().unwrap_or(0) as usize;

        let anchor_hour = value["hour"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or(*hour);

        Ok(Some(MerkleAnchor {
            root,
            bundle_count,
            hour: anchor_hour,
        }))
    }
}

/// Generate the S3 key for a given hour: `merkle-anchors/YYYY/MM/DD/HH.json`
pub fn s3_key_for_hour(hour: &DateTime<Utc>) -> String {
    format!(
        "merkle-anchors/{}/{}.json",
        hour.format("%Y/%m/%d"),
        hour.format("%H"),
    )
}

#[cfg(test)]
mod tests {
    use super::s3_key_for_hour;
    use chrono::{TimeZone, Utc};

    #[test]
    fn s3_key_format_matches_spec() {
        let hour = Utc
            .with_ymd_and_hms(2026, 3, 15, 14, 0, 0)
            .single()
            .unwrap();
        assert_eq!(s3_key_for_hour(&hour), "merkle-anchors/2026/03/15/14.json");
    }

    #[test]
    fn s3_key_midnight_boundary() {
        let hour = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).single().unwrap();
        assert_eq!(s3_key_for_hour(&hour), "merkle-anchors/2026/01/01/00.json");
    }
}
