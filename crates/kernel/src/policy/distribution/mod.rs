//! Distribution client for receiving policy updates from the control plane.
//!
//! Contains the gRPC streaming client that subscribes to policy updates
//! and drives hot-reload via `PolicySetManager::swap()`.
//!
//! Module structure:
//! - `client`: gRPC streaming client with reconnect loop and exponential backoff
//! - `snapshot`: Snapshot/delta processing that builds PolicySet from updates

pub mod client;
pub mod snapshot;

/// Generated gRPC types from the policy distribution proto.
pub mod proto {
    tonic::include_proto!("interdict.policy.v1");
}
