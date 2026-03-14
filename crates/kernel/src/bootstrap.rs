//! Kernel bootstrapping — initializes all subsystems before the accept loop.
//!
//! Extracted from main.rs to improve readability and make initialization testable.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use tokio_util::sync::CancellationToken;

use crate::config::{self, Config, DistributionConfig};
use crate::evidence::{EvidenceBuffer, MtlsCerts};
use crate::logging;
use crate::middleware;
use crate::policy;
use crate::proxy;

/// All shared state produced by bootstrapping, consumed by the accept loop.
pub struct BootstrapResult {
    pub config: Arc<Config>,
    pub allowlist: Arc<middleware::allowlist::VendorAllowlist>,
    pub proxy_service: proxy::ProxyService,
    pub evidence_buffer: Arc<EvidenceBuffer>,
    pub evidence_flusher_handle: tokio::task::JoinHandle<()>,
    pub cancel_token: CancellationToken,
    pub distribution_handle: Option<tokio::task::JoinHandle<()>>,
}

/// Run all kernel initialisation and return the assembled proxy service.
pub async fn bootstrap(config_path: &str) -> anyhow::Result<BootstrapResult> {
    // Load and validate configuration (fail-closed on errors)
    let config = config::load(config_path)?;

    // Initialize structured logging
    logging::init(&config.logging);

    tracing::info!(config_path = %config_path, "configuration loaded");

    // Load CA certificate and key for TLS interception
    let (ca_cert, ca_key) = proxy::tls::load_ca(&config.tls)?;
    tracing::info!("CA certificate loaded for TLS interception");

    // Create TLS certificate cache and pre-warm for all allowlist vendors
    let cert_cache = Arc::new(proxy::tls::CertCache::new(ca_cert, ca_key));
    cert_cache.pre_warm(&config.allowlist.vendors).await?;

    // Create vendor allowlist from configuration
    let allowlist = Arc::new(middleware::allowlist::VendorAllowlist::from_config(
        &config.allowlist,
    ));
    tracing::info!(
        vendor_count = config.allowlist.vendors.len(),
        "vendor allowlist loaded"
    );

    // Create connection pool
    let connect_timeout = Duration::from_millis(config.proxy.connect_timeout_ms);
    let pool = Arc::new(proxy::pool::ConnectionPool::new(
        &config.pool,
        connect_timeout,
    ));

    let config = Arc::new(config);

    // Initialize Policy Pipeline
    let wasm_engine = Arc::new(
        policy::wasm_engine::WasmEngine::new(&config.policy)
            .context("failed to initialize WasmEngine")?,
    );
    tracing::info!("Wasmtime engine with pooling allocator initialized");

    let pipeline = build_policy_pipeline(&config, &wasm_engine)?;
    tracing::info!("Policy pipeline initialized");

    // Wire ContentInspector
    let content_inspector = build_content_inspector()?;
    tracing::info!("content inspector initialized with default patterns");

    // Initialize PolicySetManager with empty initial set
    let initial_policy_set = policy::hot_reload::PolicySet {
        regorus_pool: Arc::new(policy::layer1::regorus::RegorusPool::new(
            &regorus::Engine::new(),
            1,
        )),
        wasm_engine: wasm_engine.clone(),
        hierarchy: policy::hierarchy::HierarchyResolver::new(vec![]),
        policies: vec![],
        version: 0,
        content_hashes: HashMap::new(),
    };
    let policy_set_manager = Arc::new(policy::hot_reload::PolicySetManager::new(
        initial_policy_set,
    ));
    tracing::info!("PolicySetManager initialized (version 0, empty)");

    // Initialize SessionStore
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

    // Initialize evidence pipeline
    let (evidence_buffer, evidence_flusher_handle, kernel_id, mtls_certs) =
        init_evidence_pipeline(dist_config).await?;
    let evidence_buffer = Arc::new(evidence_buffer);

    // Spawn distribution client if configured
    let cancel_token = CancellationToken::new();
    let distribution_handle = spawn_distribution_client(
        dist_config,
        &kernel_id,
        &mtls_certs,
        &policy_set_manager,
        &wasm_engine,
        cancel_token.clone(),
    )?;

    // Spawn session cleanup background task (KERN-13: bounded timer)
    spawn_session_cleanup(
        session_store.clone(),
        Duration::from_secs(dist_config.session_cleanup_interval_secs),
        cancel_token.clone(),
    );
    tracing::info!(
        interval_secs = dist_config.session_cleanup_interval_secs,
        "session cleanup background task started"
    );

    // Build the proxy service
    let mut proxy_service = proxy::ProxyService::with_distribution(
        cert_cache.clone(),
        pool.clone(),
        config.clone(),
        pipeline,
        evidence_buffer.clone(),
        std::env::var("INTERDICT_EVIDENCE_FULL_TEXT_STORAGE")
            .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false),
        Some(policy_set_manager),
        Some(session_store),
    )
    .with_content_inspector(content_inspector);

    // Enable high-assurance evidence delivery enforcement when fail_closed
    if dist_config.disconnect_mode == "fail_closed" {
        let health = evidence_buffer.health().clone();
        proxy_service = proxy_service.with_high_assurance(health);
        tracing::info!("high-assurance evidence delivery enforcement enabled (fail_closed mode)");
    }

    Ok(BootstrapResult {
        config,
        allowlist,
        proxy_service,
        evidence_buffer,
        evidence_flusher_handle,
        cancel_token,
        distribution_handle,
    })
}

fn build_policy_pipeline(
    config: &Arc<Config>,
    wasm_engine: &Arc<policy::wasm_engine::WasmEngine>,
) -> anyhow::Result<Arc<policy::PolicyPipeline>> {
    let regorus_template = regorus::Engine::new();
    let regorus_pool = Arc::new(policy::layer1::regorus::RegorusPool::new(
        &regorus_template,
        config.policy.regorus_pool_size,
    ));
    tracing::info!(
        pool_size = config.policy.regorus_pool_size,
        "Regorus engine pool initialized"
    );

    let allowlist_policy = Arc::new(policy::layer1::allowlist::VendorAllowlistPolicy::new(
        Arc::new(middleware::allowlist::VendorAllowlist::from_config(
            &config.allowlist,
        )),
    ));

    let labels = vec![
        "allow".to_string(),
        "block".to_string(),
        "redact".to_string(),
        "uncertain".to_string(),
    ];
    let classifier = Arc::new(match &config.policy.l2_model_path {
        Some(model_path) => {
            policy::layer2::classifier::Classifier::load(model_path, labels.clone())
                .with_context(|| format!("failed to load L2 ONNX model from {model_path}"))?
        }
        None => {
            tracing::info!("No L2 ONNX model configured, using stub classifier");
            policy::layer2::classifier::Classifier::stub(labels.clone(), "uncertain".to_string())
        }
    });

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

    let review_store = Arc::new(
        policy::layer3::store::ReviewQueueStore::new(&config.policy.review_db_path).with_context(
            || {
                format!(
                    "failed to open review queue store at {}",
                    config.policy.review_db_path
                )
            },
        )?,
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

    let redaction_engine = Arc::new(policy::redaction::RedactionEngine::empty());
    let policies: Vec<policy::config::PolicyConfig> = vec![];

    Ok(Arc::new(policy::PolicyPipeline::new(
        regorus_pool,
        allowlist_policy,
        classifier,
        background_l2,
        review_queue,
        redaction_engine,
        wasm_engine.clone(),
        policies,
    )))
}

fn build_content_inspector() -> anyhow::Result<Arc<policy::content_inspection::ContentInspector>> {
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
    Ok(Arc::new(
        policy::content_inspection::ContentInspector::new(
            pattern_registry,
            content_redactor,
            content_policy_config,
        )
        .context("failed to initialize content inspector")?,
    ))
}

async fn init_evidence_pipeline(
    dist_config: &DistributionConfig,
) -> anyhow::Result<(
    EvidenceBuffer,
    tokio::task::JoinHandle<()>,
    String,
    Option<MtlsCerts>,
)> {
    let evidence_collector_addr = match std::env::var("KERNEL_EVIDENCE_COLLECTOR_ADDR")
        .or_else(|_| std::env::var("INTERDICT_EVIDENCE_COLLECTOR_ADDR"))
    {
        Ok(addr) => addr,
        Err(_) => {
            #[cfg(debug_assertions)]
            {
                "http://[::1]:50051".to_string()
            }
            #[cfg(not(debug_assertions))]
            {
                return Err(anyhow::anyhow!(
                    "KERNEL_EVIDENCE_COLLECTOR_ADDR must be set in release builds"
                ));
            }
        }
    };

    let full_text_storage = std::env::var("INTERDICT_EVIDENCE_FULL_TEXT_STORAGE")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);

    let kernel_id = dist_config
        .kernel_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Load mTLS cert material if configured
    let mtls_certs = if let (Ok(ca_path), Ok(cert_path), Ok(key_path)) = (
        std::env::var("KERNEL_MTLS_CA_CERT"),
        std::env::var("KERNEL_MTLS_CLIENT_CERT"),
        std::env::var("KERNEL_MTLS_CLIENT_KEY"),
    ) {
        let ca = tokio::fs::read(&ca_path)
            .await
            .with_context(|| format!("failed to read mTLS CA cert {ca_path}"))?;
        let cert = tokio::fs::read(&cert_path)
            .await
            .with_context(|| format!("failed to read mTLS client cert {cert_path}"))?;
        let key = tokio::fs::read(&key_path)
            .await
            .with_context(|| format!("failed to read mTLS client key {key_path}"))?;

        tracing::info!(
            ca_cert = %ca_path,
            client_cert = %cert_path,
            "mTLS enabled for gRPC clients"
        );

        Some(MtlsCerts {
            ca_cert: ca,
            client_cert: cert,
            client_key: key,
        })
    } else {
        tracing::info!("mTLS not configured for gRPC clients (KERNEL_MTLS_CA_CERT not set)");
        None
    };

    #[cfg(not(debug_assertions))]
    {
        if !evidence_collector_addr.starts_with("https://") {
            return Err(anyhow::anyhow!(
                "INTERDICT_EVIDENCE_COLLECTOR_ADDR must use https:// in release builds"
            ));
        }

        if mtls_certs.is_none() {
            return Err(anyhow::anyhow!(
                "KERNEL_MTLS_CA_CERT, KERNEL_MTLS_CLIENT_CERT, and KERNEL_MTLS_CLIENT_KEY must be set in release builds"
            ));
        }
    }

    let (evidence_buffer, evidence_flusher_handle) = EvidenceBuffer::new(
        evidence_collector_addr.clone(),
        kernel_id.clone(),
        mtls_certs.clone(),
    );

    tracing::info!(
        collector_addr = %evidence_collector_addr,
        full_text_storage,
        kernel_id = %kernel_id,
        "evidence pipeline initialized"
    );

    Ok((
        evidence_buffer,
        evidence_flusher_handle,
        kernel_id,
        mtls_certs,
    ))
}

fn spawn_distribution_client(
    dist_config: &DistributionConfig,
    kernel_id: &str,
    mtls_certs: &Option<MtlsCerts>,
    policy_set_manager: &Arc<policy::hot_reload::PolicySetManager>,
    wasm_engine: &Arc<policy::wasm_engine::WasmEngine>,
    cancel_token: CancellationToken,
) -> anyhow::Result<Option<tokio::task::JoinHandle<()>>> {
    if let Some(ref distribution_addr) = dist_config.distribution_addr {
        let hierarchy_config = policy::hierarchy::HierarchyConfig {
            org_id: dist_config.org_id.clone(),
            dept_id: dist_config.dept_id.clone(),
            team_id: dist_config.team_id.clone(),
        };

        let mut client = policy::distribution::client::DistributionClient::new(
            distribution_addr.clone(),
            kernel_id.to_string(),
            hierarchy_config,
            policy_set_manager.clone(),
            wasm_engine.clone(),
            Duration::from_secs(dist_config.disconnect_timeout_secs),
            dist_config.disconnect_mode.clone(),
            cancel_token,
        );

        if let Some(certs) = mtls_certs {
            client = client.with_mtls(
                certs.ca_cert.clone(),
                certs.client_cert.clone(),
                certs.client_key.clone(),
                dist_config.tls_server_name.clone().context(
                    "distribution TLS server name must be configured when mTLS is enabled",
                )?,
            );
        }

        let handle = client.run();
        tracing::info!(
            addr = %distribution_addr,
            org_id = %dist_config.org_id,
            "distribution client active, subscribing to policy updates"
        );
        Ok(Some(handle))
    } else {
        tracing::info!(
            "no distribution_addr configured, running in standalone mode (static policies)"
        );
        Ok(None)
    }
}

fn spawn_session_cleanup(
    session_store: Arc<policy::session::SessionStore>,
    cleanup_interval: Duration,
    cancel_token: CancellationToken,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(cleanup_interval);
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    session_store.cleanup_expired();
                }
                _ = cancel_token.cancelled() => {
                    tracing::debug!("session cleanup task shutting down");
                    break;
                }
            }
        }
    });
}
