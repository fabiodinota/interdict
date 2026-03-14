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

/// Configuration for the policy distribution subsystem.
///
/// Controls how the kernel connects to the control plane for live
/// policy updates, hierarchy identity, session context limits, and
/// disconnect behavior.
#[derive(Debug, Clone, Deserialize)]
pub struct DistributionConfig {
    /// Control plane gRPC address (e.g., "http://[::1]:50052").
    /// None means distribution is disabled (static policies only).
    #[serde(default)]
    pub distribution_addr: Option<String>,

    /// Override kernel ID (defaults to random UUID at startup).
    #[serde(default)]
    pub kernel_id: Option<String>,

    /// Organization ID for hierarchy resolution (required when distribution is enabled).
    #[serde(default = "default_org_id")]
    pub org_id: String,

    /// Department ID for hierarchy resolution (optional).
    #[serde(default)]
    pub dept_id: Option<String>,

    /// Team ID for hierarchy resolution (optional).
    #[serde(default)]
    pub team_id: Option<String>,

    /// Seconds before fail-closed on control plane disconnect.
    #[serde(default = "default_disconnect_timeout_secs")]
    pub disconnect_timeout_secs: u64,

    /// Behavior on disconnect: "fail_closed" or "keep_last".
    #[serde(default = "default_disconnect_mode")]
    pub disconnect_mode: String,

    /// Maximum number of concurrent sessions tracked in memory.
    #[serde(default = "default_session_max_entries")]
    pub session_max_entries: usize,

    /// Session TTL in seconds (default 30 minutes).
    #[serde(default = "default_session_ttl_secs")]
    pub session_ttl_secs: u64,

    /// Interval in seconds between session cleanup sweeps.
    #[serde(default = "default_session_cleanup_interval_secs")]
    pub session_cleanup_interval_secs: u64,

    /// Path to internal CA certificate for mTLS (from env KERNEL_MTLS_CA_CERT).
    #[serde(default)]
    pub mtls_ca_cert_path: Option<String>,

    /// Path to kernel client certificate for mTLS (from env KERNEL_MTLS_CLIENT_CERT).
    #[serde(default)]
    pub mtls_client_cert_path: Option<String>,

    /// Path to kernel client private key for mTLS (from env KERNEL_MTLS_CLIENT_KEY).
    #[serde(default)]
    pub mtls_client_key_path: Option<String>,

    /// Expected TLS server identity for policy distribution mTLS.
    #[serde(default)]
    pub tls_server_name: Option<String>,
}

impl Default for DistributionConfig {
    fn default() -> Self {
        Self {
            distribution_addr: None,
            kernel_id: None,
            org_id: default_org_id(),
            dept_id: None,
            team_id: None,
            disconnect_timeout_secs: default_disconnect_timeout_secs(),
            disconnect_mode: default_disconnect_mode(),
            session_max_entries: default_session_max_entries(),
            session_ttl_secs: default_session_ttl_secs(),
            session_cleanup_interval_secs: default_session_cleanup_interval_secs(),
            mtls_ca_cert_path: std::env::var("KERNEL_MTLS_CA_CERT").ok(),
            mtls_client_cert_path: std::env::var("KERNEL_MTLS_CLIENT_CERT").ok(),
            mtls_client_key_path: std::env::var("KERNEL_MTLS_CLIENT_KEY").ok(),
            tls_server_name: std::env::var("KERNEL_DISTRIBUTION_TLS_SERVER_NAME").ok(),
        }
    }
}

fn default_org_id() -> String {
    "default".to_string()
}
fn default_disconnect_timeout_secs() -> u64 {
    30
}
fn default_disconnect_mode() -> String {
    "fail_closed".to_string()
}
fn default_session_max_entries() -> usize {
    10_000
}
fn default_session_ttl_secs() -> u64 {
    1800
}
fn default_session_cleanup_interval_secs() -> u64 {
    60
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
    /// Policy distribution and session context configuration.
    #[serde(default)]
    pub distribution: DistributionConfig,
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
            distribution: DistributionConfig::default(),
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

    let distribution = &config.policy.distribution;
    let distribution_uses_mtls = distribution
        .distribution_addr
        .as_deref()
        .map(|addr| addr.starts_with("https://"))
        .unwrap_or(false)
        && distribution.mtls_ca_cert_path.is_some()
        && distribution.mtls_client_cert_path.is_some()
        && distribution.mtls_client_key_path.is_some();

    if distribution_uses_mtls
        && distribution
            .tls_server_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        anyhow::bail!(
            "policy.distribution.tls_server_name must be set when distribution mTLS is enabled"
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
    fn test_distribution_config_defaults() {
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
        assert!(config.policy.distribution.distribution_addr.is_none());
        assert!(config.policy.distribution.kernel_id.is_none());
        assert_eq!(config.policy.distribution.org_id, "default");
        assert!(config.policy.distribution.dept_id.is_none());
        assert!(config.policy.distribution.team_id.is_none());
        assert_eq!(config.policy.distribution.disconnect_timeout_secs, 30);
        assert_eq!(config.policy.distribution.disconnect_mode, "fail_closed");
        assert_eq!(config.policy.distribution.session_max_entries, 10_000);
        assert_eq!(config.policy.distribution.session_ttl_secs, 1800);
        assert_eq!(config.policy.distribution.session_cleanup_interval_secs, 60);
    }

    #[test]
    fn test_distribution_config_custom_values() {
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

[policy.distribution]
distribution_addr = "http://[::1]:50052"
kernel_id = "kernel-001"
org_id = "acme-corp"
dept_id = "engineering"
team_id = "ml-team"
disconnect_timeout_secs = 60
disconnect_mode = "keep_last"
session_max_entries = 5000
session_ttl_secs = 3600
session_cleanup_interval_secs = 120
tls_server_name = "control-plane.internal"
"#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(
            config.policy.distribution.distribution_addr.as_deref(),
            Some("http://[::1]:50052")
        );
        assert_eq!(
            config.policy.distribution.kernel_id.as_deref(),
            Some("kernel-001")
        );
        assert_eq!(config.policy.distribution.org_id, "acme-corp");
        assert_eq!(
            config.policy.distribution.dept_id.as_deref(),
            Some("engineering")
        );
        assert_eq!(
            config.policy.distribution.team_id.as_deref(),
            Some("ml-team")
        );
        assert_eq!(config.policy.distribution.disconnect_timeout_secs, 60);
        assert_eq!(config.policy.distribution.disconnect_mode, "keep_last");
        assert_eq!(config.policy.distribution.session_max_entries, 5000);
        assert_eq!(config.policy.distribution.session_ttl_secs, 3600);
        assert_eq!(
            config.policy.distribution.session_cleanup_interval_secs,
            120
        );
        assert_eq!(
            config.policy.distribution.tls_server_name.as_deref(),
            Some("control-plane.internal")
        );
    }

    #[test]
    fn test_distribution_mtls_requires_tls_server_name() {
        let temp_dir = tempfile::tempdir().unwrap();
        let ca_cert_path = temp_dir.path().join("ca.crt");
        let ca_key_path = temp_dir.path().join("ca.key");
        let mtls_ca_path = temp_dir.path().join("internal-ca.pem");
        let mtls_cert_path = temp_dir.path().join("kernel.pem");
        let mtls_key_path = temp_dir.path().join("kernel-key.pem");

        for path in [
            &ca_cert_path,
            &ca_key_path,
            &mtls_ca_path,
            &mtls_cert_path,
            &mtls_key_path,
        ] {
            std::fs::write(path, "test").unwrap();
        }

        // Use forward slashes to avoid TOML interpreting backslashes as escapes on Windows.
        let to_toml_path = |p: &std::path::Path| p.display().to_string().replace('\\', "/");
        let toml_str = format!(
            r#"
[proxy]
listen_addr = "0.0.0.0:8443"

[tls]
ca_cert_path = "{}"
ca_key_path = "{}"

[pool]

[allowlist]
vendors = ["api.openai.com"]

[logging]

[policy.distribution]
distribution_addr = "https://control-plane:50052"
mtls_ca_cert_path = "{}"
mtls_client_cert_path = "{}"
mtls_client_key_path = "{}"
"#,
            to_toml_path(&ca_cert_path),
            to_toml_path(&ca_key_path),
            to_toml_path(&mtls_ca_path),
            to_toml_path(&mtls_cert_path),
            to_toml_path(&mtls_key_path)
        );

        let config: Config = toml::from_str(&toml_str).unwrap();
        let error = validate(&config).unwrap_err().to_string();
        assert!(error.contains("policy.distribution.tls_server_name must be set"));
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
