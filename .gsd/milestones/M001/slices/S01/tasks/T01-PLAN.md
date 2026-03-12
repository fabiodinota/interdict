# T01: Plan 01

**Slice:** S01 — **Milestone:** M001

## Description

Create the Rust workspace, kernel crate with all dependencies, configuration loading, TLS certificate infrastructure, vendor allowlist middleware, structured logging, and error types. This is the foundation every subsequent plan builds on.

Purpose: Establish the project skeleton with all critical infrastructure components that the proxy service, connection pool, and relay logic depend on. Getting TLS cert generation, config parsing, and allowlist enforcement correct here avoids rework in later plans.

Output: A compiling Rust workspace with kernel crate, config loading from TOML, TLS cert cache with on-demand generation, vendor allowlist as Tower middleware, structured JSON logging, and jemalloc allocator.
