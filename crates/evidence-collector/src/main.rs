mod config;
// mod chain; // Plan 04-02
// mod signing; // Plan 04-02
// mod grpc; // Plan 04-02
// mod merkle; // Plan 04-02
// mod storage; // Plan 04-02

use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    info!("interdict-collector starting (scaffold)");
    Ok(())
}
