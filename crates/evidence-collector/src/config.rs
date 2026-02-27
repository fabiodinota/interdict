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
