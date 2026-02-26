//! Configuration loading and validation for the Interdict kernel proxy.
//!
//! Loads configuration from a TOML file and validates all required fields.
//! Fails closed on any configuration error (PLCY-09 principle).
//!
//! # Example
//!
//! ```no_run
//! let config = kernel::config::load("interdict.toml").unwrap();
//! println!("Listening on {}", config.proxy.listen_addr);
//! ```

use serde::Deserialize;
use std::collections::HashSet;

/// Top-level configuration for the Interdict kernel proxy.
#[derive(Debug, Deserialize)]
pub struct Config {
    /// Proxy listener and timeout settings.
    pub proxy: ProxyConfig,
    /// TLS certificate authority configuration.
    pub tls: TlsConfig,
    /// Connection pool settings per vendor.
    pub pool: PoolConfig,
    /// Vendor allowlist (deny-by-default).
    pub allowlist: AllowlistConfig,
    /// Structured logging configuration.
    pub logging: LoggingConfig,
    /// Policy engine configuration (optional — defaults apply if omitted).
    #[serde(default)]
    pub policy: PolicyEngineConfig,
}

/// Policy engine configuration controlling pool sizes, queue depths,
/// and resource limits for the 3-layer evaluation pipeline.
#[derive(Debug, Deserialize)]
pub struct PolicyEngineConfig {
    /// Number of pre-created Regorus engine instances in the pool.
    #[serde(default = "default_regorus_pool_size")]
    pub regorus_pool_size: usize,
    /// Maximum concurrent Wasmtime instances (pooling allocator slots).
    #[serde(default = "default_wasm_max_instances")]
    pub wasm_max_instances: usize,
    /// Maximum linear memory per Wasm instance in bytes (default 1MB).
    #[serde(default = "default_wasm_max_memory_bytes")]
    pub wasm_max_memory_bytes: usize,
    /// Number of background worker threads for Layer 2 NLP classification.
    #[serde(default = "default_l2_background_workers")]
    pub l2_background_workers: usize,
    /// Maximum queued Layer 2 background classification jobs.
    #[serde(default = "default_l2_queue_depth")]
    pub l2_queue_depth: usize,
    /// Maximum pending Layer 3 human reviews before applying fail-mode.
    #[serde(default = "default_l3_max_pending_reviews")]
    pub l3_max_pending_reviews: usize,
    /// Layer 3 review timeout in seconds before fail-mode applies.
    #[serde(default = "default_l3_timeout_seconds")]
    pub l3_timeout_seconds: u64,
    /// Path to the SQLite database for the human review queue.
    #[serde(default = "default_review_db_path")]
    pub review_db_path: String,
    /// Directory containing Rego policy source files.
    #[serde(default = "default_policies_dir")]
    pub policies_dir: String,
    /// Optional path to the ONNX model for Layer 2 NLP classification.
    pub l2_model_path: Option<String>,
}

impl Default for PolicyEngineConfig {
    fn default() -> Self {
        Self {
            regorus_pool_size: default_regorus_pool_size(),
            wasm_max_instances: default_wasm_max_instances(),
            wasm_max_memory_bytes: default_wasm_max_memory_bytes(),
            l2_background_workers: default_l2_background_workers(),
            l2_queue_depth: default_l2_queue_depth(),
            l3_max_pending_reviews: default_l3_max_pending_reviews(),
            l3_timeout_seconds: default_l3_timeout_seconds(),
            review_db_path: default_review_db_path(),
            policies_dir: default_policies_dir(),
            l2_model_path: None,
        }
    }
}

/// Proxy listener and timeout configuration.
///
/// Timeouts are generous by default for AI workloads where
/// streaming responses can last several minutes.
#[derive(Debug, Deserialize)]
pub struct ProxyConfig {
    /// Address to listen on (e.g., "0.0.0.0:8443").
    pub listen_addr: String,

    /// Timeout for establishing upstream connection in milliseconds.
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_ms: u64,

    /// Timeout for receiving first byte from upstream in milliseconds.
    #[serde(default = "default_first_byte_timeout")]
    pub first_byte_timeout_ms: u64,

    /// Overall stream timeout in milliseconds (default 5 minutes).
    #[serde(default = "default_stream_timeout")]
    pub stream_timeout_ms: u64,

    /// Maximum request queue size for backpressure.
    /// Returns 503 when queue is full.
    #[serde(default = "default_max_queue")]
    pub max_request_queue: usize,
}

/// TLS certificate authority configuration.
///
/// The CA certificate and key are used to sign on-the-fly per-domain
/// certificates for TLS interception.
#[derive(Debug, Deserialize)]
pub struct TlsConfig {
    /// Path to the CA certificate PEM file.
    pub ca_cert_path: String,
    /// Path to the CA private key PEM file.
    pub ca_key_path: String,
}

/// Connection pool configuration per vendor.
#[derive(Debug, Deserialize)]
pub struct PoolConfig {
    /// Maximum HTTP/2 connections per vendor backend.
    #[serde(default = "default_max_connections_per_vendor")]
    pub max_connections_per_vendor: usize,

    /// Maximum concurrent streams per HTTP/2 connection.
    #[serde(default = "default_max_streams_per_connection")]
    pub max_streams_per_connection: usize,

    /// Idle connection timeout in milliseconds.
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_ms: u64,
}

/// Vendor allowlist configuration (deny-by-default).
///
/// Only domains explicitly listed in `vendors` can be reached
/// through the proxy. All other domains are blocked with 403.
#[derive(Debug, Deserialize)]
pub struct AllowlistConfig {
    /// List of allowed vendor domains (exact match).
    pub vendors: Vec<String>,
}

impl AllowlistConfig {
    /// Convert the vendor list to a `HashSet` for O(1) lookup.
    pub fn to_set(&self) -> HashSet<String> {
        self.vendors.iter().cloned().collect()
    }
}

/// Structured logging configuration.
#[derive(Debug, Deserialize)]
pub struct LoggingConfig {
    /// Log level filter (e.g., "info", "debug", "warn", "error").
    #[serde(default = "default_log_level")]
    pub level: String,

    /// Output format: "json" for production, "pretty" for development.
    #[serde(default = "default_log_format")]
    pub format: String,
}

fn default_connect_timeout() -> u64 {
    10_000
}
fn default_first_byte_timeout() -> u64 {
    30_000
}
fn default_stream_timeout() -> u64 {
    300_000
}
fn default_max_queue() -> usize {
    1024
}
fn default_max_connections_per_vendor() -> usize {
    4
}
fn default_max_streams_per_connection() -> usize {
    100
}
fn default_idle_timeout() -> u64 {
    60_000
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_log_format() -> String {
    "json".to_string()
}
fn default_regorus_pool_size() -> usize {
    8
}
fn default_wasm_max_instances() -> usize {
    64
}
fn default_wasm_max_memory_bytes() -> usize {
    1 << 20 // 1MB
}
fn default_l2_background_workers() -> usize {
    2
}
fn default_l2_queue_depth() -> usize {
    256
}
fn default_l3_max_pending_reviews() -> usize {
    50
}
fn default_l3_timeout_seconds() -> u64 {
    30
}
fn default_review_db_path() -> String {
    "data/review_queue.db".to_string()
}
fn default_policies_dir() -> String {
    "policies/".to_string()
}

/// Load and validate configuration from a TOML file.
///
/// Fails closed on any error (missing file, parse error, validation failure)
/// per PLCY-09 principle.
///
/// # Errors
///
/// Returns `anyhow::Error` if:
/// - The config file cannot be read
/// - The TOML is malformed
/// - Validation fails (empty listen_addr, missing CA files, etc.)
pub fn load(path: &str) -> anyhow::Result<Config> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("failed to read config file '{}': {}", path, e))?;

    let config: Config = toml::from_str(&content)
        .map_err(|e| anyhow::anyhow!("failed to parse config file '{}': {}", path, e))?;

    validate(&config)?;

    Ok(config)
}

/// Validate configuration values.
///
/// Enforces fail-closed semantics: invalid configuration prevents startup.
fn validate(config: &Config) -> anyhow::Result<()> {
    // listen_addr must not be empty
    if config.proxy.listen_addr.is_empty() {
        anyhow::bail!("proxy.listen_addr must not be empty");
    }

    // CA cert file must exist
    if !std::path::Path::new(&config.tls.ca_cert_path).exists() {
        anyhow::bail!(
            "TLS CA certificate file not found: {}",
            config.tls.ca_cert_path
        );
    }

    // CA key file must exist
    if !std::path::Path::new(&config.tls.ca_key_path).exists() {
        anyhow::bail!("TLS CA key file not found: {}", config.tls.ca_key_path);
    }

    // Warn if vendors list is empty (deny-by-default means nothing works)
    if config.allowlist.vendors.is_empty() {
        tracing::warn!(
            "allowlist.vendors is empty: all vendor traffic will be blocked (deny-by-default)"
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_full_config() {
        let toml_str = r#"
[proxy]
listen_addr = "0.0.0.0:8443"
connect_timeout_ms = 5000
first_byte_timeout_ms = 15000
stream_timeout_ms = 120000
max_request_queue = 512

[tls]
ca_cert_path = "/tmp/ca.crt"
ca_key_path = "/tmp/ca.key"

[pool]
max_connections_per_vendor = 8
max_streams_per_connection = 200
idle_timeout_ms = 30000

[allowlist]
vendors = ["api.openai.com", "api.anthropic.com"]

[logging]
level = "debug"
format = "pretty"

[policy]
regorus_pool_size = 16
wasm_max_instances = 32
wasm_max_memory_bytes = 2097152
l2_background_workers = 4
l2_queue_depth = 512
l3_max_pending_reviews = 100
l3_timeout_seconds = 60
review_db_path = "/tmp/review.db"
policies_dir = "/etc/policies/"
"#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(config.proxy.listen_addr, "0.0.0.0:8443");
        assert_eq!(config.proxy.connect_timeout_ms, 5000);
        assert_eq!(config.proxy.first_byte_timeout_ms, 15000);
        assert_eq!(config.proxy.stream_timeout_ms, 120000);
        assert_eq!(config.proxy.max_request_queue, 512);
        assert_eq!(config.pool.max_connections_per_vendor, 8);
        assert_eq!(config.pool.max_streams_per_connection, 200);
        assert_eq!(config.pool.idle_timeout_ms, 30000);
        assert_eq!(config.allowlist.vendors.len(), 2);
        assert_eq!(config.logging.level, "debug");
        assert_eq!(config.logging.format, "pretty");
        assert_eq!(config.policy.regorus_pool_size, 16);
        assert_eq!(config.policy.wasm_max_instances, 32);
        assert_eq!(config.policy.wasm_max_memory_bytes, 2_097_152);
        assert_eq!(config.policy.l2_background_workers, 4);
        assert_eq!(config.policy.l3_timeout_seconds, 60);
        assert_eq!(config.policy.review_db_path, "/tmp/review.db");
    }

    #[test]
    fn test_defaults_applied() {
        let toml_str = r#"
[proxy]
listen_addr = "0.0.0.0:8443"

[tls]
ca_cert_path = "/tmp/ca.crt"
ca_key_path = "/tmp/ca.key"

[pool]

[allowlist]
vendors = ["api.openai.com"]

[logging]
"#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(config.proxy.connect_timeout_ms, 10_000);
        assert_eq!(config.proxy.first_byte_timeout_ms, 30_000);
        assert_eq!(config.proxy.stream_timeout_ms, 300_000);
        assert_eq!(config.proxy.max_request_queue, 1024);
        assert_eq!(config.pool.max_connections_per_vendor, 4);
        assert_eq!(config.pool.max_streams_per_connection, 100);
        assert_eq!(config.pool.idle_timeout_ms, 60_000);
        assert_eq!(config.logging.level, "info");
        assert_eq!(config.logging.format, "json");
    }

    #[test]
    fn test_policy_defaults_when_section_omitted() {
        let toml_str = r#"
[proxy]
listen_addr = "0.0.0.0:8443"

[tls]
ca_cert_path = "/tmp/ca.crt"
ca_key_path = "/tmp/ca.key"

[pool]

[allowlist]
vendors = ["api.openai.com"]

[logging]
"#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(config.policy.regorus_pool_size, 8);
        assert_eq!(config.policy.wasm_max_instances, 64);
        assert_eq!(config.policy.wasm_max_memory_bytes, 1 << 20);
        assert_eq!(config.policy.l2_background_workers, 2);
        assert_eq!(config.policy.l2_queue_depth, 256);
        assert_eq!(config.policy.l3_max_pending_reviews, 50);
        assert_eq!(config.policy.l3_timeout_seconds, 30);
        assert_eq!(config.policy.review_db_path, "data/review_queue.db");
        assert_eq!(config.policy.policies_dir, "policies/");
        assert!(config.policy.l2_model_path.is_none());
    }

    #[test]
    fn test_allowlist_to_set() {
        let config = AllowlistConfig {
            vendors: vec![
                "api.openai.com".to_string(),
                "api.anthropic.com".to_string(),
            ],
        };
        let set = config.to_set();
        assert!(set.contains("api.openai.com"));
        assert!(set.contains("api.anthropic.com"));
        assert!(!set.contains("evil.ai.com"));
    }
}
