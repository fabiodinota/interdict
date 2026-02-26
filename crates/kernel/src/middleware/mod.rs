//! Tower middleware layers for the Interdict kernel proxy.
//!
//! Middleware is applied in order: request ID -> allowlist -> (future: timeout, metrics).

pub mod allowlist;
pub mod request_id;
