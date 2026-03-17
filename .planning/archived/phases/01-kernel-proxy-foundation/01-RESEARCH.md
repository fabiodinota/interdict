# Phase 1: Kernel Proxy Foundation - Research

**Researched:** 2026-02-26
**Domain:** Rust explicit forward proxy with TLS interception, multi-protocol streaming, HTTP/2 connection pooling
**Confidence:** HIGH

## Summary

Phase 1 builds a streaming-first Rust forward proxy that intercepts outbound AI traffic via the HTTPS CONNECT method. Clients configure HTTP_PROXY/HTTPS_PROXY environment variables to route through the kernel. The proxy terminates incoming TLS using a deployment-unique CA (generating per-domain certificates on-the-fly with rcgen), inspects the cleartext traffic, then re-encrypts to the upstream AI vendor via rustls. Traffic is relayed as a zero-copy byte stream -- SSE tokens, gRPC frames, and WebSocket messages flow through without full-body buffering. A Tower middleware layer enforces a deny-by-default vendor allowlist against the CONNECT target hostname before any upstream connection is established.

The critical engineering challenges are: (1) streaming-first byte relay that never buffers full responses, (2) a custom HTTP/2 connection pool that maintains multiple TCP connections per AI vendor to avoid single-connection stream saturation, (3) bounded tokio channels on every internal communication path for backpressure, and (4) TLS certificate generation with caching so the per-domain signing cost is amortized to sub-millisecond after first request.

**Primary recommendation:** Build directly on hyper 1.x (not axum) for low-level CONNECT handling and connection lifecycle control, with Tower for composable middleware (allowlist, timeouts, metrics), rustls + rcgen for TLS interception, and tokio-tungstenite for WebSocket relay. Use DashMap for thread-safe certificate caching. Target <5ms p99 overhead by keeping the hot path zero-copy with `bytes::Bytes`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Explicit forward proxy -- clients configure HTTP_PROXY/HTTPS_PROXY environment variables
- Kernel handles CONNECT requests, terminates TLS to inspect, re-encrypts to vendor
- HTTPS CONNECT only -- no plaintext HTTP forwarding (all AI vendors use HTTPS)
- Single listening port with protocol auto-detection (HTTP/1.1, HTTP/2, gRPC, WebSocket negotiated on the same port)
- Deployment-unique CA certificate generated per deployment
- CA installed on client machines via onboarding script (Phase 10 handles the install UX)
- Kernel signs on-the-fly certificates for each AI vendor domain using the deployment CA
- Standard corporate proxy TLS inspection pattern
- Domain-based matching on CONNECT target hostname (e.g., api.openai.com, api.anthropic.com)
- Deny-by-default -- only vendors explicitly on the allowlist can be reached; everything else is blocked
- Blocked requests receive HTTP 403 Forbidden with structured JSON body: `{"error": "vendor_blocked", "vendor": "...", "message": "..."}`
- Allowlist configured via static config file (TOML/YAML) at startup
- Fast string match on domain -- no regex in hot path
- Implement as Tower middleware layer
- Fixed connection pool per vendor with configurable max (e.g., 4 HTTP/2 connections per vendor, each supporting 100+ concurrent streams)
- Bounded request queue (e.g., 1024) for backpressure -- return 503 Service Unavailable when queue is full
- Under 128MB steady-state memory target -- streaming means no large response buffers
- Per-client rate limiting deferred to Phase 2 (policy engine)
- Vendor unreachable/timeout: return 502 Bad Gateway with structured JSON body -- no retries in the proxy
- Mid-stream failure: propagate disconnect with protocol-appropriate error event (SSE error event, gRPC UNAVAILABLE status) before closing
- Generous timeout defaults for AI workloads: connect 10s, first byte 30s, overall stream 5min -- configurable in config file
- Structured JSON logging to stdout -- container-friendly (Docker/K8s)

### Claude's Discretion
- Exact Rust crate choices (hyper, tower, tokio, rustls, etc.)
- Connection pool implementation details
- Internal channel sizing and tuning
- Certificate generation library
- Config file format choice (TOML vs YAML)
- Exact JSON error response field names and structure

### Deferred Ideas (OUT OF SCOPE)
- Hot-reload of vendor allowlist via gRPC push from control plane -- Phase 6
- Per-department/user/vendor allowlist granularity with inheritance -- Phase 6
- Per-client rate limiting -- Phase 2 (policy engine)
- DNS/IP range fallback for air-gapped deployments -- v2/ADV-04
- Suggested alternatives in block response (`suggested_alternatives` field) -- future enhancement
- Mid-stream blocking with `[BLOCKED BY INTERDICT: Vendor Not Allowed]` injection -- Phase 2/3 (policy enforcement)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KERN-01 | Rust transparent proxy intercepts all outbound AI traffic over HTTP/1.1 and HTTP/2 | hyper 1.x handles both HTTP/1.1 and HTTP/2 natively; CONNECT tunnel pattern with `hyper::upgrade::on` for TLS interception; protocol auto-detection on single port via hyper-util's `auto::Builder` |
| KERN-02 | Proxy decodes and handles SSE streaming responses from AI vendors | Zero-copy byte stream relay via `http_body_util::StreamBody` wrapping `bytes::Bytes` chunks; SSE is HTTP with `text/event-stream` content-type -- relay as raw byte stream (no SSE-specific parsing needed in Phase 1, parsing comes in Phase 3 for content inspection) |
| KERN-03 | Proxy decodes and handles gRPC streaming for enterprise AI services | gRPC over HTTP/2 -- the proxy relays HTTP/2 frames transparently after TLS termination; no gRPC-specific decoding needed at proxy level (frames are HTTP/2 DATA frames); tonic used only for kernel's own gRPC interfaces in later phases |
| KERN-04 | Proxy decodes and handles WebSocket connections for real-time AI applications | WebSocket upgrade via HTTP/1.1 Upgrade header or HTTP/2 CONNECT with `:protocol` pseudo-header; tokio-tungstenite for frame relay; bidirectional forwarding with `tokio::io::copy_bidirectional` |
| KERN-07 | Kernel achieves <10ms p99 latency overhead (target <5ms) | Zero-copy streaming with `bytes::Bytes`, no full-body buffering, certificate caching via DashMap (sub-ms after first request), bounded channels for backpressure, criterion.rs benchmarks for validation |
| KERN-08 | Kernel handles >10,000 requests/second per instance under sustained load | tokio multi-threaded runtime, connection pooling amortizes TLS negotiation, bounded concurrency via Semaphore, benchmark with criterion + custom load generator |
| KERN-09 | Kernel steady-state RAM under 128MB with <100m CPU idle, <500m burst | Streaming architecture (no response buffering), bounded channels with explicit capacity, certificate cache bounded by vendor count (dozens, not millions), jemalloc or mimalloc for predictable memory behavior |
| KERN-12 | Kernel manages multiple HTTP/2 connections per AI vendor backend | Custom connection pool maintaining N hyper client connections per vendor (configurable, default 4); round-robin or least-loaded selection; monitor active stream count per connection; open new connections when utilization exceeds threshold |
| KERN-13 | Kernel uses bounded tokio channels with explicit capacity limits on all internal communication | `tokio::sync::mpsc::channel(N)` everywhere; zero `unbounded_channel()` in production code; `try_send` for non-blocking with 503 backpressure; clippy lint to audit |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tokio | 1.47.x (LTS) | Async runtime | LTS through Sep 2026; battle-tested for >10k concurrent connections; required by hyper, tonic, tower |
| hyper | 1.7.x | HTTP/1.1 + HTTP/2 client and server | The Rust HTTP library; streaming by default (no body buffering); native HTTP/2; stable v1 API; direct CONNECT handling via upgrade |
| hyper-util | 0.1.x | Hyper utilities | Connection builder, graceful shutdown, server auto-configuration; required companion to hyper 1.x |
| tower | 0.4.x | Middleware framework | Composable async middleware via `Service` trait; used for allowlist enforcement, timeouts, request-id, metrics |
| tower-http | 0.6.x | HTTP-specific middleware | Pre-built layers: tracing, timeout, request-id propagation, CORS |
| rustls | 0.23.x | TLS termination and origination | Pure-Rust TLS; no OpenSSL dependency; `aws-lc-rs` backend for performance; supports TLS 1.2/1.3 |
| tokio-rustls | 0.26.x | Tokio integration for rustls | Async TLS accept/connect wrapping tokio streams |
| rcgen | 0.13.x+ | On-the-fly X.509 certificate generation | Rustls-maintained; generates end-entity certs signed by CA; sub-10ms generation, sub-ms when cached |
| bytes | 1.x | Zero-copy byte buffers | Used by hyper, tokio, tower internally; essential for zero-copy proxy data path |
| serde | 1.0.x | Serialization framework | De facto standard; used for config parsing (TOML), JSON error responses, structured logging |
| toml | 0.8.x | TOML config parsing | Lightweight, serde-compatible; better than YAML for typed configuration |
| tracing | 0.1.x | Structured logging | Tokio ecosystem standard; async-aware span context; JSON output via tracing-subscriber |
| tracing-subscriber | 0.3.x | Log output formatting | JSON structured logging to stdout; env-filter for dynamic log levels |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokio-tungstenite | 0.26.x+ | WebSocket frame relay | WebSocket upgrade handling and bidirectional frame forwarding |
| http-body-util | 0.1.x | Body type utilities | `StreamBody`, `Full`, `Empty` body types for hyper 1.x responses |
| dashmap | 6.x | Concurrent certificate cache | Thread-safe certificate cache keyed by domain; sharded for lock-free reads |
| tokio-util | 0.7.x | Codecs and framing | `codec` module if SSE frame-level parsing is needed (Phase 3); timeout utilities |
| thiserror | 2.x | Error types | Derive-based error definitions for proxy error hierarchy |
| anyhow | 1.x | Error context | Top-level error handling in main, test helpers |
| uuid | 1.x (v4) | Request IDs | Unique request identifiers for structured logging and tracing |
| criterion | 0.5.x | Benchmarking | Statistics-driven latency and throughput benchmarks |
| wiremock | 0.6.x | HTTP mock server | Integration tests simulating AI vendor backends |
| jemalloc (tikv-jemallocator) | 0.6.x | Memory allocator | Predictable memory behavior; better memory return to OS than default allocator |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| hyper (direct) | axum | axum adds routing/extraction abstractions for REST APIs; we need raw connection-level control for CONNECT tunneling, HTTP/2 frame handling, and upgrade; axum abstractions get in the way |
| hyper (direct) | reqwest | reqwest wraps hyper for client-side convenience but hides connection pool internals we need to control for multi-connection HTTP/2 |
| rcgen | openssl CLI | openssl requires C dependency, cross-compilation pain, CVE surface; rcgen is pure Rust, maintained by rustls team |
| rustls | openssl-rs | C dependency, cross-compilation headaches, CVE history; rustls eliminates all of this with equivalent or better performance |
| TOML config | YAML (serde_yaml) | TOML is simpler, less ambiguous, better for typed config; YAML is more flexible but its implicit typing causes bugs (e.g., `no` becomes boolean) |
| DashMap | RwLock<HashMap> | DashMap provides fine-grained sharded locking; for a certificate cache with frequent concurrent reads and rare writes, DashMap avoids global read-lock contention |
| tokio-tungstenite | fastwebsockets | fastwebsockets is faster but less mature; tokio-tungstenite has larger ecosystem, better docs, recent versions (0.26+) close the performance gap |

### Installation

```toml
# crates/kernel/Cargo.toml
[dependencies]
tokio = { version = "1.47", features = ["full"] }
hyper = { version = "1.7", features = ["http1", "http2", "server", "client"] }
hyper-util = { version = "0.1", features = ["tokio", "http1", "http2", "server-auto", "client-legacy"] }
http-body-util = "0.1"
tower = { version = "0.4", features = ["timeout", "limit", "load-shed"] }
tower-http = { version = "0.6", features = ["trace", "request-id"] }
rustls = { version = "0.23", features = ["aws_lc_rs"] }
tokio-rustls = "0.26"
rcgen = "0.13"
bytes = "1"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
toml = "0.8"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
dashmap = "6"
tokio-tungstenite = { version = "0.26", features = ["rustls-tls-webpki-roots"] }
http = "1"
uuid = { version = "1", features = ["v4"] }
thiserror = "2"
anyhow = "1"

[dependencies.tikv-jemallocator]
version = "0.6"

[dev-dependencies]
criterion = { version = "0.5", features = ["async_tokio"] }
wiremock = "0.6"
tokio-test = "0.4"

[[bench]]
name = "proxy_latency"
harness = false
```

## Architecture Patterns

### Recommended Project Structure

```
crates/kernel/
  src/
    main.rs                  # Entry point: load config, start server, graceful shutdown
    config.rs                # TOML config loading and validation (serde + toml)
    proxy/
      mod.rs                 # Proxy service entry point (Tower Service impl)
      connect.rs             # CONNECT tunnel handler: upgrade, TLS termination, relay
      tls.rs                 # TLS interception: CA loading, rcgen cert generation, cert cache
      pool.rs                # Custom HTTP/2 connection pool (multiple conns per vendor)
      relay.rs               # Zero-copy bidirectional byte stream relay
      websocket.rs           # WebSocket upgrade detection and frame relay
    middleware/
      mod.rs
      allowlist.rs           # Vendor allowlist Tower middleware (domain matching)
      timeout.rs             # AI-friendly timeout configuration as Tower layer
      request_id.rs          # Request ID generation and propagation
      metrics.rs             # Latency/throughput metrics collection
    error.rs                 # Structured error types (thiserror)
    logging.rs               # JSON structured logging setup (tracing-subscriber)
  benches/
    proxy_latency.rs         # Criterion benchmarks for p99 latency
  tests/
    integration/
      connect_tunnel.rs      # CONNECT tunnel establishment tests
      allowlist.rs           # Vendor blocking/allowing tests
      streaming.rs           # SSE/gRPC/WebSocket streaming relay tests
      connection_pool.rs     # Multi-connection HTTP/2 pool tests
      backpressure.rs        # Bounded channel and 503 behavior tests
```

### Pattern 1: CONNECT Tunnel with TLS Interception

**What:** The proxy handles HTTP CONNECT requests by (1) checking the vendor allowlist, (2) upgrading the client connection, (3) performing a TLS handshake with the client using a domain-specific certificate signed by the deployment CA, (4) establishing a TLS connection to the upstream vendor, and (5) relaying bytes bidirectionally.

**When to use:** Every HTTPS request through the proxy follows this path.

**Example:**
```rust
// Source: hyper examples/http_proxy.rs + TLS interception extension
async fn handle_connect(
    req: Request<Incoming>,
    allowlist: Arc<VendorAllowlist>,
    cert_cache: Arc<CertCache>,
    pool: Arc<ConnectionPool>,
) -> Result<Response<BoxBody>, ProxyError> {
    let host = req.uri().authority()
        .ok_or(ProxyError::MissingAuthority)?
        .host()
        .to_string();

    // 1. Check vendor allowlist BEFORE establishing any connection
    if !allowlist.is_allowed(&host) {
        return Ok(vendor_blocked_response(&host));
    }

    // 2. Spawn upgrade task
    let upgraded = hyper::upgrade::on(req);

    tokio::spawn(async move {
        match upgraded.await {
            Ok(client_stream) => {
                // 3. TLS handshake with client using domain-specific cert
                let server_config = cert_cache.get_or_create(&host).await?;
                let tls_acceptor = TlsAcceptor::from(server_config);
                let client_tls = tls_acceptor.accept(client_stream).await?;

                // 4. Get upstream connection from pool (TLS to vendor)
                let upstream = pool.get_connection(&host).await?;

                // 5. Relay bytes bidirectionally (zero-copy)
                relay::bidirectional(client_tls, upstream).await
            }
            Err(e) => tracing::error!("upgrade failed: {}", e),
        }
    });

    // Return 200 to complete CONNECT handshake
    Ok(Response::new(empty_body()))
}
```

### Pattern 2: Custom HTTP/2 Connection Pool

**What:** Maintain multiple HTTP/2 TCP connections per vendor backend to avoid single-connection stream saturation. hyper's built-in pool opens only one HTTP/2 connection per host.

**When to use:** Required for KERN-12 to sustain 200+ concurrent streams per vendor.

**Example:**
```rust
// Custom connection pool with multiple connections per vendor
pub struct ConnectionPool {
    // Map: vendor_domain -> Vec<PooledConnection>
    connections: DashMap<String, Vec<PooledConnection>>,
    max_conns_per_vendor: usize,   // e.g., 4
    max_streams_per_conn: usize,   // e.g., 100
    tls_connector: TlsConnector,
}

struct PooledConnection {
    sender: hyper::client::conn::http2::SendRequest<BoxBody>,
    active_streams: Arc<AtomicUsize>,
}

impl ConnectionPool {
    /// Get a connection with the least active streams.
    /// If all connections are above threshold, open a new one (up to max).
    pub async fn get_connection(
        &self,
        host: &str,
    ) -> Result<PooledConnection, ProxyError> {
        let conns = self.connections.entry(host.to_string())
            .or_insert_with(Vec::new);

        // Find least-loaded connection below threshold
        if let Some(conn) = conns.iter()
            .filter(|c| c.active_streams.load(Ordering::Relaxed) < self.max_streams_per_conn)
            .min_by_key(|c| c.active_streams.load(Ordering::Relaxed))
        {
            return Ok(conn.clone());
        }

        // All connections saturated -- open new one if under max
        if conns.len() < self.max_conns_per_vendor {
            let new_conn = self.create_connection(host).await?;
            conns.push(new_conn.clone());
            return Ok(new_conn);
        }

        // All connections at max -- queue/reject
        Err(ProxyError::BackpressureFull)
    }
}
```

### Pattern 3: Vendor Allowlist as Tower Middleware

**What:** A Tower `Layer`/`Service` that checks the CONNECT target hostname against a deny-by-default allowlist before any upstream connection is made.

**When to use:** First middleware in the chain, applied before timeout or any forwarding logic.

**Example:**
```rust
use tower::{Layer, Service};
use std::collections::HashSet;

pub struct VendorAllowlist {
    allowed_domains: HashSet<String>,
}

impl VendorAllowlist {
    pub fn from_config(config: &ProxyConfig) -> Self {
        Self {
            allowed_domains: config.allowed_vendors.iter().cloned().collect(),
        }
    }

    pub fn is_allowed(&self, domain: &str) -> bool {
        self.allowed_domains.contains(domain)
    }
}

// Tower Layer for composability
pub struct AllowlistLayer {
    allowlist: Arc<VendorAllowlist>,
}

impl<S> Layer<S> for AllowlistLayer {
    type Service = AllowlistService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AllowlistService {
            inner,
            allowlist: self.allowlist.clone(),
        }
    }
}
```

### Pattern 4: Certificate Cache with On-Demand Generation

**What:** Generate TLS certificates signed by the deployment CA on first request per domain, cache them in a DashMap for subsequent requests.

**When to use:** Every TLS interception handshake.

**Example:**
```rust
pub struct CertCache {
    cache: DashMap<String, Arc<rustls::ServerConfig>>,
    ca_cert: rcgen::CertifiedKey,
    ca_key: rcgen::KeyPair,
}

impl CertCache {
    pub async fn get_or_create(
        &self,
        domain: &str,
    ) -> Result<Arc<rustls::ServerConfig>, ProxyError> {
        // Fast path: cached (sub-microsecond)
        if let Some(config) = self.cache.get(domain) {
            return Ok(config.clone());
        }

        // Slow path: generate cert (5-10ms first time)
        let cert_params = rcgen::CertificateParams::new(vec![domain.to_string()])?;
        let key_pair = rcgen::KeyPair::generate()?;
        let cert = cert_params.signed_by(&key_pair, &self.ca_cert.cert, &self.ca_key)?;

        let server_config = Arc::new(
            rustls::ServerConfig::builder()
                .with_no_client_auth()
                .with_single_cert(
                    vec![cert.der().clone()],
                    key_pair.serialize_der().into(),
                )?
        );

        self.cache.insert(domain.to_string(), server_config.clone());
        Ok(server_config)
    }
}
```

### Anti-Patterns to Avoid

- **Buffering full response bodies:** Never use `hyper::body::to_bytes()` or equivalent on proxied responses. Stream `bytes::Bytes` chunks directly from upstream to client. Full buffering kills latency and memory.
- **Using axum for the proxy:** axum's Router/Handler abstractions are designed for REST APIs, not transparent proxying. The CONNECT upgrade path, connection-level TLS interception, and HTTP/2 frame relay need hyper's low-level control.
- **Single HTTP/2 connection per vendor:** hyper's default behavior. A custom pool is required (KERN-12). Without it, 80 users hitting OpenAI saturate the single connection at ~200 concurrent streams.
- **Unbounded channels anywhere:** Zero `tokio::sync::mpsc::unbounded_channel()` in production code. Every channel must have explicit capacity. This is a correctness requirement (KERN-13), not an optimization.
- **Regex for domain matching:** The allowlist uses exact string match on HashSet. No regex, no glob patterns, no DNS resolution in the hot path. Domain matching must be O(1) amortized.
- **`unwrap()` or `expect()` in request handling:** A single malformed request must not panic the proxy. Use `Result`/`?` everywhere in the hot path. `unwrap()` is acceptable only in startup/config loading and tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS implementation | Custom TLS state machine | rustls 0.23 | TLS is security-critical; any custom implementation will have vulnerabilities; rustls is audited pure-Rust |
| X.509 certificate generation | Manual ASN.1/DER encoding | rcgen 0.13 | X.509 is notoriously complex; rcgen is maintained by the rustls team; handles extensions, SANs, key usage correctly |
| HTTP/1.1 + HTTP/2 parsing | Custom protocol parser | hyper 1.7 | HTTP protocol edge cases are a bottomless pit; hyper handles chunked encoding, trailer headers, flow control, HPACK compression |
| WebSocket frame handling | Custom frame parser | tokio-tungstenite 0.26 | WebSocket has masking, fragmentation, ping/pong, close handshake; tungstenite handles all of this |
| Concurrent cache | `Mutex<HashMap>` for cert cache | DashMap 6 | Lock contention under concurrent reads; DashMap's sharding provides near-lock-free read access |
| Structured logging | Custom JSON logger | tracing + tracing-subscriber (json) | Async-aware span context, structured fields, env-filter for dynamic levels; standard in tokio ecosystem |
| Benchmark framework | Custom timing loops | criterion 0.5 | Statistical analysis, warm-up, outlier detection, regression comparison; custom timing produces unreliable results |
| Mock HTTP servers for tests | Custom test server | wiremock 0.6 | Request matching, response templating, assertion verification; async-compatible with tokio |
| Memory allocator | Default glibc allocator | jemalloc (tikv-jemallocator) | Default allocator may not return freed memory to OS, creating apparent leaks; jemalloc provides predictable memory behavior critical for 128MB budget |

**Key insight:** Every component in the TLS interception chain (certificate generation, TLS handshake, HTTP parsing, WebSocket framing) has decades of edge cases. Hand-rolling any of these will introduce security vulnerabilities and protocol bugs that take months to discover. Use battle-tested libraries and focus engineering effort on the custom connection pool and streaming relay logic.

## Common Pitfalls

### Pitfall 1: SSE Stream Buffering Destroys Latency
**What goes wrong:** The proxy buffers entire SSE responses before forwarding, causing AI responses to arrive in large delayed chunks instead of token-by-token. Every layer defaults to buffering.
**Why it happens:** HTTP proxies default to response buffering for efficiency. Developers prototype with small payloads where buffering is invisible.
**How to avoid:** Relay `bytes::Bytes` chunks directly as they arrive from upstream. Never call `.collect()` or `.to_bytes()` on the response body. Set `X-Accel-Buffering: no` header on SSE responses. Measure time-to-first-token (TTFT) overhead as a primary metric.
**Warning signs:** TTFT with proxy is >100ms higher than without; AI chat responses appear in bursts; `Content-Encoding: gzip` on proxied SSE responses (compression forces full buffering).

### Pitfall 2: Unbounded Channel Memory Exhaustion
**What goes wrong:** Under high load, unbounded channels grow without limit when producer rate exceeds consumer capacity. A single traffic spike pushes memory past 128MB, triggering OOM kills.
**Why it happens:** `mpsc::unbounded_channel()` is easier to use (no `.await` on send). Developers default to it during prototyping. The system appears fine in testing because test loads don't sustain high rates long enough.
**How to avoid:** Use `tokio::sync::mpsc::channel(N)` with explicit bounded capacity everywhere. Use `Sender::try_send()` for non-blocking sends that return error when full (trigger 503 backpressure). Add `grep -r "unbounded_channel" src/` to CI as a lint.
**Warning signs:** Memory climbs under sustained load and never returns to baseline; any match for `unbounded_channel` in production code; `tokio::spawn` called in request handlers without concurrency semaphore.

### Pitfall 3: Single HTTP/2 Connection Per Vendor
**What goes wrong:** hyper opens only one TCP connection per HTTP/2 backend. HTTP/2 servers limit concurrent streams to 100-250 per connection. With 80+ users hitting the same AI vendor, requests queue and latency spikes.
**Why it happens:** HTTP/2 multiplexing is supposed to eliminate the need for multiple connections. In practice, server-side stream limits and TCP head-of-line blocking create bottlenecks. hyper does not expose configuration for multiple HTTP/2 connections per host.
**How to avoid:** Implement a custom connection pool maintaining N hyper client connections per vendor. Monitor active stream count per connection. Open additional connections when utilization exceeds 70%.
**Warning signs:** Tail latency spikes when concurrent requests exceed ~200; all traffic to one vendor routes through one TCP connection (visible in `netstat`); request queuing under moderate load despite low CPU.

### Pitfall 4: Certificate Generation Latency on First Request
**What goes wrong:** rcgen certificate generation takes 5-10ms per domain. Without caching, every first request to a new domain pays this cost. Under cold-start conditions (proxy restart), all domains hit the slow path simultaneously.
**Why it happens:** X.509 certificate generation involves key generation and ASN.1 serialization, which are CPU-bound operations.
**How to avoid:** Cache generated certificates in DashMap keyed by domain. Pre-warm cache for known AI vendor domains at startup (from allowlist config). Use `DashMap::entry()` API to ensure only one task generates a cert per domain (avoiding thundering herd).
**Warning signs:** First-request latency is 5-10ms higher than subsequent requests; CPU spike at proxy startup when many clients connect simultaneously.

### Pitfall 5: Blocking in Async Context
**What goes wrong:** Synchronous operations (TLS cert generation, config file reads, certificate validation) block the tokio runtime thread, stalling all other tasks on that thread.
**Why it happens:** Not all operations have async versions. `rcgen` cert generation is CPU-bound synchronous code. File I/O for config loading is synchronous.
**How to avoid:** Use `tokio::task::spawn_blocking()` for CPU-bound or synchronous operations. Keep the async hot path (request handling, byte relay) free of any blocking calls.
**Warning signs:** p99 latency is significantly higher than p50; latency spikes correlate with certificate cache misses; `tokio-console` shows task stalls.

### Pitfall 6: Improper Connection Error Propagation
**What goes wrong:** When the upstream vendor drops a connection mid-stream, the proxy silently closes the client connection without an error signal. Clients hang waiting for data that never arrives.
**Why it happens:** Default behavior of `copy_bidirectional` is to stop when either side closes. For SSE, the client expects an explicit error event or clean close. For gRPC, a GOAWAY frame or RST_STREAM is needed.
**How to avoid:** Detect upstream disconnect and send protocol-appropriate error before closing the client side: SSE `event: error` with retry hint, gRPC status UNAVAILABLE, WebSocket close frame with code 1011 (Internal Error). Per user decisions, client SDK should be able to detect and retry.
**Warning signs:** Force-killing upstream during streaming test -- client hangs instead of receiving error; integration tests only test happy path.

## Code Examples

### TOML Configuration File

```toml
# interdict.toml -- Phase 1 kernel configuration

[proxy]
listen_addr = "0.0.0.0:8443"
# Timeouts generous for AI workloads
connect_timeout_ms = 10_000       # 10s to establish upstream connection
first_byte_timeout_ms = 30_000    # 30s to receive first byte from AI vendor
stream_timeout_ms = 300_000       # 5min for streaming responses
# Backpressure
max_request_queue = 1024          # Return 503 when queue is full

[tls]
ca_cert_path = "/etc/interdict/ca.crt"
ca_key_path = "/etc/interdict/ca.key"

[pool]
max_connections_per_vendor = 4
max_streams_per_connection = 100
idle_timeout_ms = 60_000

[allowlist]
# Deny-by-default: only these vendors are reachable
vendors = [
    "api.openai.com",
    "api.anthropic.com",
    "api.cohere.ai",
    "generativelanguage.googleapis.com",
]

[logging]
level = "info"                    # debug, info, warn, error
format = "json"                   # json for production, pretty for development
```

```rust
// Source: serde + toml deserialization pattern
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub proxy: ProxyConfig,
    pub tls: TlsConfig,
    pub pool: PoolConfig,
    pub allowlist: AllowlistConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize)]
pub struct ProxyConfig {
    pub listen_addr: String,
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_ms: u64,
    #[serde(default = "default_first_byte_timeout")]
    pub first_byte_timeout_ms: u64,
    #[serde(default = "default_stream_timeout")]
    pub stream_timeout_ms: u64,
    #[serde(default = "default_max_queue")]
    pub max_request_queue: usize,
}

#[derive(Debug, Deserialize)]
pub struct AllowlistConfig {
    pub vendors: Vec<String>,
}

impl AllowlistConfig {
    pub fn to_set(&self) -> HashSet<String> {
        self.vendors.iter().cloned().collect()
    }
}

fn default_connect_timeout() -> u64 { 10_000 }
fn default_first_byte_timeout() -> u64 { 30_000 }
fn default_stream_timeout() -> u64 { 300_000 }
fn default_max_queue() -> usize { 1024 }
```

### Zero-Copy Bidirectional Relay

```rust
// Source: tokio::io::copy_bidirectional pattern for byte-level relay
use tokio::io::{AsyncRead, AsyncWrite};

/// Relay bytes bidirectionally between client and upstream.
/// Zero-copy: bytes::Bytes chunks flow through without materialization.
pub async fn bidirectional<C, U>(
    mut client: C,
    mut upstream: U,
) -> Result<(u64, u64), std::io::Error>
where
    C: AsyncRead + AsyncWrite + Unpin,
    U: AsyncRead + AsyncWrite + Unpin,
{
    let (client_to_upstream, upstream_to_client) =
        tokio::io::copy_bidirectional(&mut client, &mut upstream).await?;

    tracing::debug!(
        client_to_upstream,
        upstream_to_client,
        "relay complete"
    );

    Ok((client_to_upstream, upstream_to_client))
}
```

### Structured Error Responses

```rust
// Structured JSON error responses per user decisions
use serde::Serialize;

#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout_ms: Option<u64>,
}

fn vendor_blocked_response(vendor: &str) -> Response<BoxBody> {
    let body = serde_json::to_vec(&ErrorResponse {
        error: "vendor_blocked",
        vendor: Some(vendor.to_string()),
        message: Some(format!("Vendor '{}' is not on the approved allowlist", vendor)),
        timeout_ms: None,
    }).unwrap();

    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header("content-type", "application/json")
        .body(full_body(body))
        .unwrap()
}

fn vendor_unreachable_response(vendor: &str, timeout_ms: u64) -> Response<BoxBody> {
    let body = serde_json::to_vec(&ErrorResponse {
        error: "vendor_unreachable",
        vendor: Some(vendor.to_string()),
        message: None,
        timeout_ms: Some(timeout_ms),
    }).unwrap();

    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .header("content-type", "application/json")
        .body(full_body(body))
        .unwrap()
}

fn backpressure_response() -> Response<BoxBody> {
    let body = serde_json::to_vec(&ErrorResponse {
        error: "service_overloaded",
        vendor: None,
        message: Some("Request queue is full. Retry after a brief delay.".to_string()),
        timeout_ms: None,
    }).unwrap();

    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .header("content-type", "application/json")
        .header("retry-after", "1")
        .body(full_body(body))
        .unwrap()
}
```

### Main Entry Point Structure

```rust
// Source: hyper + tower service composition pattern
use std::sync::Arc;

#[global_allocator]
static GLOBAL: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Load config
    let config = config::load("interdict.toml")?;

    // 2. Initialize structured logging
    logging::init(&config.logging);

    // 3. Load CA certificate and key
    let ca = tls::load_ca(&config.tls)?;

    // 4. Build shared state
    let cert_cache = Arc::new(CertCache::new(ca));
    let allowlist = Arc::new(VendorAllowlist::from_config(&config.allowlist));
    let pool = Arc::new(ConnectionPool::new(&config.pool));

    // 5. Pre-warm cert cache for known vendors
    for vendor in &config.allowlist.vendors {
        cert_cache.get_or_create(vendor).await?;
    }

    // 6. Build Tower service stack
    let service = tower::ServiceBuilder::new()
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(config.proxy.stream_timeout()))
        .layer(AllowlistLayer::new(allowlist.clone()))
        .service(ProxyService::new(cert_cache, pool));

    // 7. Start server
    let listener = tokio::net::TcpListener::bind(&config.proxy.listen_addr).await?;
    tracing::info!(addr = %config.proxy.listen_addr, "kernel proxy listening");

    // 8. Accept loop with graceful shutdown
    loop {
        let (stream, addr) = listener.accept().await?;
        let svc = service.clone();
        tokio::spawn(async move {
            let io = hyper_util::rt::TokioIo::new(stream);
            hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new())
                .serve_connection_with_upgrades(io, svc)
                .await
        });
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| hyper 0.14 with `Body` type | hyper 1.x with `http_body::Body` trait | 2024 | Breaking change; Body is now a trait, not a concrete type; need `http-body-util` for common body types |
| `hyper::Client` built-in pool | Manual connection management with `hyper::client::conn` | 2024 (hyper 1.0) | hyper 1.x removed the built-in `Client` with auto pool; must use `hyper::client::conn::http2::handshake` directly or hyper-util's legacy client |
| openssl-rs for TLS | rustls 0.23 with aws-lc-rs backend | 2024-2025 | Pure Rust, no C dependencies, FIPS-capable via aws-lc-rs, performance parity |
| rcgen 0.12 API | rcgen 0.13+ restructured API | March 2024 | API changed: `CertificateParams::signed_by()` now takes `&KeyPair` and `&Certificate` separately (not combined `CertifiedKey`) |
| tokio unbounded as default | Bounded channels as standard practice | 2024-2025 | Community consensus after multiple production incidents with memory exhaustion |

**Deprecated/outdated:**
- **hyper::Client (hyper <1.0):** Removed in hyper 1.0. Use `hyper::client::conn::http2::handshake` directly or `hyper_util::client::legacy::Client` (which is itself being phased out). For this proxy, direct connection management is preferred anyway.
- **native-tls crate:** Wraps OpenSSL/Schannel/Security.framework. Replaced by rustls for pure-Rust projects. No reason to use native-tls in greenfield 2026 code.
- **rcgen 0.12 API:** The `Certificate` type was split into separate concepts in 0.13. Code examples from pre-2024 will not compile.

## Open Questions

1. **HTTP/2 CONNECT for WebSocket upgrade**
   - What we know: HTTP/2 supports extended CONNECT with `:protocol` pseudo-header (RFC 8441) for WebSocket over HTTP/2. hyper supports HTTP/2 upgrades.
   - What's unclear: Whether all AI vendor WebSocket endpoints (e.g., OpenAI Realtime API) negotiate WebSocket over HTTP/2, or if they require HTTP/1.1 upgrade. Most likely HTTP/1.1.
   - Recommendation: Support both paths. HTTP/1.1 WebSocket upgrade is the primary path; HTTP/2 extended CONNECT is the fallback. Test against real AI vendor WebSocket endpoints during implementation.

2. **Connection pool warm-up strategy**
   - What we know: The custom pool needs to open connections lazily (on first request) or eagerly (at startup).
   - What's unclear: Whether eager connection warm-up improves tail latency enough to justify the complexity. TLS handshake to AI vendors takes 50-200ms.
   - Recommendation: Start with lazy connection creation. Add eager warm-up as an optimization in a later iteration if first-request latency to a vendor is problematic. Certificate cache pre-warming is more impactful.

3. **Protocol auto-detection on single port**
   - What we know: User decision requires single listening port with protocol auto-detection. hyper-util's `auto::Builder` handles HTTP/1.1 vs HTTP/2 auto-detection.
   - What's unclear: Whether plain TCP connections (for WebSocket upgrade from non-HTTP contexts) need separate handling.
   - Recommendation: Use hyper-util `auto::Builder` which reads the initial bytes to detect HTTP/1.1 vs HTTP/2. WebSocket always starts as HTTP/1.1 Upgrade or HTTP/2 CONNECT, so it flows through the same handler.

4. **Graceful shutdown under active streams**
   - What we know: AI streaming responses can last 5+ minutes. Graceful shutdown must wait for active streams to complete.
   - What's unclear: The exact timeout before forceful shutdown. Too short = dropped AI responses. Too long = stuck deployment.
   - Recommendation: Implement two-phase shutdown: (1) stop accepting new connections, (2) wait up to 30 seconds for active streams, (3) force close remaining. Make the drain timeout configurable.

## Sources

### Primary (HIGH confidence)
- [hyper 1.7 crates.io](https://crates.io/crates/hyper) -- HTTP library, version verified
- [hyper http_proxy.rs example](https://github.com/hyperium/hyper/blob/master/examples/http_proxy.rs) -- CONNECT tunnel pattern
- [rcgen docs.rs](https://docs.rs/rcgen/latest/rcgen/) -- Certificate generation API, 0.13+ API verified
- [rcgen GitHub](https://github.com/rustls/rcgen) -- Maintained by rustls team, certificate signing patterns
- [rustls 0.23 GitHub](https://github.com/rustls/rustls) -- TLS library, aws-lc-rs backend confirmed
- [tokio mpsc docs](https://docs.rs/tokio/latest/tokio/sync/mpsc/index.html) -- Bounded channel API and backpressure semantics
- [tower Service trait docs](https://docs.rs/tower/0.5.2/tower/trait.Service.html) -- Middleware composition pattern
- [tower building middleware guide](https://github.com/tower-rs/tower/blob/master/guides/building-a-middleware-from-scratch.md) -- Layer/Service implementation pattern
- [DashMap docs.rs](https://docs.rs/dashmap/latest/dashmap/) -- Concurrent hashmap API
- [hyper HTTP/2 single connection issue (Apollo Router #2063)](https://github.com/apollographql/router/issues/2063) -- Documents single-connection limitation
- [hyper HTTP/2 stuck issue #3338](https://github.com/hyperium/hyper/issues/3338) -- Documents connection saturation under load
- [criterion.rs docs](https://docs.rs/criterion/latest/criterion/) -- Benchmarking framework API
- [wiremock-rs docs](https://docs.rs/wiremock/) -- HTTP mock server for testing

### Secondary (MEDIUM confidence)
- [rust-forward-proxy GitHub](https://github.com/pratik-codes/rust-forward-proxy) -- Reference implementation showing TLS interception + rcgen + cert caching pattern
- [proxelar GitHub](https://github.com/emanuele-em/proxelar) -- MITM proxy with TLS interception, CA generation, per-host cert minting
- [Cloudflare Oxy blog post](https://blog.cloudflare.com/introducing-oxy/) -- Production Rust proxy framework with TLS interception patterns
- [tokio-tungstenite docs](https://docs.rs/tokio-tungstenite) -- WebSocket async integration
- [Sling Academy: Backpressure in Rust Async](https://www.slingacademy.com/article/handling-backpressure-in-rust-async-systems-with-bounded-channels/) -- Bounded channel patterns

### Tertiary (LOW confidence)
- [High-Throughput HTTP Proxy in Rust (oneuptime blog)](https://oneuptime.com/blog/post/2026-01-25-high-throughput-http-proxy-rust/view) -- Architecture overview, needs validation
- Certificate generation performance (5-10ms first request, sub-ms cached) -- from rust-forward-proxy README, not independently benchmarked

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all crates are well-established with millions of downloads; versions verified on crates.io
- Architecture: HIGH -- CONNECT tunnel + TLS interception is a proven pattern (mitmproxy, corporate proxies, Cloudflare Oxy); Rust implementations exist as references
- Pitfalls: HIGH -- sourced from PITFALLS.md (project research), hyper GitHub issues, and production incident reports
- Connection pool: MEDIUM -- custom pool is required but exact implementation needs prototyping; no off-the-shelf solution for multiple HTTP/2 connections per host in hyper 1.x
- WebSocket relay: MEDIUM -- straightforward with tokio-tungstenite but HTTP/2 extended CONNECT path needs validation against real AI vendor endpoints

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days -- stack is stable, no fast-moving dependencies)
