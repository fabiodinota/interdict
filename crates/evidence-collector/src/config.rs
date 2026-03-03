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
    /// Enable mTLS for the gRPC server (requires CA cert, server cert, server key).
    pub mtls_enabled: bool,
    /// Path to the internal CA certificate (trust anchor for client verification).
    pub mtls_ca_cert_path: Option<String>,
    /// Path to the server certificate.
    pub mtls_cert_path: Option<String>,
    /// Path to the server private key.
    pub mtls_key_path: Option<String>,
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
            mtls_enabled: false,
            mtls_ca_cert_path: None,
            mtls_cert_path: None,
            mtls_key_path: None,
        }
    }
}

impl CollectorConfig {
    /// Construct config from environment variables with fallback defaults.
    ///
    /// Env vars:
    /// - `COLLECTOR_GRPC_LISTEN_ADDR` (default: `[::1]:50051`)
    /// - `CLICKHOUSE_URL` (default: `http://localhost:8123`)
    /// - `CLICKHOUSE_DATABASE` (default: `interdict`)
    /// - `COLLECTOR_S3_BUCKET` (default: `""`)
    /// - `COLLECTOR_S3_REGION` (default: `""`)
    /// - `COLLECTOR_SIGNING_MODE` (default: `dev`) -- `dev`, `file`, or `kms`
    /// - `COLLECTOR_SIGNING_KEY_PATH` (default: `/data/keys/signing.key`) -- used when signing_mode=file
    /// - `COLLECTOR_KMS_KEY_ID` -- required when signing_mode=kms
    /// - `COLLECTOR_MERKLE_WINDOW_SECS` (default: 3600)
    /// - `COLLECTOR_MERKLE_MAX_LEAVES` (default: 1000000)
    /// - `COLLECTOR_FULL_TEXT_STORAGE` (default: false) -- `1`/`true`/`yes`
    /// - `COLLECTOR_RETENTION_DAYS` (default: 2555)
    /// - `MTLS_ENABLED` (default: "false") -- `true`/`false`
    /// - `MTLS_CA_CERT_PATH` -- CA cert for client verification
    /// - `MTLS_CERT_PATH` -- Server certificate
    /// - `MTLS_KEY_PATH` -- Server private key
    pub fn from_env() -> Self {
        let signing_mode = match std::env::var("COLLECTOR_SIGNING_MODE")
            .unwrap_or_else(|_| "dev".to_string())
            .to_ascii_lowercase()
            .as_str()
        {
            "file" => SigningMode::File(
                std::env::var("COLLECTOR_SIGNING_KEY_PATH")
                    .unwrap_or_else(|_| "/data/keys/signing.key".to_string())
                    .into(),
            ),
            "kms" => SigningMode::Kms(
                std::env::var("COLLECTOR_KMS_KEY_ID")
                    .expect("COLLECTOR_KMS_KEY_ID required when COLLECTOR_SIGNING_MODE=kms"),
            ),
            _ => SigningMode::Dev,
        };

        Self {
            grpc_listen_addr: std::env::var("COLLECTOR_GRPC_LISTEN_ADDR")
                .unwrap_or_else(|_| "[::1]:50051".to_string()),
            clickhouse_url: std::env::var("CLICKHOUSE_URL")
                .unwrap_or_else(|_| "http://localhost:8123".to_string()),
            clickhouse_database: std::env::var("CLICKHOUSE_DATABASE")
                .unwrap_or_else(|_| "interdict".to_string()),
            s3_bucket: std::env::var("COLLECTOR_S3_BUCKET").unwrap_or_default(),
            s3_region: std::env::var("COLLECTOR_S3_REGION").unwrap_or_default(),
            signing_mode,
            merkle_window_secs: std::env::var("COLLECTOR_MERKLE_WINDOW_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3600),
            merkle_max_leaves: std::env::var("COLLECTOR_MERKLE_MAX_LEAVES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1_000_000),
            full_text_storage: std::env::var("COLLECTOR_FULL_TEXT_STORAGE")
                .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false),
            retention_days: std::env::var("COLLECTOR_RETENTION_DAYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2555),
            mtls_enabled: std::env::var("MTLS_ENABLED")
                .map(|v| v.to_ascii_lowercase() == "true")
                .unwrap_or(false),
            mtls_ca_cert_path: std::env::var("MTLS_CA_CERT_PATH").ok(),
            mtls_cert_path: std::env::var("MTLS_CERT_PATH").ok(),
            mtls_key_path: std::env::var("MTLS_KEY_PATH").ok(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// SAFETY: These tests mutate environment variables and must run with
    /// `--test-threads=1` to avoid data races between tests.

    unsafe fn clear_collector_env() {
        std::env::remove_var("COLLECTOR_GRPC_LISTEN_ADDR");
        std::env::remove_var("CLICKHOUSE_URL");
        std::env::remove_var("CLICKHOUSE_DATABASE");
        std::env::remove_var("COLLECTOR_S3_BUCKET");
        std::env::remove_var("COLLECTOR_S3_REGION");
        std::env::remove_var("COLLECTOR_SIGNING_MODE");
        std::env::remove_var("COLLECTOR_SIGNING_KEY_PATH");
        std::env::remove_var("COLLECTOR_KMS_KEY_ID");
        std::env::remove_var("COLLECTOR_MERKLE_WINDOW_SECS");
        std::env::remove_var("COLLECTOR_MERKLE_MAX_LEAVES");
        std::env::remove_var("COLLECTOR_FULL_TEXT_STORAGE");
        std::env::remove_var("COLLECTOR_RETENTION_DAYS");
    }

    #[test]
    fn test_from_env_defaults() {
        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe { clear_collector_env() };

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
        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_GRPC_LISTEN_ADDR", "[::]:50051");
            std::env::set_var("CLICKHOUSE_URL", "http://clickhouse:8123");
            std::env::set_var("CLICKHOUSE_DATABASE", "mydb");
            std::env::set_var("COLLECTOR_S3_BUCKET", "my-bucket");
            std::env::set_var("COLLECTOR_S3_REGION", "eu-west-1");
            std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", "true");
            std::env::set_var("COLLECTOR_RETENTION_DAYS", "365");
            std::env::set_var("COLLECTOR_MERKLE_WINDOW_SECS", "1800");
            std::env::set_var("COLLECTOR_MERKLE_MAX_LEAVES", "500000");
        }

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

        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe { clear_collector_env() };
    }

    #[test]
    fn test_from_env_signing_mode_file() {
        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_SIGNING_MODE", "file");
            std::env::set_var("COLLECTOR_SIGNING_KEY_PATH", "/custom/key.pem");
        }

        let cfg = CollectorConfig::from_env();
        match &cfg.signing_mode {
            SigningMode::File(path) => assert_eq!(path.to_str().unwrap(), "/custom/key.pem"),
            other => panic!("expected SigningMode::File, got {:?}", other),
        }

        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe { clear_collector_env() };
    }

    #[test]
    fn test_from_env_signing_mode_file_default_path() {
        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_SIGNING_MODE", "file");
        }

        let cfg = CollectorConfig::from_env();
        match &cfg.signing_mode {
            SigningMode::File(path) => {
                assert_eq!(path.to_str().unwrap(), "/data/keys/signing.key")
            }
            other => panic!("expected SigningMode::File, got {:?}", other),
        }

        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe { clear_collector_env() };
    }

    #[test]
    fn test_from_env_full_text_storage_variants() {
        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe { clear_collector_env() };

        for val in &["1", "true", "yes", "TRUE", "Yes", "YES"] {
            // SAFETY: test-threads=1 prevents concurrent env mutation.
            unsafe { std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", val) };
            let cfg = CollectorConfig::from_env();
            assert!(cfg.full_text_storage, "expected true for '{}'", val);
        }
        for val in &["0", "false", "no", "anything"] {
            // SAFETY: test-threads=1 prevents concurrent env mutation.
            unsafe { std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", val) };
            let cfg = CollectorConfig::from_env();
            assert!(!cfg.full_text_storage, "expected false for '{}'", val);
        }

        // SAFETY: test-threads=1 prevents concurrent env mutation.
        unsafe { clear_collector_env() };
    }
}
