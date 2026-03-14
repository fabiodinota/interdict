//! Interdict Kernel Proxy - Entry Point
//!
//! AI governance kernel that intercepts, inspects, and enforces policy on
//! all outbound AI traffic. Operates as an explicit forward proxy with
//! TLS interception via deployment-unique CA.
//!
//! KERN-13: All channels in this project MUST be bounded. Zero unbounded_channel() allowed.
//! The shutdown watch channel is inherently bounded (single value).

use std::time::Duration;

use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto;
use hyper_util::service::TowerToHyperService;
use tower::ServiceBuilder;

use kernel::middleware;

/// Use jemalloc for predictable memory behavior required for the
/// 128MB steady-state target (KERN-09).
#[cfg(not(target_os = "windows"))]
#[global_allocator]
static GLOBAL: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "interdict.toml".to_string());

    // Bootstrap all subsystems
    let result = kernel::bootstrap::bootstrap(&config_path).await?;

    // Bind TCP listener
    let listener = tokio::net::TcpListener::bind(&result.config.proxy.listen_addr).await?;
    tracing::info!(
        addr = %result.config.proxy.listen_addr,
        "kernel proxy listening"
    );

    // Graceful shutdown via watch channel (KERN-13: bounded, single value)
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

    tokio::spawn(async move {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(error = %error, "failed to install SIGINT handler");
        } else {
            tracing::info!("shutdown signal received");
        }
        let _ = shutdown_tx.send(true);
    });

    // Accept loop
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, addr) = accept_result?;
                let allowlist = result.allowlist.clone();
                let proxy_service = result.proxy_service.clone();
                let mut shutdown_rx = shutdown_rx.clone();

                tokio::spawn(async move {
                    tracing::debug!(peer_addr = %addr, "new connection");

                    let tower_svc = ServiceBuilder::new()
                        .layer(middleware::request_id::RequestIdLayer::new())
                        .layer(middleware::allowlist::AllowlistLayer::new(allowlist))
                        .service(proxy_service);

                    let hyper_svc = TowerToHyperService::new(tower_svc);
                    let io = TokioIo::new(stream);

                    let builder = auto::Builder::new(TokioExecutor::new());
                    let conn = builder.serve_connection_with_upgrades(io, hyper_svc);

                    tokio::pin!(conn);

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
                            tracing::debug!(peer_addr = %addr, "connection draining for shutdown");
                            conn.as_mut().graceful_shutdown();
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

    // Cleanup
    result.cancel_token.cancel();
    if let Some(handle) = result.distribution_handle {
        match tokio::time::timeout(Duration::from_secs(5), handle).await {
            Ok(Ok(())) => tracing::info!("distribution client stopped"),
            Ok(Err(err)) => tracing::warn!(error = %err, "distribution client join failed"),
            Err(_) => tracing::warn!("distribution client shutdown timed out"),
        }
    }

    drop(result.proxy_service);
    drop(result.evidence_buffer);

    match tokio::time::timeout(Duration::from_secs(2), result.evidence_flusher_handle).await {
        Ok(Ok(())) => tracing::info!("evidence flusher stopped"),
        Ok(Err(err)) => tracing::warn!(error = %err, "evidence flusher join failed"),
        Err(_) => tracing::warn!("evidence flusher shutdown timed out"),
    }

    Ok(())
}
