# Architecture Research

**Domain:** AI Governance Kernel / Compliance Proxy Platform
**Researched:** 2026-02-26
**Confidence:** HIGH (core patterns) / MEDIUM (specific integration details)

## System Overview

```
                         ENTERPRISE NETWORK BOUNDARY
 ============================================================================

  EMPLOYEES                       DATA PLANE (Rust)
  =========                       =================

  Browser  ----\                 +--------------------------------------------+
  IDE      -----+--- HTTPS/SSE  | INTERDICT KERNEL (per-pod sidecar)         |
  Agent    ----/    ------------>|                                            |
                                 |  +-----------+    +-----------+            |
                                 |  | Protocol  |    | Session   |            |
                                 |  | Decoder   |--->| Context   |            |
                                 |  | (HTTP/1.1,|    | Tracker   |            |
                                 |  |  H2, SSE, |    +-----+-----+            |
                                 |  |  WS, gRPC)|          |                  |
                                 |  +-----+-----+    +-----v-----+            |
                                 |        |          | 3-Layer    |            |
                                 |        |          | Enforcer   |            |
                                 |        |          |            |            |
                                 |        |          | L1: Wasm   |            |
                                 |        |          | L2: NLP    |            |
                                 |        |          | L3: Queue  |            |
                                 |        |          +-----+-----+            |
                                 |        |                |                  |
                                 |  +-----v-----+   +-----v------+           |
                                 |  | Streaming  |   | Evidence   |           |
                                 |  | Inspector  |   | Buffer     |           |
                                 |  | (sliding   |   | (in-mem,   |           |
                                 |  |  window)   |   |  flush     |           |
                                 |  +-----+------+   |  @500ms)   |           |
                                 |        |          +------+------+           |
                                 +--------|-----------------|------------------+
                                          |                 |
                     HTTPS/H2             |       gRPC      |  gRPC
               to AI Vendor APIs          |    (streaming)   |  (push)
                                          |                 |
  AI VENDORS <----------------------------+                 |
  ==========                                                |
  OpenAI                                                    |
  Anthropic                                                 |
  Cohere                                                    |
  Internal LLMs                                             |
                                                            |
               CONTROL PLANE (TypeScript)                   |
               ==========================                   |
                                                            |
  +----------------------------------------------------------v---------+
  |                                                                    |
  |  +------------------+    +------------------+                      |
  |  | EVIDENCE         |    | CONTROL PLANE    |                      |
  |  | COLLECTOR        |    | API              |                      |
  |  | SERVICE          |    | (Bun + Elysia)   |                      |
  |  |                  |    |                  |                      |
  |  | - Hash chain     |    | - Policy CRUD   |                      |
  |  | - Merkle tree    |    | - Policy compile |                      |
  |  | - Ed25519 sign   |    | - gRPC push     |                      |
  |  | - S3 WORM anchor |    | - Vendor mgmt   |                      |
  |  +--------+---------+    | - RBAC          |                      |
  |           |              | - Reg framework  |                      |
  |           |              +--------+---------+                      |
  |           |                       |                                |
  |     +-----v-------+        +-----v--------+                       |
  |     | ClickHouse  |        | PostgreSQL   |                       |
  |     | (audit logs,|        | (config,     |                       |
  |     |  analytics) |        |  policies,   |                       |
  |     +-------------+        |  users,      |                       |
  |                            |  metadata)   |                       |
  |                            +--------------+                       |
  |                                                                    |
  |  +------------------+                                              |
  |  | DASHBOARD        |                                              |
  |  | (Next.js + React)|                                              |
  |  |                  |                                              |
  |  | - Policy builder |                                              |
  |  | - Audit trail    |                                              |
  |  | - Vendor mgmt   |                                              |
  |  | - Compliance rpt |                                              |
  |  | - Evidence verify|                                              |
  |  +------------------+                                              |
  +--------------------------------------------------------------------+

 ============================================================================
```

## Component Responsibilities

| Component | Responsibility | Communicates With | Language/Runtime |
|-----------|----------------|-------------------|------------------|
| **Interdict Kernel** | Transparent proxy intercepting all AI traffic, enforcing policies inline, producing evidence | AI Vendors (HTTPS), Evidence Collector (gRPC stream), Control Plane API (gRPC for policy push) | Rust (tokio + hyper + tonic) |
| **Protocol Decoder** | Decode HTTP/1.1, HTTP/2, SSE, WebSocket, gRPC frames into a unified internal request representation | Internal to Kernel | Rust (hyper + h2 + tokio-tungstenite) |
| **Session Context Tracker** | Maintain multi-turn conversation state per actor+vendor pair, enabling cross-message policy evaluation | Internal to Kernel (in-memory HashMap) | Rust |
| **3-Layer Enforcer** | Execute policy pipeline: Wasm rules, NLP classification, human review queue | Wasm Runtime (embedded), NLP Model (embedded ONNX), Control Plane (human review API) | Rust + Wasmtime + ort |
| **Streaming Inspector** | Sliding window over SSE/streaming tokens, buffering 5-10 tokens to detect multi-token patterns before forwarding | Internal to Kernel | Rust |
| **Evidence Buffer** | Compress and batch evidence events in memory, flush to Evidence Collector every 500ms | Evidence Collector (gRPC client stream) | Rust |
| **Evidence Collector Service** | Receive evidence streams, compute SHA-256 hash chains, build hourly Merkle trees, sign with Ed25519, anchor to S3 Object Lock | Kernels (gRPC server), ClickHouse (batch insert), S3 (WORM write) | Rust (recommended) or TypeScript |
| **Control Plane API** | Policy CRUD, Rego-to-Wasm compilation, gRPC policy push, vendor registry, regulatory mapping, RBAC, audit query | Dashboard (REST/tRPC), Kernel fleet (gRPC), PostgreSQL (config), ClickHouse (query), Evidence Collector (management) | Bun + Elysia |
| **Dashboard** | UI for policy authoring, audit trail, vendor management, compliance reporting, evidence verification | Control Plane API only (never talks to kernel directly) | Next.js + React |
| **PostgreSQL** | Config, policy definitions (source Rego), compiled Wasm blobs, user accounts, RBAC, vendor registry, regulatory mappings | Control Plane API (primary client) | PostgreSQL 16+ |
| **ClickHouse** | High-volume audit log storage, analytics queries, anomaly detection data | Evidence Collector (bulk insert), Control Plane API (read queries), Dashboard (via API) | ClickHouse 24+ |

## Recommended Monorepo Structure

```
interdict/
├── Cargo.toml                    # Cargo workspace root
├── turbo.json                    # Turborepo config (TS packages only)
├── package.json                  # pnpm workspace root
├── pnpm-workspace.yaml           # pnpm workspace definition
│
├── proto/                        # Shared protobuf definitions
│   ├── buf.yaml                  # Buf configuration
│   ├── interdict/
│   │   ├── audit/v1/
│   │   │   └── audit.proto       # Evidence streaming service
│   │   ├── policy/v1/
│   │   │   └── policy.proto      # Policy distribution service
│   │   └── common/v1/
│   │       └── common.proto      # Shared types (Identity, Verdict, etc.)
│   └── buf.gen.yaml              # Buf code generation config
│
├── crates/                       # Rust workspace members
│   ├── kernel/                   # Main proxy binary
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── proxy/            # Protocol decoding, request/response handling
│   │       │   ├── mod.rs
│   │       │   ├── decoder.rs    # HTTP/1.1, H2, SSE, WS protocol parsing
│   │       │   ├── inspector.rs  # Sliding window streaming inspector
│   │       │   └── forwarder.rs  # Upstream forwarding
│   │       ├── enforce/          # 3-layer enforcement pipeline
│   │       │   ├── mod.rs
│   │       │   ├── pipeline.rs   # Orchestrates L1 -> L2 -> L3
│   │       │   ├── wasm.rs       # Wasmtime policy executor
│   │       │   ├── nlp.rs        # ONNX model inference
│   │       │   └── review.rs     # Human review queue client
│   │       ├── session/          # Session context tracking
│   │       ├── evidence/         # Evidence buffer and gRPC client
│   │       ├── config/           # Runtime configuration, gRPC policy receiver
│   │       └── vendor/           # Vendor allowlist enforcement
│   │
│   ├── evidence-collector/       # Evidence Collector service binary
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── chain.rs          # SHA-256 hash chain construction
│   │       ├── merkle.rs         # Merkle tree builder
│   │       ├── signing.rs        # Ed25519 signing
│   │       ├── anchor.rs         # S3 Object Lock writer
│   │       ├── grpc_server.rs    # gRPC stream receiver
│   │       └── clickhouse.rs     # ClickHouse batch inserter
│   │
│   ├── policy-compiler/          # OPA Rego -> Wasm compilation library
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── rego.rs           # Rego parsing and validation
│   │       ├── wasm.rs           # Wasm module compilation (wraps OPA CLI)
│   │       └── bundle.rs         # Bundle packaging
│   │
│   └── shared/                   # Shared Rust types and utilities
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── types.rs          # Core domain types (Identity, Verdict, etc.)
│           ├── crypto.rs         # Ed25519, SHA-256 helpers
│           └── proto.rs          # Generated protobuf types (from tonic-build)
│
├── packages/                     # TypeScript packages (pnpm + Turborepo)
│   ├── api/                      # Control Plane API (Bun + Elysia)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/
│   │       │   ├── policies.ts
│   │       │   ├── vendors.ts
│   │       │   ├── regulatory.ts
│   │       │   ├── audit.ts
│   │       │   └── auth.ts
│   │       ├── services/
│   │       │   ├── policy-compiler.ts    # Calls OPA CLI or policy-compiler crate via FFI
│   │       │   ├── policy-distributor.ts # gRPC client to push to kernels
│   │       │   ├── clickhouse.ts         # ClickHouse query service
│   │       │   └── regulatory-mapper.ts  # Jurisdiction -> policy config
│   │       ├── grpc/
│   │       │   └── kernel-push.ts        # gRPC server for kernel connections
│   │       └── middleware/
│   │           ├── auth.ts               # OIDC/SAML verification
│   │           └── rbac.ts               # Role-based access control
│   │
│   ├── dashboard/                # Next.js + React dashboard
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       └── lib/
│   │
│   ├── shared/                   # Shared TypeScript types
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts          # Domain types matching proto definitions
│   │       └── validators.ts
│   │
│   └── proto-gen/                # Generated TS protobuf types
│       ├── package.json
│       └── src/                  # Auto-generated from proto/ via buf
│
├── policies/                     # Example/default policy definitions
│   ├── base/
│   │   ├── pii-detection.rego
│   │   ├── vendor-allowlist.rego
│   │   └── data-classification.rego
│   └── frameworks/
│       ├── eu-ai-act.rego
│       ├── gdpr.rego
│       └── nist-ai-rmf.rego
│
├── deploy/                       # Deployment configurations
│   ├── docker/
│   │   ├── Dockerfile.kernel
│   │   ├── Dockerfile.evidence-collector
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.dashboard
│   │   └── docker-compose.yml
│   ├── k8s/
│   │   ├── helm/
│   │   │   └── interdict/
│   │   │       ├── Chart.yaml
│   │   │       ├── values.yaml
│   │   │       └── templates/
│   │   └── sidecar-inject.yaml
│   └── scripts/
│       ├── build.sh
│       └── dev.sh
│
├── models/                       # NLP model artifacts
│   └── classifier/
│       ├── model.onnx            # Pre-trained/fine-tuned classification model
│       └── tokenizer.json        # Tokenizer config
│
└── wit/                          # WebAssembly Interface Type definitions
    └── policy/
        ├── world.wit             # Policy plugin world
        └── types.wit             # Shared WIT types
```

### Structure Rationale

- **`proto/` at root:** Single source of truth for all gRPC definitions. Both Rust (tonic-build) and TypeScript (buf generate) consume the same proto files, ensuring type safety across the plane boundary.
- **`crates/` for Rust workspace:** Cargo workspace with independent crates for kernel, evidence-collector, policy-compiler, and shared types. Each crate compiles independently, enabling parallel CI builds and clear dependency boundaries.
- **`packages/` for TypeScript:** pnpm workspaces + Turborepo for the control plane. Separate packages for API, dashboard, and shared types.
- **`wit/` at root:** WIT definitions for the Wasm policy plugin interface, consumed by both the kernel host (Rust) and policy authors (any language targeting Wasm Components).
- **`policies/` at root:** Example Rego policies serving as both documentation and default deployments.
- **Dual build system:** Cargo workspace handles Rust; Turborepo handles TypeScript. A root `Makefile` or `justfile` orchestrates both via `cargo build --workspace` and `turbo run build`.

## Architectural Patterns

### Pattern 1: Data Plane / Control Plane Strict Separation

**What:** The kernel (data plane) never reads from PostgreSQL, never serves REST endpoints, never handles admin logic. The control plane never touches live AI traffic. Communication between planes is exclusively via gRPC.

**When to use:** Always. This is the non-negotiable foundation.

**Trade-offs:**
- Pro: Kernel stays fast and stateless; control plane can evolve independently
- Pro: Kernel crash does not affect admin operations; control plane restart does not drop traffic
- Con: More moving parts; requires well-designed gRPC contracts
- Con: Policy updates have a propagation delay (mitigated by gRPC push, not polling)

**Implementation:**
```
Kernel receives policies via gRPC push (control plane -> kernel)
Kernel sends evidence via gRPC stream (kernel -> evidence collector)
Kernel NEVER calls REST APIs, NEVER queries databases
```

### Pattern 2: Envoy-Inspired xDS Policy Distribution

**What:** Adapt the Envoy xDS pattern for policy distribution. The control plane API acts as an xDS-style management server. Kernels establish long-lived gRPC streams and receive policy updates as they happen -- not polling, not REST webhooks.

**When to use:** For pushing compiled Wasm policy modules, vendor allowlists, and configuration changes to the kernel fleet.

**Trade-offs:**
- Pro: Real-time propagation (sub-second); no polling overhead; push guarantees delivery order
- Pro: Battle-tested pattern from service mesh world (Envoy/Istio use it at massive scale)
- Con: Requires reconnection logic and state reconciliation on kernel restart

**gRPC service definition pattern:**
```protobuf
// proto/interdict/policy/v1/policy.proto

syntax = "proto3";
package interdict.policy.v1;

service PolicyDistribution {
  // Kernel connects and receives policy updates as a server stream.
  // Request includes kernel identity and current policy version vector.
  // Server sends full state on connect, then deltas.
  rpc SubscribePolicies(PolicySubscribeRequest) returns (stream PolicyUpdate);

  // Kernel reports its current enforcement status back
  rpc ReportStatus(KernelStatusReport) returns (KernelStatusAck);
}

message PolicySubscribeRequest {
  string kernel_id = 1;
  string cluster_id = 2;
  map<string, uint64> current_versions = 3; // policy_id -> version
}

message PolicyUpdate {
  string policy_id = 1;
  uint64 version = 2;
  PolicyAction action = 3;       // UPSERT or DELETE
  bytes wasm_module = 4;         // Compiled Wasm binary (only for UPSERT)
  PolicyMetadata metadata = 5;
  string checksum_sha256 = 6;    // Integrity check
}

enum PolicyAction {
  POLICY_ACTION_UNSPECIFIED = 0;
  POLICY_ACTION_UPSERT = 1;
  POLICY_ACTION_DELETE = 2;
}

message PolicyMetadata {
  string name = 1;
  string description = 2;
  uint32 priority = 3;           // Execution order
  EnforcementMode mode = 4;
  repeated string regulatory_frameworks = 5;
  repeated string applicable_vendors = 6;   // Empty = all vendors
  repeated string applicable_departments = 7;
}

enum EnforcementMode {
  ENFORCEMENT_MODE_UNSPECIFIED = 0;
  ENFORCEMENT_MODE_ENFORCE = 1;  // Block violations
  ENFORCEMENT_MODE_AUDIT = 2;    // Log only, don't block
  ENFORCEMENT_MODE_DISABLED = 3;
}
```

### Pattern 3: Streaming Evidence Pipeline (Async Sidecar Drain)

**What:** The kernel never blocks on evidence collection. Evidence events are serialized into a bounded in-memory ring buffer and flushed to the Evidence Collector via a gRPC client stream every 500ms (or when buffer hits threshold). The Evidence Collector handles the expensive cryptographic work (hash chain, Merkle tree, signing) asynchronously.

**When to use:** For all audit evidence. Zero evidence work should happen on the hot path.

**Trade-offs:**
- Pro: Evidence collection adds zero latency to AI response path
- Pro: Evidence Collector can batch ClickHouse inserts (1000+ rows per batch)
- Con: 500ms window means evidence could be lost on kernel crash (acceptable: crash-restart logs the gap)
- Con: Eventual consistency between action and audit record

**gRPC service definition pattern:**
```protobuf
// proto/interdict/audit/v1/audit.proto

syntax = "proto3";
package interdict.audit.v1;

import "google/protobuf/timestamp.proto";

service AuditPipeline {
  // Client streaming: kernel sends a continuous stream of evidence events.
  // Server acknowledges with the latest processed sequence number.
  rpc StreamEvidence(stream EvidenceEvent) returns (stream EvidenceAck);

  // Query API for the control plane
  rpc QueryAuditTrail(AuditQuery) returns (AuditQueryResponse);
}

message EvidenceEvent {
  string event_id = 1;            // UUIDv7 (time-sortable)
  string kernel_id = 2;
  uint64 sequence_number = 3;     // Monotonic per kernel, gap detection
  google.protobuf.Timestamp timestamp = 4;

  // Actor
  ActorIdentity actor = 5;

  // What happened
  string ai_vendor = 6;
  string ai_model = 7;
  RequestDirection direction = 8;  // INBOUND (to AI) or OUTBOUND (from AI)

  // Content fingerprints (NEVER plaintext prompts/responses)
  bytes prompt_hash_sha256 = 9;
  bytes response_hash_sha256 = 10;
  uint32 prompt_token_count = 11;
  uint32 response_token_count = 12;

  // Policy decision
  PolicyDecision decision = 13;

  // Session linkage
  string session_id = 14;
  uint32 turn_number = 15;

  // Chain linkage
  bytes previous_event_hash = 16;  // SHA-256 of previous evidence event
}

message ActorIdentity {
  string user_id = 1;
  string email = 2;
  string department = 3;
  string idp_source = 4;           // "okta", "azure_ad", etc.
  string jwt_fingerprint = 5;      // Hash of the JWT, not the JWT itself
}

message PolicyDecision {
  Verdict verdict = 1;
  repeated PolicyResult policy_results = 2;
  uint32 enforcement_latency_us = 3;  // Microseconds for full pipeline
}

enum Verdict {
  VERDICT_UNSPECIFIED = 0;
  VERDICT_ALLOW = 1;
  VERDICT_BLOCK = 2;
  VERDICT_REDACT = 3;
  VERDICT_REVIEW = 4;             // Sent to human review queue
}

message PolicyResult {
  string policy_id = 1;
  string policy_name = 2;
  Verdict result = 3;
  uint32 layer = 4;               // 1=Wasm, 2=NLP, 3=Human
  uint32 latency_us = 5;
  string detail = 6;              // Human-readable explanation
}

enum RequestDirection {
  REQUEST_DIRECTION_UNSPECIFIED = 0;
  REQUEST_DIRECTION_INBOUND = 1;    // User -> AI vendor
  REQUEST_DIRECTION_OUTBOUND = 2;   // AI vendor -> User
}

message EvidenceAck {
  uint64 last_sequence_number = 1;
  string merkle_batch_id = 2;       // Which Merkle batch this event joined
}
```

### Pattern 4: WIT-Based Policy Plugin API (Wasm Component Model)

**What:** Define the policy plugin interface using WIT (WebAssembly Interface Types) rather than the raw OPA Wasm ABI. This creates a type-safe contract between the kernel host and policy plugins, supporting both OPA-compiled Wasm and custom Wasm components.

**When to use:** For the L1 (Wasm) enforcement layer. All policy modules conform to this interface.

**Trade-offs:**
- Pro: Type-safe interface; policies can be authored in any language that targets Wasm Components (Rust, Go, Python, JS)
- Pro: Host can provide capabilities to policies (regex, data lookups) in a controlled way
- Con: Component Model adds ~50-100us overhead vs raw module instantiation (negligible vs policy logic)
- Con: OPA-compiled Wasm uses the older module ABI, not Component Model -- need an adapter layer

**WIT Definition:**
```wit
// wit/policy/world.wit

package interdict:policy@0.1.0;

interface types {
    record request-context {
        actor-id: string,
        actor-email: string,
        actor-department: string,
        vendor: string,
        model: string,
        direction: direction,
        session-id: string,
        turn-number: u32,
        content-hash: list<u8>,
        token-count: u32,
        metadata: list<tuple<string, string>>,
    }

    enum direction {
        inbound,
        outbound,
    }

    record policy-result {
        verdict: verdict,
        detail: string,
        matched-rules: list<string>,
    }

    enum verdict {
        allow,
        block,
        redact,
        review,
    }

    // Host-provided capabilities
    record regex-match {
        pattern: string,
        matched: bool,
        captures: list<string>,
    }
}

interface host-capabilities {
    use types.{regex-match};

    // Regex matching (compiled and cached by host for performance)
    regex-check: func(pattern: string, text: string) -> regex-match;

    // Data lookup (host-managed reference data)
    lookup-set: func(set-name: string, key: string) -> bool;

    // Logging (sandboxed, goes to policy evaluation log)
    log-debug: func(message: string);
}

world policy-plugin {
    import host-capabilities;

    use types.{request-context, policy-result};

    // Core evaluation function. Called for every request/response.
    export evaluate: func(ctx: request-context, content: list<u8>) -> policy-result;

    // Optional: streaming chunk evaluation for response inspection.
    // Called per token window. Return none to continue, some to act.
    export evaluate-chunk: func(ctx: request-context, chunk: list<u8>, window: list<u8>) -> option<policy-result>;

    // Metadata
    export name: func() -> string;
    export version: func() -> string;
    export description: func() -> string;
}
```

**Host-side Rust implementation pattern:**
```rust
// crates/kernel/src/enforce/wasm.rs (conceptual)

use wasmtime::component::{bindgen, Component, Linker};
use wasmtime::{Config, Engine, Store};

// Generate Rust bindings from WIT
bindgen!({
    world: "policy-plugin",
    path: "../../wit/policy",
    async: true,
});

struct PolicyHost {
    regex_cache: HashMap<String, Regex>,
    data_sets: HashMap<String, HashSet<String>>,
}

impl host_capabilities::Host for PolicyHost {
    async fn regex_check(&mut self, pattern: String, text: String) -> RegexMatch {
        let re = self.regex_cache.entry(pattern.clone())
            .or_insert_with(|| Regex::new(&pattern).unwrap());
        // ... perform match, return result
    }

    async fn lookup_set(&mut self, set_name: String, key: String) -> bool {
        self.data_sets.get(&set_name)
            .map(|s| s.contains(&key))
            .unwrap_or(false)
    }

    async fn log_debug(&mut self, message: String) {
        tracing::debug!(policy_log = %message);
    }
}
```

### Pattern 5: OPA-to-Wasm Dual Path (Component Adapter)

**What:** Support two policy authoring paths: (1) Rego policies compiled via OPA's built-in Wasm compiler, wrapped in a thin adapter to conform to the WIT interface; (2) Native Wasm Components written directly against the WIT interface in any language.

**When to use:** Rego path for day-one regulatory policies (faster to author for compliance teams). Native Wasm path for complex custom policies.

**OPA Compilation Pipeline:**
```
                    OPA CLI / Go API
Rego Source  ──────────────────────>  OPA Wasm Module (.wasm)
   (.rego)        opa build              (OPA ABI 1.x)
                  -t wasm                    │
                  -e entrypoint              │
                                             v
                                    Adapter Component
                                    (wraps OPA module in
                                     WIT-compatible shell)
                                             │
                                             v
                                    Policy Plugin (.wasm)
                                    (conforms to policy-plugin world)
```

**Key OPA Wasm ABI details** (from official docs, HIGH confidence):
- OPA compiles Rego to Wasm modules with exported functions: `eval()`, `builtins()`, `entrypoints()`, `opa_eval_ctx_new()`, `opa_eval_ctx_set_input()`, `opa_eval_ctx_set_data()`, `opa_eval_ctx_get_result()`
- Memory is managed via `opa_malloc()`/`opa_free()` and JSON parsing via `opa_json_parse()`/`opa_json_dump()`
- The host must implement `env.opa_abort()`, `env.opa_println()`, and `env.opa_builtin0/1/2/3/4()` as imports
- Compilation command: `opa build -t wasm -e <entrypoint> <rego_file>`
- Output is always an OPA bundle (tar.gz) containing `policy.wasm`
- Core Rego language is fully supported; `http.send` and similar I/O built-ins are not (must be implemented by host)

**Adapter layer:** The adapter is itself a Wasm Component that internally instantiates the OPA module, translates the WIT `request-context` into OPA JSON input, calls `eval()`, and translates the OPA JSON result back into a WIT `policy-result`. This is a fixed piece of infrastructure code, not per-policy.

### Pattern 6: Sliding Window Token Buffer for Streaming

**What:** For SSE/streaming responses from AI vendors, the kernel does not forward tokens immediately. Instead, it holds back a sliding window of 5-10 tokens, running policy evaluation on the accumulated window. If a violation is detected mid-stream, the connection is severed and remaining content replaced with `[REDACTED BY INTERDICT POLICY]`.

**When to use:** All streaming AI responses (SSE from OpenAI, Anthropic, etc.).

**Implementation approach:**
```
  AI Vendor SSE stream:
    token1 -> token2 -> token3 -> token4 -> token5 -> token6 -> ...
                                                        │
                          ┌─────────────────────────────┘
                          v
                    Sliding Window Buffer
                    [token2, token3, token4, token5, token6]
                          │
                          v
                    L1 Wasm evaluation on window text
                          │
                    ┌─────┴─────┐
                    │           │
                 ALLOW       BLOCK
                    │           │
                    v           v
              Forward       Sever connection
              token1        Insert redaction marker
              to client     Close upstream
```

**Key design decisions:**
- Window size is configurable per policy (default 5 tokens)
- The delay is imperceptible to users (tokens arrive ~50ms apart from most vendors)
- L1 (Wasm) runs on every window shift; L2 (NLP) runs only if L1 returns `review`
- Window state is per-stream, stored in the kernel's memory (not persisted)
- SSE parsing: split on `data:` lines, handle `[DONE]` sentinel

### Pattern 7: NLP Classifier as Embedded ONNX Model

**What:** Layer 2 of the enforcement pipeline is a lightweight NLP classifier running as an ONNX model embedded in the kernel process. Use the `ort` crate (Rust bindings for ONNX Runtime) to run a DistilBERT or similar small model for content classification (PII detection, topic classification, sensitivity scoring).

**When to use:** When L1 Wasm rules return an inconclusive or `review` verdict, and the content needs semantic analysis (not just pattern matching).

**Trade-offs:**
- Pro: Runs in-process, no network hop; inference in <10ms for small models
- Pro: Deterministic (same input = same output), unlike LLM-based classification
- Con: Model size (~60-100MB for DistilBERT ONNX); adds to kernel memory footprint
- Con: Must be fine-tuned for the specific classification tasks (PII, sensitivity, topic)
- Con: Not as flexible as LLM -- handles predefined categories only

**Model selection (MEDIUM confidence):**
- **Primary:** DistilBERT-base fine-tuned for multi-label classification, exported to ONNX with INT8 quantization. ~66MB model size, ~3-8ms inference on CPU.
- **Alternative:** A custom small model (2-3 transformer layers) trained specifically on governance-relevant categories. Smaller footprint, faster inference, but requires training investment.
- **Runtime:** `ort` crate (Rust ONNX Runtime bindings) -- 3-5x faster than Python, supports CPU execution providers. No GPU needed for small models.

**Architecture:**
```
L2 NLP Classifier (in kernel process)
├── Tokenizer (loaded from tokenizer.json at startup)
├── ONNX Session (loaded from model.onnx at startup, one per kernel)
├── Classification heads:
│   ├── PII detection (names, emails, SSNs, etc.)
│   ├── Sensitivity scoring (confidential, internal, public)
│   ├── Topic classification (financial, legal, medical, etc.)
│   └── Custom categories (configurable per deployment)
└── Threshold config (per category, per policy)
```

## Data Flow

### Primary Request Flow (Inline Enforcement)

```
Employee App
    │
    │ HTTPS request to AI vendor (e.g., api.openai.com)
    │ (intercepted by proxy config / sidecar network policy)
    v
INTERDICT KERNEL
    │
    ├── 1. Protocol Decode: Parse HTTP/H2/SSE/WS/gRPC
    │       Extract: method, headers, body/stream, target vendor
    │
    ├── 2. Identity Extract: Pull identity from JWT/SAML assertion
    │       Map to: user_id, email, department, IdP source
    │
    ├── 3. Vendor Check: Verify target is in approved vendor registry
    │       BLOCK if vendor not approved (fast path, no policy eval needed)
    │
    ├── 4. Session Lookup: Find or create session context
    │       Key: (user_id, vendor, conversation_id)
    │       Provides: turn history, accumulated context
    │
    ├── 5. L1 Wasm Evaluation (<2ms target)
    │   │   Run all active Wasm policy plugins in priority order
    │   │   Input: request-context + content bytes
    │   │   Each plugin returns: allow / block / redact / review
    │   │   Aggregate: strictest verdict wins (block > redact > review > allow)
    │   │
    │   ├── If BLOCK: Return 403 + policy violation message
    │   ├── If REDACT: Modify request body, continue to L1 check on modified content
    │   ├── If ALLOW: Skip L2, forward request
    │   └── If REVIEW: Continue to L2
    │
    ├── 6. L2 NLP Classification (<10ms target)
    │   │   Run ONNX model inference on content
    │   │   Categories: PII, sensitivity, topic
    │   │   Compare scores against per-policy thresholds
    │   │
    │   ├── If high-confidence classification: Apply verdict (block/allow/redact)
    │   └── If low-confidence: Route to L3 human review queue
    │
    ├── 7. L3 Human Review (async)
    │   │   Enqueue to review queue (via control plane API)
    │   │   Default behavior while pending: configurable (block / allow with flag)
    │   │
    │   └── Note: This is async. The request is either blocked pending review
    │       or allowed with an audit flag. Review happens in dashboard.
    │
    ├── 8. Forward Request: Proxy to AI vendor
    │       Maintain original headers, body (or redacted body)
    │       For streaming: enter response inspection loop (Pattern 6)
    │
    ├── 9. Response Inspection:
    │       Non-streaming: Buffer response, run L1+L2 on response body
    │       Streaming (SSE): Sliding window inspection per Pattern 6
    │       If violation in response: sever stream, insert redaction marker
    │
    └── 10. Evidence Emission (async, non-blocking):
            Push EvidenceEvent to in-memory buffer
            Buffer flushes to Evidence Collector via gRPC stream every 500ms
            Event includes: actor, vendor, hashes, verdict, latency, chain link
```

### Policy Update Flow

```
Compliance Officer (Dashboard)
    │
    │ Creates/edits policy in Policy Builder UI
    v
DASHBOARD (Next.js)
    │
    │ REST API call
    v
CONTROL PLANE API (Bun + Elysia)
    │
    ├── 1. Validate Rego syntax
    ├── 2. Store source in PostgreSQL (policies table)
    ├── 3. Compile: opa build -t wasm -e <entrypoint> <rego>
    │       Produces: policy.wasm (OPA bundle)
    ├── 4. Wrap in adapter (OPA ABI -> WIT Component)
    ├── 5. Store compiled Wasm blob in PostgreSQL
    ├── 6. Increment policy version
    ├── 7. Push PolicyUpdate to all subscribed kernels via gRPC stream
    │       (PolicyDistribution.SubscribePolicies server stream)
    │       Include: Wasm binary, metadata, checksum
    └── 8. Kernels receive update:
            - Verify checksum
            - Hot-load new Wasm module into Wasmtime engine
            - Update local policy registry (in-memory HashMap)
            - Begin enforcing new version on next request
            - No restart required
```

### Evidence and Audit Flow

```
KERNEL (per request)
    │
    │ EvidenceEvent (protobuf, compressed)
    │ Pushed to in-memory ring buffer
    │ Buffer auto-flushes every 500ms or at capacity
    v
EVIDENCE COLLECTOR SERVICE (gRPC stream receiver)
    │
    ├── 1. Receive batch of EvidenceEvents
    ├── 2. For each event:
    │       - Verify sequence continuity (detect gaps = kernel crash)
    │       - Compute SHA-256(event_bytes + previous_event_hash) -> event_hash
    │       - Append to hash chain
    │       - Add event_hash as leaf to current Merkle tree batch
    │
    ├── 3. Every hour (configurable):
    │       - Finalize Merkle tree
    │       - Compute Merkle root
    │       - Sign root with Ed25519 key
    │       - Create Merkle batch record:
    │           { batch_id, root_hash, signature, start_time, end_time,
    │             event_count, leaf_hashes }
    │
    ├── 4. Anchor to immutable storage:
    │       - S3 PutObject with Object Lock (WORM)
    │       - Content: signed Merkle batch + all evidence events
    │       - Retention: configurable (regulatory minimum, e.g., 7 years)
    │
    ├── 5. Batch insert to ClickHouse:
    │       - Denormalized event rows for analytics
    │       - 1000+ rows per INSERT for performance
    │
    └── 6. Acknowledge to kernel:
            - Return last_sequence_number processed
            - Return merkle_batch_id for cross-reference
```

## ClickHouse Schema Design

**Confidence:** MEDIUM (based on ClickHouse best practices, not production-validated for this exact use case)

```sql
-- Primary audit events table
CREATE TABLE audit_events (
    -- Time-sortable primary identifiers
    event_id UUID,                                  -- UUIDv7
    event_time DateTime64(3, 'UTC'),                -- Millisecond precision
    event_date Date MATERIALIZED toDate(event_time), -- For partition pruning

    -- Tenant isolation (multi-tenant from day one)
    tenant_id UInt32,

    -- Actor dimensions (LowCardinality for enum-like fields)
    actor_user_id String,
    actor_email String,
    actor_department LowCardinality(String),
    actor_idp_source LowCardinality(String),

    -- AI interaction dimensions
    ai_vendor LowCardinality(String),              -- "openai", "anthropic", etc.
    ai_model LowCardinality(String),               -- "gpt-4o", "claude-3.5-sonnet"
    direction LowCardinality(String),               -- "inbound", "outbound"

    -- Content fingerprints (NEVER store plaintext)
    prompt_hash FixedString(32),                    -- SHA-256 (32 bytes binary)
    response_hash FixedString(32),
    prompt_token_count UInt32,
    response_token_count UInt32,

    -- Policy decision
    verdict LowCardinality(String),                 -- "allow", "block", "redact", "review"
    enforcement_latency_us UInt32,                  -- Microseconds

    -- Policy results (nested as JSON string, queryable via JSON functions)
    policy_results String CODEC(ZSTD(3)),

    -- Session tracking
    session_id String,
    turn_number UInt16,

    -- Kernel metadata
    kernel_id String,
    sequence_number UInt64,

    -- Cryptographic chain
    event_hash FixedString(32),
    previous_event_hash FixedString(32),
    merkle_batch_id String
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(event_date))
ORDER BY (tenant_id, event_date, actor_department, ai_vendor, event_time)
TTL event_date + INTERVAL 7 YEAR
SETTINGS index_granularity = 8192;

-- Materialized view: Hourly aggregates per department
CREATE MATERIALIZED VIEW audit_hourly_stats
ENGINE = SummingMergeTree()
PARTITION BY (tenant_id, toYYYYMM(event_date))
ORDER BY (tenant_id, event_date, hour, actor_department, ai_vendor, verdict)
AS SELECT
    tenant_id,
    toDate(event_time) AS event_date,
    toStartOfHour(event_time) AS hour,
    actor_department,
    ai_vendor,
    verdict,
    count() AS event_count,
    sum(prompt_token_count) AS total_prompt_tokens,
    sum(response_token_count) AS total_response_tokens,
    avg(enforcement_latency_us) AS avg_latency_us
FROM audit_events
GROUP BY tenant_id, event_date, hour, actor_department, ai_vendor, verdict;

-- Materialized view: Policy violation tracking
CREATE MATERIALIZED VIEW audit_violations
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(event_date))
ORDER BY (tenant_id, event_date, verdict, ai_vendor, event_time)
AS SELECT
    event_id,
    event_time,
    toDate(event_time) AS event_date,
    tenant_id,
    actor_user_id,
    actor_email,
    actor_department,
    ai_vendor,
    ai_model,
    verdict,
    policy_results,
    session_id,
    turn_number
FROM audit_events
WHERE verdict IN ('block', 'redact', 'review');
```

**Schema design rationale:**
- **ORDER BY** starts with `tenant_id` (lowest cardinality, primary filter) then `event_date` (time range queries), then `actor_department` and `ai_vendor` (common dashboard filters), then `event_time` (final sort within groups).
- **PARTITION BY** includes `tenant_id` for strict tenant isolation and `toYYYYMM(event_date)` for monthly time partitioning. At 10K events/sec per tenant, monthly partitions stay well within the 1-300GB optimal range.
- **LowCardinality** on all enum-like string columns (vendor, model, department, verdict, direction) -- dictionary encoding dramatically reduces storage and speeds filtering.
- **FixedString(32)** for SHA-256 hashes -- avoids variable-length overhead.
- **ZSTD(3) codec** on the `policy_results` JSON column -- compresses well but with acceptable decompress speed.
- **TTL 7 years** -- regulatory minimum for most frameworks; configurable per deployment.
- **Materialized views** pre-aggregate common dashboard queries, avoiding full table scans.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **Pilot (80 users, ~100 req/s)** | Single kernel instance, single Evidence Collector, single-node ClickHouse, single-node PostgreSQL. Docker Compose. Everything on one VM is fine. |
| **Mid-market (1K-5K users, ~5K req/s)** | Multiple kernel sidecar instances (one per app pod). Dedicated Evidence Collector replica set. ClickHouse with 2-3 shards. PostgreSQL with read replicas. Kubernetes deployment. |
| **Enterprise (10K-50K users, ~50K req/s)** | Kernel fleet with horizontal scaling (stateless, so linear). Evidence Collector scaled to 3-5 replicas with consistent hashing for chain ordering. ClickHouse cluster (sharded by tenant_id). PostgreSQL with pgBouncer connection pooling. S3-compatible storage with cross-region replication. |
| **Large Enterprise (100K+ users, ~500K req/s)** | Kernel auto-scaling based on request rate. Evidence pipeline may need Kafka/NATS as buffer between kernels and Evidence Collector to handle burst. ClickHouse with ReplicatedMergeTree across availability zones. Dedicated ClickHouse cluster per large tenant. |

### Scaling Priorities (what breaks first)

1. **First bottleneck: Evidence Collector throughput.** At high request volumes, the single Evidence Collector becomes a bottleneck for hash chain construction (sequential by nature). Mitigation: partition chains by kernel_id (each kernel maintains its own chain), merge into Merkle trees per batch. This allows parallel Evidence Collector instances.

2. **Second bottleneck: ClickHouse insert throughput.** Solved by batching (already designed in) and adding shards. ClickHouse handles 100K+ inserts/sec per node with proper batching.

3. **Third bottleneck: Policy compilation latency.** OPA compilation is CPU-intensive. At scale with many policy changes, the control plane may need a dedicated compilation worker pool. Mitigation: compile asynchronously, queue compilation jobs.

4. **Kernel itself is unlikely to bottleneck** -- Rust + tokio handles >10K concurrent connections per instance. The Wasm evaluation is <2ms. NLP inference is <10ms. The proxy overhead is dominated by network I/O to the AI vendor, not kernel processing.

## Anti-Patterns

### Anti-Pattern 1: Synchronous Evidence Collection on Hot Path

**What people do:** Write evidence to database or external service synchronously before returning the AI response to the user.
**Why it's wrong:** Adds 5-50ms of latency per request for database writes, hash computation, and signing. At 10K req/s this destroys the latency budget and makes the kernel a bottleneck.
**Do this instead:** Async evidence buffer with background flush. Evidence is eventually consistent (500ms max lag), which is acceptable for audit purposes. No auditor needs real-time logs.

### Anti-Pattern 2: Polling for Policy Updates

**What people do:** Kernel periodically polls the control plane API for policy changes (e.g., every 30 seconds via REST).
**Why it's wrong:** 30-second propagation delay is unacceptable for security policy changes. Polling at high frequency wastes bandwidth and CPU. Polling at low frequency leaves enforcement gaps.
**Do this instead:** Long-lived gRPC server stream from control plane to kernels. Push-based delivery ensures sub-second propagation. Reconnection with version vector handles kernel restarts.

### Anti-Pattern 3: Storing Plaintext Prompts/Responses in Audit Logs

**What people do:** Log the full text of every prompt and response for auditability.
**Why it's wrong:** Creates a honeypot of sensitive data. If the audit log is breached, every AI conversation is exposed. Also violates GDPR data minimization and potentially creates new compliance liabilities.
**Do this instead:** Store SHA-256 hashes of content (prompt_hash, response_hash) in the audit log. Store token counts for usage analytics. The plaintext is reconstructable from the original system (if needed for investigation) but never centralized in the audit pipeline. Evidence bundles in S3 WORM may optionally include encrypted content for forensic access with strict key management.

### Anti-Pattern 4: Mixing Data Plane and Control Plane Concerns

**What people do:** Add REST endpoints to the kernel for configuration, or have the kernel query PostgreSQL for policy definitions.
**Why it's wrong:** The kernel becomes a monolith. Database connection pools consume memory and file descriptors. REST handler bugs can crash the proxy. Configuration queries add latency to the hot path. The kernel can no longer be truly stateless.
**Do this instead:** Kernel receives ALL configuration via gRPC push from the control plane. Kernel has zero database dependencies. Kernel exposes only a health check endpoint and gRPC streams.

### Anti-Pattern 5: Evaluating All Policy Layers on Every Request

**What people do:** Run L1 (Wasm) + L2 (NLP) + L3 (Human) on every single request regardless of L1 result.
**Why it's wrong:** NLP inference at 5-10ms per request is expensive at scale. If L1 gives a definitive ALLOW or BLOCK, running L2 wastes CPU and adds latency for no benefit.
**Do this instead:** Short-circuit evaluation. L1 result of ALLOW or BLOCK is final. Only REVIEW triggers L2. L2 result of ALLOW or BLOCK is final. Only continued ambiguity triggers L3 (human review). Expected distribution: ~90% resolved at L1, ~9% at L2, ~1% at L3.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **AI Vendors (OpenAI, Anthropic, etc.)** | HTTPS proxy pass-through with TLS termination/re-origination | Kernel terminates incoming TLS, inspects, then originates new TLS to vendor. Must handle vendor-specific auth headers (API keys passthrough). |
| **Identity Providers (Okta, Azure AD)** | OIDC/SAML token validation in kernel + control plane | Kernel validates JWT signature and extracts claims. Control plane manages IdP configuration. Keys fetched from JWKS endpoint and cached. |
| **S3-Compatible Storage** | S3 PutObject with Object Lock from Evidence Collector | Use AWS SDK for Rust (`aws-sdk-s3`). Object Lock requires bucket-level configuration. MinIO for on-prem deployments. |
| **Container Registries** | Docker image publishing for all services | Multi-arch builds (amd64 + arm64). Kernel image should be minimal (scratch or distroless base). |

### Internal Boundaries

| Boundary | Communication | Protocol | Authentication |
|----------|---------------|----------|----------------|
| Kernel <-> Evidence Collector | Unidirectional stream (kernel sends events) | gRPC client streaming | mTLS (mutual TLS certificates) |
| Kernel <-> Control Plane API | Bidirectional (policy push + status reports) | gRPC server streaming + unary | mTLS |
| Control Plane API <-> Dashboard | Request/response | REST (HTTP/2) or tRPC | Session cookie + RBAC middleware |
| Control Plane API <-> PostgreSQL | Query/write | PostgreSQL wire protocol | TLS + password/certificate |
| Evidence Collector <-> ClickHouse | Batch insert | ClickHouse native protocol or HTTP | TLS + password |
| Evidence Collector <-> S3 | Object write | HTTPS (S3 API) | IAM role or access key |
| All internal services | Service discovery | Kubernetes DNS or Docker Compose DNS | mTLS between all components |

## Build Order (Dependency-Driven)

The following build order reflects hard technical dependencies between components.

```
Phase 1: Foundation
├── proto/ definitions (everything depends on these)
├── crates/shared (types, crypto primitives)
├── packages/shared (TS types)
└── wit/ definitions (policy plugin contract)

Phase 2: Kernel Core
├── crates/kernel/proxy (protocol decode + forward without inspection)
├── Basic transparent proxy that passes traffic through
└── Performance benchmarks (establish baseline)

Phase 3: Enforcement Pipeline
├── crates/kernel/enforce/wasm (Wasmtime integration + WIT host)
├── crates/policy-compiler (Rego -> Wasm + adapter)
├── L1 enforcement working end-to-end
└── Streaming inspector (sliding window)

Phase 4: Evidence Pipeline
├── crates/evidence-collector (hash chain + Merkle tree + signing)
├── crates/kernel/evidence (buffer + gRPC client)
├── ClickHouse schema deployment
└── S3 Object Lock integration

Phase 5: Control Plane
├── packages/api (Elysia API with policy CRUD)
├── gRPC policy distribution (API -> kernel push)
├── PostgreSQL schema + migrations
└── RBAC + auth middleware

Phase 6: Dashboard
├── packages/dashboard (Next.js)
├── Policy builder UI
├── Audit trail views
└── Compliance reporting

Phase 7: NLP Layer (L2)
├── Model selection and fine-tuning
├── ONNX export + quantization
├── crates/kernel/enforce/nlp (ort integration)
└── Threshold calibration

Phase 8: Hardening
├── mTLS everywhere
├── Identity provider integration (OIDC/SAML)
├── Helm chart + K8s sidecar injection
├── Load testing at target scale
└── Security audit
```

**Rationale for this order:**
- Proto definitions and shared types are the foundation -- everything else depends on them.
- The kernel must work as a transparent proxy before adding enforcement (proves the proxy works, establishes performance baseline).
- Enforcement before evidence because enforcement is the core value proposition; evidence without enforcement is just logging.
- Control plane after kernel because the kernel can initially load policies from local files during development, but enforcement cannot work without the kernel.
- Dashboard last among features because it is a UI on top of working APIs; the API must exist first.
- NLP (L2) is deferred because L1 (Wasm/Rego) handles the majority of cases; L2 adds incremental value and requires model training investment.
- Hardening is last because security features (mTLS, OIDC) add complexity that slows down development velocity in early phases.

## Sources

- [OPA WebAssembly Documentation](https://www.openpolicyagent.org/docs/latest/wasm/) -- HIGH confidence, official docs
- [Wasmtime Component Model Bindgen](https://docs.wasmtime.dev/api/wasmtime/component/macro.bindgen.html) -- HIGH confidence, official docs
- [Building Native Plugin Systems with WebAssembly Components](https://tartanllama.xyz/posts/wasm-plugins/) -- MEDIUM confidence, detailed technical walkthrough
- [Envoy xDS Protocol Documentation](https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol) -- HIGH confidence, official docs
- [Tonic gRPC for Rust](https://github.com/hyperium/tonic) -- HIGH confidence, official repo
- [ClickHouse MergeTree Key Selection (Altinity)](https://kb.altinity.com/engines/mergetree-table-engine-family/pick-keys/) -- HIGH confidence, authoritative knowledge base
- [ort Crate - ONNX Runtime for Rust](https://ort.pyke.io) -- MEDIUM confidence, active project
- [rust-bert NLP Pipelines](https://github.com/guillaume-be/rust-bert) -- MEDIUM confidence, active project
- [Ed25519 + Merkle Tree Tamper-Proof Decision Logs](https://dev.to/veritaschain/ed25519-merkle-tree-uuidv7-building-tamper-proof-decision-logs-o1e) -- LOW confidence, community article
- [Constant-Size Cryptographic Evidence Structures for Regulated AI Workflows](https://arxiv.org/pdf/2511.17118) -- MEDIUM confidence, academic paper
- [Building a Scalable Audit Log System with ClickHouse](https://dev.to/epilot/building-a-scalable-audit-log-system-with-aws-and-clickhouse-jn5) -- LOW confidence, community article
- [ClickHouse Schema Design Best Practices](https://medium.com/@lureilly1/clickhouse-schema-design-best-practices-for-high-performance-analytics-5c26998c7e56) -- MEDIUM confidence
- [Monorepo with pnpm + Turborepo + Rust](https://github.com/spa5k/monorepo-typescript-rust) -- LOW confidence, example repo

---
*Architecture research for: AI Governance Kernel / Compliance Proxy Platform*
*Researched: 2026-02-26*
