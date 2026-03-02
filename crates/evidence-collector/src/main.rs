use std::sync::Arc;

use anyhow::Result;
use chrono::{Timelike, Utc};
use evidence_collector::chain::hasher::ChainManager;
use evidence_collector::config::{CollectorConfig, SigningMode};
use evidence_collector::grpc::proto::evidence_collector_server::EvidenceCollectorServer;
use evidence_collector::grpc::service::EvidenceCollectorService;
use evidence_collector::merkle::builder::{self, HourlyMerkleBuilder};
use evidence_collector::signing::{KmsSigningProvider, LocalSigningProvider, SigningProvider};
use evidence_collector::storage::clickhouse::ClickHouseWriter;
use evidence_collector::storage::s3::S3Anchor;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use tonic::transport::Server;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let cfg = CollectorConfig::from_env();

    info!(
        grpc_listen_addr = %cfg.grpc_listen_addr,
        clickhouse_url = %cfg.clickhouse_url,
        s3_bucket = %cfg.s3_bucket,
        signing_mode = ?cfg.signing_mode,
        "interdict-collector starting"
    );

    // Initialize signing provider based on config.
    let signing_provider: Arc<dyn SigningProvider> = match &cfg.signing_mode {
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

    // Initialize chain manager for per-kernel hash linkage.
    let chain_manager = Arc::new(Mutex::new(ChainManager::new()));

    // Initialize ClickHouse batched writer (runs DDL on startup).
    let clickhouse_writer =
        Arc::new(ClickHouseWriter::new(&cfg.clickhouse_url, &cfg.clickhouse_database).await?);

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
            S3Anchor::new(&cfg.s3_bucket, &cfg.s3_region, cfg.retention_days).await?,
        ))
    } else {
        info!("S3 bucket not configured; merkle anchoring disabled (dev mode)");
        None
    };

    // Merkle overflow channel for sub-hourly rotation.
    let (overflow_tx, overflow_rx) = mpsc::channel::<()>(1);

    // Cancellation token for graceful shutdown.
    let cancel = CancellationToken::new();

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
    Server::builder()
        .add_service(EvidenceCollectorServer::new(service))
        .serve_with_shutdown(grpc_addr, async move {
            tokio::signal::ctrl_c()
                .await
                .expect("install ctrl+c handler");
            info!("shutdown signal received; draining connections");
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
