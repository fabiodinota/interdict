# Phase 4: Evidence Collector - Research

**Researched:** 2026-02-28
**Domain:** Cryptographic audit pipeline -- gRPC streaming, hash chains, Merkle trees, S3 WORM anchoring, ClickHouse batch ingestion
**Confidence:** HIGH

## Summary

Phase 4 introduces a standalone Rust binary (`interdict-collector`) that receives evidence events from the kernel via gRPC client-streaming, constructs SHA-256 hash chains with Ed25519 digital signatures, builds hourly Merkle trees, anchors root hashes to S3 Object Lock (WORM), and batch-inserts to ClickHouse with strict rate limiting to avoid "too many parts" failures. A separate standalone verifier binary (`interdict-verify`) enables auditors to independently validate chain integrity, signatures, and Merkle root anchoring without any network access to production.

The Rust ecosystem has mature, well-maintained crates for every component: `tonic` (gRPC), `ed25519-dalek` (signing), `rs_merkle` (Merkle trees), `clickhouse` (ClickHouse client with built-in `Inserter` batch API), `aws-sdk-s3` (S3 Object Lock), and `prost`/`tonic-build` (protobuf codegen). The kernel side requires a new async evidence buffer (bounded `tokio::sync::mpsc` channel) that flushes compressed bundles every 500ms via gRPC to the collector without adding latency to the proxied AI response path.

**Primary recommendation:** Use the official `clickhouse` crate's `Inserter` API with `with_max_rows(1000)` and `with_period(Duration::from_secs(1))` for batch control; use `tonic` for gRPC with client-streaming from kernel to collector; use `ed25519-dalek` 2.x with `rand_core` feature for signing (local dev) and `aws-sdk-kms` for KMS-backed signing (production); use `rs_merkle` for Merkle tree construction with SHA-256.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store SHA-256 hashes of prompt/response by default, not plaintext. Enterprise-configurable toggle to enable full text storage for regulations that require it.
- Include department/team attribution from SSO claims in every bundle, enabling per-department compliance reporting in Phase 9.
- Use zstd compression for evidence bundles sent from kernel to collector (fast, good ratio, mature Rust crate).
- Use protobuf as the wire and storage format. Self-describing, versioned, backward-compatible. Already needed for gRPC transport -- one schema for wire + storage.
- KMS-backed signing keys (AWS KMS / Azure Key Vault) with local in-memory cache. Kernel fetches signing key at startup, caches locally. Air-gapped mode falls back to file-based keys.
- Static key provisioning in Phase 4. Key rotation, revocation, and lifecycle management deferred to Phase 7 (Identity, Access & Security).
- In dev/test mode, auto-generate ephemeral Ed25519 keypairs at startup. No KMS dependency for local development. Clear marker in evidence bundles that they are dev-signed.
- One unique Ed25519 keypair per kernel instance. Enables attribution of which kernel signed which evidence. Limits blast radius if one key is compromised.
- Daily partitions (toYYYYMMDD). Balances query performance with part count management under the 150-parts-per-partition constraint.
- Configurable TTL with 7-year default retention. Aligns with financial services compliance (SOX, MiFID II). Enterprise can override per deployment.
- Create 2-3 basic materialized views in Phase 4: hourly violation counts, per-vendor usage stats, per-department summary. Phase 5 API queries these directly.
- Support optional embedded ClickHouse mode for single-node air-gapped deployments. External ClickHouse instance is the primary path.
- Three verification modes: single bundle, time-range chain, and full chain integrity check. Auditors pick scope based on investigation needs.
- Default output is human-readable summary with pass/fail per check. --json flag for machine-parseable output (CI pipelines, automated compliance checks).
- Export-based offline verification. Enterprise exports evidence bundles to a file or S3 bucket. Auditor runs CLI against the export with no network access to production.
- Standalone `interdict-verify` binary, separate from evidence-collector. Clean trust boundary -- verification code isolated from collection code. Auditors download one tool with zero runtime dependencies.

### Claude's Discretion
- gRPC service definition structure and streaming patterns
- Merkle tree implementation details (batch size, tree depth)
- ClickHouse materialized view definitions
- Internal buffer management and backpressure strategy
- Embedded ClickHouse integration approach

### Deferred Ideas (OUT OF SCOPE)
- Key rotation and revocation lifecycle -- Phase 7 (Identity, Access & Security)
- TEE integration for evidence signing (AWS Nitro Enclaves) -- ADV-06 backlog
- Compliance report generation from evidence data -- Phase 9
- Evidence verification UI -- Phase 9
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EVID-01 | Evidence Collector service receives compressed log events from kernels via gRPC streaming | tonic 0.14.5 client-streaming with bounded mpsc channel + ReceiverStream; zstd 0.13.3 decompression on collector side |
| EVID-02 | Every evidence bundle includes SHA-256 hash incorporating the previous bundle's hash (linked chain) | sha2 0.10 crate (already in kernel); chain linkage field in protobuf schema; previous_hash field computed before serialization |
| EVID-03 | Every evidence bundle is digitally signed with Ed25519 using a kernel-specific private key | ed25519-dalek 2.2.0 with rand_core feature for local keypairs; aws-sdk-kms for production KMS-backed signing with ECC_NIST_EDWARDS25519 key spec |
| EVID-04 | Evidence bundles are structured into Merkle trees with hourly root hash computation | rs_merkle 1.5.0 with SHA-256 hasher; hourly cron-style flush builds tree from accumulated bundle hashes |
| EVID-05 | Hourly Merkle root hashes are anchored to S3 Object Lock (WORM) for external immutability verification | aws-sdk-s3 with ObjectLockMode::Compliance and retention period; bucket must have versioning + Object Lock enabled at creation |
| EVID-06 | Evidence bundle captures actor identity, AI vendor/model, prompt hash, policy evaluation result, response hash, token count, enforcement latency, chain linkage, and digital signature | Protobuf schema with all fields; enterprise-configurable full_text_storage toggle for prompt/response plaintext |
| EVID-07 | Evidence Collector batches inserts to ClickHouse (min 1000 rows, max 1 INSERT/sec) | clickhouse 0.14.2 Inserter API with with_max_rows(1000) + with_period(Duration::from_secs(1)); daily toYYYYMMDD partitions |
| EVID-08 | Evidence Collector is a separate Rust binary service | New crate `crates/evidence-collector` in workspace; separate `main.rs` with tonic server + ClickHouse writer + Merkle builder |
| EVID-09 | Signing private keys stored in HSM/KMS, never in env vars or config files | aws-sdk-kms Sign API for production; ed25519-dalek ephemeral keypairs for dev; KmsSigningProvider trait for abstraction |
| EVID-10 | Open-source regulator verification script for independent chain integrity auditing | Standalone `crates/interdict-verify` binary; reads exported protobuf bundles; verifies hash chain, Ed25519 signatures, Merkle roots against S3 anchors |
| KERN-14 | Evidence bundle creation is fully async -- binary logs compressed and pushed to local memory buffer, background flush every 500ms via gRPC to Evidence Collector | Bounded tokio::sync::mpsc channel in kernel; background tokio task drains buffer every 500ms; zstd compression before gRPC send; zero latency impact on proxied requests |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tonic | 0.14.5 | gRPC server (collector) and client (kernel) | De facto Rust gRPC framework; async/await native; HTTP/2 streaming; built on tokio + hyper + tower |
| tonic-build | 0.14.3 | Proto-to-Rust code generation in build.rs | Official companion to tonic; generates service traits and message types from .proto files |
| prost | 0.13.x | Protobuf serialization/deserialization | Official protobuf for Rust (tokio-rs); used by tonic internally; derives `Message` trait |
| clickhouse | 0.14.2 | ClickHouse HTTP client with typed Row derive and Inserter batch API | Official ClickHouse Rust client; Inserter API provides `with_max_rows`/`with_period` batch control; LZ4 compression built-in |
| ed25519-dalek | 2.2.0 | Ed25519 key generation, signing, and verification | Pure Rust; no unsafe code; constant-time signing; zeroize-on-drop; standard choice for Ed25519 in Rust |
| rs_merkle | 1.5.0 | Merkle tree construction and proof generation/verification | Most advanced Rust Merkle tree lib; SHA-256 built-in; multi-proof support; transactional append with commit/rollback |
| sha2 | 0.10 | SHA-256 hashing (already in kernel Cargo.toml) | RustCrypto standard; already used in kernel for content hashing |
| aws-sdk-s3 | latest | S3 Object Lock (WORM) for Merkle root anchoring | Official AWS SDK for Rust; supports ObjectLockMode::Compliance and retention configuration |
| aws-sdk-kms | latest | KMS-backed Ed25519 signing in production | Official AWS SDK; supports ECC_NIST_EDWARDS25519 key spec with ED25519_SHA_512 signing algorithm |
| zstd | 0.13.3 | Zstandard compression for evidence bundles over gRPC | Mature C binding; streaming Read/Write wrappers; fast compression with good ratio; user decision from CONTEXT.md |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tokio | 1.47 | Async runtime (already in workspace) | All async operations; mpsc channels for evidence buffer; interval timers for flush/Merkle cycles |
| chrono | 0.4 | Timestamp handling (already in workspace) | Evidence bundle timestamps; hourly Merkle tree scheduling; TTL computation |
| uuid | 1.x | Unique identifiers (already in workspace) | Evidence bundle IDs; kernel instance IDs |
| clap | 4.x | CLI argument parsing for interdict-verify | Verification mode selection; output format flags; export path arguments |
| serde + serde_json | 1.x | JSON serialization for verification output | --json flag output in interdict-verify; human-readable summary formatting |
| tracing | 0.1 | Structured logging (already in workspace) | Collector service logging; error reporting; performance tracing |
| rand | 0.8 | Random number generation for dev keypairs | ed25519-dalek requires rand_core for SigningKey::generate; dev/test mode only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rs_merkle | merkletree crate | merkletree is simpler but lacks transactional append and multi-proof; rs_merkle is more feature-complete |
| clickhouse (official) | clickhouse-rs (suharev7) | clickhouse-rs uses native TCP protocol but lacks the typed Inserter API; official crate has better maintenance and HTTP-based transport |
| ed25519-dalek | ring | ring is C-based (not pure Rust); ed25519-dalek has better ergonomics for key serialization and is more widely used for Ed25519 specifically |
| aws-sdk-s3 | rust-s3 | rust-s3 is simpler but lacks Object Lock support; aws-sdk-s3 is official and fully supports WORM configuration |
| chdb (embedded ClickHouse) | DuckDB | chdb has Rust FFI bindings but immature for production; for air-gapped single-node, spawning a ClickHouse server process or using Docker is more reliable |

**Installation (Cargo.toml for evidence-collector):**
```toml
[dependencies]
tonic = { version = "0.14", features = ["zstd"] }
prost = "0.13"
prost-types = "0.13"
clickhouse = { version = "0.14", features = ["inserter", "lz4"] }
ed25519-dalek = { version = "2.2", features = ["rand_core", "serde", "zeroize"] }
rs_merkle = "1.5"
sha2 = "0.10"
aws-sdk-s3 = "1"
aws-sdk-kms = "1"
aws-config = "1"
zstd = "0.13"
tokio = { version = "1", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
anyhow = "1"
thiserror = "2"
rand = "0.8"

[build-dependencies]
tonic-build = "0.14"
prost-build = "0.13"
```

## Architecture Patterns

### Recommended Project Structure
```
crates/
├── kernel/                    # Existing kernel crate
│   └── src/
│       ├── evidence/          # NEW: Evidence buffer + gRPC client
│       │   ├── mod.rs         # EvidenceBuffer, BackgroundFlusher
│       │   ├── bundle.rs      # EvidenceBundle construction from pipeline results
│       │   └── client.rs      # gRPC client wrapper (tonic)
│       └── ...
├── evidence-collector/        # NEW: Separate Rust binary (EVID-08)
│   ├── Cargo.toml
│   ├── build.rs               # tonic-build proto compilation
│   ├── src/
│   │   ├── main.rs            # Service startup, config, graceful shutdown
│   │   ├── grpc/
│   │   │   ├── mod.rs
│   │   │   └── service.rs     # EvidenceCollector gRPC service impl
│   │   ├── chain/
│   │   │   ├── mod.rs
│   │   │   ├── hasher.rs      # SHA-256 chain linkage computation
│   │   │   └── signer.rs      # Ed25519 signing (KMS + local providers)
│   │   ├── merkle/
│   │   │   ├── mod.rs
│   │   │   └── builder.rs     # Hourly Merkle tree construction + S3 anchoring
│   │   ├── storage/
│   │   │   ├── mod.rs
│   │   │   ├── clickhouse.rs  # ClickHouse Inserter batch writer
│   │   │   └── s3.rs          # S3 Object Lock WORM writer
│   │   ├── config.rs          # TOML configuration
│   │   └── signing/
│   │       ├── mod.rs         # SigningProvider trait
│   │       ├── kms.rs         # AWS KMS provider
│   │       └── local.rs       # File-based / ephemeral dev provider
│   └── proto/
│       └── evidence.proto     # Protobuf definitions
├── interdict-verify/          # NEW: Standalone verification binary (EVID-10)
│   ├── Cargo.toml
│   ├── build.rs
│   └── src/
│       ├── main.rs            # CLI entry point (clap)
│       ├── chain.rs           # Hash chain verification
│       ├── signature.rs       # Ed25519 signature verification
│       ├── merkle.rs          # Merkle root verification against S3 anchors
│       └── report.rs          # Human-readable + JSON output formatting
└── proto/                     # Shared proto definitions (workspace level)
    └── interdict/
        └── evidence/
            └── v1/
                └── evidence.proto
```

### Pattern 1: Kernel Evidence Buffer (Async Fire-and-Forget)
**What:** Bounded tokio mpsc channel in the kernel collects evidence bundles without blocking the proxy hot path. A background task drains the buffer every 500ms, compresses with zstd, and streams to the collector via gRPC.
**When to use:** Every proxied request that passes through the policy pipeline.
**Example:**
```rust
// Source: Architecture pattern for KERN-14
use tokio::sync::mpsc;
use std::time::Duration;

const EVIDENCE_BUFFER_SIZE: usize = 8192;
const FLUSH_INTERVAL: Duration = Duration::from_millis(500);

pub struct EvidenceBuffer {
    tx: mpsc::Sender<RawEvidenceEvent>,
}

impl EvidenceBuffer {
    pub fn new() -> (Self, mpsc::Receiver<RawEvidenceEvent>) {
        let (tx, rx) = mpsc::channel(EVIDENCE_BUFFER_SIZE);
        (Self { tx }, rx)
    }

    /// Non-blocking send -- drops event if buffer full (fail-open for evidence).
    /// Evidence loss is acceptable vs. adding latency to AI responses.
    pub fn try_send(&self, event: RawEvidenceEvent) {
        if self.tx.try_send(event).is_err() {
            tracing::warn!("evidence buffer full, dropping event");
        }
    }
}

// Background flusher task
async fn evidence_flusher(
    mut rx: mpsc::Receiver<RawEvidenceEvent>,
    grpc_client: EvidenceCollectorClient,
) {
    let mut interval = tokio::time::interval(FLUSH_INTERVAL);
    let mut batch = Vec::with_capacity(256);

    loop {
        tokio::select! {
            _ = interval.tick() => {
                if !batch.is_empty() {
                    let compressed = zstd::encode_all(
                        &batch_to_proto_bytes(&batch)[..], 3
                    ).unwrap_or_default();
                    // Send via gRPC client-streaming
                    let _ = grpc_client.submit_evidence(compressed).await;
                    batch.clear();
                }
            }
            Some(event) = rx.recv() => {
                batch.push(event);
            }
        }
    }
}
```

### Pattern 2: Hash Chain with Previous Link
**What:** Each evidence bundle incorporates the SHA-256 hash of the previous bundle, creating a tamper-evident linked chain. Tampering with any single bundle breaks the chain from that point forward.
**When to use:** Every evidence bundle received by the collector.
**Example:**
```rust
// Source: EVID-02 implementation pattern
use sha2::{Digest, Sha256};

pub struct ChainState {
    previous_hash: [u8; 32],
    sequence_number: u64,
}

impl ChainState {
    pub fn new() -> Self {
        Self {
            previous_hash: [0u8; 32], // Genesis block has zero hash
            sequence_number: 0,
        }
    }

    /// Compute the chain hash for a new bundle.
    /// Hash = SHA-256(previous_hash || bundle_content_bytes)
    pub fn link(&mut self, bundle_content: &[u8]) -> ([u8; 32], u64) {
        let mut hasher = Sha256::new();
        hasher.update(&self.previous_hash);
        hasher.update(bundle_content);
        let hash: [u8; 32] = hasher.finalize().into();

        self.previous_hash = hash;
        self.sequence_number += 1;

        (hash, self.sequence_number)
    }
}
```

### Pattern 3: ClickHouse Inserter with Rate Limiting
**What:** The `clickhouse` crate's `Inserter` API accumulates rows and flushes when thresholds are reached. Configure `with_max_rows(1000)` and `with_period(Duration::from_secs(1))` to enforce the min-1000-rows / max-1-INSERT/sec contract.
**When to use:** All evidence bundle persistence to ClickHouse.
**Example:**
```rust
// Source: Official clickhouse crate docs + EVID-07 constraints
use clickhouse::{Client, Row, inserter::Inserter};
use serde::Serialize;
use std::time::Duration;

#[derive(Row, Serialize)]
pub struct EvidenceRow {
    pub event_date: u32,           // toYYYYMMDD partition key
    pub timestamp: i64,            // DateTime64(3)
    pub bundle_id: String,         // UUID
    pub kernel_id: String,         // UUID of signing kernel
    pub actor_identity: String,    // From SSO claims
    pub department: String,        // For per-department reporting
    pub vendor: String,            // AI vendor domain
    pub model: String,             // AI model name
    pub prompt_hash: String,       // SHA-256 of prompt
    pub response_hash: String,     // SHA-256 of response
    pub prompt_text: String,       // Empty unless full_text_storage enabled
    pub response_text: String,     // Empty unless full_text_storage enabled
    pub policy_action: String,     // allow/redact/block
    pub policy_rules: String,      // JSON array of applied rules
    pub token_count: u32,          // Total tokens
    pub enforcement_latency_us: u64, // Microseconds
    pub chain_hash: String,        // SHA-256 chain linkage
    pub previous_hash: String,     // Previous bundle's chain hash
    pub sequence_number: u64,      // Monotonic sequence
    pub signature: String,         // Ed25519 signature (hex)
    pub signing_key_id: String,    // Key ID for verification
    pub dev_signed: u8,            // Boolean: 1 if dev-signed
}

async fn create_inserter(client: &Client) -> Inserter<EvidenceRow> {
    client.inserter::<EvidenceRow>("evidence_bundles")
        .expect("create inserter")
        .with_max_rows(1000)
        .with_period(Some(Duration::from_secs(1)))
        .with_max_bytes(50_000_000) // 50MB safety limit
}
```

### Pattern 4: Signing Provider Abstraction
**What:** A trait that abstracts over KMS-backed signing (production) and local ephemeral keys (dev/test). The collector uses this trait throughout, and the concrete implementation is selected at startup based on configuration.
**When to use:** All evidence bundle signing operations.
**Example:**
```rust
// Source: EVID-09 + CONTEXT.md key management decisions
use async_trait::async_trait;

#[async_trait]
pub trait SigningProvider: Send + Sync {
    /// Sign a message and return the signature bytes.
    async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, SigningError>;

    /// Return the public key for verification.
    fn public_key(&self) -> &[u8];

    /// Return a key identifier for the evidence bundle.
    fn key_id(&self) -> &str;

    /// Whether this is a dev/ephemeral key.
    fn is_dev_key(&self) -> bool;
}

// Local dev implementation
pub struct LocalSigningProvider {
    signing_key: ed25519_dalek::SigningKey,
    key_id: String,
}

// KMS implementation
pub struct KmsSigningProvider {
    kms_client: aws_sdk_kms::Client,
    key_id: String,
    cached_public_key: Vec<u8>,
}
```

### Pattern 5: Hourly Merkle Tree with S3 Anchoring
**What:** The collector accumulates bundle hashes during each hour. At the top of each hour, it builds a Merkle tree from the accumulated hashes, computes the root, and uploads the root hash to S3 with Object Lock (WORM compliance mode).
**When to use:** Hourly scheduled operation in the collector.
**Example:**
```rust
// Source: rs_merkle docs + EVID-04/EVID-05 pattern
use rs_merkle::{MerkleTree, algorithms::Sha256 as MerkleSha256};

pub struct HourlyMerkleBuilder {
    leaf_hashes: Vec<[u8; 32]>,
    hour_start: chrono::DateTime<chrono::Utc>,
}

impl HourlyMerkleBuilder {
    pub fn new(hour_start: chrono::DateTime<chrono::Utc>) -> Self {
        Self {
            leaf_hashes: Vec::new(),
            hour_start,
        }
    }

    pub fn add_bundle_hash(&mut self, hash: [u8; 32]) {
        self.leaf_hashes.push(hash);
    }

    pub fn finalize(&self) -> Option<[u8; 32]> {
        if self.leaf_hashes.is_empty() {
            return None;
        }
        let tree = MerkleTree::<MerkleSha256>::from_leaves(&self.leaf_hashes);
        tree.root()
    }

    pub fn bundle_count(&self) -> usize {
        self.leaf_hashes.len()
    }
}
```

### Anti-Patterns to Avoid
- **Unbounded channels in kernel evidence path:** Violates KERN-13. Always use bounded `mpsc::channel(N)` with `try_send` to avoid blocking the proxy hot path.
- **Synchronous gRPC calls from kernel:** Evidence sending must be fully async and fire-and-forget. Never `await` evidence submission on the proxy request path.
- **One INSERT per evidence bundle:** Triggers ClickHouse "too many parts" within minutes under load. Always batch via the Inserter API.
- **Storing signing keys in config files or environment variables:** Violates EVID-09. Use KMS for production, ephemeral generation for dev. Never persist private key material to disk in production.
- **Full buffering of Merkle tree leaves in memory indefinitely:** Flush and reset at each hourly boundary. For high-throughput deployments, a single hour could accumulate millions of hashes -- size the Vec capacity based on expected throughput.
- **Blocking the chain state on ClickHouse writes:** Chain hash computation and ClickHouse insertion are independent. Compute the chain hash inline (fast), queue for ClickHouse batch insert asynchronously.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merkle tree construction | Custom tree traversal | `rs_merkle` 1.5.0 | Handles odd leaf counts, proof serialization, multi-proof; edge cases in manual implementation are subtle |
| Protobuf serialization | Manual binary encoding | `prost` + `tonic-build` | Schema evolution, backward compatibility, field presence tracking; manual encoding breaks on schema changes |
| ClickHouse batch rate limiting | Custom timer + row counter | `clickhouse` Inserter API | Built-in `with_max_rows`/`with_period`/`with_max_bytes` with progressive network send; handles timeouts and error recovery |
| Ed25519 signing | Raw crypto primitives | `ed25519-dalek` 2.2.0 | Constant-time operations, secure key zeroing, protection against known Ed25519 pitfalls (cofactor multiplication, malleability) |
| gRPC streaming + codegen | Raw HTTP/2 frames | `tonic` 0.14.5 | Flow control, error propagation, metadata handling, keepalive, load balancing; manual HTTP/2 streaming is error-prone |
| S3 Object Lock configuration | Raw REST API calls | `aws-sdk-s3` | Retry logic, SigV4 signing, endpoint resolution, region handling; manual S3 API calls are a maintenance burden |

**Key insight:** The cryptographic audit pipeline has zero room for subtle bugs. A single incorrect hash computation, missed chain link, or malformed signature makes the entire evidence chain legally worthless. Using battle-tested crates eliminates classes of bugs that would be invisible until an actual audit.

## Common Pitfalls

### Pitfall 1: ClickHouse "Too Many Parts" Under Load
**What goes wrong:** Each INSERT to a MergeTree table creates a new "part." If inserts arrive faster than background merges can consolidate parts, ClickHouse rejects inserts when active parts per partition exceed 300 (default). Under sustained load, this happens within minutes with unbatched inserts.
**Why it happens:** ClickHouse's merge-on-read architecture expects large, infrequent inserts. The merge thread pool has finite capacity.
**How to avoid:** Use the Inserter API with `with_max_rows(1000)` and `with_period(Duration::from_secs(1))`. This enforces the min-1000-rows / max-1-INSERT/sec contract from EVID-07. Monitor `system.parts` in ClickHouse to verify parts stay well below 150 per partition.
**Warning signs:** `DB::Exception: Too many parts` errors; increasing query latency; merge queue depth growing in `system.merges`.

### Pitfall 2: Chain Hash Ordering Sensitivity
**What goes wrong:** If evidence bundles arrive out of order (e.g., from multiple kernel instances), and the collector computes chain hashes based on arrival order rather than a deterministic sequence, the chain becomes non-reproducible. Verification fails on re-ordered exports.
**Why it happens:** gRPC client-streaming from multiple kernels arrives concurrently. Network jitter and load balancing change arrival order.
**How to avoid:** Maintain one chain per kernel instance (identified by kernel_id). Each kernel's chain is independently ordered by its local monotonic sequence number. The collector maintains separate `ChainState` per kernel_id. Cross-kernel ordering is handled at query time, not at chain computation time.
**Warning signs:** Verification failures on exported bundles; sequence number gaps; hash mismatches on re-verification.

### Pitfall 3: S3 Object Lock Requires Versioning at Bucket Creation
**What goes wrong:** S3 Object Lock (WORM) can only be enabled when creating a bucket. You cannot retroactively enable it on an existing bucket. If the bucket is created without Object Lock, Merkle root anchoring silently lacks WORM protection.
**Why it happens:** AWS design constraint. Versioning is a prerequisite, and Object Lock is an immutable bucket property.
**How to avoid:** Document bucket creation with `--object-lock-enabled-for-bucket` in deployment scripts. Verify Object Lock status at collector startup with `GetObjectLockConfiguration`. Fail startup if the bucket lacks Object Lock in production mode (allow bypass in dev mode).
**Warning signs:** `GetObjectLockConfiguration` returns empty or error; collector starts without WORM verification.

### Pitfall 4: Ed25519 Key Material Leakage
**What goes wrong:** Signing keys stored in config files, environment variables, or logged in error messages. A compromised key allows forging evidence bundles that pass verification.
**Why it happens:** Dev convenience leaking into production paths; error messages including key bytes.
**How to avoid:** Never log or serialize `SigningKey` structs. Use `zeroize` feature on ed25519-dalek (enabled by default in 2.x). KMS keys never leave the HSM -- only the key ID and public key are local. For dev mode, generate ephemeral keys at startup and mark bundles with `dev_signed = true`.
**Warning signs:** Key material in log output; `SigningKey` in Debug/Display impls; environment variable access for key bytes.

### Pitfall 5: Protobuf Schema Evolution Breaking Verification
**What goes wrong:** Adding required fields to the evidence bundle protobuf schema makes old bundles fail to deserialize during verification. Removing fields loses data that was present in historical bundles.
**Why it happens:** Protobuf schema changes without following backward compatibility rules.
**How to avoid:** All new fields must be `optional` with explicit field numbers. Never reuse field numbers. Never change field types. Include a `schema_version` field in the bundle. The verifier must handle all schema versions.
**Warning signs:** Deserialization errors on historical bundles; missing field warnings; field number collisions.

### Pitfall 6: Hourly Merkle Tree Empty or Oversized
**What goes wrong:** During low-traffic periods, an hourly window may have zero bundles (empty tree, no root to anchor). During peak traffic, millions of bundles create a very large tree that consumes significant memory.
**Why it happens:** Traffic is bursty and varies by time of day.
**How to avoid:** For empty windows: skip anchoring, record a "no-activity" marker in S3. For large windows: pre-allocate the leaf hash Vec based on configured capacity; consider sub-hourly checkpoints for very high throughput deployments (configurable). The `rs_merkle` crate handles unbalanced trees (non-power-of-2 leaf counts) correctly.
**Warning signs:** OOM during Merkle tree construction; gaps in hourly S3 anchors; tree construction taking seconds instead of milliseconds.

## Code Examples

Verified patterns from official sources:

### Protobuf Service Definition
```protobuf
// Source: tonic gRPC patterns + project requirements
syntax = "proto3";

package interdict.evidence.v1;

import "google/protobuf/timestamp.proto";

// Kernel streams compressed evidence batches to the collector.
service EvidenceCollector {
    // Client-streaming: kernel sends batches, collector acknowledges.
    rpc SubmitEvidence(stream EvidenceBatch) returns (SubmitResponse);
}

message EvidenceBatch {
    // Zstd-compressed serialized EvidenceBundles
    bytes compressed_payload = 1;
    string kernel_id = 2;
    uint64 batch_sequence = 3;
}

message SubmitResponse {
    uint64 accepted_count = 1;
    uint64 rejected_count = 2;
    string error_message = 3;
}

message EvidenceBundle {
    string bundle_id = 1;            // UUID
    string kernel_id = 2;            // Signing kernel UUID
    google.protobuf.Timestamp timestamp = 3;

    // Actor and context
    string actor_identity = 4;       // From SSO claims
    string department = 5;           // For per-department reporting
    string vendor = 6;               // AI vendor domain
    string model = 7;                // AI model name

    // Content hashes (default) or full text (enterprise toggle)
    string prompt_hash = 8;          // SHA-256
    string response_hash = 9;        // SHA-256
    string prompt_text = 10;         // Empty unless full_text_storage
    string response_text = 11;       // Empty unless full_text_storage

    // Policy evaluation
    string policy_action = 12;       // allow/redact/block
    string policy_rules_json = 13;   // JSON array of applied rules
    uint32 token_count = 14;
    uint64 enforcement_latency_us = 15;

    // Chain integrity
    bytes chain_hash = 16;           // SHA-256(previous_hash || content)
    bytes previous_hash = 17;        // Previous bundle's chain_hash
    uint64 sequence_number = 18;     // Monotonic per kernel

    // Digital signature
    bytes signature = 19;            // Ed25519 signature
    string signing_key_id = 20;      // Key ID for verification
    bool dev_signed = 21;            // True if ephemeral dev key

    // Schema evolution
    uint32 schema_version = 22;      // Current: 1
}
```

### ClickHouse Table Schema
```sql
-- Source: ClickHouse docs + CONTEXT.md decisions
CREATE TABLE IF NOT EXISTS evidence_bundles (
    event_date Date DEFAULT toDate(timestamp),
    timestamp DateTime64(3),
    bundle_id String,
    kernel_id String,
    actor_identity String,
    department LowCardinality(String),
    vendor LowCardinality(String),
    model LowCardinality(String),
    prompt_hash String,
    response_hash String,
    prompt_text String DEFAULT '',
    response_text String DEFAULT '',
    policy_action LowCardinality(String),
    policy_rules_json String,
    token_count UInt32,
    enforcement_latency_us UInt64,
    chain_hash String,
    previous_hash String,
    sequence_number UInt64,
    signature String,
    signing_key_id String,
    dev_signed UInt8 DEFAULT 0,
    schema_version UInt32 DEFAULT 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(event_date)
ORDER BY (kernel_id, sequence_number)
TTL event_date + INTERVAL 7 YEAR DELETE
SETTINGS index_granularity = 8192;

-- Materialized view: hourly violation counts
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_violations
ENGINE = SummingMergeTree
PARTITION BY toYYYYMMDD(hour)
ORDER BY (hour, policy_action)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    policy_action,
    count() AS violation_count,
    uniqExact(actor_identity) AS unique_actors,
    uniqExact(vendor) AS unique_vendors
FROM evidence_bundles
WHERE policy_action IN ('block', 'redact')
GROUP BY hour, policy_action;

-- Materialized view: per-vendor usage stats
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_vendor_usage
ENGINE = SummingMergeTree
PARTITION BY toYYYYMMDD(hour)
ORDER BY (hour, vendor, model)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    vendor,
    model,
    count() AS request_count,
    sum(token_count) AS total_tokens,
    avg(enforcement_latency_us) AS avg_latency_us
FROM evidence_bundles
GROUP BY hour, vendor, model;

-- Materialized view: per-department summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_department_summary
ENGINE = SummingMergeTree
PARTITION BY toYYYYMMDD(hour)
ORDER BY (hour, department, policy_action)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    department,
    policy_action,
    count() AS action_count,
    uniqExact(actor_identity) AS unique_actors
FROM evidence_bundles
GROUP BY hour, department, policy_action;
```

### tonic build.rs
```rust
// Source: tonic-build docs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)  // Collector is the server
        .build_client(true)  // Kernel is the client
        .compile_protos(
            &["proto/interdict/evidence/v1/evidence.proto"],
            &["proto/"],
        )?;
    Ok(())
}
```

### KMS Signing Provider
```rust
// Source: AWS KMS docs + ed25519-dalek docs
use aws_sdk_kms::Client as KmsClient;
use aws_sdk_kms::types::SigningAlgorithmSpec;

pub struct KmsSigningProvider {
    client: KmsClient,
    key_id: String,
    cached_public_key: Vec<u8>,
}

impl KmsSigningProvider {
    pub async fn new(key_id: String) -> Result<Self, anyhow::Error> {
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        let client = KmsClient::new(&config);

        // Fetch and cache public key at startup
        let pub_key_response = client.get_public_key()
            .key_id(&key_id)
            .send()
            .await?;
        let cached_public_key = pub_key_response
            .public_key()
            .expect("public key present")
            .as_ref()
            .to_vec();

        Ok(Self { client, key_id, cached_public_key })
    }

    pub async fn sign(&self, message: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
        let response = self.client.sign()
            .key_id(&self.key_id)
            .signing_algorithm(SigningAlgorithmSpec::from("ED25519_SHA_512"))
            .message(aws_sdk_kms::primitives::Blob::new(message))
            .send()
            .await?;

        Ok(response.signature()
            .expect("signature present")
            .as_ref()
            .to_vec())
    }
}
```

### S3 Object Lock Anchoring
```rust
// Source: AWS S3 docs
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::types::{ObjectLockMode, ObjectLockRetention};

pub async fn anchor_merkle_root(
    s3_client: &S3Client,
    bucket: &str,
    hour: &chrono::DateTime<chrono::Utc>,
    merkle_root: &[u8; 32],
    bundle_count: usize,
) -> Result<(), anyhow::Error> {
    let key = format!(
        "merkle-anchors/{}/{}.json",
        hour.format("%Y/%m/%d"),
        hour.format("%H"),
    );

    let body = serde_json::json!({
        "hour": hour.to_rfc3339(),
        "merkle_root": hex::encode(merkle_root),
        "bundle_count": bundle_count,
        "anchored_at": chrono::Utc::now().to_rfc3339(),
    });

    let retention_until = *hour + chrono::Duration::days(7 * 365); // 7-year retention

    s3_client.put_object()
        .bucket(bucket)
        .key(&key)
        .body(serde_json::to_vec(&body)?.into())
        .content_type("application/json")
        .object_lock_mode(ObjectLockMode::Compliance)
        .object_lock_retain_until_date(
            aws_sdk_s3::primitives::DateTime::from_millis(
                retention_until.timestamp_millis()
            )
        )
        .send()
        .await?;

    Ok(())
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| clickhouse-rs (suharev7) TCP client | Official `clickhouse` crate (ClickHouse team) HTTP client | 2023+ | Official crate has typed Inserter, Row derive, LZ4; preferred for new projects |
| ed25519-dalek 1.x | ed25519-dalek 2.x | 2023 (v2.0.0) | Major API change: `Keypair` removed, `SigningKey`/`VerifyingKey` introduced; zeroize-on-drop by default |
| tonic 0.9-0.11 | tonic 0.14.5 | 2024-2025 | Zstd compression support added; improved streaming; better error types |
| Manual protobuf encoding | prost 0.13.x with tonic-build | Ongoing | Unified codegen; better schema evolution support |
| AWS SDK v0.x (smithy-rs alpha) | AWS SDK 1.x (stable) | 2024 | GA release; stable API surface; proper retry/timeout defaults |

**Deprecated/outdated:**
- `ed25519-dalek` 1.x: Do not use; 2.x has different API (`Keypair` -> `SigningKey`/`VerifyingKey`), better safety defaults
- `clickhouse-rs` (suharev7): Not deprecated but unofficial; official `clickhouse` crate is preferred
- Manual `hyper` HTTP/2 for gRPC: Use `tonic` instead; handles all HTTP/2 framing, flow control, and error mapping

## Open Questions

1. **Embedded ClickHouse for air-gapped single-node**
   - What we know: chDB has Rust FFI bindings but is primarily designed for Python and batch analytics. It lacks continuous ingestion support.
   - What's unclear: Whether spawning a ClickHouse server process via Docker or a static binary is more reliable for air-gapped single-node deployments than chDB's FFI approach.
   - Recommendation: For Phase 4, implement the standard external ClickHouse path first. For the "embedded" option, spawn a ClickHouse server binary as a child process (or require a Docker container) rather than FFI embedding. Flag this as a deployment concern for Phase 10 to finalize.

2. **Per-kernel chain vs. global chain ordering**
   - What we know: Each kernel has its own Ed25519 keypair and produces an independent chain. The collector receives from multiple kernels concurrently.
   - What's unclear: Whether auditors need a single global ordering across all kernels, or whether per-kernel chains are sufficient for compliance.
   - Recommendation: Implement per-kernel chains (simplest, most robust). Global ordering can be derived at query time from ClickHouse using `ORDER BY (timestamp, kernel_id, sequence_number)`. This avoids a global coordination bottleneck in the collector.

3. **Merkle tree leaf capacity for high-throughput hours**
   - What we know: At 10,000 requests/sec (KERN-08), one hour could produce 36 million evidence bundles. Each leaf hash is 32 bytes, so the leaf array alone would be ~1.1 GB.
   - What's unclear: Whether rs_merkle handles this scale efficiently, or whether sub-hourly checkpoints are needed.
   - Recommendation: Make the Merkle window configurable (default: 1 hour). If leaf count exceeds a threshold (e.g., 1 million), automatically create sub-hourly checkpoints. Each checkpoint produces its own Merkle root and S3 anchor.

4. **AWS KMS Ed25519 availability**
   - What we know: AWS KMS supports `ECC_NIST_EDWARDS25519` with `ED25519_SHA_512` signing algorithm. This was added relatively recently.
   - What's unclear: Whether Azure Key Vault supports Ed25519 natively or requires a different curve. The CONTEXT.md mentions both AWS KMS and Azure Key Vault.
   - Recommendation: Implement AWS KMS first. Azure Key Vault support can use ECDSA with P-256 as a fallback if Ed25519 is not available. Abstract behind the `SigningProvider` trait so the algorithm difference is contained.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (built-in) + criterion (benchmarks, already in workspace) |
| Config file | Workspace Cargo.toml (edition 2024) |
| Quick run command | `cargo test -p evidence-collector --lib` |
| Full suite command | `cargo test --workspace --all-targets` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVID-01 | gRPC client-streaming receives compressed evidence | integration | `cargo test -p evidence-collector --test grpc_streaming` | Wave 0 |
| EVID-02 | SHA-256 chain linkage (each hash incorporates previous) | unit | `cargo test -p evidence-collector chain::tests` | Wave 0 |
| EVID-03 | Ed25519 signing with kernel-specific key | unit | `cargo test -p evidence-collector signing::tests` | Wave 0 |
| EVID-04 | Hourly Merkle tree from accumulated hashes | unit | `cargo test -p evidence-collector merkle::tests` | Wave 0 |
| EVID-05 | S3 Object Lock WORM anchoring | integration (mock S3) | `cargo test -p evidence-collector --test s3_anchoring` | Wave 0 |
| EVID-06 | Full evidence bundle schema with all fields | unit | `cargo test -p evidence-collector bundle::tests` | Wave 0 |
| EVID-07 | ClickHouse batch insert (min 1000, max 1/sec) | integration (mock CH) | `cargo test -p evidence-collector --test clickhouse_batching` | Wave 0 |
| EVID-08 | Separate binary compiles and runs | smoke | `cargo build -p evidence-collector && cargo build -p interdict-verify` | Wave 0 |
| EVID-09 | KMS signing provider + dev ephemeral fallback | unit | `cargo test -p evidence-collector signing::tests` | Wave 0 |
| EVID-10 | Verifier checks chain, signatures, Merkle roots | integration | `cargo test -p interdict-verify --test verification` | Wave 0 |
| KERN-14 | Async evidence buffer with 500ms flush (no proxy latency) | unit + integration | `cargo test -p kernel evidence::tests` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p evidence-collector --lib && cargo clippy -p evidence-collector -- -D warnings`
- **Per wave merge:** `cargo test --workspace --all-targets && cargo clippy --workspace --all-targets -- -D warnings`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `crates/evidence-collector/` -- entire crate needs creation (new binary)
- [ ] `crates/interdict-verify/` -- entire crate needs creation (new binary)
- [ ] `crates/kernel/src/evidence/` -- new module for evidence buffer + gRPC client
- [ ] `proto/interdict/evidence/v1/evidence.proto` -- shared protobuf definitions
- [ ] Workspace `Cargo.toml` update to add new workspace members
- [ ] `build.rs` for proto compilation in both new crates

## Sources

### Primary (HIGH confidence)
- [ClickHouse official Rust client docs](https://clickhouse.com/docs/integrations/rust) -- Inserter API, Row derive, batch insert patterns
- [clickhouse crate docs.rs](https://docs.rs/clickhouse/latest/clickhouse/inserter/struct.Inserter.html) -- Inserter v0.14.2 API reference
- [tonic crate docs.rs](https://docs.rs/tonic/latest/tonic/) -- tonic 0.14.5 streaming types and features
- [ed25519-dalek docs.rs](https://docs.rs/ed25519-dalek/latest/ed25519_dalek/) -- ed25519-dalek 2.2.0 API reference
- [rs_merkle docs.rs](https://docs.rs/rs_merkle/latest/rs_merkle/) -- rs_merkle 1.5.0 MerkleTree API
- [AWS S3 Object Lock docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) -- WORM configuration and PutObjectLockConfiguration API
- [AWS KMS key spec reference](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html) -- ECC_NIST_EDWARDS25519 + ED25519_SHA_512 signing
- [ClickHouse "too many parts" resolution](https://clickhouse.com/docs/knowledgebase/exception-too-many-parts) -- Official guidance on batch insert sizing

### Secondary (MEDIUM confidence)
- [ClickHouse GitHub clickhouse-rs README](https://github.com/ClickHouse/clickhouse-rs) -- Feature flags, version, examples verified against crate docs
- [tonic-build crate docs](https://docs.rs/tonic-build/latest/tonic_build/) -- Proto compilation configuration
- [zstd crate docs.rs](https://docs.rs/zstd) -- v0.13.3 streaming compression API
- [chDB Rust FFI bindings](https://github.com/chdb-io/chdb-rust) -- Embedded ClickHouse option assessment

### Tertiary (LOW confidence)
- Embedded ClickHouse viability for production air-gapped use -- chDB Rust bindings are early-stage; needs validation before Phase 10

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All crates verified via docs.rs with current versions; official ClickHouse Rust client Inserter API confirmed with exact methods
- Architecture: HIGH -- Patterns follow established tonic gRPC + ClickHouse batch insert idioms; hash chain and Merkle tree patterns are well-defined cryptographic constructions
- Pitfalls: HIGH -- ClickHouse "too many parts" is extensively documented by ClickHouse team; S3 Object Lock bucket requirement is in AWS docs; Ed25519 key safety is documented in ed25519-dalek crate

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable ecosystem; crate versions unlikely to break within 30 days)