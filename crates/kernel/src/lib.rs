//! Interdict Kernel Proxy Library
//!
//! AI governance kernel that intercepts, inspects, and enforces policy on
//! all outbound AI traffic. This library crate exposes all proxy components
//! for use by the binary entry point and tests.
//!
//! KERN-13: All channels in this project MUST be bounded. Zero unbounded_channel() allowed.

pub mod config;
pub mod error;
pub mod logging;
pub mod middleware;
pub mod proxy;
