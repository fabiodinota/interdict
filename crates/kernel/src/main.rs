//! Interdict Kernel Proxy - Entry Point
//!
//! AI governance kernel that intercepts, inspects, and enforces policy on
//! all outbound AI traffic. Operates as an explicit forward proxy with
//! TLS interception via deployment-unique CA.
//!
//! KERN-13: All channels in this project MUST be bounded. Zero unbounded_channel() allowed.
//! The shutdown watch channel is inherently bounded (single value).

use std::sync::Arc;
use std::time::Duration;

use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto;
use hyper_util::service::TowerToHyperService;
use tower::ServiceBuilder;

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
    let allowlist = Arc::new(middleware::allowlist::VendorAllowlist::from_config(
        &config.allowlist,
    ));

    tracing::info!(
        vendor_count = config.allowlist.vendors.len(),
        "vendor allowlist loaded"
    );

    // 7. Create connection pool
    let connect_timeout = Duration::from_millis(config.proxy.connect_timeout_ms);
    let pool = Arc::new(proxy::pool::ConnectionPool::new(
        &config.pool,
        connect_timeout,
    ));

    // 8. Store config in Arc for sharing
    let config = Arc::new(config);

    // 9. Build the Tower service stack
    //    Request flow: RequestIdLayer -> AllowlistLayer -> ProxyService
    let proxy_service =
        proxy::ProxyService::new(cert_cache.clone(), pool.clone(), config.clone());

    // 10. Bind TCP listener
    let listener = tokio::net::TcpListener::bind(&config.proxy.listen_addr).await?;
    tracing::info!(
        addr = %config.proxy.listen_addr,
        "kernel proxy listening"
    );

    // 11. Graceful shutdown via watch channel (KERN-13: bounded, single value)
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

    // Spawn shutdown signal handler
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to listen for SIGINT");
        tracing::info!("shutdown signal received");
        let _ = shutdown_tx.send(true);
    });

    // 12. Accept loop
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, addr) = accept_result?;
                let allowlist = allowlist.clone();
                let proxy_service = proxy_service.clone();
                let mut shutdown_rx = shutdown_rx.clone();

                tokio::spawn(async move {
                    tracing::debug!(peer_addr = %addr, "new connection");

                    // Build per-connection service stack with Tower layers
                    let tower_svc = ServiceBuilder::new()
                        .layer(middleware::request_id::RequestIdLayer::new())
                        .layer(middleware::allowlist::AllowlistLayer::new(allowlist))
                        .service(proxy_service);

                    // Bridge tower::Service to hyper::Service for serve_connection_with_upgrades
                    let hyper_svc = TowerToHyperService::new(tower_svc);

                    let io = TokioIo::new(stream);

                    // Use auto::Builder for HTTP/1.1 + HTTP/2 auto-detection
                    // CRITICAL: serve_connection_with_upgrades enables CONNECT upgrade
                    let builder = auto::Builder::new(TokioExecutor::new());
                    let conn = builder
                        .serve_connection_with_upgrades(io, hyper_svc);

                    // Pin for select!
                    tokio::pin!(conn);

                    // Drive connection until completion or shutdown
                    tokio::select! {
                        result = conn.as_mut() => {
                            if let Err(e) = result {
                                tracing::debug!(
                                    peer_addr = %addr,
                                    error = %e,
                                    "connection error"
                                );
                            }
                        }
                        _ = shutdown_rx.changed() => {
                            // Graceful shutdown: stop accepting but let connection drain
                            tracing::debug!(peer_addr = %addr, "connection draining for shutdown");
                            conn.as_mut().graceful_shutdown();
                            // Wait up to 30 seconds for connection to drain
                            if let Err(_timeout) = tokio::time::timeout(
                                Duration::from_secs(30),
                                conn.as_mut(),
                            ).await {
                                tracing::warn!(
                                    peer_addr = %addr,
                                    "connection drain timeout, forcing close"
                                );
                            }
                        }
                    }
                });
            }
            _ = shutdown_rx.changed() => {
                tracing::info!("stopping accept loop for shutdown");
                break;
            }
        }
    }

    tracing::info!("kernel proxy shutdown complete");

    Ok(())
}
