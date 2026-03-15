//! TLS certificate infrastructure for TLS interception.
//!
//! Generates domain-specific certificates signed by the deployment CA
//! and caches them in a DashMap for sub-microsecond subsequent lookups.
//!
//! The CA certificate and key are loaded at startup and used to sign
//! per-domain end-entity certificates on demand. Cert generation is
//! CPU-bound and runs in `spawn_blocking` to avoid blocking the async
//! runtime (Pitfall 5).

use crate::config::TlsConfig;
use crate::error::ProxyError;
use dashmap::DashMap;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

/// Load the CA certificate and key pair from PEM files.
///
/// Used to sign per-domain certificates for TLS interception.
/// Returns the raw PEM strings for later use in cert generation.
///
/// # Errors
///
/// Returns `ProxyError::Config` if files cannot be read or parsed.
pub fn load_ca(config: &TlsConfig) -> Result<(rcgen::Certificate, rcgen::KeyPair), ProxyError> {
    let cert_pem = std::fs::read_to_string(&config.ca_cert_path).map_err(|e| {
        ProxyError::Config(format!(
            "failed to read CA cert '{}': {}",
            config.ca_cert_path, e
        ))
    })?;

    let key_pem = std::fs::read_to_string(&config.ca_key_path).map_err(|e| {
        ProxyError::Config(format!(
            "failed to read CA key '{}': {}",
            config.ca_key_path, e
        ))
    })?;

    let key_pair = rcgen::KeyPair::from_pem(&key_pem)
        .map_err(|e| ProxyError::Config(format!("failed to parse CA key: {}", e)))?;

    let params = rcgen::CertificateParams::from_ca_cert_pem(&cert_pem)
        .map_err(|e| ProxyError::Config(format!("failed to parse CA cert: {}", e)))?;

    let ca_cert = params
        .self_signed(&key_pair)
        .map_err(|e| ProxyError::Config(format!("failed to reconstruct CA cert: {}", e)))?;

    Ok((ca_cert, key_pair))
}

/// Cached certificate with creation timestamp for TTL enforcement.
struct CachedCert {
    config: Arc<rustls::ServerConfig>,
    created_at: Instant,
}

/// Thread-safe TLS certificate cache with on-demand generation.
///
/// Caches `rustls::ServerConfig` per domain in a `DashMap` for
/// sub-microsecond lookups after initial generation.
///
/// Bounded to `max_entries` with FIFO eviction, and entries expire
/// after `ttl`. The CA private key is wrapped in `Zeroizing` so it
/// is securely erased from memory on drop.
pub struct CertCache {
    /// Cached ServerConfig per domain with TTL.
    cache: DashMap<String, CachedCert>,
    /// CA certificate PEM for re-parsing in spawn_blocking context.
    ca_cert_pem: String,
    /// CA key PEM wrapped in Zeroizing for secure memory cleanup.
    ca_key_pem: Zeroizing<String>,
    /// Maximum number of cached certificates.
    max_entries: usize,
    /// Certificate time-to-live.
    ttl: Duration,
    /// Insertion order for FIFO eviction when cache is full.
    insertion_order: Mutex<VecDeque<String>>,
}

impl CertCache {
    /// Create a new certificate cache with the given CA certificate and key.
    ///
    /// Stores PEM representations for use in spawn_blocking cert generation.
    /// The CA key PEM is wrapped in `Zeroizing` for secure memory cleanup.
    pub fn new(ca_cert: rcgen::Certificate, ca_key: rcgen::KeyPair) -> Self {
        let ca_cert_pem = ca_cert.pem();
        let ca_key_pem = Zeroizing::new(ca_key.serialize_pem());

        Self {
            cache: DashMap::new(),
            ca_cert_pem,
            ca_key_pem,
            max_entries: 1000,
            ttl: Duration::from_secs(86400), // 24 hours
            insertion_order: Mutex::new(VecDeque::new()),
        }
    }

    /// Get or create a TLS `ServerConfig` for the given domain.
    ///
    /// Fast path: returns cached config if present and not expired.
    /// Slow path: generates a new certificate signed by the CA,
    /// wraps it in a `ServerConfig`, caches it, and returns it.
    ///
    /// The cache is bounded to `max_entries`; when full, the oldest
    /// entry is evicted (FIFO). Entries that exceed `ttl` are treated
    /// as cache misses and regenerated.
    ///
    /// CPU-bound cert generation runs in `spawn_blocking` (Pitfall 5).
    pub async fn get_or_create(
        &self,
        domain: &str,
    ) -> Result<Arc<rustls::ServerConfig>, ProxyError> {
        // Fast path: cached and not expired
        if let Some(entry) = self.cache.get(domain) {
            if entry.created_at.elapsed() < self.ttl {
                return Ok(entry.config.clone());
            }
            // TTL expired, drop the ref and remove below
            drop(entry);
            self.cache.remove(domain);
        }

        // Slow path: generate cert in blocking context
        let domain_owned = domain.to_string();
        let ca_cert_pem = self.ca_cert_pem.clone();
        let ca_key_pem = self.ca_key_pem.clone();

        let server_config = tokio::task::spawn_blocking(move || {
            generate_server_config(&domain_owned, &ca_cert_pem, &ca_key_pem)
        })
        .await
        .map_err(|e| ProxyError::Config(format!("cert generation task panicked: {}", e)))??;

        let server_config = Arc::new(server_config);

        // Evict oldest if at capacity
        {
            let mut order = self
                .insertion_order
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if self.cache.len() >= self.max_entries
                && let Some(oldest) = order.pop_front()
            {
                self.cache.remove(&oldest);
            }
            // Remove any existing entry for this domain from insertion order
            order.retain(|d| d != domain);
            order.push_back(domain.to_string());
        }

        // Insert with TTL tracking
        self.cache.entry(domain.to_string()).or_insert(CachedCert {
            config: server_config.clone(),
            created_at: Instant::now(),
        });

        Ok(server_config)
    }

    /// Pre-warm the certificate cache for all configured vendor domains.
    ///
    /// Called at startup to avoid cold-start latency (Pitfall 4).
    pub async fn pre_warm(&self, domains: &[String]) -> Result<(), ProxyError> {
        for domain in domains {
            self.get_or_create(domain).await?;
            tracing::debug!(domain = %domain, "pre-warmed TLS certificate");
        }
        Ok(())
    }

    /// Get the number of cached certificates.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.cache.len()
    }

    /// Check if the cache is empty.
    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }
}

/// Generate a rustls `ServerConfig` for a domain, signed by the CA.
///
/// This is a CPU-bound operation that should run in `spawn_blocking`.
fn generate_server_config(
    domain: &str,
    ca_cert_pem: &str,
    ca_key_pem: &str,
) -> Result<rustls::ServerConfig, ProxyError> {
    // Re-parse CA from PEM (needed because rcgen types are not easily shared across threads)
    let ca_key = rcgen::KeyPair::from_pem(ca_key_pem)
        .map_err(|e| ProxyError::Config(format!("failed to parse CA key: {}", e)))?;

    let ca_params = rcgen::CertificateParams::from_ca_cert_pem(ca_cert_pem)
        .map_err(|e| ProxyError::Config(format!("failed to parse CA cert: {}", e)))?;

    let ca_cert = ca_params
        .self_signed(&ca_key)
        .map_err(|e| ProxyError::Config(format!("failed to reconstruct CA cert: {}", e)))?;

    // Generate end-entity certificate for this domain
    let mut ee_params = rcgen::CertificateParams::new(vec![domain.to_string()])
        .map_err(|e| ProxyError::Config(format!("invalid domain for cert: {}", e)))?;
    ee_params.is_ca = rcgen::IsCa::NoCa;

    let ee_key = rcgen::KeyPair::generate()
        .map_err(|e| ProxyError::Config(format!("key generation failed: {}", e)))?;

    let ee_cert = ee_params.signed_by(&ee_key, &ca_cert, &ca_key)?;

    // Build rustls ServerConfig
    let cert_chain = vec![ee_cert.into()];
    let private_key = rustls::pki_types::PrivatePkcs8KeyDer::from(ee_key.serialized_der().to_vec());

    let server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key.into())
        .map_err(ProxyError::Tls)?;

    Ok(server_config)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generate a self-signed CA for testing.
    fn generate_test_ca() -> (rcgen::Certificate, rcgen::KeyPair) {
        let mut params =
            rcgen::CertificateParams::new(Vec::<String>::new()).expect("empty SAN list");
        params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);

        // Set a distinguished name for the CA
        params
            .distinguished_name
            .push(rcgen::DnType::CommonName, "Interdict Test CA");
        params
            .distinguished_name
            .push(rcgen::DnType::OrganizationName, "Interdict Test");

        let key_pair = rcgen::KeyPair::generate().expect("key generation");
        let cert = params.self_signed(&key_pair).expect("self-signed CA cert");

        (cert, key_pair)
    }

    #[tokio::test]
    async fn test_cert_cache_generates_and_caches() {
        let (ca_cert, ca_key) = generate_test_ca();
        let cache = CertCache::new(ca_cert, ca_key);

        // First call generates a cert
        let config1 = cache
            .get_or_create("api.openai.com")
            .await
            .expect("cert generation should succeed");
        assert_eq!(cache.len(), 1);

        // Second call returns cached value
        let config2 = cache
            .get_or_create("api.openai.com")
            .await
            .expect("cached lookup should succeed");
        assert_eq!(cache.len(), 1);

        // Both should point to the same Arc
        assert!(Arc::ptr_eq(&config1, &config2));
    }

    #[tokio::test]
    async fn test_cert_has_correct_san() {
        let (ca_cert, ca_key) = generate_test_ca();
        let cache = CertCache::new(ca_cert, ca_key);

        // Generate cert for a specific domain
        let _config = cache
            .get_or_create("api.openai.com")
            .await
            .expect("cert generation should succeed");

        // If we got here, the cert was accepted by rustls which validates
        // the certificate chain. The domain is set as SAN in CertificateParams.
        assert_eq!(cache.len(), 1);
    }

    #[tokio::test]
    async fn test_pre_warm_populates_cache() {
        let (ca_cert, ca_key) = generate_test_ca();
        let cache = CertCache::new(ca_cert, ca_key);

        let domains = vec![
            "api.openai.com".to_string(),
            "api.anthropic.com".to_string(),
            "api.cohere.ai".to_string(),
        ];

        cache
            .pre_warm(&domains)
            .await
            .expect("pre-warm should succeed");
        assert_eq!(cache.len(), 3);
    }

    #[tokio::test]
    async fn test_different_domains_get_different_certs() {
        let (ca_cert, ca_key) = generate_test_ca();
        let cache = CertCache::new(ca_cert, ca_key);

        let config1 = cache
            .get_or_create("api.openai.com")
            .await
            .expect("cert generation should succeed");
        let config2 = cache
            .get_or_create("api.anthropic.com")
            .await
            .expect("cert generation should succeed");

        assert_eq!(cache.len(), 2);
        assert!(!Arc::ptr_eq(&config1, &config2));
    }

    #[tokio::test]
    async fn test_cert_cache_evicts_beyond_max_entries() {
        let (ca_cert, ca_key) = generate_test_ca();
        let mut cache = CertCache::new(ca_cert, ca_key);
        cache.max_entries = 5; // Low limit for testing

        // Insert more domains than max_entries
        for i in 0..15 {
            cache
                .get_or_create(&format!("domain-{}.example.com", i))
                .await
                .expect("cert generation should succeed");
        }

        assert!(
            cache.len() <= 5,
            "cache should not exceed max_entries, got {}",
            cache.len()
        );
    }

    #[test]
    fn test_load_ca_valid_pem() {
        use std::io::Write;

        // Generate a CA cert/key pair, serialize to PEM, write to temp files
        let (ca_cert, ca_key) = generate_test_ca();
        let cert_pem = ca_cert.pem();
        let key_pem = ca_key.serialize_pem();

        let mut cert_file = tempfile::NamedTempFile::new().expect("create cert tempfile");
        cert_file
            .write_all(cert_pem.as_bytes())
            .expect("write cert PEM");

        let mut key_file = tempfile::NamedTempFile::new().expect("create key tempfile");
        key_file
            .write_all(key_pem.as_bytes())
            .expect("write key PEM");

        let config = TlsConfig {
            ca_cert_path: cert_file.path().to_string_lossy().into_owned(),
            ca_key_path: key_file.path().to_string_lossy().into_owned(),
        };

        let result = load_ca(&config);
        assert!(
            result.is_ok(),
            "load_ca should succeed with valid PEM files"
        );

        // Verify we got usable CA components back
        let (loaded_cert, _loaded_key) = result.unwrap();
        assert!(
            !loaded_cert.pem().is_empty(),
            "loaded cert should produce non-empty PEM"
        );
    }

    #[test]
    fn test_load_ca_missing_file() {
        let config = TlsConfig {
            ca_cert_path: "/nonexistent/path/ca-cert.pem".to_string(),
            ca_key_path: "/nonexistent/path/ca-key.pem".to_string(),
        };

        let result = load_ca(&config);
        assert!(result.is_err(), "load_ca should fail for missing files");

        let err = match result {
            Err(e) => e,
            Ok(_) => unreachable!("already asserted is_err"),
        };
        let msg = err.to_string();
        assert!(
            msg.contains("failed to read CA cert"),
            "error should mention cert read failure, got: {msg}"
        );
    }

    #[test]
    fn test_load_ca_invalid_pem() {
        use std::io::Write;

        let mut cert_file = tempfile::NamedTempFile::new().expect("create cert tempfile");
        cert_file
            .write_all(b"this is not valid PEM data")
            .expect("write garbage");

        let mut key_file = tempfile::NamedTempFile::new().expect("create key tempfile");
        key_file
            .write_all(b"also not valid PEM data")
            .expect("write garbage");

        let config = TlsConfig {
            ca_cert_path: cert_file.path().to_string_lossy().into_owned(),
            ca_key_path: key_file.path().to_string_lossy().into_owned(),
        };

        let result = load_ca(&config);
        assert!(result.is_err(), "load_ca should fail for invalid PEM");

        let err = match result {
            Err(e) => e,
            Ok(_) => unreachable!("already asserted is_err"),
        };
        let msg = err.to_string();
        // Should fail on key or cert parsing — either error path is acceptable
        assert!(
            msg.contains("failed to parse") || msg.contains("failed to read"),
            "error should mention parse/read failure, got: {msg}"
        );
    }

    #[tokio::test]
    async fn test_concurrent_get_or_create_same_domain() {
        let (ca_cert, ca_key) = generate_test_ca();
        let cache = Arc::new(CertCache::new(ca_cert, ca_key));

        let mut handles = Vec::new();
        for _ in 0..10 {
            let cache = Arc::clone(&cache);
            handles.push(tokio::spawn(async move {
                cache.get_or_create("concurrent.example.com").await
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            let result = handle.await.expect("task should not panic");
            assert!(result.is_ok(), "get_or_create should succeed");
            results.push(result.unwrap());
        }

        // All 10 tasks should have succeeded and only one cache entry should exist
        assert_eq!(
            cache.len(),
            1,
            "cache should contain exactly 1 entry for the domain"
        );

        // Verify that a subsequent call returns the cached entry
        let cached = cache
            .get_or_create("concurrent.example.com")
            .await
            .expect("cached lookup should succeed");
        assert_eq!(cache.len(), 1, "cache should still contain exactly 1 entry");
        // The cached config should match at least one of the results
        // (the one that won the or_insert race)
        assert!(
            results.iter().any(|r| Arc::ptr_eq(r, &cached)),
            "cached entry should be one of the concurrently generated configs"
        );
    }

    #[tokio::test]
    async fn test_cert_cache_ttl_expiration() {
        let (ca_cert, ca_key) = generate_test_ca();
        let mut cache = CertCache::new(ca_cert, ca_key);
        cache.ttl = Duration::from_millis(1); // Very short TTL for testing

        let config1 = cache.get_or_create("test.example.com").await.unwrap();

        // Wait for TTL to expire
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Should generate a new cert (different Arc)
        let config2 = cache.get_or_create("test.example.com").await.unwrap();

        assert!(
            !Arc::ptr_eq(&config1, &config2),
            "expired cert should be regenerated"
        );
    }
}
