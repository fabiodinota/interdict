//! Interdict Kernel Proxy - Entry Point
//!
//! AI governance kernel that intercepts, inspects, and enforces policy on
//! all outbound AI traffic. Operates as an explicit forward proxy with
//! TLS interception via deployment-unique CA.
//!
//! KERN-13: All channels in this project MUST be bounded. Zero unbounded_channel() allowed.

use std::sync::Arc;

use kernel::config;
use kernel::logging;
use kernel::middleware;
use kernel::proxy;

/// Use jemalloc for predictable memory behavior required for the
/// 128MB steady-state target (KERN-09).
#[global_allocator]
static GLOBAL: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Determine config path from CLI args or default
    let config_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "interdict.toml".to_string());

    // 2. Load and validate configuration (fail-closed on errors)
    let config = config::load(&config_path)?;

    // 3. Initialize structured logging
    logging::init(&config.logging);

    tracing::info!(
        config_path = %config_path,
        "configuration loaded"
    );

    // 4. Load CA certificate and key for TLS interception
    let (ca_cert, ca_key) = proxy::tls::load_ca(&config.tls)?;

    tracing::info!("CA certificate loaded for TLS interception");

    // 5. Create TLS certificate cache and pre-warm for all allowlist vendors
    let cert_cache = Arc::new(proxy::tls::CertCache::new(ca_cert, ca_key));

    // Pre-warm cert cache for known vendors (avoids cold-start latency per Pitfall 4)
    cert_cache.pre_warm(&config.allowlist.vendors).await?;

    // 6. Create vendor allowlist from configuration
    let _allowlist = Arc::new(middleware::allowlist::VendorAllowlist::from_config(
        &config.allowlist,
    ));

    tracing::info!(
        vendor_count = config.allowlist.vendors.len(),
        "vendor allowlist loaded"
    );

    // TODO: Plan 01-02 adds proxy server accept loop here
    tracing::info!(
        addr = %config.proxy.listen_addr,
        "kernel proxy ready (server loop not yet implemented)"
    );

    Ok(())
}
