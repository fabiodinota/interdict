use std::sync::Arc;

use anyhow::{Context, Result};
use chrono::{Timelike, Utc};
use evidence_collector::chain::hasher::ChainManager;
use evidence_collector::config::{CollectorConfig, SigningMode};
use evidence_collector::grpc::proto::evidence_collector_server::EvidenceCollectorServer;
use evidence_collector::grpc::service::EvidenceCollectorService;
use evidence_collector::merkle::builder::{self, HourlyMerkleBuilder};
use evidence_collector::signing::{
    KmsSigningProvider, LocalSigningProvider, RotatingSigningProvider, SigningProvider,
};
use evidence_collector::storage::clickhouse::ClickHouseWriter;
use evidence_collector::storage::s3::S3Anchor;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use tonic::transport::Server;
use tonic::transport::server::ServerTlsConfig;
use tonic::transport::{Certificate, Identity};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let cfg = CollectorConfig::from_env()?;
    let redacted_clickhouse_url = redact_url_credentials(&cfg.clickhouse_url);

    #[cfg(not(debug_assertions))]
    if !cfg.mtls_enabled {
        return Err(anyhow::anyhow!(
            "MTLS_ENABLED must be true for evidence collector in release builds"
        ));
    }

    info!(
        grpc_listen_addr = %cfg.grpc_listen_addr,
        clickhouse_url = %redacted_clickhouse_url,
        s3_bucket = %cfg.s3_bucket,
        signing_mode = ?cfg.signing_mode,
        "interdict-collector starting"
    );

    // Initialize signing provider based on config, wrapped in RotatingSigningProvider
    // for hot-reload support.
    let inner_provider: Arc<dyn SigningProvider> = match &cfg.signing_mode {
        SigningMode::Dev => {
            info!("using ephemeral dev signing key (NOT for production)");
            Arc::new(LocalSigningProvider::generate())
        }
        SigningMode::File(path) => {
            info!(path = %path.display(), "loading signing key from file");
            Arc::new(LocalSigningProvider::from_file(path)?)
        }
        SigningMode::Kms(key_id) => {
            info!(key_id = %key_id, "initializing KMS signing provider");
            Arc::new(KmsSigningProvider::new(key_id.clone()).await?)
        }
    };

    let signing_provider = Arc::new(RotatingSigningProvider::new(inner_provider));

    // Initialize chain manager for per-kernel hash linkage.
    let chain_manager = Arc::new(Mutex::new(ChainManager::new()));

    // Initialize ClickHouse batched writer (runs DDL on startup).
    let clickhouse_writer = Arc::new(
        ClickHouseWriter::new(
            &cfg.clickhouse_url,
            &cfg.clickhouse_database,
            &cfg.clickhouse_user,
            &cfg.clickhouse_password,
        )
        .await?,
    );

    // Initialize hourly Merkle builder.
    let current_hour = Utc::now()
        .with_minute(0)
        .and_then(|dt| dt.with_second(0))
        .and_then(|dt| dt.with_nanosecond(0))
        .unwrap_or_else(Utc::now);

    let merkle_builder = Arc::new(Mutex::new(HourlyMerkleBuilder::new(
        current_hour,
        cfg.merkle_max_leaves as usize,
    )));

    // Initialize S3 anchor if bucket is configured.
    let s3_anchor = if !cfg.s3_bucket.is_empty() {
        Some(Arc::new(
            S3Anchor::new(
                &cfg.s3_bucket,
                &cfg.s3_region,
                cfg.retention_days,
                cfg.require_object_lock,
            )
            .await?,
        ))
    } else {
        info!("S3 bucket not configured; merkle anchoring disabled (dev mode)");
        None
    };

    // Merkle overflow channel for sub-hourly rotation.
    let (overflow_tx, overflow_rx) = mpsc::channel::<()>(1);

    // Cancellation token for graceful shutdown.
    let cancel = CancellationToken::new();

    // Spawn signing key file watcher if SIGNING_KEY_WATCH_PATH is set.
    if let Some(watch_path) = &cfg.signing_key_watch_path {
        let watcher_provider = Arc::clone(&signing_provider);
        let watcher_path = std::path::PathBuf::from(watch_path);
        let watcher_cancel = cancel.clone();
        info!(path = %watch_path, "starting signing key file watcher (30s poll interval)");
        tokio::spawn(async move {
            signing_key_watch_task(watcher_provider, watcher_path, watcher_cancel).await;
        });
    }

    // Spawn Merkle rotation background task.
    let rotation_cancel = cancel.clone();
    let rotation_builder = Arc::clone(&merkle_builder);
    let rotation_s3 = s3_anchor.clone();
    tokio::spawn(async move {
        builder::merkle_rotation_task(rotation_builder, rotation_s3, overflow_rx, rotation_cancel)
            .await;
    });

    // Build the gRPC service.
    let service = EvidenceCollectorService::new(
        chain_manager,
        signing_provider,
        clickhouse_writer.clone(),
        merkle_builder.clone(),
        Some(overflow_tx),
    );

    let grpc_addr = cfg.grpc_listen_addr.parse()?;
    info!(addr = %grpc_addr, "starting gRPC server");

    // Start gRPC server with graceful shutdown.
    let shutdown_cancel = cancel.clone();

    let mut builder = if cfg.mtls_enabled {
        let ca_cert_path = cfg
            .mtls_ca_cert_path
            .as_deref()
            .context("MTLS_CA_CERT_PATH required when MTLS_ENABLED=true")?;
        let cert_path = cfg
            .mtls_cert_path
            .as_deref()
            .context("MTLS_CERT_PATH required when MTLS_ENABLED=true")?;
        let key_path = cfg
            .mtls_key_path
            .as_deref()
            .context("MTLS_KEY_PATH required when MTLS_ENABLED=true")?;

        let ca_cert = tokio::fs::read_to_string(ca_cert_path)
            .await
            .with_context(|| format!("failed to read CA cert {ca_cert_path}"))?;
        let server_cert = tokio::fs::read_to_string(cert_path)
            .await
            .with_context(|| format!("failed to read server cert {cert_path}"))?;
        let server_key = tokio::fs::read_to_string(key_path)
            .await
            .with_context(|| format!("failed to read server key {key_path}"))?;

        let tls_config = ServerTlsConfig::new()
            .identity(Identity::from_pem(&server_cert, &server_key))
            .client_ca_root(Certificate::from_pem(&ca_cert));

        info!("mTLS enabled: requiring client certificates for gRPC connections");
        Server::builder()
            .tls_config(tls_config)
            .context("invalid mTLS configuration")?
    } else {
        info!("mTLS disabled: accepting insecure gRPC connections");
        Server::builder()
    };

    builder
        .add_service(EvidenceCollectorServer::new(service))
        .serve_with_shutdown(grpc_addr, async move {
            if let Err(error) = tokio::signal::ctrl_c().await {
                tracing::error!(error = %error, "failed to install ctrl+c handler");
            } else {
                info!("shutdown signal received; draining connections");
            }
            shutdown_cancel.cancel();
        })
        .await?;

    // Graceful shutdown: flush ClickHouse inserter.
    info!("flushing ClickHouse inserter");
    if let Err(error) = clickhouse_writer.flush().await {
        tracing::error!(error = %error, "failed to flush ClickHouse on shutdown");
    }

    // Final Merkle tree finalization is handled by the rotation task on cancel.

    info!("interdict-collector stopped");
    Ok(())
}

/// Polls a signing key file for changes and hot-reloads when the file is modified.
///
/// Checks the file's modification time every 30 seconds. On change, calls
/// `RotatingSigningProvider::reload_from_file` to atomically swap the active key.
/// Stops when the cancellation token is triggered.
async fn signing_key_watch_task(
    provider: Arc<RotatingSigningProvider>,
    key_path: std::path::PathBuf,
    cancel: CancellationToken,
) {
    use std::time::Duration;
    use tokio::time::interval;

    let mut poll = interval(Duration::from_secs(30));
    let mut last_mtime: Option<std::time::SystemTime> = None;

    // Record initial mtime if file exists.
    if let Ok(meta) = tokio::fs::metadata(&key_path).await {
        last_mtime = meta.modified().ok();
    }

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("signing key watcher stopping (shutdown)");
                break;
            }
            _ = poll.tick() => {
                match tokio::fs::metadata(&key_path).await {
                    Ok(meta) => {
                        let current_mtime = meta.modified().ok();
                        if current_mtime != last_mtime && last_mtime.is_some() {
                            info!(
                                path = %key_path.display(),
                                "signing key file changed, reloading"
                            );
                            let reload_provider = Arc::clone(&provider);
                            let reload_path = key_path.clone();
                            match tokio::task::spawn_blocking(move || {
                                reload_provider.reload_from_file(&reload_path)
                            }).await {
                                Ok(Ok(())) => {
                                    info!(
                                        new_key_id = %provider.current().key_id(),
                                        "signing key hot-reloaded successfully"
                                    );
                                }
                                Ok(Err(err)) => {
                                    tracing::error!(
                                        error = %err,
                                        path = %key_path.display(),
                                        "failed to reload signing key"
                                    );
                                }
                                Err(err) => {
                                    tracing::error!(
                                        error = %err,
                                        path = %key_path.display(),
                                        "signing key reload task failed"
                                    );
                                }
                            }
                        }
                        last_mtime = current_mtime;
                    }
                    Err(err) => {
                        tracing::warn!(
                            error = %err,
                            path = %key_path.display(),
                            "signing key watch file not accessible"
                        );
                    }
                }
            }
        }
    }
}

fn redact_url_credentials(url: &str) -> String {
    match url.split_once("://") {
        Some((scheme, remainder)) => match remainder.split_once('@') {
            Some((userinfo, host)) if userinfo.contains(':') => {
                format!("{scheme}://REDACTED:REDACTED@{host}")
            }
            Some((_userinfo, host)) => format!("{scheme}://REDACTED@{host}"),
            None => url.to_string(),
        },
        None => url.to_string(),
    }
}
