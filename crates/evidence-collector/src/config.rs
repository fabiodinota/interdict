use anyhow::{Context, Result};
use std::path::PathBuf;

/// Default base directory for evidence collector persistent data.
const DEFAULT_DATA_DIR: &str = "/data/evidence-collector";

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
    pub clickhouse_user: String,
    pub clickhouse_password: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub signing_mode: SigningMode,
    pub merkle_window_secs: u64,
    pub merkle_max_leaves: u64,
    pub full_text_storage: bool,
    pub retention_days: u32,
    /// Require S3 Object Lock verification when anchoring is enabled.
    pub require_object_lock: bool,
    /// Enable mTLS for the gRPC server (requires CA cert, server cert, server key).
    pub mtls_enabled: bool,
    /// Path to the internal CA certificate (trust anchor for client verification).
    pub mtls_ca_cert_path: Option<String>,
    /// Path to the server certificate.
    pub mtls_cert_path: Option<String>,
    /// Path to the server private key.
    pub mtls_key_path: Option<String>,
    /// Optional file path to poll for signing key rotation.
    /// When set, the evidence collector polls this file every 30 seconds
    /// and hot-reloads the signing key when the file is modified.
    pub signing_key_watch_path: Option<String>,
    /// Base directory for persistent data (dead-letter files, merkle anchors, etc.).
    pub data_dir: PathBuf,
    /// Maximum rows per ClickHouse inserter batch (default: 1000).
    pub ch_max_rows: u64,
    /// ClickHouse inserter flush period in milliseconds (default: 1000).
    pub ch_period_ms: u64,
    /// Maximum bytes per ClickHouse inserter batch (default: 52_428_800 = 50 MiB).
    pub ch_max_bytes: u64,
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self {
            grpc_listen_addr: "[::1]:50051".to_string(),
            clickhouse_url: "http://localhost:8123".to_string(),
            clickhouse_database: "interdict".to_string(),
            clickhouse_user: "default".to_string(),
            clickhouse_password: String::new(),
            s3_bucket: String::new(),
            s3_region: String::new(),
            signing_mode: SigningMode::Dev,
            merkle_window_secs: 3600,
            merkle_max_leaves: 1_000_000,
            full_text_storage: false,
            retention_days: 2555,
            require_object_lock: true,
            mtls_enabled: false,
            mtls_ca_cert_path: None,
            mtls_cert_path: None,
            mtls_key_path: None,
            signing_key_watch_path: None,
            data_dir: PathBuf::from(DEFAULT_DATA_DIR),
            ch_max_rows: 1000,
            ch_period_ms: 1000,
            ch_max_bytes: 52_428_800,
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
    /// - `COLLECTOR_REQUIRE_OBJECT_LOCK` (default: true) -- `1`/`true`/`yes`
    /// - `MTLS_ENABLED` (default: "false") -- `true`/`false`
    /// - `MTLS_CA_CERT_PATH` -- CA cert for client verification
    /// - `MTLS_CERT_PATH` -- Server certificate
    /// - `MTLS_KEY_PATH` -- Server private key
    /// - `SIGNING_KEY_WATCH_PATH` -- Optional file path to poll for signing key hot-reload
    /// - `COLLECTOR_DATA_DIR` (default: `/data/evidence-collector`) -- persistent data directory
    pub fn from_env() -> Result<Self> {
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
                    .context("COLLECTOR_KMS_KEY_ID required when COLLECTOR_SIGNING_MODE=kms")?,
            ),
            _ => SigningMode::Dev,
        };

        Ok(Self {
            grpc_listen_addr: std::env::var("COLLECTOR_GRPC_LISTEN_ADDR")
                .unwrap_or_else(|_| "[::1]:50051".to_string()),
            clickhouse_url: std::env::var("CLICKHOUSE_URL")
                .unwrap_or_else(|_| "http://localhost:8123".to_string()),
            clickhouse_database: std::env::var("CLICKHOUSE_DATABASE")
                .unwrap_or_else(|_| "interdict".to_string()),
            clickhouse_user: std::env::var("CLICKHOUSE_USER")
                .unwrap_or_else(|_| "default".to_string()),
            clickhouse_password: std::env::var("CLICKHOUSE_PASSWORD").unwrap_or_default(),
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
            require_object_lock: std::env::var("COLLECTOR_REQUIRE_OBJECT_LOCK")
                .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(true),
            mtls_enabled: std::env::var("MTLS_ENABLED")
                .map(|v| v.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            mtls_ca_cert_path: std::env::var("MTLS_CA_CERT_PATH").ok(),
            mtls_cert_path: std::env::var("MTLS_CERT_PATH").ok(),
            mtls_key_path: std::env::var("MTLS_KEY_PATH").ok(),
            signing_key_watch_path: std::env::var("SIGNING_KEY_WATCH_PATH").ok(),
            data_dir: std::env::var("COLLECTOR_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from(DEFAULT_DATA_DIR)),
            ch_max_rows: std::env::var("COLLECTOR_CH_MAX_ROWS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1000),
            ch_period_ms: std::env::var("COLLECTOR_CH_PERIOD_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1000),
            ch_max_bytes: std::env::var("COLLECTOR_CH_MAX_BYTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(52_428_800),
        })
    }
}

#[cfg(test)]
#[allow(unsafe_code)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Mutex to serialize tests that mutate environment variables, since
    /// cargo test runs them in parallel by default.
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    /// SAFETY: Caller must hold ENV_MUTEX to prevent concurrent env mutation.
    unsafe fn clear_collector_env() {
        unsafe {
            std::env::remove_var("COLLECTOR_GRPC_LISTEN_ADDR");
            std::env::remove_var("CLICKHOUSE_URL");
            std::env::remove_var("CLICKHOUSE_DATABASE");
            std::env::remove_var("CLICKHOUSE_USER");
            std::env::remove_var("CLICKHOUSE_PASSWORD");
            std::env::remove_var("COLLECTOR_S3_BUCKET");
            std::env::remove_var("COLLECTOR_S3_REGION");
            std::env::remove_var("COLLECTOR_SIGNING_MODE");
            std::env::remove_var("COLLECTOR_SIGNING_KEY_PATH");
            std::env::remove_var("COLLECTOR_KMS_KEY_ID");
            std::env::remove_var("COLLECTOR_MERKLE_WINDOW_SECS");
            std::env::remove_var("COLLECTOR_MERKLE_MAX_LEAVES");
            std::env::remove_var("COLLECTOR_FULL_TEXT_STORAGE");
            std::env::remove_var("COLLECTOR_RETENTION_DAYS");
            std::env::remove_var("COLLECTOR_REQUIRE_OBJECT_LOCK");
            std::env::remove_var("SIGNING_KEY_WATCH_PATH");
            std::env::remove_var("COLLECTOR_DATA_DIR");
            std::env::remove_var("COLLECTOR_CH_MAX_ROWS");
            std::env::remove_var("COLLECTOR_CH_PERIOD_MS");
            std::env::remove_var("COLLECTOR_CH_MAX_BYTES");
        }
    }

    #[test]
    fn test_from_env_defaults() {
        let _guard = ENV_MUTEX.lock().unwrap();
        unsafe { clear_collector_env() };

        let cfg = CollectorConfig::from_env().expect("config from env");
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
        assert!(cfg.require_object_lock);
        assert_eq!(
            cfg.data_dir,
            std::path::PathBuf::from("/data/evidence-collector")
        );
        assert_eq!(cfg.ch_max_rows, 1000);
        assert_eq!(cfg.ch_period_ms, 1000);
        assert_eq!(cfg.ch_max_bytes, 52_428_800);
    }

    #[test]
    fn test_from_env_overrides() {
        let _guard = ENV_MUTEX.lock().unwrap();
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

        let cfg = CollectorConfig::from_env().expect("config from env");
        assert_eq!(cfg.grpc_listen_addr, "[::]:50051");
        assert_eq!(cfg.clickhouse_url, "http://clickhouse:8123");
        assert_eq!(cfg.clickhouse_database, "mydb");
        assert_eq!(cfg.s3_bucket, "my-bucket");
        assert_eq!(cfg.s3_region, "eu-west-1");
        assert!(cfg.full_text_storage);
        assert_eq!(cfg.retention_days, 365);
        assert_eq!(cfg.merkle_window_secs, 1800);
        assert_eq!(cfg.merkle_max_leaves, 500_000);

        unsafe { clear_collector_env() };
    }

    #[test]
    fn test_from_env_signing_mode_file() {
        let _guard = ENV_MUTEX.lock().unwrap();
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_SIGNING_MODE", "file");
            std::env::set_var("COLLECTOR_SIGNING_KEY_PATH", "/custom/key.pem");
        }

        let cfg = CollectorConfig::from_env().expect("config from env");
        match &cfg.signing_mode {
            SigningMode::File(path) => assert_eq!(path.to_str().unwrap(), "/custom/key.pem"),
            other => panic!("expected SigningMode::File, got {:?}", other),
        }

        unsafe { clear_collector_env() };
    }

    #[test]
    fn test_from_env_signing_mode_file_default_path() {
        let _guard = ENV_MUTEX.lock().unwrap();
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_SIGNING_MODE", "file");
        }

        let cfg = CollectorConfig::from_env().expect("config from env");
        match &cfg.signing_mode {
            SigningMode::File(path) => {
                assert_eq!(path.to_str().unwrap(), "/data/keys/signing.key")
            }
            other => panic!("expected SigningMode::File, got {:?}", other),
        }

        unsafe { clear_collector_env() };
    }

    #[test]
    fn test_from_env_full_text_storage_variants() {
        let _guard = ENV_MUTEX.lock().unwrap();
        unsafe { clear_collector_env() };

        for val in &["1", "true", "yes", "TRUE", "Yes", "YES"] {
            unsafe { std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", val) };
            let cfg = CollectorConfig::from_env().expect("config from env");
            assert!(cfg.full_text_storage, "expected true for '{}'", val);
        }
        for val in &["0", "false", "no", "anything"] {
            unsafe { std::env::set_var("COLLECTOR_FULL_TEXT_STORAGE", val) };
            let cfg = CollectorConfig::from_env().expect("config from env");
            assert!(!cfg.full_text_storage, "expected false for '{}'", val);
        }

        unsafe { clear_collector_env() };
    }

    #[test]
    fn config_batch_settings_from_env() {
        let _guard = ENV_MUTEX.lock().unwrap();
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_CH_MAX_ROWS", "5000");
            std::env::set_var("COLLECTOR_CH_PERIOD_MS", "2000");
            std::env::set_var("COLLECTOR_CH_MAX_BYTES", "104857600");
        }

        let cfg = CollectorConfig::from_env().expect("config from env");
        assert_eq!(cfg.ch_max_rows, 5000);
        assert_eq!(cfg.ch_period_ms, 2000);
        assert_eq!(cfg.ch_max_bytes, 104_857_600);

        unsafe { clear_collector_env() };
    }

    #[test]
    fn config_data_dir_from_env() {
        let _guard = ENV_MUTEX.lock().unwrap();
        unsafe {
            clear_collector_env();
            std::env::set_var("COLLECTOR_DATA_DIR", "/custom/data");
        }

        let cfg = CollectorConfig::from_env().expect("config from env");
        assert_eq!(cfg.data_dir, std::path::PathBuf::from("/custom/data"));

        unsafe { clear_collector_env() };
    }
}
