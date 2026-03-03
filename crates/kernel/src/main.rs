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
    let wasm_engine = Arc::new(
        policy::wasm_engine::WasmEngine::new(&config.policy)
            .expect("WasmEngine creation should succeed"),
    );
    tracing::info!("Wasmtime engine with pooling allocator initialized");

    let pipeline = {
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
            wasm_engine.clone(),
            policies,
        ))
    };

    tracing::info!("Policy pipeline initialized");

    // Phase 6.1 INT-01: Wire ContentInspector into ProxyService
    let pattern_registry = Arc::new(policy::patterns::PatternRegistry {
        patterns: policy::patterns::default::default_patterns(),
        version: 1,
    });
    let content_redactor = Arc::new(policy::redaction::RedactionEngine::empty());
    let content_policy_config = Arc::new(policy::config::PolicyConfig {
        id: "builtin:content_inspection".to_string(),
        name: "Content Inspection".to_string(),
        rego_source: None,
        entrypoint: None,
        fail_mode: policy::config::FailMode::FailClosed,
        block_response_detail: policy::config::BlockResponseDetail::Opaque,
        redaction_direction: policy::config::RedactionDirection::Both,
        background_l2: false,
        enabled: true,
    });
    let content_inspector = Arc::new(policy::content_inspection::ContentInspector::new(
        pattern_registry,
        content_redactor,
        content_policy_config,
    ));
    tracing::info!("content inspector initialized with default patterns");

    // 8c. Initialize PolicySetManager with empty initial set (Phase 6)
    let initial_policy_set = policy::hot_reload::PolicySet {
        regorus_pool: Arc::new(policy::layer1::regorus::RegorusPool::new(
            &regorus::Engine::new(),
            1,
        )),
        wasm_engine: wasm_engine.clone(),
        hierarchy: policy::hierarchy::HierarchyResolver::new(vec![]),
        policies: vec![],
        version: 0,
        content_hashes: std::collections::HashMap::new(),
    };
    let policy_set_manager = Arc::new(policy::hot_reload::PolicySetManager::new(
        initial_policy_set,
    ));

    tracing::info!("PolicySetManager initialized (version 0, empty)");

    // 8d. Initialize SessionStore (Phase 6)
    let dist_config = &config.policy.distribution;
    let session_config = policy::session::SessionConfig {
        max_sessions: dist_config.session_max_entries,
        session_ttl: Duration::from_secs(dist_config.session_ttl_secs),
        cleanup_interval: Duration::from_secs(dist_config.session_cleanup_interval_secs),
        ..policy::session::SessionConfig::default()
    };
    let session_store = Arc::new(policy::session::SessionStore::new(session_config));

    tracing::info!(
        max_sessions = dist_config.session_max_entries,
        ttl_secs = dist_config.session_ttl_secs,
        cleanup_interval_secs = dist_config.session_cleanup_interval_secs,
        "session store initialized"
    );

    let evidence_collector_addr = std::env::var("INTERDICT_EVIDENCE_COLLECTOR_ADDR")
        .unwrap_or_else(|_| "http://[::1]:50051".to_string());
    let full_text_storage = std::env::var("INTERDICT_EVIDENCE_FULL_TEXT_STORAGE")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);
    let kernel_id = dist_config
        .kernel_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    // Load mTLS cert material if configured (env vars set by Docker Compose cert-init)
    let mtls_certs = if let (Ok(ca_path), Ok(cert_path), Ok(key_path)) = (
        std::env::var("KERNEL_MTLS_CA_CERT"),
        std::env::var("KERNEL_MTLS_CLIENT_CERT"),
        std::env::var("KERNEL_MTLS_CLIENT_KEY"),
    ) {
        let ca = std::fs::read(&ca_path)
            .unwrap_or_else(|e| panic!("failed to read mTLS CA cert {ca_path}: {e}"));
        let cert = std::fs::read(&cert_path)
            .unwrap_or_else(|e| panic!("failed to read mTLS client cert {cert_path}: {e}"));
        let key = std::fs::read(&key_path)
            .unwrap_or_else(|e| panic!("failed to read mTLS client key {key_path}: {e}"));

        tracing::info!(
            ca_cert = %ca_path,
            client_cert = %cert_path,
            "mTLS enabled for gRPC clients"
        );

        Some(evidence::MtlsCerts {
            ca_cert: ca,
            client_cert: cert,
            client_key: key,
        })
    } else {
        tracing::info!("mTLS not configured for gRPC clients (KERNEL_MTLS_CA_CERT not set)");
        None
    };

    let (evidence_buffer, evidence_flusher_handle) =
        evidence::EvidenceBuffer::new(evidence_collector_addr.clone(), kernel_id.clone(), mtls_certs.clone());
    let evidence_buffer = Arc::new(evidence_buffer);

    tracing::info!(
        collector_addr = %evidence_collector_addr,
        full_text_storage,
        kernel_id = %kernel_id,
        "evidence pipeline initialized"
    );

    // 8e. Spawn distribution client if configured (Phase 6)
    let cancel_token = tokio_util::sync::CancellationToken::new();
    let distribution_handle = if let Some(ref distribution_addr) = dist_config.distribution_addr {
        let hierarchy_config = policy::hierarchy::HierarchyConfig {
            org_id: dist_config.org_id.clone(),
            dept_id: dist_config.dept_id.clone(),
            team_id: dist_config.team_id.clone(),
        };

        let mut client = policy::distribution::client::DistributionClient::new(
            distribution_addr.clone(),
            kernel_id.clone(),
            hierarchy_config,
            policy_set_manager.clone(),
            wasm_engine.clone(),
            Duration::from_secs(dist_config.disconnect_timeout_secs),
            dist_config.disconnect_mode.clone(),
            cancel_token.clone(),
        );

        if let Some(ref certs) = mtls_certs {
            client = client.with_mtls(
                certs.ca_cert.clone(),
                certs.client_cert.clone(),
                certs.client_key.clone(),
            );
        }

        let handle = client.run();
        tracing::info!(
            addr = %distribution_addr,
            org_id = %dist_config.org_id,
            "distribution client active, subscribing to policy updates"
        );
        Some(handle)
    } else {
        tracing::info!(
            "no distribution_addr configured, running in standalone mode (static policies)"
        );
        None
    };

    // 8f. Spawn session cleanup background task (Phase 6)
    // KERN-13: bounded timer, respects shutdown signal
    let session_cleanup_cancel = cancel_token.clone();
    let session_store_cleanup = session_store.clone();
    let cleanup_interval = Duration::from_secs(dist_config.session_cleanup_interval_secs);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(cleanup_interval);
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    session_store_cleanup.cleanup_expired();
                }
                _ = session_cleanup_cancel.cancelled() => {
                    tracing::debug!("session cleanup task shutting down");
                    break;
                }
            }
        }
    });

    tracing::info!(
        interval_secs = dist_config.session_cleanup_interval_secs,
        "session cleanup background task started"
    );

    // 9. Build the Tower service stack
    //    Request flow: RequestIdLayer -> AllowlistLayer -> ProxyService
    let proxy_service = proxy::ProxyService::with_distribution(
        cert_cache.clone(),
        pool.clone(),
        config.clone(),
        pipeline,
        evidence_buffer.clone(),
        full_text_storage,
        Some(policy_set_manager),
        Some(session_store),
    )
    .with_content_inspector(content_inspector);

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

    // Stop distribution client and session cleanup (Phase 6)
    cancel_token.cancel();
    if let Some(handle) = distribution_handle {
        match tokio::time::timeout(Duration::from_secs(5), handle).await {
            Ok(Ok(())) => tracing::info!("distribution client stopped"),
            Ok(Err(err)) => tracing::warn!(error = %err, "distribution client join failed"),
            Err(_) => tracing::warn!("distribution client shutdown timed out"),
        }
    }

    drop(proxy_service);
    drop(evidence_buffer);

    match tokio::time::timeout(Duration::from_secs(2), evidence_flusher_handle).await {
        Ok(Ok(())) => tracing::info!("evidence flusher stopped"),
        Ok(Err(err)) => tracing::warn!(error = %err, "evidence flusher join failed"),
        Err(_) => tracing::warn!("evidence flusher shutdown timed out"),
    }

    Ok(())
}
