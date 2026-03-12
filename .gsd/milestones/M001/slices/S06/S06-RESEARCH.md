# Phase 6: Policy Distribution & Kernel Integration - Research

**Researched:** 2026-03-01
**Domain:** gRPC server-streaming policy distribution, Rust hot-reload, session context tracking, hierarchical policy model
**Confidence:** HIGH

## Summary

Phase 6 connects the control plane (TypeScript/Bun/Elysia) to the kernel fleet (Rust) via a gRPC server-streaming distribution channel. When a compliance officer updates a policy in the control plane, the compiled Wasm module is pushed to all connected kernels in real-time without polling. Kernels hot-reload policy modules atomically using ArcSwap, ensuring zero-downtime updates. The phase also adds hierarchical policy scoping (Organization > Department > Team) with most-restrictive-wins conflict resolution, and session context tracking for multi-turn policy violation detection.

The codebase already has strong foundations: tonic 0.14 for gRPC, Arc-based sharing patterns, an evidence-collector gRPC service as a reference implementation, Wasmtime with pooling allocator, Regorus engine pools, and a most-restrictive-wins verdict merge pattern. The control plane has the policy CRUD API, async compilation worker, and an organization schema (departments/teams/users) already defined. The primary engineering challenge is wiring these pieces together: building the distribution proto and gRPC service, adding ArcSwap for atomic policy swaps in the kernel, and implementing a bounded in-memory session store.

**Primary recommendation:** Build the gRPC distribution service in the control plane using `@grpc/grpc-js` (Bun-compatible), implement the distribution client in the kernel using tonic 0.14, use `arc-swap` 1.7.1 for atomic policy set swaps, and implement session context as a bounded `DashMap` keyed by session ID with TTL-based expiry.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- xDS-style gRPC server-streaming: control plane opens long-lived server-stream per kernel, pushes updates when policies change
- Full snapshot on initial connect/reconnect, delta updates after (only changed/added/removed policies)
- Disconnect handling is configurable: default to fail-closed after timeout, but setting available to keep last-known policies with exponential backoff reconnect
- Policy versioning: monotonic version counter (higher = newer) paired with content hash (SHA-256 of compiled module) for integrity -- key-value map of version to content hash
- Three-level hierarchy: Organization > Department > Team
- No per-user policy overrides -- users inherit from their team
- Conflict resolution: most-restrictive-wins (consistent with existing verdict merge pattern). Lower levels can only tighten, never loosen org-level protections
- Per-vendor policy scoping within each hierarchy level
- Atomic Arc swap (ArcSwap pattern): new policy set behind Arc, atomic swap, in-flight requests finish with old policy, next request uses new. Zero downtime
- Rollback behavior is configurable: default to keeping previous working policy set on load failure (log error, report NACK to control plane), but setting available to fail-closed on bad policy
- Must work with existing RegorusPool and WasmEngine which hold engines in Arc
- Session storage: full content hashes (SHA-256) plus complete detection history per session
- Must enable detection of slow-leak data exfiltration across multiple exchanges (KERN-10)
- Session expiry/cleanup mechanism needed to bound memory

### Claude's Discretion
- Session boundary detection approach (header-based vs inferred)
- Exact reconnect backoff parameters
- Session storage implementation (in-memory bounded map vs other)
- Delta update wire format details
- gRPC service proto schema design

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTRL-03 | Policy distribution pushes compiled Wasm modules to kernel fleet via gRPC server-streaming (Envoy xDS-style pattern, not polling) | gRPC server-streaming with tonic 0.14 (kernel client) and @grpc/grpc-js (control plane server); xDS-style full snapshot + delta update protocol; proto schema design for PolicyDistribution service |
| PLCY-06 | Policy modules can be hot-reloaded at runtime without restarting the kernel binary | ArcSwap 1.7.1 for atomic policy set swap; ArcSwap::store() replaces current policy set while in-flight requests read old set via load(); zero-downtime reload |
| PLCY-08 | Policies are configurable per department, per user, and per AI vendor | Three-level hierarchy model (Org > Dept > Team) with per-vendor scoping; no per-user overrides (users inherit team); policy resolution at evaluation time using hierarchy context |
| PLCY-10 | Department-level policy segmentation with inheritance model: organization defaults -> department overrides -> team overrides | Most-restrictive-wins merge across hierarchy levels using existing VerdictAction ordering; lower levels can only tighten; PolicySet struct with org/dept/team layers merged at load time |
| KERN-10 | Kernel maintains session context across multi-turn conversations per user/session, detecting policy violations that emerge across multiple exchanges | Bounded DashMap session store with TTL expiry; SHA-256 content hashes per exchange; cumulative detection state tracks patterns across turns; slow-leak exfiltration detection via cross-turn analysis |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `arc-swap` | 1.7.1 | Atomic Arc swapping for hot-reload | 143M+ downloads; read-mostly optimized; lock-free reads; battle-tested in config hot-reload, routing tables, connection pools |
| `tonic` | 0.14 | gRPC client (kernel) for policy distribution stream | Already in workspace; proven with evidence-collector gRPC infrastructure |
| `prost` | 0.14 | Protobuf message types for distribution proto | Already in workspace; pairs with tonic 0.14 |
| `tokio-stream` | 0.1 | ReceiverStream wrapper for gRPC server-streaming | Already in workspace; wraps mpsc::Receiver into Stream trait |
| `dashmap` | 6 | Concurrent session context store | Already in workspace; lock-free concurrent HashMap; used for pending request tracking |
| `@grpc/grpc-js` | latest | gRPC server (control plane) for distribution service | Official gRPC implementation; Bun-compatible since v1.1.31; 95%+ test suite passes on Bun |
| `@grpc/proto-loader` | latest | Proto definition loading for control plane gRPC server | Companion to @grpc/grpc-js; dynamic proto loading |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crossbeam-queue` | 0.3 | Already used for RegorusPool | Engine pool queueing |
| `sha2` | 0.10 | Content hash computation for policy integrity and session tracking | Already in workspace |
| `chrono` | 0.4 | Timestamp handling for session expiry | Already in workspace |
| `uuid` | 1 | Session ID generation | Already in workspace |
| `tokio-util` | latest | CancellationToken for distribution client lifecycle | Already used in evidence-collector |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `arc-swap` | `RwLock<Arc<T>>` | RwLock adds contention on reads; ArcSwap is lock-free for reads which is critical for hot-path policy evaluation at >10k req/s |
| `arc-swap` | `std::sync::atomic` with raw pointer | Unsafe, error-prone; ArcSwap handles reference counting correctly |
| `@grpc/grpc-js` | `nice-grpc` | nice-grpc has cleaner API but @grpc/grpc-js is official, more battle-tested, and directly compatible with Bun |
| In-memory session store | Redis | Adds external dependency; kernel must remain self-contained per INFR-07; in-memory is sufficient for single-kernel session tracking |

**Installation (Rust -- kernel Cargo.toml):**
```toml
arc-swap = "1.7"
```

**Installation (TypeScript -- control plane):**
```bash
bun add @grpc/grpc-js @grpc/proto-loader
```

## Architecture Patterns

### Recommended Project Structure

#### Kernel (Rust) additions
```
crates/kernel/src/
├── policy/
│   ├── distribution/          # NEW: Policy distribution client
│   │   ├── mod.rs             # Module root, PolicyDistributionClient
│   │   ├── client.rs          # gRPC streaming client, reconnect logic
│   │   └── snapshot.rs        # Snapshot/delta processing, policy set builder
│   ├── hierarchy.rs           # NEW: Hierarchy resolution (org > dept > team)
│   ├── session.rs             # NEW: Session context store
│   ├── hot_reload.rs          # NEW: ArcSwap-based policy set manager
│   └── mod.rs                 # Updated: PolicyPipeline uses ArcSwap
├── config.rs                  # Updated: distribution + session config fields
└── main.rs                    # Updated: spawn distribution client

proto/interdict/policy/v1/
└── policy_distribution.proto  # NEW: Distribution service proto
```

#### Control Plane (TypeScript) additions
```
control-plane/src/
├── modules/
│   └── distribution/          # NEW: gRPC distribution server
│       ├── index.ts           # Module registration
│       ├── server.ts          # gRPC server setup + streaming logic
│       └── tracker.ts         # Connected kernel tracking, change notification
```

### Pattern 1: ArcSwap Hot-Reload for Policy Sets
**What:** Use `ArcSwap<PolicySet>` to hold the current active policy configuration. Readers (request handlers) call `policy_set.load()` for a lightweight, lock-free snapshot. Writers (distribution client) call `policy_set.store(new_arc)` to atomically swap.
**When to use:** Whenever multiple async tasks read a shared resource that is infrequently updated.
**Example:**
```rust
use arc_swap::ArcSwap;
use std::sync::Arc;

/// The complete set of policies active on this kernel.
struct PolicySet {
    regorus_pool: Arc<RegorusPool>,   // Rebuilt from new Rego sources
    wasm_modules: Vec<CompiledModule>, // Pre-compiled Wasm modules
    hierarchy: HierarchyConfig,        // Org > Dept > Team mappings
    version: u64,                      // Monotonic version counter
    content_hashes: HashMap<String, String>, // policy_id -> SHA-256
}

/// Held in the kernel's main state, shared across all request handlers.
struct KernelState {
    policy_set: Arc<ArcSwap<PolicySet>>,
}

// Reader (hot path -- every request):
let current = state.policy_set.load(); // Lock-free Arc clone
// current is an Arc<PolicySet>, in-flight requests keep their ref

// Writer (distribution client, infrequent):
let new_set = Arc::new(build_policy_set(update)?);
state.policy_set.store(new_set);
// Next request picks up new policies; in-flight requests unaffected
```

### Pattern 2: xDS-Style gRPC Server-Streaming Distribution
**What:** Control plane opens a long-lived server-stream per connected kernel. On initial connect, sends a full snapshot of all compiled policies. After that, sends delta updates (only changed/added/removed policies) when a compilation completes.
**When to use:** Real-time push-based configuration distribution to a fleet of data-plane nodes.
**Example (proto):**
```protobuf
service PolicyDistribution {
  // Kernel subscribes; control plane pushes updates
  rpc Subscribe(SubscribeRequest) returns (stream PolicyUpdate);
  // Kernel ACKs/NACKs each update
  rpc Acknowledge(AckRequest) returns (AckResponse);
}

message SubscribeRequest {
  string kernel_id = 1;
  uint64 current_version = 2;  // 0 on first connect = full snapshot
  string org_id = 3;
  string dept_id = 4;
  string team_id = 5;
}

message PolicyUpdate {
  uint64 version = 1;
  UpdateType type = 2;         // FULL_SNAPSHOT or DELTA
  repeated PolicyEntry policies = 3;
  repeated string removed_policy_ids = 4;  // For delta: IDs to remove
}

enum UpdateType {
  FULL_SNAPSHOT = 0;
  DELTA = 1;
}

message PolicyEntry {
  string policy_id = 1;
  string name = 2;
  uint64 version = 3;
  bytes wasm_bytes = 4;
  string wasm_hash = 5;       // SHA-256 for integrity verification
  string rego_source = 6;     // For Regorus evaluation
  string entrypoint = 7;
  PolicyScope scope = 8;
  FailMode fail_mode = 9;
}

message PolicyScope {
  string org_id = 1;
  string dept_id = 2;
  string team_id = 3;
  repeated string vendor_ids = 4;
}
```

### Pattern 3: Session Context Store (Bounded In-Memory Map)
**What:** Per-kernel in-memory store tracking multi-turn conversation state. Keyed by session ID, each entry holds content hash history and cumulative detection state. Bounded by max entries with TTL-based expiry.
**When to use:** Detecting policy violations that emerge across multiple exchanges (slow-leak data exfiltration, progressive jailbreak).
**Example:**
```rust
use dashmap::DashMap;
use std::time::{Duration, Instant};

struct SessionEntry {
    session_id: String,
    user_id: String,
    vendor: String,
    exchanges: Vec<ExchangeRecord>,
    detection_state: DetectionState,
    created_at: Instant,
    last_activity: Instant,
}

struct ExchangeRecord {
    request_hash: String,    // SHA-256 of prompt
    response_hash: String,   // SHA-256 of response
    timestamp: chrono::DateTime<chrono::Utc>,
    verdict: VerdictAction,
    categories_detected: Vec<String>,
}

struct DetectionState {
    total_redactions: u32,
    categories_seen: HashSet<String>,
    cumulative_risk_score: f32,
    // Slow-leak detection: if N distinct PII categories
    // appear across M exchanges, escalate
}

struct SessionStore {
    sessions: DashMap<String, SessionEntry>,
    max_sessions: usize,
    session_ttl: Duration,
}
```

### Pattern 4: Hierarchy Resolution (Most-Restrictive-Wins Cascade)
**What:** Policy evaluation resolves policies at three levels (org, dept, team) and merges them with most-restrictive-wins. Lower levels can only add restrictions, never remove them. Vendor-scoped policies within each level.
**When to use:** When the same request must be evaluated against organization defaults, department overrides, and team-specific rules.
**Example:**
```rust
struct HierarchyResolver {
    org_policies: Vec<PolicyConfig>,
    dept_policies: HashMap<String, Vec<PolicyConfig>>,  // dept_id -> policies
    team_policies: HashMap<String, Vec<PolicyConfig>>,  // team_id -> policies
}

impl HierarchyResolver {
    fn resolve(&self, ctx: &RequestContext) -> Vec<PolicyConfig> {
        let mut applicable = Vec::new();

        // Org-level (always applied)
        applicable.extend(self.org_policies.iter()
            .filter(|p| p.matches_vendor(&ctx.vendor))
            .cloned());

        // Dept-level overrides (if user has dept)
        if let Some(dept_id) = &ctx.dept_id {
            if let Some(dept_policies) = self.dept_policies.get(dept_id) {
                applicable.extend(dept_policies.iter()
                    .filter(|p| p.matches_vendor(&ctx.vendor))
                    .cloned());
            }
        }

        // Team-level overrides (if user has team)
        if let Some(team_id) = &ctx.team_id {
            if let Some(team_policies) = self.team_policies.get(team_id) {
                applicable.extend(team_policies.iter()
                    .filter(|p| p.matches_vendor(&ctx.vendor))
                    .cloned());
            }
        }

        // Existing MergedVerdict::merge handles most-restrictive-wins
        applicable
    }
}
```

### Anti-Patterns to Avoid
- **Polling-based distribution:** Do not have kernels poll the control plane for policy updates. The decision locks xDS-style server-streaming push. Polling adds latency, wastes bandwidth, and creates thundering herd problems.
- **Full-buffering of Wasm modules in memory during transfer:** Stream Wasm bytes through the gRPC channel rather than accumulating in a single buffer. However, compiled Wasm modules are typically <1MB (enforced by WASM_MAX_SIZE_BYTES), so full-message transfer is acceptable within this constraint.
- **Shared mutable policy state without ArcSwap:** Using `RwLock<PolicySet>` would contend on the hot path. ArcSwap provides lock-free reads at >10k req/s.
- **Unbounded session store:** Session store without max entries or TTL will leak memory. The store MUST be bounded (KERN-13: no unbounded channels/collections).
- **Per-user policy overrides:** The decision explicitly excludes per-user overrides. Users inherit from their team, period.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic reference-counted swap | Custom unsafe Arc pointer manipulation | `arc-swap` 1.7.1 | Reference counting edge cases, memory ordering, epoch-based reclamation are extremely subtle |
| gRPC server-streaming | Custom TCP long-poll or WebSocket push | tonic 0.14 (Rust) / @grpc/grpc-js (TS) | Backpressure, flow control, HTTP/2 multiplexing, reconnect are all handled |
| Protobuf serialization | Custom binary encoding for policy transfer | prost 0.14 + proto definitions | Schema evolution, backward compatibility, cross-language interop |
| Exponential backoff | Manual sleep/retry loop | gRPC built-in connection backoff (INITIAL_BACKOFF=1s, MULTIPLIER=1.6, MAX_BACKOFF=120s, JITTER=0.2) | Standard algorithm with jitter prevents thundering herd |
| Content integrity verification | Custom hash-then-compare | SHA-256 via sha2 0.10 (already in workspace) | Well-tested, constant-time comparison available |

**Key insight:** The primary value of this phase is wiring existing infrastructure together (tonic, ArcSwap, DashMap, existing verdict merge), not building novel data structures. The gRPC distribution protocol is the most complex new piece, and it follows well-documented xDS patterns.

## Common Pitfalls

### Pitfall 1: ArcSwap Memory Leak on Rapid Updates
**What goes wrong:** If policy updates arrive faster than old Arc references are dropped (in-flight requests holding old snapshots), Arc reference counts accumulate.
**Why it happens:** Each `load()` returns a `Guard` that keeps the old Arc alive until dropped. If requests are long-lived (streaming AI responses) and updates are rapid, many old versions coexist.
**How to avoid:** This is expected behavior and self-corrects as requests complete. ArcSwap is designed for this. Monitor the number of distinct Arc versions alive using `ArcSwap::peek()` for observability. Policy updates are infrequent (compliance officer manual action), so this is unlikely in practice.
**Warning signs:** Memory growth correlated with policy update frequency.

### Pitfall 2: gRPC Stream Drop Without Reconnect
**What goes wrong:** The tonic streaming client silently drops the connection when the control plane restarts or has a transient network issue, and no reconnect happens.
**Why it happens:** tonic's `Streaming<T>` yields `None` on stream end but does not auto-reconnect. The application must handle reconnection.
**How to avoid:** Implement a reconnect loop wrapping the subscription. On stream end or error, wait with exponential backoff (1s initial, 1.6x multiplier, 120s max, +/-20% jitter per gRPC spec), then re-subscribe with current_version to get only missed updates.
**Warning signs:** Kernels stop receiving policy updates after control plane restart.

### Pitfall 3: Stale Session Data Causing False Positives
**What goes wrong:** Session entries accumulate old detection state indefinitely, causing false positive violation detections on legitimate new conversations that happen to share a session boundary.
**Why it happens:** Sessions without TTL-based expiry or explicit cleanup retain state from previous conversations.
**How to avoid:** TTL-based expiry (configurable, default 30 minutes of inactivity). Background cleanup task sweeps expired sessions periodically (every 60 seconds). Max session entries (default 10,000) with LRU eviction when full.
**Warning signs:** Growing false positive rate over time, memory growth in session store.

### Pitfall 4: RegorusPool Rebuild Blocks Async Runtime
**What goes wrong:** Building a new RegorusPool from updated Rego sources involves parsing and compiling policies, which is CPU-intensive and synchronous.
**Why it happens:** Regorus operations are CPU-bound (already documented in Phase 2 decisions). Building the pool on the async runtime starves other tasks.
**How to avoid:** Use `tokio::task::spawn_blocking` for the entire policy set rebuild, then swap the result atomically via ArcSwap on the async side. This matches the existing pattern used for Regorus evaluation.
**Warning signs:** High p99 latency during policy updates.

### Pitfall 5: Delta Update Desynchronization
**What goes wrong:** A delta update references a policy ID that the kernel doesn't have (e.g., missed a previous delta), causing an inconsistent policy set.
**Why it happens:** Network partition between initial delta and a subsequent one, or control plane restart between deltas.
**How to avoid:** Each update carries a monotonic version counter. If the kernel receives a delta with a version gap (expected = current+1, received > current+1), it must re-request a full snapshot by reconnecting with current_version=0. The control plane should also detect staleness via the ACK/NACK mechanism.
**Warning signs:** Version gaps in kernel logs, NACK responses.

### Pitfall 6: Hierarchy Merge Producing Wrong Results
**What goes wrong:** Department-level "allow" overrides organization-level "block", violating the "lower levels can only tighten" invariant.
**Why it happens:** Naive merge treats all policies equally. The hierarchy must be "additive restrictions only" -- lower-level policies add new restrictions or keep existing ones, never relax them.
**How to avoid:** The existing `MergedVerdict::merge` with most-restrictive-wins already handles this correctly. All policies from all applicable hierarchy levels are gathered and merged together. Since `Block > Redact > Allow`, adding a department-level `Allow` cannot override an org-level `Block`. The key is that hierarchy resolution gathers ALL applicable policies, not that it replaces higher-level policies.
**Warning signs:** Test cases where dept-allow + org-block result in Allow.

## Code Examples

Verified patterns from the existing codebase and official sources:

### ArcSwap Load and Store (Hot Path)
```rust
// Source: arc-swap docs (https://docs.rs/arc-swap/latest/arc_swap/)
use arc_swap::ArcSwap;
use std::sync::Arc;

let policy_set = Arc::new(ArcSwap::from_pointee(initial_policy_set));

// Hot path (every request) -- lock-free read:
let current = policy_set.load();
// current: arc_swap::Guard<Arc<PolicySet>>
// Dereferences to &PolicySet, keeps old version alive

// Cold path (distribution client) -- atomic swap:
let new_set = Arc::new(new_policy_set);
policy_set.store(new_set);
// All subsequent load() calls return the new version
```

### tonic Server Streaming Client (Reconnect Pattern)
```rust
// Source: tonic examples + existing evidence client pattern
use tonic::transport::{Channel, Endpoint};
use tokio_stream::StreamExt;

async fn distribution_loop(
    addr: String,
    kernel_id: String,
    policy_set: Arc<ArcSwap<PolicySet>>,
) {
    let mut current_version = 0u64;
    let mut backoff = Duration::from_secs(1);

    loop {
        match connect_and_subscribe(&addr, &kernel_id, current_version).await {
            Ok(mut stream) => {
                backoff = Duration::from_secs(1); // Reset on success
                while let Some(result) = stream.next().await {
                    match result {
                        Ok(update) => {
                            match apply_update(&policy_set, update).await {
                                Ok(new_version) => {
                                    current_version = new_version;
                                    // Send ACK
                                }
                                Err(e) => {
                                    // Send NACK, keep previous policy set
                                    tracing::error!(error = %e, "policy update failed");
                                }
                            }
                        }
                        Err(status) => {
                            tracing::warn!(status = %status, "stream error");
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "distribution connect failed");
            }
        }

        // Exponential backoff with jitter
        let jitter = backoff.mul_f64(0.2 * (rand::random::<f64>() * 2.0 - 1.0));
        tokio::time::sleep(backoff + jitter).await;
        backoff = std::cmp::min(backoff.mul_f64(1.6), Duration::from_secs(120));
    }
}
```

### gRPC Server Streaming (Control Plane -- TypeScript)
```typescript
// Source: @grpc/grpc-js patterns + existing control plane conventions
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

// Track connected kernels
const connectedKernels = new Map<string, grpc.ServerWritableStream<any, any>>();

function subscribe(call: grpc.ServerWritableStream<SubscribeRequest, PolicyUpdate>) {
  const kernelId = call.request.kernel_id;
  const currentVersion = call.request.current_version;

  connectedKernels.set(kernelId, call);

  // Send full snapshot on connect
  const snapshot = buildFullSnapshot(call.request);
  call.write(snapshot);

  // Handle client disconnect
  call.on("cancelled", () => {
    connectedKernels.delete(kernelId);
  });
  call.on("error", () => {
    connectedKernels.delete(kernelId);
  });
}

// Called when a policy is compiled successfully
function broadcastUpdate(update: PolicyUpdate) {
  for (const [kernelId, call] of connectedKernels) {
    try {
      call.write(update);
    } catch {
      connectedKernels.delete(kernelId);
    }
  }
}
```

### Session Store with TTL Expiry
```rust
use dashmap::DashMap;
use std::time::{Duration, Instant};

struct SessionStore {
    sessions: DashMap<String, SessionEntry>,
    max_sessions: usize,
    session_ttl: Duration,
}

impl SessionStore {
    fn get_or_create(&self, session_id: &str, user_id: &str, vendor: &str) -> SessionEntry {
        self.sessions
            .entry(session_id.to_string())
            .or_insert_with(|| SessionEntry {
                session_id: session_id.to_string(),
                user_id: user_id.to_string(),
                vendor: vendor.to_string(),
                exchanges: Vec::new(),
                detection_state: DetectionState::default(),
                created_at: Instant::now(),
                last_activity: Instant::now(),
            })
            .clone()
    }

    fn record_exchange(&self, session_id: &str, record: ExchangeRecord) {
        if let Some(mut entry) = self.sessions.get_mut(session_id) {
            entry.exchanges.push(record);
            entry.last_activity = Instant::now();
            // Update cumulative detection state
            entry.detection_state.update(&entry.exchanges);
        }
    }

    fn cleanup_expired(&self) {
        self.sessions.retain(|_, entry| {
            entry.last_activity.elapsed() < self.session_ttl
        });
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling-based config distribution | gRPC server-streaming push (xDS pattern) | 2018+ (Envoy v2 API) | Reduced latency, eliminated thundering herd, real-time updates |
| RwLock for shared config | ArcSwap for read-mostly data | 2019+ (arc-swap 0.3) | Lock-free reads, consistent performance at high concurrency |
| Static policy loading at startup | Hot-reload without restart | Industry standard | Zero-downtime policy updates, no service disruption |
| Flat policy model | Hierarchical with inheritance | Enterprise requirement | Multi-tenant governance with organizational structure |

**Deprecated/outdated:**
- `@grpc/grpc-native`: Deprecated in favor of `@grpc/grpc-js` pure-JS implementation
- tonic 0.12/0.13: Project uses tonic 0.14 with tonic-prost-build 0.14

## Open Questions

1. **Session boundary detection mechanism**
   - What we know: Need to group multi-turn conversations into sessions for cross-turn analysis. Options are header-based session ID (explicit, requires client cooperation or header injection) vs inferred from user+vendor+time window.
   - What's unclear: Whether client applications pass session/conversation IDs in headers, or whether the proxy must infer session boundaries.
   - Recommendation: Use header-based session ID when available (e.g., `X-Session-Id`, `X-Conversation-Id`), fall back to inferred boundaries using `user_id + vendor + 30-minute sliding window`. This dual approach handles both cooperative and uncooperative clients. **Confidence: HIGH** -- the proxy intercepts all traffic and can inspect headers; inference provides a safety net.

2. **Wasm module transfer size over gRPC**
   - What we know: Compiled Wasm modules are capped at 1MB (WASM_MAX_SIZE_BYTES enforced in compiler). gRPC default max message size is 4MB. Full snapshot could include many policies.
   - What's unclear: Whether a full snapshot with many policies exceeds default gRPC message limits.
   - Recommendation: Set gRPC max message size to 16MB on both client and server. For very large policy sets, the full snapshot could be chunked across multiple PolicyUpdate messages marked as FULL_SNAPSHOT with a sequence number. However, for v1 with <100 policies, this is unlikely to be an issue. **Confidence: MEDIUM** -- depends on actual policy count in production.

3. **Reconnect behavior on control plane restart**
   - What we know: When the control plane restarts, all kernel gRPC streams will drop. Kernels must reconnect and re-subscribe.
   - What's unclear: Whether kernels should reconnect immediately (thundering herd) or stagger.
   - Recommendation: Use exponential backoff with jitter (gRPC standard: INITIAL_BACKOFF=1s, MULTIPLIER=1.6, MAX_BACKOFF=120s, JITTER=+/-20%). This is built into the reconnect loop. Additionally, kernels should start with their currently-loaded policy version to avoid unnecessary full snapshots if the control plane already has that version in memory. **Confidence: HIGH** -- follows gRPC standard connection backoff protocol.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust: cargo test (unit + integration), TypeScript: bun test |
| Config file | Workspace Cargo.toml, control-plane/package.json |
| Quick run command | `cargo test -p kernel --lib` |
| Full suite command | `cargo test --workspace --all-targets` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-03 | gRPC server-streaming pushes policies to connected kernels | integration | `cargo test -p kernel --test distribution_test` | Wave 0 |
| PLCY-06 | Hot-reload swaps policy set atomically without restart | unit | `cargo test -p kernel hot_reload` | Wave 0 |
| PLCY-08 | Policies configurable per dept, per team, per vendor | unit | `cargo test -p kernel hierarchy` | Wave 0 |
| PLCY-10 | Hierarchy inheritance with most-restrictive-wins | unit | `cargo test -p kernel hierarchy_merge` | Wave 0 |
| KERN-10 | Session context detects multi-turn violations | unit + integration | `cargo test -p kernel session` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p kernel --lib`
- **Per wave merge:** `cargo test --workspace --all-targets`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `crates/kernel/src/policy/distribution/` -- new module, all files
- [ ] `crates/kernel/src/policy/hierarchy.rs` -- new file
- [ ] `crates/kernel/src/policy/session.rs` -- new file
- [ ] `crates/kernel/src/policy/hot_reload.rs` -- new file
- [ ] `proto/interdict/policy/v1/policy_distribution.proto` -- new proto
- [ ] `control-plane/src/modules/distribution/` -- new module
- [ ] `crates/kernel/tests/distribution_test.rs` -- integration test for end-to-end distribution

## Sources

### Primary (HIGH confidence)
- [arc-swap crate (crates.io)](https://crates.io/crates/arc-swap) - version 1.7.1 confirmed, API patterns
- [arc-swap docs (docs.rs)](https://docs.rs/arc-swap/latest/arc_swap/) - ArcSwap API, load/store semantics, Guard pattern
- [tonic streaming server example](https://github.com/hyperium/tonic/blob/master/examples/src/streaming/server.rs) - ReceiverStream pattern, mpsc channel, client disconnect handling
- [gRPC connection backoff spec](https://github.com/grpc/grpc/blob/master/doc/connection-backoff.md) - INITIAL_BACKOFF=1s, MULTIPLIER=1.6, MAX_BACKOFF=120s, JITTER=0.2
- Existing codebase: `crates/kernel/src/evidence/client.rs` - tonic gRPC client reconnect pattern
- Existing codebase: `crates/kernel/src/policy/verdict.rs` - VerdictAction ordering, MergedVerdict::merge
- Existing codebase: `crates/kernel/src/policy/layer1/regorus.rs` - RegorusPool Arc pattern, spawn_blocking
- Existing codebase: `crates/evidence-collector/build.rs` - tonic-prost-build proto compilation pattern
- Existing codebase: `control-plane/src/db/schema/organization.ts` - departments, teams, users schema
- Existing codebase: `control-plane/src/modules/compiler/worker.ts` - compilation status lifecycle

### Secondary (MEDIUM confidence)
- [Envoy xDS protocol documentation](https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol) - full snapshot vs delta update patterns, ACK/NACK semantics
- [@grpc/grpc-js npm](https://www.npmjs.com/package/@grpc/grpc-js) - official gRPC Node.js implementation
- [Bun Node.js compatibility](https://bun.com/docs/runtime/nodejs-compat) - gRPC/HTTP2 support status (95.25% test suite passes)
- [gRPC retry documentation](https://grpc.io/docs/guides/retry/) - retry semantics for streaming RPCs

### Tertiary (LOW confidence)
- Bun gRPC server streaming reliability under sustained connections -- not independently verified beyond Bun's stated 95.25% gRPC test suite pass rate. Recommend manual validation of long-lived server-streaming connections in Bun during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in workspace except arc-swap (which has 143M+ downloads and is the de facto standard)
- Architecture: HIGH - patterns follow existing codebase conventions (Arc sharing, tonic gRPC, DashMap, MergedVerdict) and well-documented xDS patterns
- Pitfalls: HIGH - most pitfalls derive from documented behavior of known libraries and patterns already encountered in this project
- Session tracking: MEDIUM - slow-leak exfiltration detection logic is domain-specific and will need iterative tuning of thresholds

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (30 days -- stable domain, all libraries mature)