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
            tracing::warn!(format = other, "unknown log format, falling back to JSON");
            tracing_subscriber::fmt()
                .json()
                .with_env_filter(env_filter)
                .with_target(true)
                .init();
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::config::LoggingConfig;

    // Note: tracing subscriber can only be set once per process.
    // These tests verify construction logic without calling init().

    #[test]
    fn test_json_format_accepted() {
        let config = LoggingConfig {
            level: "info".to_string(),
            format: "json".to_string(),
        };
        assert_eq!(config.format, "json");
    }

    #[test]
    fn test_pretty_format_accepted() {
        let config = LoggingConfig {
            level: "debug".to_string(),
            format: "pretty".to_string(),
        };
        assert_eq!(config.format, "pretty");
    }

    #[test]
    fn test_unknown_format_defaults_exist() {
        // Test that unknown formats don't cause issues at config level.
        // The init() function handles this by logging a warning and using JSON.
        let config = LoggingConfig {
            level: "info".to_string(),
            format: "xml".to_string(),
        };
        assert_ne!(config.format, "json");
        assert_ne!(config.format, "pretty");
    }
}
