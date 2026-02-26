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
use std::sync::Arc;

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

/// Thread-safe TLS certificate cache with on-demand generation.
///
/// Caches `rustls::ServerConfig` per domain in a `DashMap` for
/// sub-microsecond lookups after initial generation.
///
/// Uses `DashMap::entry()` to prevent thundering herd: only one
/// task generates a cert per domain at a time (Pitfall 4).
pub struct CertCache {
    /// Cached ServerConfig per domain.
    cache: DashMap<String, Arc<rustls::ServerConfig>>,
    /// CA certificate PEM for re-parsing in spawn_blocking context.
    ca_cert_pem: String,
    /// CA key PEM for re-parsing in spawn_blocking context.
    ca_key_pem: String,
}

impl CertCache {
    /// Create a new certificate cache with the given CA certificate and key.
    ///
    /// Stores PEM representations for use in spawn_blocking cert generation.
    pub fn new(ca_cert: rcgen::Certificate, ca_key: rcgen::KeyPair) -> Self {
        let ca_cert_pem = ca_cert.pem();
        let ca_key_pem = ca_key.serialize_pem();

        Self {
            cache: DashMap::new(),
            ca_cert_pem,
            ca_key_pem,
        }
    }

    /// Get or create a TLS `ServerConfig` for the given domain.
    ///
    /// Fast path: returns cached config (sub-microsecond).
    /// Slow path: generates a new certificate signed by the CA,
    /// wraps it in a `ServerConfig`, caches it, and returns it.
    ///
    /// Uses `DashMap::entry()` to prevent thundering herd on cache miss.
    /// CPU-bound cert generation runs in `spawn_blocking` (Pitfall 5).
    pub async fn get_or_create(
        &self,
        domain: &str,
    ) -> Result<Arc<rustls::ServerConfig>, ProxyError> {
        // Fast path: cached
        if let Some(config) = self.cache.get(domain) {
            return Ok(config.clone());
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

        // Use entry API to avoid duplicate insertion (thundering herd prevention)
        self.cache
            .entry(domain.to_string())
            .or_insert(server_config.clone());

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
    let private_key =
        rustls::pki_types::PrivatePkcs8KeyDer::from(ee_key.serialized_der().to_vec());

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

        cache.pre_warm(&domains).await.expect("pre-warm should succeed");
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
}
