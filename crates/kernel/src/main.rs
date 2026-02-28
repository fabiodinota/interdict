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
use kernel::evidence;
use kernel::logging;
use kernel::middleware;
use kernel::policy;
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

    // 8b. Initialize Policy Pipeline (Phase 2)
    let pipeline = {
        // Create WasmEngine with pooling allocator (proves PLCY-01)
        let wasm_engine = Arc::new(
            policy::wasm_engine::WasmEngine::new(&config.policy)
                .expect("WasmEngine creation should succeed"),
        );
        tracing::info!("Wasmtime engine with pooling allocator initialized");

        // Create Regorus engine template and pool
        // Load policies from the configured directory (if any exist)
        let regorus_template = regorus::Engine::new();
        let regorus_pool = Arc::new(policy::layer1::regorus::RegorusPool::new(
            &regorus_template,
            config.policy.regorus_pool_size,
        ));
        tracing::info!(
            pool_size = config.policy.regorus_pool_size,
            "Regorus engine pool initialized"
        );

        // Create VendorAllowlistPolicy from the existing allowlist
        let allowlist_policy = Arc::new(policy::layer1::allowlist::VendorAllowlistPolicy::new(
            allowlist.clone(),
        ));

        // Create Classifier (stub if no model path, real if model path configured)
        let labels = vec![
            "allow".to_string(),
            "block".to_string(),
            "redact".to_string(),
            "uncertain".to_string(),
        ];
        let classifier = Arc::new(match &config.policy.l2_model_path {
            Some(model_path) => {
                policy::layer2::classifier::Classifier::load(model_path, labels.clone())
                    .expect("L2 ONNX model should load")
            }
            None => {
                tracing::info!("No L2 ONNX model configured, using stub classifier");
                policy::layer2::classifier::Classifier::stub(
                    labels.clone(),
                    "uncertain".to_string(),
                )
            }
        });

        // Create BackgroundL2 for analytics enrichment
        let background_l2 = Some(policy::layer2::classifier::BackgroundL2::new(
            classifier.clone(),
            config.policy.l2_background_workers,
            config.policy.l2_queue_depth,
        ));
        tracing::info!(
            workers = config.policy.l2_background_workers,
            queue_depth = config.policy.l2_queue_depth,
            "Background L2 classifier initialized"
        );

        // Create ReviewQueueStore and ReviewQueue (L3)
        let review_store = Arc::new(
            policy::layer3::store::ReviewQueueStore::new(&config.policy.review_db_path)
                .expect("ReviewQueueStore should open"),
        );
        let review_queue = Arc::new(policy::layer3::queue::ReviewQueue::new(
            review_store,
            config.policy.l3_max_pending_reviews,
            Duration::from_secs(config.policy.l3_timeout_seconds),
        ));
        tracing::info!(
            max_pending = config.policy.l3_max_pending_reviews,
            timeout_secs = config.policy.l3_timeout_seconds,
            "L3 human review queue initialized"
        );

        // Create RedactionEngine (with default patterns for Phase 2)
        let redaction_engine = Arc::new(policy::redaction::RedactionEngine::empty());

        // No configured Rego policies yet (policies_dir may not exist)
        let policies: Vec<policy::config::PolicyConfig> = vec![];

        Arc::new(policy::PolicyPipeline::new(
            regorus_pool,
            allowlist_policy,
            classifier,
            background_l2,
            review_queue,
            redaction_engine,
            wasm_engine,
            policies,
        ))
    };

    tracing::info!("Policy pipeline initialized");

    let evidence_collector_addr = std::env::var("INTERDICT_EVIDENCE_COLLECTOR_ADDR")
        .unwrap_or_else(|_| "http://[::1]:50051".to_string());
    let full_text_storage = std::env::var("INTERDICT_EVIDENCE_FULL_TEXT_STORAGE")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);
    let kernel_id = uuid::Uuid::new_v4().to_string();
    let (evidence_buffer, evidence_flusher_handle) =
        evidence::EvidenceBuffer::new(evidence_collector_addr.clone(), kernel_id.clone());
    let evidence_buffer = Arc::new(evidence_buffer);

    tracing::info!(
        collector_addr = %evidence_collector_addr,
        full_text_storage,
        kernel_id = %kernel_id,
        "evidence pipeline initialized"
    );

    // 9. Build the Tower service stack
    //    Request flow: RequestIdLayer -> AllowlistLayer -> ProxyService
    let proxy_service = proxy::ProxyService::with_pipeline(
        cert_cache.clone(),
        pool.clone(),
        config.clone(),
        pipeline,
        evidence_buffer.clone(),
        full_text_storage,
    );

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

    drop(proxy_service);
    drop(evidence_buffer);

    match tokio::time::timeout(Duration::from_secs(2), evidence_flusher_handle).await {
        Ok(Ok(())) => tracing::info!("evidence flusher stopped"),
        Ok(Err(err)) => tracing::warn!(error = %err, "evidence flusher join failed"),
        Err(_) => tracing::warn!("evidence flusher shutdown timed out"),
    }

    Ok(())
}
