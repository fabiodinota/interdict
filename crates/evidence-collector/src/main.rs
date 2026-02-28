// mod grpc; // Plan 04-02
// mod merkle; // Plan 04-02
// mod storage; // Plan 04-02

use evidence_collector::config::CollectorConfig;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let cfg = CollectorConfig::default();
    info!(
        grpc_listen_addr = %cfg.grpc_listen_addr,
        clickhouse_url = %cfg.clickhouse_url,
        "interdict-collector starting (scaffold)"
    );
    Ok(())
}
