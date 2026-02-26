//! Proxy infrastructure for the Interdict kernel.
//!
//! This module contains TLS certificate management, connection tunneling,
//! bidirectional relay, connection pooling, and WebSocket support.

pub mod connect;
pub mod pool;
pub mod relay;
pub mod tls;
pub mod websocket;

pub use connect::ProxyService;
