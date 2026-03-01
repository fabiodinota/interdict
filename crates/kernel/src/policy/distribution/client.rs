//! gRPC streaming client for policy distribution with reconnect and backoff.
//!
//! Subscribes to a control plane server-streaming RPC that pushes policy
//! updates in real-time (xDS-style). On stream drop, reconnects with
//! exponential backoff per gRPC spec (1s initial, 1.6x multiplier, 120s max, 20% jitter).
//!
//! Sends ACK on successful policy load, NACK on failure (preserving previous PolicySet).

use std::sync::Arc;
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tonic::transport::Endpoint;

use crate::policy::distribution::proto;
use crate::policy::distribution::proto::policy_distribution_client::PolicyDistributionClient;
use crate::policy::distribution::snapshot;
use crate::policy::hierarchy::HierarchyConfig;
use crate::policy::hot_reload::PolicySetManager;
use crate::policy::wasm_engine::WasmEngine;

/// gRPC backoff parameters per the gRPC connection backoff spec.
const INITIAL_BACKOFF_SECS: f64 = 1.0;
const BACKOFF_MULTIPLIER: f64 = 1.6;
const MAX_BACKOFF_SECS: f64 = 120.0;
const JITTER_FRACTION: f64 = 0.2;

/// Client that subscribes to policy updates from the control plane via gRPC
/// server-streaming and drives hot-reload through `PolicySetManager`.
pub struct DistributionClient {
    /// Control plane gRPC address.
    addr: String,
    /// Unique identifier for this kernel instance.
    kernel_id: String,
    /// Hierarchy context for policy resolution.
    hierarchy_config: HierarchyConfig,
    /// Shared policy set manager for atomic swaps.
    policy_set_manager: Arc<PolicySetManager>,
    /// Shared Wasmtime engine (config-stable, not rebuilt per update).
    wasm_engine: Arc<WasmEngine>,
    /// Timeout before triggering disconnect behavior.
    disconnect_timeout: Duration,
    /// Behavior on disconnect: "fail_closed" or "keep_last".
    #[allow(dead_code)]
    disconnect_mode: String,
    /// Token for graceful shutdown of the reconnect loop.
    cancel_token: CancellationToken,
}

impl DistributionClient {
    /// Create a new distribution client.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        addr: String,
        kernel_id: String,
        hierarchy_config: HierarchyConfig,
        policy_set_manager: Arc<PolicySetManager>,
        wasm_engine: Arc<WasmEngine>,
        disconnect_timeout: Duration,
        disconnect_mode: String,
        cancel_token: CancellationToken,
    ) -> Self {
        Self {
            addr,
            kernel_id,
            hierarchy_config,
            policy_set_manager,
            wasm_engine,
            disconnect_timeout,
            disconnect_mode,
            cancel_token,
        }
    }

    /// Spawn the reconnect loop as a background tokio task.
    ///
    /// Returns the JoinHandle for the spawned task. The loop runs until
    /// the cancellation token is triggered via `stop()`.
    pub fn run(self) -> JoinHandle<()> {
        tokio::spawn(async move {
            self.reconnect_loop().await;
        })
    }

    /// Cancel the reconnect loop for graceful shutdown.
    pub fn stop(&self) {
        self.cancel_token.cancel();
    }

    /// Main reconnect loop with exponential backoff.
    async fn reconnect_loop(&self) {
        let mut backoff_secs = INITIAL_BACKOFF_SECS;

        loop {
            // Check cancellation before attempting connection
            if self.cancel_token.is_cancelled() {
                tracing::info!("distribution client shutdown requested");
                break;
            }

            match self.connect_and_subscribe().await {
                Ok(stream) => {
                    // Reset backoff on successful connection
                    backoff_secs = INITIAL_BACKOFF_SECS;
                    tracing::info!(
                        addr = %self.addr,
                        "connected to policy distribution server"
                    );

                    // Process the stream until it drops or an error occurs
                    self.process_stream(stream).await;

                    tracing::warn!("policy distribution stream ended, will reconnect");
                }
                Err(e) => {
                    tracing::warn!(
                        error = %e,
                        addr = %self.addr,
                        "failed to connect to policy distribution server"
                    );
                }
            }

            // Check cancellation before sleeping
            if self.cancel_token.is_cancelled() {
                tracing::info!("distribution client shutdown requested");
                break;
            }

            // Exponential backoff with jitter
            let jitter = backoff_secs * JITTER_FRACTION * (2.0 * rand::random::<f64>() - 1.0);
            let sleep_secs = (backoff_secs + jitter).max(0.0);
            let sleep_duration = Duration::from_secs_f64(sleep_secs);

            tracing::debug!(
                backoff_secs = sleep_secs,
                "waiting before reconnect"
            );

            tokio::select! {
                _ = tokio::time::sleep(sleep_duration) => {}
                _ = self.cancel_token.cancelled() => {
                    tracing::info!("distribution client shutdown during backoff");
                    break;
                }
            }

            // Increase backoff for next iteration
            backoff_secs = (backoff_secs * BACKOFF_MULTIPLIER).min(MAX_BACKOFF_SECS);
        }
    }

    /// Connect to the control plane and subscribe to the policy update stream.
    async fn connect_and_subscribe(
        &self,
    ) -> anyhow::Result<tonic::Streaming<proto::PolicyUpdate>> {
        let endpoint = Endpoint::from_shared(self.addr.clone())?
            .connect_timeout(Duration::from_secs(5))
            .timeout(self.disconnect_timeout);

        let channel = endpoint.connect().await?;
        let mut client = PolicyDistributionClient::new(channel);

        let request = proto::SubscribeRequest {
            kernel_id: self.kernel_id.clone(),
            current_version: self.policy_set_manager.current_version(),
            org_id: self.hierarchy_config.org_id.clone(),
            dept_id: self.hierarchy_config.dept_id.clone().unwrap_or_default(),
            team_id: self.hierarchy_config.team_id.clone().unwrap_or_default(),
        };

        let response = client.subscribe(request).await?;
        Ok(response.into_inner())
    }

    /// Process the policy update stream until it drops or errors out.
    async fn process_stream(&self, mut stream: tonic::Streaming<proto::PolicyUpdate>) {
        use tokio_stream::StreamExt;

        while let Some(result) = stream.next().await {
            // Check cancellation
            if self.cancel_token.is_cancelled() {
                break;
            }

            match result {
                Ok(update) => {
                    self.handle_update(update).await;
                }
                Err(status) => {
                    tracing::warn!(
                        status_code = ?status.code(),
                        message = %status.message(),
                        "policy distribution stream error"
                    );
                    break;
                }
            }
        }
    }

    /// Handle a single policy update from the stream.
    async fn handle_update(&self, update: proto::PolicyUpdate) {
        let update_version = update.version;
        let update_type = proto::policy_update::UpdateType::try_from(update.r#type)
            .unwrap_or(proto::policy_update::UpdateType::FullSnapshot);

        tracing::info!(
            version = update_version,
            update_type = ?update_type,
            policy_count = update.policies.len(),
            removed_count = update.removed_policy_ids.len(),
            "received policy update"
        );

        let result = match update_type {
            proto::policy_update::UpdateType::FullSnapshot => {
                snapshot::apply_snapshot(
                    update.version,
                    &update.policies,
                    &self.wasm_engine,
                    &self.hierarchy_config,
                )
                .await
            }
            proto::policy_update::UpdateType::Delta => {
                let current = self.policy_set_manager.load();
                let delta_result = snapshot::apply_delta(
                    &current,
                    &update,
                    &self.wasm_engine,
                    &self.hierarchy_config,
                )
                .await;

                if let Err(ref e) = delta_result {
                    let err_msg = e.to_string();
                    if err_msg.contains("version gap") {
                        tracing::warn!(
                            "version gap detected, will reconnect for full snapshot"
                        );
                        // Send NACK for version gap
                        self.send_ack(update_version, false, &err_msg).await;
                        return;
                    }
                }

                delta_result
            }
        };

        match result {
            Ok(new_policy_set) => {
                let new_version = new_policy_set.version;
                let policy_count = new_policy_set.policies.len();
                self.policy_set_manager.swap(new_policy_set);

                tracing::info!(
                    version = new_version,
                    policies = policy_count,
                    "policy set swapped successfully"
                );

                // Send ACK
                self.send_ack(update_version, true, "").await;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    version = update_version,
                    "failed to apply policy update, keeping previous set"
                );

                // Send NACK
                self.send_ack(update_version, false, &e.to_string()).await;
            }
        }
    }

    /// Send ACK or NACK to the control plane.
    async fn send_ack(&self, version: u64, accepted: bool, error_message: &str) {
        let ack_result = async {
            let endpoint = Endpoint::from_shared(self.addr.clone())?;
            let channel = endpoint.connect().await?;
            let mut client = PolicyDistributionClient::new(channel);

            let request = proto::AckRequest {
                kernel_id: self.kernel_id.clone(),
                version,
                accepted,
                error_message: error_message.to_string(),
            };

            client.acknowledge(request).await?;
            Ok::<(), anyhow::Error>(())
        }
        .await;

        if let Err(e) = ack_result {
            tracing::debug!(
                error = %e,
                version = version,
                accepted = accepted,
                "failed to send ACK/NACK (non-fatal)"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::hot_reload::PolicySet;
    use std::collections::HashMap;

    fn test_wasm_engine() -> Arc<WasmEngine> {
        Arc::new(
            WasmEngine::new(&crate::config::PolicyEngineConfig::default())
                .expect("WasmEngine should create"),
        )
    }

    fn make_empty_policy_set(version: u64) -> PolicySet {
        use crate::policy::hierarchy::HierarchyResolver;
        use crate::policy::layer1::regorus::RegorusPool;

        let engine = regorus::Engine::new();
        let pool = Arc::new(RegorusPool::new(&engine, 1));
        let wasm = test_wasm_engine();
        let hierarchy = HierarchyResolver::new(vec![]);

        PolicySet {
            regorus_pool: pool,
            wasm_engine: wasm,
            hierarchy,
            policies: vec![],
            version,
            content_hashes: HashMap::new(),
        }
    }

    #[test]
    fn test_distribution_client_construction() {
        let wasm = test_wasm_engine();
        let manager = Arc::new(PolicySetManager::new(make_empty_policy_set(0)));
        let cancel = CancellationToken::new();

        let client = DistributionClient::new(
            "http://[::1]:50052".to_string(),
            "kernel-test".to_string(),
            HierarchyConfig {
                org_id: "test-org".to_string(),
                dept_id: None,
                team_id: None,
            },
            manager.clone(),
            wasm,
            Duration::from_secs(30),
            "fail_closed".to_string(),
            cancel.clone(),
        );

        assert_eq!(client.addr, "http://[::1]:50052");
        assert_eq!(client.kernel_id, "kernel-test");
        assert_eq!(client.disconnect_mode, "fail_closed");
    }

    #[test]
    fn test_distribution_client_stop_cancels_token() {
        let wasm = test_wasm_engine();
        let manager = Arc::new(PolicySetManager::new(make_empty_policy_set(0)));
        let cancel = CancellationToken::new();

        let client = DistributionClient::new(
            "http://[::1]:50052".to_string(),
            "kernel-test".to_string(),
            HierarchyConfig {
                org_id: "test-org".to_string(),
                dept_id: None,
                team_id: None,
            },
            manager,
            wasm,
            Duration::from_secs(30),
            "fail_closed".to_string(),
            cancel.clone(),
        );

        assert!(!cancel.is_cancelled());
        client.stop();
        assert!(cancel.is_cancelled());
    }

    #[test]
    fn test_backoff_constants_match_grpc_spec() {
        // gRPC spec: INITIAL_BACKOFF=1s, MULTIPLIER=1.6, MAX_BACKOFF=120s, JITTER=0.2
        assert_eq!(INITIAL_BACKOFF_SECS, 1.0);
        assert_eq!(BACKOFF_MULTIPLIER, 1.6);
        assert_eq!(MAX_BACKOFF_SECS, 120.0);
        assert_eq!(JITTER_FRACTION, 0.2);
    }

    #[tokio::test]
    async fn test_reconnect_loop_respects_cancellation() {
        let wasm = test_wasm_engine();
        let manager = Arc::new(PolicySetManager::new(make_empty_policy_set(0)));
        let cancel = CancellationToken::new();

        let client = DistributionClient::new(
            // Use invalid address so connect fails immediately
            "http://127.0.0.1:1".to_string(),
            "kernel-test".to_string(),
            HierarchyConfig {
                org_id: "test-org".to_string(),
                dept_id: None,
                team_id: None,
            },
            manager,
            wasm,
            Duration::from_secs(1),
            "fail_closed".to_string(),
            cancel.clone(),
        );

        // Cancel immediately
        cancel.cancel();

        // The reconnect loop should exit quickly
        let handle = client.run();
        let result = tokio::time::timeout(Duration::from_secs(5), handle).await;
        assert!(result.is_ok(), "reconnect loop should exit on cancellation");
    }
}
