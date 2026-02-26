# Technology Stack

**Project:** Interdict.io -- AI Governance Kernel & Compliance Proxy
**Researched:** 2026-02-26
**Overall confidence:** HIGH

---

## Recommended Stack

### Data Plane (Rust Kernel)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Rust (Edition 2024) | 1.85+ (stable) | Core language | Zero-cost abstractions, no GC pauses, memory safety without runtime overhead. Only viable language for a sub-10ms p99 inline proxy under 128MB RAM. | HIGH |
| tokio | 1.47.x (LTS) | Async runtime | LTS through Sep 2026, battle-tested for high-concurrency networking (>10k concurrent connections). Pin to LTS for stability in production infrastructure. | HIGH |
| hyper | 1.7.x | HTTP/1.1 + HTTP/2 | The Rust HTTP library. Streaming by default (no body buffering), native HTTP/2, stable v1 API guaranteed for 3+ years. Directly use hyper (not axum) since we need low-level proxy control over connection lifecycle. | HIGH |
| tower | 0.4.x | Middleware framework | Composable async middleware via the `Service` trait. Use for rate limiting, timeouts, metrics collection, authentication layers. Integrates natively with hyper. | HIGH |
| tower-http | 0.6.x | HTTP middleware | Pre-built layers: tracing, compression, CORS, request-id propagation. Saves weeks of middleware development. | HIGH |
| hyper-util | latest | Hyper utilities | Connection pooling, graceful shutdown, server auto-configuration. Required companion to hyper 1.x. | HIGH |
| rustls | 0.23.x | TLS termination | Pure-Rust TLS. No OpenSSL dependency means simpler builds and no C library CVEs. Use with `aws-lc-rs` backend for best performance. Supports TLS 1.2/1.3. | HIGH |
| wasmtime | 29.x | Wasm policy execution | CNCF/Bytecode Alliance project. Cranelift JIT compiler, async execution support, sub-millisecond instantiation, strong sandboxing. Use `component-model` feature for structured host/guest FFI. Pin to a specific minor version -- wasmtime releases major versions frequently (currently at 40.x but rapid semver). Recommend pinning to a well-tested version series. | HIGH |
| regorus | 0.9.x | Rego policy interpreter | Microsoft's Rust-native Rego interpreter. 10x faster than OPA (4.6ms vs 45ms benchmarked). Compiles to Wasm via wasm-pack. Passes OPA v1.2.0 test suite. Use regorus to evaluate Rego policies directly in Rust -- no need for OPA sidecar or Wasm compilation of Rego. This is the key differentiator vs. running OPA as a separate process. | HIGH |
| tonic | 0.14.x | gRPC client/server | De facto Rust gRPC. Async, streaming, native tokio integration. 170M+ downloads. Use for kernel-to-control-plane and kernel-to-evidence-collector communication. | HIGH |
| prost | 0.14.x | Protobuf codegen | Tokio-maintained protobuf implementation. Generates idiomatic Rust types from .proto files. Required companion to tonic. | HIGH |
| serde + serde_json | 1.0.228 / 1.0.145 | Serialization | De facto standard. 700M+ downloads. Use for JSON config parsing, evidence bundle serialization, API payloads. | HIGH |
| bytes | latest | Byte buffers | Zero-copy byte manipulation for proxy data path. Used by tokio, hyper, and tonic internally. Essential for the sliding window token buffer. | HIGH |
| tokio-util | latest | Codecs/framing | `codec` module for SSE frame parsing, chunked transfer decoding, length-delimited framing. Required for streaming response inspection. | HIGH |
| ed25519-dalek | 2.2.x | Ed25519 signing | Pure-Rust Ed25519. Fast signing (~68us), small signatures (64 bytes), deterministic. Avoid 3.0.0-pre.x (breaking changes not stabilized). | HIGH |
| sha2 | 0.10.x | SHA-256 hashing | RustCrypto project. Pure Rust, hardware-accelerated on x86_64 (SHA-NI). Use stable 0.10.x, not 0.11.0-rc. | HIGH |
| rs_merkle | 1.5.x | Merkle trees | Most feature-complete Merkle tree crate. Supports multi-proofs, transactional changes, rollbacks. no_std compatible. Custom hash function trait for SHA-256 integration. | HIGH |
| tracing | 0.1.41 | Structured logging | Tokio ecosystem standard. Async-aware structured logging with span context propagation. Use with `tracing-subscriber` for output formatting and filtering. | HIGH |
| opentelemetry | 0.30.x | Observability | Metrics SDK now stable. Integrates with tracing via `tracing-opentelemetry` bridge. Export to any OTel-compatible backend. | MEDIUM |
| clickhouse (crate) | 0.14.x | ClickHouse client | Official Rust client. Typed row serialization, LZ4 compression, async. Row type validation against schema since 0.14.0. | HIGH |
| openidconnect | latest | OIDC validation | Strongly-typed OIDC client. JWT validation, token introspection, provider discovery. Use in kernel to validate JWT assertions from enterprise SSO. | MEDIUM |
| samael | latest | SAML 2.0 parsing | Only maintained Rust SAML library. Use `xmlsec` feature for signature verification. Note: SAML parsing in the hot path is discouraged -- validate at the control plane and pass verified identity claims via mTLS or signed headers. | MEDIUM |
| tract | latest | ONNX inference | Pure-Rust ONNX runtime for Layer 2 NLP classifier. No external dependencies, no GPU requirement. Micro-second inference on small models (CNN). Use for lightweight text classification models (DistilBERT-tiny, MiniLM). Alternatives: `ort` for GPU acceleration -- but tract's pure-Rust, no-dependency story is better for a sidecar that must stay under 128MB. | MEDIUM |

### Control Plane API (Bun + Elysia)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Bun | 1.3.x | Runtime | 4-18x faster than Node+Express. Built-in bundler, test runner, package manager. Zig-based I/O loop. Mature enough for production (used by X, banks). | HIGH |
| Elysia | 1.4.x | API framework | Bun-first, end-to-end type safety, compile-time optimizations. Express-like DX with vastly better performance. Official JWT plugin, OpenAPI generation, WinterTC compliant. | HIGH |
| @elysiajs/jwt | latest | JWT auth | Official Elysia JWT plugin. Handles token signing/verification with type-safe integration. | HIGH |
| Drizzle ORM | 0.45.x | PostgreSQL ORM | Lightweight (7.4kb), zero dependencies, SQL-like API with full TypeScript inference. Works natively with Bun. Schema-as-code with migration generation. Fastest TypeScript ORM. | HIGH |
| drizzle-kit | latest | Migrations | CLI for generating and running Drizzle migrations. Schema diff, push, and introspect commands. | HIGH |
| nice-grpc | latest | gRPC client | TypeScript gRPC client built on grpc-js. Modern Promise/AsyncIterable API. Use for control-plane-to-kernel gRPC calls (policy push, fleet management). ConnectRPC does not have official Bun support yet. | MEDIUM |
| @bufbuild/protobuf | latest | Protobuf runtime | Buf's Protobuf-ES. Fully conformance-tested, first-class TypeScript support. Use with protoc-gen-es for code generation. | HIGH |
| @bufbuild/protoc-gen-es | latest | Proto codegen | Generates TypeScript types from .proto files. Shared proto definitions between Rust (prost) and TypeScript (protobuf-es). | HIGH |
| buf | latest (CLI) | Proto tooling | Replaces raw protoc. Linting, breaking change detection, code generation orchestration. Single tool for all proto management. | HIGH |
| postgres (bun:sql) | built-in | Postgres driver | Bun's built-in PostgreSQL driver. Zero additional dependencies. Use Drizzle's bun:sql adapter. | MEDIUM |
| @clickhouse/client | latest | ClickHouse client | Official ClickHouse JS client. HTTP interface, streaming inserts, parameterized queries. | HIGH |

### Control Plane Dashboard (Next.js + React)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.1.x | Framework | Turbopack stable for dev and prod builds. React Compiler built-in. `use cache` directive for explicit caching. Latest LTS-equivalent from Vercel. | HIGH |
| React | 19.x | UI library | Server Components, Actions, `use` hook, React Compiler auto-memoization. Required by Next.js 16. | HIGH |
| TypeScript | 5.7+ | Type safety | Strict mode, satisfies operator, const type parameters. Shared types with Elysia API. | HIGH |
| Tailwind CSS | 4.2.x | Styling | CSS-first config (no JS config file). 5x faster full builds, 100x faster incremental. New color palettes, logical properties. | HIGH |
| shadcn/ui | latest | Component library | Not a dependency -- copy-paste components built on Radix UI primitives. Full Tailwind v4 + React 19 support. Enterprise dashboard templates available. Own your components. | HIGH |
| Zustand | latest | Client state | Smallest bundle, no Provider wrapper, Flux-inspired. Industry leader for React client state in 2025-2026. Pair with TanStack Query for server state. | HIGH |
| @tanstack/react-query | 5.90.x | Server state | Data fetching, caching, background refetching. Essential for real-time dashboard data (policy violations, audit streams). | HIGH |
| @tanstack/react-table | 8.21.x | Data tables | Headless table with sorting, filtering, pagination, column resizing. Perfect for audit trail and policy list views. | HIGH |
| recharts or tremor | latest | Charts/analytics | Recharts for custom charts. Tremor for pre-built analytics dashboard components (built on Tailwind). Either works for compliance dashboards. | MEDIUM |
| nuqs | latest | URL state | Type-safe search params for Next.js App Router. Essential for shareable filtered/sorted audit views. | MEDIUM |

### Databases

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL | 17.x | Config, metadata, users, policies | ACID, JSONB for flexible policy storage, row-level security for multi-tenant isolation. Use 17.x (current stable with LTS). PG 18 too new for production infra. | HIGH |
| ClickHouse | 25.8 LTS | Log analytics, audit trail queries | Handles 10k+ events/sec ingestion. Columnar storage compresses logs 6x. Sub-second analytical queries over billions of rows. Use LTS 25.8 for stability. | HIGH |

### Infrastructure & Deployment

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker | latest | Containerization | Multi-stage builds for Rust (builder -> distroless/static runtime). Final kernel image target: <50MB. | HIGH |
| Helm | 3.x | K8s packaging | Standard for K8s application distribution. Chart per service (kernel, control-plane, dashboard, evidence-collector). Values-based config for different enterprise environments. | HIGH |
| Docker Compose | latest | Dev/pilot deploy | Single-file deployment for law firm pilot (~80 employees). All services + Postgres + ClickHouse in one compose file. | HIGH |
| GitHub Actions | - | CI/CD | Rust cross-compilation, Docker build, Helm chart packaging, proto linting. | HIGH |

### Observability & Monitoring

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| OpenTelemetry (Rust) | 0.30.x | Traces + metrics | Vendor-neutral. Stable metrics SDK. Bridge with tracing crate. Export via OTLP. | MEDIUM |
| OpenTelemetry (JS) | latest | Control plane telemetry | Elysia + Bun tracing with Datadog/Jaeger export. | MEDIUM |
| Prometheus format | - | Metrics exposition | Standard `/metrics` endpoint on all services. ClickHouse and Postgres both expose Prometheus metrics natively. | HIGH |

### Cryptographic Evidence Pipeline

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ed25519-dalek | 2.2.x | Bundle signing | See Data Plane table. Each evidence bundle gets Ed25519 signature. | HIGH |
| sha2 | 0.10.x | Hash chain | SHA-256 linked hash chain. Each bundle includes previous bundle's hash. | HIGH |
| rs_merkle | 1.5.x | Merkle batching | Hourly root hash computation. Proof generation for individual bundles. | HIGH |
| S3-compatible (MinIO) | latest | WORM storage | S3 Object Lock for immutable evidence storage. MinIO for VPC-native deployment (no AWS dependency). | MEDIUM |

### Identity & Access

| Technology | Purpose | Where | Confidence |
|------------|---------|-------|------------|
| openidconnect (Rust crate) | OIDC token validation | Data Plane -- validate JWTs from enterprise SSO | MEDIUM |
| samael (Rust crate) | SAML 2.0 assertion parsing | Control Plane -- SAML should be validated at API layer, not kernel hot path | MEDIUM |
| rustls (mTLS config) | Inter-service mTLS | All internal communication. rustls supports client certificate verification natively. | HIGH |
| @elysiajs/jwt | API JWT validation | Control Plane API -- session management for dashboard users | HIGH |

### Proto / Schema Tooling

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| buf CLI | Proto management | Lint, format, breaking change detection, code generation. Replaces raw protoc. | HIGH |
| prost-build | Rust proto codegen | Generates Rust types from .proto at build time via build.rs | HIGH |
| @bufbuild/protoc-gen-es | TS proto codegen | Generates TypeScript types from same .proto files | HIGH |
| Shared /proto directory | Schema contract | Single source of truth for all gRPC service definitions between Rust and TypeScript | HIGH |

---

## Policy Execution Architecture (Layer 1-2-3)

This is the most architecturally novel part of the stack. Here are specific recommendations for each layer.

### Layer 1: Deterministic Rules (<2ms target)

**Use Regorus (Rust-native Rego interpreter), NOT OPA-compiled-to-Wasm.**

| Approach | Latency | Complexity | Recommendation |
|----------|---------|------------|----------------|
| Regorus embedded in Rust | ~4.6ms (benchmark), optimizable to <2ms for simple policies | Low -- direct Rust API call | **USE THIS** |
| OPA Rego compiled to Wasm via Wasmtime | ~10-20ms (Wasm instantiation + eval) | High -- compile pipeline, Wasm module management | Fallback only |
| Custom Rust rule engine | <1ms | Very High -- reinventing policy language | Avoid |

**Rationale:** Regorus is a Rust-native Rego interpreter from Microsoft. It evaluates Rego policies directly without Wasm compilation. It is 10x faster than OPA and passes the OPA v1.2.0 test suite. The 4.6ms benchmark is for complex policies -- simple allowlist/blocklist checks will be sub-millisecond.

**However, keep Wasmtime for custom policy extensions.** Enterprises may want to write custom policy logic in languages that compile to Wasm (Rust, Go, AssemblyScript). Wasmtime provides the sandbox for that. Regorus handles standard Rego; Wasmtime handles custom compiled extensions.

### Layer 2: NLP Classifier (<10ms target)

**Use tract with a quantized ONNX model.**

| Approach | Latency | RAM | Recommendation |
|----------|---------|-----|----------------|
| tract + quantized MiniLM-L6 (ONNX) | ~5-8ms | ~30MB model | **USE THIS** |
| ort (ONNX Runtime wrapper) | ~3-5ms | ~50MB + onnxruntime binary | Acceptable if GPU needed later |
| rust-bert (libtorch) | ~15-30ms | ~200MB | Too heavy for sidecar |
| External inference service | ~20-50ms (network) | N/A | Too slow for inline |

**Rationale:** tract is pure Rust, no external dependencies, runs ONNX models. A quantized MiniLM-L6 or DistilBERT-tiny model classifies text intent (PII detection, topic classification, sentiment) in single-digit milliseconds on CPU. The 128MB RAM budget accommodates the model (~30MB) alongside the kernel.

**Model pipeline:** Train/fine-tune in Python (HuggingFace) -> Export to ONNX -> Quantize (INT8) -> Load in tract at kernel startup.

### Layer 3: Human Review Queue

No special runtime technology. Kernel marks request as "pending review" and routes to a hold queue in the Control Plane. Dashboard surfaces these for human decision.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Data Plane Language | Rust | Go | Go's GC pauses are unpredictable under high load. Rust provides deterministic latency. Go acceptable for non-hot-path services only. |
| Async Runtime | tokio | async-std | tokio has 10x the ecosystem, maintained by the same team as hyper/tonic/tower. async-std is effectively abandoned. |
| HTTP Library | hyper (direct) | axum | axum adds routing/extraction abstractions we don't need -- we're building a proxy, not a REST API. hyper gives direct control over connection upgrade, streaming, and HTTP/2 frames. |
| TLS | rustls | openssl (via openssl-rs) | rustls eliminates C dependency, cross-compilation headaches, and OpenSSL CVE exposure. Performance is equivalent or better with aws-lc-rs backend. |
| Wasm Runtime | wasmtime | wasmer | Wasmtime is CNCF/Bytecode Alliance, better Rust integration, component model support. Wasmer is more focused on standalone execution. |
| Policy Language | Rego (via Regorus) | Cedar (AWS) | Rego has far larger ecosystem, OPA adoption across CNCF. Cedar is AWS-specific. Regorus makes Rego evaluation Rust-native. |
| Policy Interpreter | Regorus (embedded) | OPA sidecar | OPA sidecar adds network hop (~1-5ms), deployment complexity, resource overhead. Regorus is a Rust library call. |
| Control Plane Framework | Elysia (Bun) | Fastify (Node) | Elysia on Bun is 4-18x faster. End-to-end type safety. Shared TypeScript with Next.js dashboard. |
| Control Plane Framework | Elysia (Bun) | Hono | Hono is runtime-agnostic (good for edge) but Elysia is Bun-optimized with better plugin ecosystem (JWT, OpenAPI, CORS). |
| ORM | Drizzle | Prisma | Prisma requires a query engine binary (Rust ironically), adding ~15MB and cold-start latency. Drizzle is 7.4kb, zero dependencies, SQL-like. |
| Dashboard Framework | Next.js 16 | Remix / SvelteKit | Next.js has the largest enterprise ecosystem, Vercel support, and shadcn/ui components. Enterprise customers expect React. |
| State Management | Zustand | Redux Toolkit | Redux has too much boilerplate for a dashboard. Zustand is simpler, smaller, higher satisfaction scores in 2025 surveys. |
| Log Database | ClickHouse | Elasticsearch | ClickHouse is 10-100x faster for analytical queries, 6x better compression, much lower operational cost. Elasticsearch is overkill for structured log analytics. |
| Merkle Tree | rs_merkle | merkletree crate | rs_merkle has transactional changes, rollbacks, multi-proofs. merkletree crate is less maintained. |
| gRPC (TypeScript) | nice-grpc | @connectrpc/connect | ConnectRPC lacks official Bun support. nice-grpc works on grpc-js which runs on Bun. |
| NLP Runtime | tract | ort / rust-bert | tract is pure Rust, no C++ dependencies, fits in 128MB sidecar budget. ort pulls in onnxruntime binary; rust-bert needs libtorch (~200MB). |

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **axum** for the proxy kernel | axum is for building REST APIs with routing/extractors. A transparent proxy needs raw hyper for connection-level control (CONNECT tunneling, HTTP/2 frame inspection, SSE stream interception). axum's abstractions get in the way. |
| **Prisma** | Binary query engine adds 15MB+ and cold start. Drizzle does the same job at 7.4kb. |
| **OPA as sidecar** | Network hop adds 1-5ms per policy evaluation. Regorus does it in-process in ~0.5-4.6ms. |
| **Redis for audit trail** | Redis is not a database. ClickHouse provides columnar analytics; PostgreSQL provides ACID. Redis is acceptable only as a transient cache if needed. |
| **Elasticsearch** | Overengineered for structured log analytics. ClickHouse is faster, cheaper, and simpler for this workload. |
| **Express.js** | 4-18x slower than Elysia on Bun. No type safety. Legacy DX. |
| **Node.js runtime** | Bun is drop-in compatible and faster. No reason to use Node for a greenfield project in 2026. |
| **webpack** | Next.js 16 uses Turbopack by default. Webpack is legacy. |
| **OpenSSL** | C dependency, cross-compilation pain, CVE history. Rustls is the modern choice. |
| **gRPC-Web for dashboard** | Use ConnectRPC or REST/JSON for browser communication. gRPC-Web requires an Envoy proxy -- unnecessary complexity when the dashboard can use the Elysia REST API. |
| **LLM in enforcement path** | Explicitly prohibited. Too slow (100ms+), non-deterministic, expensive. LLMs only for async Layer 3 edge case review. |
| **Blockchain** | Merkle tree + S3 Object Lock achieves identical tamper-evidence at vastly lower complexity. |

---

## Monorepo Structure

```
interdict/
  proto/                    # Shared .proto definitions (single source of truth)
    interdict/v1/
      kernel.proto          # Kernel <-> Control Plane gRPC services
      evidence.proto        # Evidence bundle schema
      policy.proto          # Policy distribution messages
  crates/                   # Rust workspace
    kernel/                 # Data Plane proxy kernel (binary)
    evidence-collector/     # Evidence pipeline service (binary)
    policy-engine/          # Regorus + Wasmtime policy evaluation (library)
    crypto/                 # Ed25519, SHA-256, Merkle tree utilities (library)
    proto-gen/              # Generated Rust types from .proto (library)
  apps/
    control-plane/          # Bun + Elysia API
    dashboard/              # Next.js 16 + React 19
  packages/
    shared-types/           # TypeScript types shared between API and dashboard
    proto-gen/              # Generated TypeScript types from .proto
  docker/
    kernel.Dockerfile       # Multi-stage: rust:1.85 builder -> distroless
    control-plane.Dockerfile
    dashboard.Dockerfile
    evidence-collector.Dockerfile
  deploy/
    docker-compose.yml      # Pilot deployment
    helm/                   # Kubernetes Helm chart
      interdict/
        Chart.yaml
        values.yaml
        templates/
  buf.yaml                  # Buf proto configuration
  buf.gen.yaml              # Code generation config (Rust + TypeScript)
  Cargo.toml                # Rust workspace root
  package.json              # Bun workspace root
  turbo.json                # Turborepo for JS/TS builds (or Bun workspace scripts)
```

---

## Installation

### Rust (Data Plane)

```toml
# Cargo.toml workspace dependencies
[workspace.dependencies]
tokio = { version = "1.47", features = ["full"] }
hyper = { version = "1.7", features = ["http1", "http2", "server", "client"] }
hyper-util = { version = "0.1", features = ["tokio", "http1", "http2", "server-auto", "client-legacy"] }
tower = { version = "0.4", features = ["timeout", "limit", "load-shed"] }
tower-http = { version = "0.6", features = ["trace", "compression-gzip", "request-id", "cors"] }
rustls = { version = "0.23", features = ["aws_lc_rs"] }
tokio-rustls = "0.26"
tonic = { version = "0.14", features = ["tls", "gzip"] }
tonic-build = "0.14"
prost = "0.14"
prost-types = "0.14"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bytes = "1"
tokio-util = { version = "0.7", features = ["codec"] }
wasmtime = { version = "29", features = ["async", "component-model", "cranelift"] }
regorus = "0.9"
ed25519-dalek = { version = "2.2", features = ["rand_core"] }
sha2 = "0.10"
rs_merkle = "1.5"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
opentelemetry = "0.30"
tracing-opentelemetry = "0.30"
clickhouse = { version = "0.14", features = ["lz4"] }
openidconnect = "4"
samael = { version = "0.0.17", features = ["xmlsec"] }
tract-onnx = "0.21"
uuid = { version = "1", features = ["v7"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "2"
anyhow = "1"
```

### TypeScript (Control Plane)

```bash
# Control Plane API
bun add elysia @elysiajs/jwt @elysiajs/cors @elysiajs/openapi
bun add drizzle-orm postgres
bun add nice-grpc @bufbuild/protobuf
bun add @clickhouse/client
bun add -d drizzle-kit @bufbuild/protoc-gen-es typescript

# Dashboard
bun add next@16 react@19 react-dom@19
bun add @tanstack/react-query @tanstack/react-table
bun add zustand
bun add tailwindcss@4 @tailwindcss/postcss
bun add recharts
bun add nuqs
bun add -d typescript @types/react @types/react-dom

# shadcn/ui (init, then add components as needed)
bunx shadcn@latest init
bunx shadcn@latest add button card dialog table tabs chart
```

### Proto Tooling

```bash
# Install buf CLI
brew install bufbuild/buf/buf  # or via npm: bunx buf

# buf.gen.yaml configures both Rust (prost) and TypeScript (protoc-gen-es) generation
buf generate proto/
```

---

## Version Pinning Strategy

| Component | Strategy | Rationale |
|-----------|----------|-----------|
| Rust toolchain | Pin via `rust-toolchain.toml` to specific stable version | Reproducible builds across team |
| tokio | Pin to LTS (1.47.x) | LTS guarantees backports until Sep 2026 |
| wasmtime | Pin to exact minor version | Wasmtime does frequent breaking major releases |
| Next.js | Pin to 16.1.x | Stable with Turbopack |
| Elysia | Pin to 1.4.x | Active development, minor versions are stable |
| PostgreSQL | 17.x | Current stable, avoid bleeding-edge 18.x for infra |
| ClickHouse | 25.8 LTS | LTS release, production-safe |
| Bun | 1.3.x | Latest stable line |

---

## Key Technical Decisions Validated

### 1. Rust for Data Plane -- VALIDATED (HIGH confidence)

The <10ms p99 and <128MB RAM constraints make Rust the only viable choice. Go's GC pauses (1-10ms) would consume the entire latency budget. Python is not even in consideration. The Rust async ecosystem (tokio + hyper + tower) is mature and battle-tested for proxy workloads.

### 2. Bun + Elysia for Control Plane API -- VALIDATED (HIGH confidence)

Elysia 1.4.x on Bun 1.3.x is production-ready (used by financial institutions). End-to-end type safety with TypeScript shared across API and dashboard is a significant DX win. The only concern is gRPC support -- nice-grpc works but ConnectRPC (the more modern option) lacks official Bun support. This is a manageable gap.

### 3. Next.js + React for Dashboard -- VALIDATED (HIGH confidence)

Next.js 16 with Turbopack, React Compiler, and React 19 is the current standard for enterprise dashboards. shadcn/ui provides high-quality components with Tailwind v4 support. No credible alternative for this use case.

### 4. PostgreSQL + ClickHouse Split -- VALIDATED (HIGH confidence)

This is the correct pattern. PostgreSQL 17 for ACID config/metadata/users. ClickHouse 25.8 LTS for high-volume audit log analytics. Mixing these workloads in a single database would be the #1 architecture mistake.

### 5. Wasmtime for Wasm Policy Execution -- VALIDATED WITH MODIFICATION (HIGH confidence)

Wasmtime is correct for sandboxed execution of custom compiled policy extensions. However, for standard Rego policy evaluation, Regorus (Rust-native) is 10x faster and eliminates the Wasm compilation step. **Recommended architecture: Regorus for Rego policies, Wasmtime for custom Wasm extensions.**

### 6. Ed25519 + SHA-256 + Merkle -- VALIDATED (HIGH confidence)

ed25519-dalek, sha2, and rs_merkle are all battle-tested, pure-Rust, and well-maintained. This is the standard cryptographic evidence stack.

### 7. Docker Compose + Helm -- VALIDATED (HIGH confidence)

Standard deployment pattern. Compose for pilots, Helm for enterprise K8s. No innovation needed here.

### 8. gRPC + HTTP/2 Internal Comms -- VALIDATED (HIGH confidence)

tonic (Rust) + nice-grpc (TypeScript) + shared .proto definitions via buf. Standard pattern for polyglot microservices with strong contracts.

### 9. OIDC + SAML 2.0 Identity -- VALIDATED WITH CAVEAT (MEDIUM confidence)

openidconnect crate is solid for OIDC. samael for SAML is the only option in Rust but is less mature. **Recommendation: Handle SAML validation in the Control Plane (TypeScript), not in the Rust kernel. Pass verified identity claims to the kernel via signed headers or mTLS client certificates.**

---

## Gaps Identified (Requiring Phase-Specific Research)

1. **SSE/WebSocket inspection protocol details** -- How exactly to implement the sliding window token buffer for streaming responses needs prototyping, not just library selection. The codec/framing approach with tokio-util is correct, but the token detection logic is custom.

2. **ClickHouse schema design** -- The specific table schema (MergeTree engine, partition key, ORDER BY columns) needs design during the audit pipeline phase. Research shows best practices (low-cardinality ORDER BY, hourly partitioning) but the exact schema depends on query patterns.

3. **Regorus performance for complex policies** -- Benchmarked at 4.6ms for the OPA test suite. Need to validate with Interdict-specific policy patterns (allowlists, regex matching, PII detection rules) to confirm <2ms Layer 1 target.

4. **tract model selection** -- Need to benchmark specific ONNX models (MiniLM-L6 vs DistilBERT-tiny vs custom) for the PII/topic classification task. Model accuracy vs latency tradeoff needs experimentation.

5. **nice-grpc on Bun stability** -- nice-grpc uses grpc-js which was designed for Node. While Bun is Node-compatible, gRPC streaming stability under load needs validation.

6. **SAML in production** -- samael crate's production readiness needs validation with real enterprise IdPs (Okta SAML, Azure AD SAML). Consider a Node.js SAML library as fallback.

---

## Sources

### Verified (HIGH confidence)
- [Tokio crates.io](https://crates.io/crates/tokio) -- v1.49.0, LTS 1.47.x
- [Hyper crates.io](https://crates.io/crates/hyper) -- v1.7.0
- [Tonic crates.io](https://crates.io/crates/tonic) -- v0.14.3
- [Wasmtime crates.io](https://crates.io/crates/wasmtime) -- v40.0.1
- [Regorus GitHub](https://github.com/microsoft/regorus) -- v0.9.1, 10x faster than OPA
- [ed25519-dalek crates.io](https://crates.io/crates/ed25519-dalek) -- v2.2.0 stable
- [rs_merkle docs.rs](https://docs.rs/crate/rs_merkle/latest) -- v1.5.0
- [Elysia npm](https://www.npmjs.com/package/elysia) -- v1.4.26
- [Next.js 16 blog](https://nextjs.org/blog/next-16) -- v16.1.6
- [ClickHouse 2025 roundup](https://clickhouse.com/blog/clickhouse-2025-roundup) -- v25.8 LTS
- [PostgreSQL releases](https://www.postgresql.org/about/news/postgresql-182-178-1612-1516-and-1421-released-3235/) -- v18.2 / v17.8
- [Bun releases](https://github.com/oven-sh/bun/releases) -- v1.3.9
- [Tailwind CSS v4.2](https://tailwindcss.com/blog/tailwindcss-v4) -- v4.2.0
- [Drizzle ORM npm](https://www.npmjs.com/drizzle-orm) -- v0.45.1
- [Prost crates.io](https://crates.io/crates/prost) -- v0.14.3
- [TanStack Query npm](https://www.npmjs.com/package/@tanstack/react-query) -- v5.90.21
- [Zustand GitHub](https://github.com/pmndrs/zustand) -- market leader in React state 2025-2026

### Verified (MEDIUM confidence)
- [Tract GitHub](https://github.com/sonos/tract) -- Pure Rust ONNX, benchmarked on Pi Zero
- [OPA Wasm docs](https://www.openpolicyagent.org/docs/latest/wasm/) -- Rego compiles to Wasm
- [ConnectRPC](https://connectrpc.com/) -- No official Bun support yet
- [nice-grpc npm](https://www.npmjs.com/package/nice-grpc) -- TypeScript gRPC
- [Rustls GitHub](https://github.com/rustls/rustls) -- v0.23.x, aws-lc-rs recommended
- [OpenTelemetry Rust](https://opentelemetry.io/docs/languages/rust/) -- v0.30.x
- [samael crates.io](https://crates.io/crates/samael) -- Only Rust SAML library
- [openidconnect GitHub](https://github.com/ramosbugs/openidconnect-rs) -- Rust OIDC client
- [clickhouse crate docs](https://clickhouse.com/docs/integrations/rust) -- v0.14.x

### Web Search (LOW confidence -- verify during implementation)
- [Elysia + gRPC integration](https://github.com/elysiajs/elysia/issues/1632) -- Community exploring ConnectRPC integration
- [Cloudflare ClickHouse log analytics](https://blog.cloudflare.com/log-analytics-using-clickhouse/) -- Schema design patterns
- [Tokio + Tower + Hyper proxy guide](https://medium.com/@alfred.weirich/tokio-tower-hyper-and-rustls-building-high-performance-and-secure-servers-in-rust-ee4caff53114) -- Architecture patterns
