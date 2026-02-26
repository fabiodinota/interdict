//! Structured logging initialization for the Interdict kernel proxy.
//!
//! Supports two output formats:
//! - `"json"`: Machine-readable JSON logs for production (stdout, container-friendly)
//! - `"pretty"`: Human-readable colored logs for development
//!
//! The log level can be overridden via the `RUST_LOG` environment variable.

use crate::config::LoggingConfig;

/// Initialize the tracing subscriber based on configuration.
///
/// Sets up structured logging with the configured format and level.
/// The `RUST_LOG` environment variable takes precedence over the config level.
///
/// # Panics
///
/// Panics if the tracing subscriber cannot be set (should only happen
/// if called more than once).
pub fn init(config: &LoggingConfig) {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&config.level));

    match config.format.as_str() {
        "json" => {
            tracing_subscriber::fmt()
                .json()
                .with_env_filter(env_filter)
                .with_target(true)
                .with_thread_ids(false)
                .with_thread_names(false)
                .init();
        }
        "pretty" => {
            tracing_subscriber::fmt()
                .pretty()
                .with_env_filter(env_filter)
                .with_target(true)
                .init();
        }
        other => {
            // Fall back to JSON for unknown formats (fail-closed: use most structured format)
            tracing::warn!(
                format = other,
                "unknown log format, falling back to JSON"
            );
            tracing_subscriber::fmt()
                .json()
                .with_env_filter(env_filter)
                .with_target(true)
                .init();
        }
    }
}
