use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum SigningMode {
    Dev,
    File(PathBuf),
    Kms(String),
}

#[derive(Debug, Clone)]
pub struct CollectorConfig {
    pub grpc_listen_addr: String,
    pub clickhouse_url: String,
    pub clickhouse_database: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub signing_mode: SigningMode,
    pub merkle_window_secs: u64,
    pub merkle_max_leaves: u64,
    pub full_text_storage: bool,
    pub retention_days: u32,
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self {
            grpc_listen_addr: "[::1]:50051".to_string(),
            clickhouse_url: "http://localhost:8123".to_string(),
            clickhouse_database: "interdict".to_string(),
            s3_bucket: String::new(),
            s3_region: String::new(),
            signing_mode: SigningMode::Dev,
            merkle_window_secs: 3600,
            merkle_max_leaves: 1_000_000,
            full_text_storage: false,
            retention_days: 2555,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env_defaults() {
        // Clear any env vars that might interfere
        std::env::remove_var("COLLECTOR_GRPC_LISTEN_ADDR");
        std::env::remove_var("CLICKHOUSE_URL");
        std::env::remove_var("CLICKHOUSE_DATABASE");
        std::env::remove_var("COLLECTOR_S3_BUCKET");
        std::env::remove_var("COLLECTOR_S3_REGION");
        std::env::remove_var("COLLECTOR_SIGNING_MODE");
        std::env::remove_var("COLLECTOR_SIGNING_KEY_PATH");
        std::env::remove_var("COLLECTOR_MERKLE_WINDOW_SECS");
        std::env::remove_var("COLLECTOR_MERKLE_MAX_LEAVES");
        std::env::remove_var("COLLECTOR_FULL_TEXT_STORAGE");
        std::env::remove_var("COLLECTOR_RETENTION_DAYS");

        let cfg = CollectorConfig::from_env();
        assert_eq!(cfg.grpc_listen_addr, "[::1]:50051");
        assert_eq!(cfg.clickhouse_url, "http://localhost:8123");
        assert_eq!(cfg.clickhouse_database, "interdict");
        assert!(cfg.s3_bucket.is_empty());
        assert!(cfg.s3_region.is_empty());
        assert!(matches!(cfg.signing_mode, SigningMode::Dev));
        assert_eq!(cfg.merkle_window_secs, 3600);
        assert_eq!(cfg.merkle_max_leaves, 1_000_000);
        assert!(!cfg.full_text_storage);
        assert_eq!(cfg.retention_days, 2555);
    }

    #[test]
    fn test_from_env_overrides() {
        std::env::set_var("COLLECTOR_GRPC_LISTEN_ADDR", "[::]:50051");
        std::env::set_var("CLICKHOUSE_URL", "http://clickhouse:8123");
        std::env::set_var("CLICKHOUSE_DATABASE", "mydb");
        std::env::set_var("COLLECTOR_S3_BUCKET", "my-bucket");
        std::env::set_var("COLLECTOR_S3_REGION", "eu-west-1");
        std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", "true");
        std::env::set_var("COLLECTOR_RETENTION_DAYS", "365");
        std::env::set_var("COLLECTOR_MERKLE_WINDOW_SECS", "1800");
        std::env::set_var("COLLECTOR_MERKLE_MAX_LEAVES", "500000");

        let cfg = CollectorConfig::from_env();
        assert_eq!(cfg.grpc_listen_addr, "[::]:50051");
        assert_eq!(cfg.clickhouse_url, "http://clickhouse:8123");
        assert_eq!(cfg.clickhouse_database, "mydb");
        assert_eq!(cfg.s3_bucket, "my-bucket");
        assert_eq!(cfg.s3_region, "eu-west-1");
        assert!(cfg.full_text_storage);
        assert_eq!(cfg.retention_days, 365);
        assert_eq!(cfg.merkle_window_secs, 1800);
        assert_eq!(cfg.merkle_max_leaves, 500_000);

        // Clean up
        std::env::remove_var("COLLECTOR_GRPC_LISTEN_ADDR");
        std::env::remove_var("CLICKHOUSE_URL");
        std::env::remove_var("CLICKHOUSE_DATABASE");
        std::env::remove_var("COLLECTOR_S3_BUCKET");
        std::env::remove_var("COLLECTOR_S3_REGION");
        std::env::remove_var("COLLECTOR_FULL_TEXT_STORAGE");
        std::env::remove_var("COLLECTOR_RETENTION_DAYS");
        std::env::remove_var("COLLECTOR_MERKLE_WINDOW_SECS");
        std::env::remove_var("COLLECTOR_MERKLE_MAX_LEAVES");
    }

    #[test]
    fn test_from_env_signing_mode_file() {
        std::env::set_var("COLLECTOR_SIGNING_MODE", "file");
        std::env::set_var("COLLECTOR_SIGNING_KEY_PATH", "/custom/key.pem");

        let cfg = CollectorConfig::from_env();
        match &cfg.signing_mode {
            SigningMode::File(path) => assert_eq!(path.to_str().unwrap(), "/custom/key.pem"),
            other => panic!("expected SigningMode::File, got {:?}", other),
        }

        // Clean up
        std::env::remove_var("COLLECTOR_SIGNING_MODE");
        std::env::remove_var("COLLECTOR_SIGNING_KEY_PATH");
    }

    #[test]
    fn test_from_env_signing_mode_file_default_path() {
        std::env::set_var("COLLECTOR_SIGNING_MODE", "file");
        std::env::remove_var("COLLECTOR_SIGNING_KEY_PATH");

        let cfg = CollectorConfig::from_env();
        match &cfg.signing_mode {
            SigningMode::File(path) => {
                assert_eq!(path.to_str().unwrap(), "/data/keys/signing.key")
            }
            other => panic!("expected SigningMode::File, got {:?}", other),
        }

        // Clean up
        std::env::remove_var("COLLECTOR_SIGNING_MODE");
    }

    #[test]
    fn test_from_env_full_text_storage_variants() {
        for val in &["1", "true", "yes", "TRUE", "Yes", "YES"] {
            std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", val);
            let cfg = CollectorConfig::from_env();
            assert!(cfg.full_text_storage, "expected true for '{}'", val);
        }
        for val in &["0", "false", "no", "anything"] {
            std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", val);
            let cfg = CollectorConfig::from_env();
            assert!(!cfg.full_text_storage, "expected false for '{}'", val);
        }

        // Clean up
        std::env::remove_var("COLLECTOR_FULL_TEXT_STORAGE");
    }
}
