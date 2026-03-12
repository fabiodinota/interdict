# S01: Kernel Proxy Foundation

**Goal:** Create the Rust workspace, kernel crate with all dependencies, configuration loading, TLS certificate infrastructure, vendor allowlist middleware, structured logging, and error types.
**Demo:** Create the Rust workspace, kernel crate with all dependencies, configuration loading, TLS certificate infrastructure, vendor allowlist middleware, structured logging, and error types.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Create the Rust workspace, kernel crate with all dependencies, configuration loading, TLS certificate infrastructure, vendor allowlist middleware, structured logging, and error types. This is the foundation every subsequent plan builds on.

Purpose: Establish the project skeleton with all critical infrastructure components that the proxy service, connection pool, and relay logic depend on. Getting TLS cert generation, config parsing, and allowlist enforcement correct here avoids rework in later plans.

Output: A compiling Rust workspace with kernel crate, config loading from TOML, TLS cert cache with on-demand generation, vendor allowlist as Tower middleware, structured JSON logging, and jemalloc allocator.
- [x] **T02: Plan 02**
  - Implement the core proxy service: CONNECT tunnel handling with TLS interception, zero-copy bidirectional relay, custom HTTP/2 connection pool with multiple connections per vendor, WebSocket upgrade and relay, and the main server accept loop. This is the hot-path data plane -- every proxied AI request flows through these components.

Purpose: This plan delivers the actual proxy functionality that intercepts, inspects (in later phases), and relays AI traffic. It is the core of the kernel and must be streaming-first with zero full-body buffering.

Output: A running proxy binary that accepts HTTP CONNECT requests, terminates TLS, relays bytes to upstream AI vendors via a multi-connection HTTP/2 pool, handles WebSocket upgrades, and returns structured errors on failure.
- [x] **T03: Plan 03**
  - Validate that the kernel proxy meets all Phase 1 success criteria through comprehensive integration tests and performance benchmarks. Tests prove correctness of CONNECT tunneling, vendor blocking, streaming relay, connection pooling, and backpressure. Benchmarks prove the proxy meets <10ms p99 latency (KERN-07), >10k RPS throughput (KERN-08), and <128MB memory (KERN-09).

Purpose: Without these tests and benchmarks, the proxy success criteria from the roadmap are unverified claims. Integration tests catch bugs that unit tests miss (TLS handshake flows, HTTP/2 negotiation, streaming behavior). Benchmarks establish the performance baseline and catch regressions.

Output: A comprehensive integration test suite using wiremock for mock AI vendors, and criterion benchmarks measuring latency, throughput, and memory usage.

## Files Likely Touched

