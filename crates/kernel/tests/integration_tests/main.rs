//! Integration tests for the Interdict kernel proxy.
//!
//! These tests validate end-to-end proxy behavior:
//! - CONNECT tunnel with TLS interception
//! - Vendor allowlist enforcement
//! - SSE streaming relay
//! - Connection pool under concurrent load
//! - Backpressure behavior
//! - Policy pipeline (Phase 2 success criteria)
//!
//! Each test creates its own isolated proxy instance with a test CA.

mod helpers;

mod allowlist;
mod backpressure;
mod connect_tunnel;
mod connection_pool;
mod policy_pipeline;
mod streaming;
