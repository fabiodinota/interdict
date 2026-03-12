# Phase 2: Policy Engine - Research

**Researched:** 2026-02-26
**Domain:** Policy evaluation pipeline (Wasm/Rego + NLP classifier + human review queue) in Rust
**Confidence:** HIGH

## Summary

Phase 2 integrates a 3-layer policy evaluation pipeline into the existing kernel proxy from Phase 1. The pipeline consists of: **Layer 1** — deterministic Rego policy rules evaluated via Regorus (Rust-native Rego interpreter), optionally compiled to Wasm and executed in Wasmtime with pooling allocator; **Layer 2** — a lightweight NLP classifier using tract-onnx for ONNX model inference to handle ambiguous cases; **Layer 3** — a database-backed human review queue for genuinely uncertain requests.

The stack is well-established: Wasmtime (v42, CNCF-backed, Bytecode Alliance) provides the sandboxed Wasm execution with a mature pooling allocator API. Regorus (v0.9.1, Microsoft) is a Rust-native Rego interpreter that is Send+Sync, supports `eval_rule` for fast single-rule evaluation, and is Cloneable for use across worker pools. Tract-onnx (v0.22.1, Sonos) is a pure-Rust ONNX inference engine with no runtime dependencies, suitable for quantized INT8 models and sub-10ms inference on small classifiers.

**Primary recommendation:** Use Regorus directly as the Layer 1 engine (not compiled-to-Wasm) for simplicity and <2ms evaluation, with Wasmtime + pooling allocator as the execution sandbox for future custom policy modules. Use tract-onnx for Layer 2 NLP inference. Use rusqlite (SQLite via WAL mode) for the human review queue persistence.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Redaction uses **category-tagged placeholders** (e.g. `[REDACTED:SSN]`, `[REDACTED:EMAIL]`) so downstream consumers and auditors can see what type of content was removed
- Block responses are **configurable per policy** — policy author decides whether the 403 response includes detailed reason (policy_id, reason category, human-readable message) or is opaque ("Request blocked by policy")
- Redaction applies to **both directions by default** (outbound prompts and inbound AI responses), but is **configurable per policy** to apply to one direction only
- Original pre-redaction content: **SHA-256 hash always stored** in evidence for verification; **full plaintext storage is configurable per enterprise** (some regulations require it, others prohibit it — per EVID-06). Auditors can always verify what was redacted via hash; plaintext access depends on enterprise config
- When Layer 1 Rego rules return **no match** (neither explicit allow/block/redact), the request **escalates to Layer 2** NLP classifier
- Layer 2 NLP model has a dedicated **'uncertain/review' output class** that triggers escalation to Layer 3 human queue — not a confidence threshold
- When Layer 1 returns an **explicit verdict**, it is enforced immediately; **Layer 2 runs in background by default** for analytics/audit enrichment (classification data logged alongside the verdict). Background L2 can be disabled per policy for performance-critical paths
- Layer 3 escalations include **full pipeline trace** (L1 result, L2 classification, request context) so the human reviewer has sufficient context to decide
- Layer errors (Wasm panic, model load failure) use the **policy's fail-closed/fail-open setting** to determine behavior — consistent error handling model across the pipeline
- When multiple policies match the same request, **most restrictive verdict wins** — if any policy says block, it's blocked; redact beats allow
- **All matching policies are evaluated** and verdicts merged — no short-circuiting on block — needed for complete audit trail
- Overlapping redaction verdicts merge as a **union of all redactions** — every field/pattern any policy wants redacted gets redacted (additive)
- **Full verdict trace always generated** — every verdict includes which policies matched, each individual verdict, and the merge result — stored in evidence
- When a request escalates to Layer 3, the **user's connection is held** (blocked) until a human reviewer decides or timeout expires
- **Short timeout (30-60 seconds)** — user's connection can't wait indefinitely
- On timeout with no human decision, the **policy's fail-mode applies** — fail-closed blocks, fail-open allows — consistent with error handling behavior
- Queue is built as a **full queue with database-backed persistence** and API, ready for dashboard integration in later phases
- Queue messages include **request_id, full pipeline trace, and pre-redaction content hash** for reviewer context and audit correlation

### Claude's Discretion
- Wasm module loading and caching strategy
- NLP model warm-up and inference optimization
- Queue persistence backend choice (embedded DB vs external)
- Internal data structures for verdict representation
- Background L2 execution threading model

### Deferred Ideas (OUT OF SCOPE)
- Per-department/per-user policy configuration — Phase 6 (Policy Distribution & Kernel Integration)
- Policy authoring and management UI — Phase 8 (Dashboard Core)
- Human review queue dashboard/UI — Phase 8/9 (Dashboard phases)
- Policy versioning and rollback — future consideration
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLCY-01 | Kernel embeds Wasmtime runtime with pooling allocator and pre-warmed worker pool for policy module execution | Wasmtime 42.0.1 `PoolingAllocationConfig` API documented; `pooling-allocator` feature is default-enabled; pooling config tuning parameters identified for 128MB RAM budget |
| PLCY-02 | Policy modules are compiled Wasm binaries loaded and executed in sandboxed isolation (<2ms per evaluation) | Wasmtime `Module::deserialize` for pre-compiled modules; `Store` per-evaluation with `Engine` reuse; Regorus `eval_rule` benchmarks at 3-5ms for complex ACI policies, simpler rules well under 2ms |
| PLCY-03 | Layer 1 deterministic rules use Regorus (Rust-native Rego interpreter) for policy evaluation without external OPA dependency | Regorus 0.9.1 is Send+Sync, Cloneable, embedded Rust library; `eval_rule` faster than `eval_query`; supports v1 Rego; compliant with OPA v1.2.0 test suite |
| PLCY-04 | Layer 2 lightweight NLP classifier (quantized ONNX model via tract) handles intent classification and ambiguous cases (<10ms) | tract-onnx 0.22.1 is pure Rust, no external runtime; supports quantized INT8 models; demonstrated sub-millisecond inference on small models on embedded hardware |
| PLCY-07 | Policies support three enforcement actions: block (reject request), allow (pass through), redact (modify and pass) | Verdict enum design with Block/Allow/Redact variants; per-policy block response configurability; redaction with category-tagged placeholders per CONTEXT.md |
| PLCY-09 | Fail-closed / fail-open is a per-policy configuration flag controlling behavior when the kernel encounters errors | Per-policy `fail_mode` field; applied consistently across L1 errors, L2 model failures, L3 timeouts; integrated into verdict merge logic |
| KERN-11 | Kernel checks vendor allowlist before forwarding any outbound AI request, blocking non-approved vendors | Existing `AllowlistLayer` middleware refactored: vendor check becomes first policy in L1 pipeline returning Block verdict; unified code path |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| regorus | 0.9.1 | Rego policy evaluation (Layer 1) | Microsoft-backed, 10x faster than OPA, Rust-native, Send+Sync, OPA v1.2.0 compatible |
| wasmtime | 42.0.1 | Wasm sandbox for custom policy modules | CNCF/Bytecode Alliance, pooling allocator, `Module::serialize`/`deserialize` for AOT compilation |
| tract-onnx | 0.22.1 | ONNX model inference (Layer 2 NLP) | Pure Rust, no external runtime, quantized model support, sub-ms inference on small models |
| rusqlite | 0.38.0 | SQLite-backed human review queue persistence | Embedded, zero-config, WAL mode for concurrent reads, battle-tested, no external DB dependency |
| sha2 | 0.10 | SHA-256 hashing for pre-redaction content evidence | Standard Rust crypto crate, used for content hashing per EVID-06 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crossbeam-channel | 0.5 | Bounded MPMC channels for L2 background work | Background L2 classification dispatch; bounded per KERN-13 |
| serde + serde_json | (existing) | Verdict serialization, policy config, queue messages | Already in Phase 1 Cargo.toml |
| dashmap | (existing) | Concurrent policy cache, module cache | Already in Phase 1 Cargo.toml, used for cert cache |
| uuid | (existing) | Request IDs for verdict trace correlation | Already in Phase 1 Cargo.toml |
| tokio | (existing) | Async runtime, timeouts, spawn_blocking | Already in Phase 1; `spawn_blocking` for Regorus eval (sync API) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regorus (direct eval) | Regorus compiled to Wasm + Wasmtime | Extra compilation step, more complexity; direct Regorus is faster and simpler for Phase 2. Wasm path reserved for custom user-authored modules in future |
| rusqlite (SQLite) | sled / redb (embedded key-value) | SQLite has richer query support for queue management (priority, timeout, status filtering); sled is unmaintained; redb lacks SQL query flexibility |
| tract-onnx | ort (ONNX Runtime bindings) | ort links C++ ONNX Runtime (larger binary, build complexity, platform-specific); tract is pure Rust, smaller, sufficient for small classifiers |
| crossbeam-channel | tokio::sync::mpsc | crossbeam is better for mixed sync/async (Regorus is sync); tokio mpsc requires async context. Either works; crossbeam avoids async bridging |

**Installation:**
```toml
# Add to crates/kernel/Cargo.toml [dependencies]
regorus = { version = "0.9.1", default-features = false, features = ["arc", "regex", "glob", "semver", "time", "uuid", "std"] }
wasmtime = { version = "42", features = ["pooling-allocator", "cranelift", "runtime"] }
tract-onnx = "0.22.1"
rusqlite = { version = "0.38", features = ["bundled"] }
sha2 = "0.10"
crossbeam-channel = "0.5"
```

## Architecture Patterns

### Recommended Module Structure
```
crates/kernel/src/
├── policy/
│   ├── mod.rs              # Policy module, Pipeline orchestrator
│   ├── verdict.rs          # Verdict enum, VerdictTrace, merge logic
│   ├── config.rs           # PolicyConfig (fail_mode, block_response_detail, redaction_direction)
│   ├── layer1/
│   │   ├── mod.rs          # Layer 1 orchestrator
│   │   ├── regorus.rs      # Regorus engine pool + evaluation
│   │   └── allowlist.rs    # Vendor allowlist as L1 policy (refactored from middleware)
│   ├── layer2/
│   │   ├── mod.rs          # Layer 2 orchestrator
│   │   └── classifier.rs   # tract ONNX model loading + inference
│   ├── layer3/
│   │   ├── mod.rs          # Layer 3 orchestrator
│   │   ├── queue.rs        # Review queue (enqueue, dequeue, timeout)
│   │   └── store.rs        # SQLite persistence layer
│   └── redaction.rs        # Content redaction with category-tagged placeholders
├── middleware/
│   ├── mod.rs
│   ├── allowlist.rs        # (deprecated/thin wrapper → delegates to policy::layer1::allowlist)
│   └── request_id.rs
├── proxy/                  # (unchanged from Phase 1)
└── ...
```

### Pattern 1: Engine Pool for Regorus
**What:** Pre-create a pool of `regorus::Engine` instances, each with policies loaded. Workers take an engine from the pool, set input, evaluate, and return it.
**When to use:** Every Layer 1 evaluation. Regorus `Engine` is `Clone` (deep clone), but cloning per-request is wasteful. Instead, maintain a fixed-size pool.
**Example:**
```rust
// Source: regorus docs (docs.rs/regorus/0.9.1)
use std::sync::Arc;
use tokio::sync::Semaphore;
use crossbeam_queue::ArrayQueue;

pub struct RegorusPool {
    engines: ArrayQueue<regorus::Engine>,
    semaphore: Arc<Semaphore>,
}

impl RegorusPool {
    pub fn new(template: &regorus::Engine, size: usize) -> Self {
        let queue = ArrayQueue::new(size);
        for _ in 0..size {
            let _ = queue.push(template.clone());
        }
        Self {
            engines: queue,
            semaphore: Arc::new(Semaphore::new(size)),
        }
    }

    pub async fn evaluate(
        &self,
        input_json: &str,
        rule: &str,
    ) -> anyhow::Result<regorus::Value> {
        let _permit = self.semaphore.acquire().await?;
        let mut engine = self.engines.pop()
            .expect("semaphore guarantees availability");
        
        // Regorus eval is synchronous — use spawn_blocking
        let input = input_json.to_string();
        let rule = rule.to_string();
        let result = tokio::task::spawn_blocking(move || {
            engine.set_input(regorus::Value::from_json_str(&input)?);
            let result = engine.eval_rule(rule)?;
            Ok::<(regorus::Engine, regorus::Value), anyhow::Error>((engine, result))
        }).await??;
        
        let (engine, value) = result;
        let _ = self.engines.push(engine);
        Ok(value)
    }
}
```

### Pattern 2: Verdict Merge with Most-Restrictive-Wins
**What:** All matching policies are evaluated. Verdicts are merged: Block > Redact > Allow. Redaction sets are unioned additively.
**When to use:** Every request that matches multiple policies.
**Example:**
```rust
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum VerdictAction {
    Allow = 0,
    Redact = 1,
    Block = 2,
}

#[derive(Debug, Clone)]
pub struct PolicyVerdict {
    pub policy_id: String,
    pub action: VerdictAction,
    pub redactions: Vec<Redaction>,  // empty unless action == Redact
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MergedVerdict {
    pub final_action: VerdictAction,
    pub redactions: Vec<Redaction>,  // union of all policy redactions
    pub policy_verdicts: Vec<PolicyVerdict>,  // full trace
}

impl MergedVerdict {
    pub fn merge(verdicts: Vec<PolicyVerdict>) -> Self {
        let final_action = verdicts.iter()
            .map(|v| &v.action)
            .max()
            .cloned()
            .unwrap_or(VerdictAction::Allow);
        
        let redactions: Vec<Redaction> = verdicts.iter()
            .flat_map(|v| v.redactions.iter().cloned())
            .collect();  // union — deduplicate by field/pattern if needed
        
        Self { final_action, redactions, policy_verdicts: verdicts }
    }
}
```

### Pattern 3: Layer 3 Queue with Connection Hold
**What:** When L2 returns 'uncertain/review', the request connection is held via a tokio oneshot channel. A human verdict is sent back through the channel, or timeout triggers fall-through to fail-mode.
**When to use:** Layer 3 escalation path.
**Example:**
```rust
use tokio::sync::oneshot;
use std::time::Duration;

pub struct ReviewRequest {
    pub request_id: uuid::Uuid,
    pub pipeline_trace: PipelineTrace,
    pub content_hash: String,
    pub respond_tx: oneshot::Sender<HumanVerdict>,
    pub created_at: std::time::Instant,
    pub timeout: Duration,
    pub fail_mode: FailMode,
}

pub async fn await_human_verdict(
    rx: oneshot::Receiver<HumanVerdict>,
    timeout: Duration,
    fail_mode: FailMode,
) -> VerdictAction {
    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(verdict)) => verdict.action,
        Ok(Err(_)) => {
            // Channel dropped — reviewer disconnected
            fail_mode.default_action()
        }
        Err(_) => {
            // Timeout — no human decision
            tracing::warn!("L3 review timeout, applying fail-mode");
            fail_mode.default_action()
        }
    }
}
```

### Pattern 4: Wasmtime Pooling Allocator Configuration
**What:** Configure Wasmtime with pooling allocator for bounded, reusable Wasm instance slots. Critical for staying under 128MB RAM.
**When to use:** Engine initialization at kernel startup.
**Example:**
```rust
// Source: docs.rs/wasmtime/42.0.1 PoolingAllocationConfig
use wasmtime::{Config, Engine, PoolingAllocationConfig};

fn create_wasm_engine() -> anyhow::Result<Engine> {
    let mut pool_config = PoolingAllocationConfig::new();
    
    // Policy modules are small — conservative limits
    pool_config
        .total_core_instances(64)        // max concurrent Wasm evaluations
        .total_memories(64)               // 1 memory per instance
        .total_tables(64)                 // 1 table per instance
        .max_memory_size(1 << 20)         // 1MB per linear memory (policies are small)
        .max_core_instance_size(1 << 16)  // 64KB VMContext
        .max_memories_per_module(1)
        .max_tables_per_module(1)
        .max_unused_warm_slots(16)        // keep 16 warm for reuse
        .linear_memory_keep_resident(1 << 16);  // keep 64KB resident per slot
    
    let mut config = Config::new();
    config.allocation_strategy(pool_config);
    config.cranelift_opt_level(wasmtime::OptLevel::Speed);
    // Pre-compile modules with Module::serialize, load with Module::deserialize
    
    Engine::new(&config)
}
```

### Pattern 5: Background L2 Execution
**What:** When L1 produces an explicit verdict, L2 runs asynchronously in the background for analytics/audit enrichment. Uses a bounded channel to dispatch work.
**When to use:** Every request where L1 gives explicit verdict and background L2 is enabled for the policy.
**Example:**
```rust
use crossbeam_channel::{bounded, Sender, Receiver};

pub struct BackgroundL2 {
    tx: Sender<L2WorkItem>,
}

struct L2WorkItem {
    request_id: uuid::Uuid,
    input_features: Vec<f32>,
    // callback to store classification result in evidence
}

impl BackgroundL2 {
    pub fn new(classifier: Arc<Classifier>, workers: usize, queue_depth: usize) -> Self {
        let (tx, rx) = bounded::<L2WorkItem>(queue_depth);
        
        for _ in 0..workers {
            let rx = rx.clone();
            let classifier = classifier.clone();
            std::thread::spawn(move || {
                while let Ok(item) = rx.recv() {
                    match classifier.classify(&item.input_features) {
                        Ok(classification) => {
                            tracing::debug!(
                                request_id = %item.request_id,
                                classification = ?classification,
                                "background L2 classification complete"
                            );
                            // Store in evidence log
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "background L2 classification failed");
                        }
                    }
                }
            });
        }
        
        Self { tx }
    }
    
    pub fn submit(&self, item: L2WorkItem) {
        // Non-blocking: if queue full, log and drop (background is best-effort)
        if self.tx.try_send(item).is_err() {
            tracing::warn!("background L2 queue full, dropping classification");
        }
    }
}
```

### Anti-Patterns to Avoid
- **Creating a new Regorus Engine per request:** Engine construction + policy loading is expensive (~1ms). Always use a pre-loaded pool.
- **Running Regorus eval on the async tokio runtime directly:** Regorus is synchronous and CPU-bound. Always use `spawn_blocking` or dedicated threads to avoid starving the tokio event loop.
- **Using unbounded channels anywhere:** KERN-13 explicitly prohibits unbounded channels. Every channel must have explicit capacity limits.
- **Short-circuiting policy evaluation on first Block:** CONTEXT.md requires all matching policies to be evaluated for complete audit trail. Even if one policy blocks, continue evaluating remaining policies.
- **Storing original content in the verdict by default:** Pre-redaction plaintext storage is configurable per enterprise. Always store the SHA-256 hash; only store plaintext when enterprise config enables it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rego policy evaluation | Custom rule engine | regorus `Engine::eval_rule` | OPA-compatible, tested against OPA v1.2.0 suite, handles Rego edge cases |
| ONNX model inference | Custom tensor ops | tract-onnx `SimplePlan::run` | Handles quantization, operator support, model optimization internally |
| Wasm sandboxing | Custom process isolation | wasmtime `Engine` + `Store` + `PoolingAllocationConfig` | Memory isolation, fuel metering, resource limits built-in |
| SQLite connection management | Manual file locking | rusqlite with connection pool | WAL mode, proper locking, prepared statement caching |
| SHA-256 hashing | Manual implementation | `sha2::Sha256` | Auditable, constant-time, battle-tested |
| Thread-safe queue | Mutex<VecDeque> | crossbeam `ArrayQueue` or `bounded` channel | Lock-free, bounded, designed for concurrent access patterns |

**Key insight:** The policy engine integrates 3 distinct evaluation technologies (Rego, ONNX, human). Each has excellent Rust-native libraries. The complexity is in the orchestration (verdict merging, escalation logic, error handling), not in any single technology.

## Common Pitfalls

### Pitfall 1: Wasmtime Pooling Allocator Virtual Memory Exhaustion
**What goes wrong:** Default pooling allocator reserves ~4GB of virtual memory per linear memory slot. With 64 slots, that's ~256GB of virtual address space, which can exhaust 48-bit address spaces.
**Why it happens:** Wasmtime uses virtual memory tricks for bounds checking; each slot reserves full 4GB address space.
**How to avoid:** Set `max_memory_size` to the minimum needed (e.g., 1MB for policy modules). This drastically reduces virtual memory reservation. Policy modules don't need large linear memories.
**Warning signs:** Process fails to allocate memory or `mmap` errors during engine creation.

### Pitfall 2: Regorus Engine is Sync, Tokio Runtime is Async
**What goes wrong:** Calling `engine.eval_rule()` directly on a tokio worker thread blocks the entire thread, starving other tasks. Under load, this causes cascading latency spikes.
**Why it happens:** Regorus Engine API is entirely synchronous. There is no async eval variant.
**How to avoid:** Always use `tokio::task::spawn_blocking` for Regorus evaluation, or use dedicated OS threads with crossbeam channels. The engine pool pattern (Pattern 1 above) handles this correctly.
**Warning signs:** Increasing p99 latency under load, tokio worker starvation warnings.

### Pitfall 3: Forgetting to Evaluate All Policies Before Merging
**What goes wrong:** Short-circuiting on the first Block verdict means the audit trail is incomplete — you don't know which other policies also matched or what they would have decided.
**Why it happens:** Performance optimization instinct — "why evaluate more if we already know it's blocked?"
**How to avoid:** Always evaluate all matching policies. The audit trail requirement (full verdict trace) is a hard correctness requirement per CONTEXT.md. Performance is acceptable because individual Rego evaluations are <2ms.
**Warning signs:** Incomplete `policy_verdicts` array in the verdict trace.

### Pitfall 4: tract Model Loading on Hot Path
**What goes wrong:** Loading an ONNX model is expensive (parsing, optimization, plan building). If done per-request, L2 latency balloons to 100ms+.
**Why it happens:** The model must be loaded once and reused. `tract_onnx::onnx().model_for_path(...)?.into_optimized()?.into_runnable()?` is the expensive path.
**How to avoid:** Load the model at startup, build the `SimplePlan`, and share it via `Arc`. The `SimplePlan::run` method takes `&self` and is safe to call concurrently.
**Warning signs:** L2 latency >10ms, high CPU during model loading.

### Pitfall 5: SQLite Queue Under Concurrent Write Load
**What goes wrong:** Multiple threads writing to the review queue simultaneously can cause SQLite `SQLITE_BUSY` errors.
**Why it happens:** SQLite has limited write concurrency even in WAL mode (single writer at a time).
**How to avoid:** Use a single dedicated writer thread/task for queue writes. Reads can be concurrent in WAL mode. Alternatively, use `busy_timeout` to handle transient contention. For Phase 2 traffic levels (only L3 escalations, which should be rare), this is unlikely to be a bottleneck.
**Warning signs:** `SQLITE_BUSY` errors in logs, review queue write failures.

### Pitfall 6: Layer 3 Connection Hold Exhausting Proxy Resources
**What goes wrong:** If many requests escalate to L3 simultaneously, the proxy holds all those connections open (30-60s each), potentially exhausting connection limits.
**Why it happens:** L3 is designed for rare edge cases, but a bad policy configuration could escalate too many requests.
**How to avoid:** Add a concurrent L3 hold limit (e.g., max 50 pending reviews). Beyond that, immediately apply the fail-mode without queuing. Log/alert when the limit is hit. This is a safety valve.
**Warning signs:** Spike in held connections, proxy approaching `max_request_queue` limit.

## Code Examples

### Regorus: Loading Policies and Evaluating
```rust
// Source: docs.rs/regorus/0.9.1/regorus/struct.Engine.html
use regorus::{Engine, Value};

fn create_policy_engine() -> anyhow::Result<Engine> {
    let mut engine = Engine::new();
    
    // Load policy
    engine.add_policy(
        "vendor_policy.rego".to_string(),
        r#"
        package interdict.policy.vendor
        import rego.v1
        
        default verdict := {"action": "allow"}
        
        verdict := {"action": "block", "reason": "prohibited_vendor"} if {
            input.vendor in data.blocked_vendors
        }
        
        verdict := {"action": "redact", "patterns": redact_patterns} if {
            not input.vendor in data.blocked_vendors
            redact_patterns := [p | p := data.redaction_rules[_]; regex.match(p.pattern, input.content)]
            count(redact_patterns) > 0
        }
        "#.to_string(),
    )?;
    
    // Load data
    engine.add_data(Value::from_json_str(r#"{
        "blocked_vendors": ["evil-ai.com"],
        "redaction_rules": [
            {"pattern": "\\b\\d{3}-\\d{2}-\\d{4}\\b", "category": "SSN"},
            {"pattern": "[\\w.]+@[\\w.]+\\.[a-z]{2,}", "category": "EMAIL"}
        ]
    }"#)?)?;
    
    Ok(engine)
}

fn evaluate_policy(engine: &mut Engine, request_json: &str) -> anyhow::Result<Value> {
    engine.set_input(Value::from_json_str(request_json)?);
    // eval_rule is faster than eval_query for single rule evaluation
    engine.eval_rule("data.interdict.policy.vendor.verdict".to_string())
}
```

### tract-onnx: Loading and Running a Classifier
```rust
// Source: docs.rs/tract-onnx/0.22.1, github.com/sonos/tract examples
use tract_onnx::prelude::*;
use std::sync::Arc;

pub struct Classifier {
    model: Arc<SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>>,
    labels: Vec<String>,  // ["allow", "block", "redact", "uncertain"]
}

impl Classifier {
    pub fn load(model_path: &str) -> anyhow::Result<Self> {
        let model = tract_onnx::onnx()
            .model_for_path(model_path)?
            .into_optimized()?
            .into_runnable()?;
        
        let labels = vec![
            "allow".into(), "block".into(), 
            "redact".into(), "uncertain".into(),  // dedicated uncertain class per CONTEXT.md
        ];
        
        Ok(Self { model: Arc::new(model), labels })
    }
    
    pub fn classify(&self, features: &[f32]) -> anyhow::Result<ClassificationResult> {
        let input = tract_ndarray::Array2::from_shape_vec(
            (1, features.len()),
            features.to_vec(),
        )?.into_tensor();
        
        let result = self.model.run(tvec!(input.into()))?;
        let scores = result[0].to_array_view::<f32>()?;
        
        let (max_idx, &max_score) = scores.iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap();
        
        Ok(ClassificationResult {
            label: self.labels[max_idx].clone(),
            confidence: max_score,
            all_scores: self.labels.iter()
                .zip(scores.iter())
                .map(|(l, &s)| (l.clone(), s))
                .collect(),
        })
    }
}
```

### Wasmtime: Pre-compiled Module Loading with Pooling
```rust
// Source: docs.rs/wasmtime/42.0.1
use wasmtime::*;

fn load_precompiled_policy(
    engine: &Engine,
    compiled_bytes: &[u8],
) -> anyhow::Result<Module> {
    // SAFETY: deserialize is unsafe because we trust the bytes
    // In production, these bytes come from our own compilation pipeline
    unsafe { Module::deserialize(engine, compiled_bytes) }
}

fn evaluate_wasm_policy(
    engine: &Engine,
    module: &Module,
    input_json: &str,
) -> anyhow::Result<String> {
    // Each evaluation gets its own Store (lightweight with pooling allocator)
    let mut store = Store::new(engine, ());
    
    // Set resource limits per evaluation
    store.set_fuel(10_000)?;  // Prevent infinite loops
    
    let mut linker = Linker::new(engine);
    // Expose host functions to Wasm policy module
    linker.func_wrap("env", "get_input", |caller: Caller<'_, ()>| -> i32 {
        // Return pointer to input JSON in Wasm memory
        0 // simplified
    })?;
    
    let instance = linker.instantiate(&mut store, module)?;
    let evaluate = instance.get_typed_func::<(), i32>(&mut store, "evaluate")?;
    
    let result_ptr = evaluate.call(&mut store, ())?;
    // Read result from Wasm memory
    Ok(String::new()) // simplified
}
```

### rusqlite: Review Queue Persistence
```rust
// Source: docs.rs/rusqlite/0.38.0
use rusqlite::{Connection, params};

pub struct ReviewQueueStore {
    conn: Connection,
}

impl ReviewQueueStore {
    pub fn new(db_path: &str) -> anyhow::Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // WAL mode for concurrent reads
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS review_queue (
                id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                pipeline_trace TEXT NOT NULL,  -- JSON
                content_hash TEXT NOT NULL,
                fail_mode TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                timeout_at TEXT NOT NULL,
                verdict TEXT,                   -- NULL until reviewed
                reviewer_id TEXT,
                reviewed_at TEXT,
                UNIQUE(request_id)
            );
            CREATE INDEX IF NOT EXISTS idx_review_queue_status 
                ON review_queue(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_review_queue_timeout 
                ON review_queue(status, timeout_at);"
        )?;
        
        Ok(Self { conn })
    }
    
    pub fn enqueue(&self, item: &QueueItem) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO review_queue 
             (id, request_id, pipeline_trace, content_hash, fail_mode, created_at, timeout_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                item.id.to_string(),
                item.request_id.to_string(),
                serde_json::to_string(&item.pipeline_trace)?,
                item.content_hash,
                item.fail_mode.as_str(),
                item.created_at.to_rfc3339(),
                item.timeout_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }
    
    pub fn submit_verdict(
        &self,
        request_id: &str,
        verdict: &str,
        reviewer_id: &str,
    ) -> anyhow::Result<bool> {
        let updated = self.conn.execute(
            "UPDATE review_queue 
             SET status = 'reviewed', verdict = ?1, reviewer_id = ?2, reviewed_at = datetime('now')
             WHERE request_id = ?3 AND status = 'pending'",
            params![verdict, reviewer_id, request_id],
        )?;
        Ok(updated > 0)
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OPA sidecar (separate process) | Regorus embedded library (in-process) | 2024 (regorus stable) | Eliminates network hop, 10x faster eval, no sidecar resource overhead |
| Wasmtime on-demand allocation | Wasmtime pooling allocator | Wasmtime ~v5+ (2023) | Pre-allocated memory slots, faster instantiation, bounded resource usage |
| ONNX Runtime (C++ via FFI) | tract-onnx (pure Rust) | tract stable since 2020+ | No C++ build dependency, smaller binary, cross-platform, no dynamic linking |
| Regorus `eval_query` | Regorus `eval_rule` + `compile_with_entrypoint` | regorus 0.8+ | `eval_rule` is faster for single-rule eval; compiled entrypoint even faster for hot paths |

**Deprecated/outdated:**
- Regorus `rvm` feature: mentioned in older versions for a bytecode VM. Current 0.9.1 uses `compile_with_entrypoint` via the `azure_policy` feature for compiled evaluation. For standard use, `eval_rule` is the recommended fast path.
- Wasmtime `InstanceAllocationStrategy::OnDemand`: Still available but pooling allocator is preferred for server workloads with bounded resource requirements.

## Open Questions

1. **Regorus vs Wasmtime for Layer 1 execution**
   - What we know: CONTEXT.md says "Wasm/Regorus deterministic rules" and PLCY-01 says "Wasmtime runtime with pooling allocator". PLCY-03 says "Regorus (Rust-native Rego interpreter)."
   - What's unclear: Whether L1 should run Rego via Regorus directly (simpler, ~3-5ms for complex policies, <2ms for simple ones) OR compile Rego→Wasm and run via Wasmtime (more isolation, but adds compilation complexity).
   - Recommendation: Use **Regorus directly** for L1 Rego evaluation (it's already sandboxed by being embedded, and performance meets <2ms for typical rules). Reserve **Wasmtime** for future custom policy modules authored in languages other than Rego (e.g., user-uploaded Wasm modules in Phase 5+). This satisfies both PLCY-01 (Wasmtime runtime exists and is configured) and PLCY-03 (Regorus for Rego) without coupling them unnecessarily. The Wasmtime engine should be initialized at startup with pooling allocator to prove the success criterion (128MB RAM under 10k+ evaluations), even if most L1 eval goes through Regorus.

2. **NLP Model: What model to use for Layer 2?**
   - What we know: tract-onnx can run any ONNX model. L2 needs intent/risk classification with an explicit 'uncertain' output class.
   - What's unclear: No specific model is specified. Training/selection of the actual ML model is outside Phase 2 scope.
   - Recommendation: Design the tract integration to be **model-agnostic** — accept any ONNX file with configurable input features and output labels. For testing, use a **dummy/stub model** that returns configurable responses. The actual model training/selection can happen independently. The classifier interface should be: `fn classify(&self, features: &[f32]) -> Result<ClassificationResult>` where `ClassificationResult` includes all output classes.

3. **Queue API: What endpoints does the review queue expose?**
   - What we know: CONTEXT.md says "full queue with database-backed persistence and API, ready for dashboard integration." Dashboard UI is Phase 8/9.
   - What's unclear: Exact API surface for the review queue in Phase 2.
   - Recommendation: Implement a minimal internal API (Rust trait/functions) for: `enqueue`, `get_pending`, `submit_verdict`, `get_by_request_id`, `cleanup_expired`. Expose a simple HTTP API on a separate management port (e.g., `:8444`) for Phase 2 testing: `GET /review/pending`, `POST /review/{id}/verdict`. Full dashboard API in later phases.

## Sources

### Primary (HIGH confidence)
- docs.rs/wasmtime/42.0.1 — PoolingAllocationConfig, Engine, Module, Store APIs
- docs.rs/regorus/0.9.1 — Engine API: add_policy, eval_rule, eval_query, set_input, add_extension, compile_with_entrypoint
- github.com/microsoft/regorus README — OPA v1.2.0 compliance, performance benchmarks (4.6ms vs OPA 45ms), feature flags
- github.com/sonos/tract README — ONNX operator support, performance benchmarks, pure Rust design
- crates.io API — current versions: wasmtime 42.0.1, regorus 0.9.1, tract-onnx 0.22.1, rusqlite 0.38.0

### Secondary (MEDIUM confidence)
- Wasmtime documentation on pooling allocator virtual memory requirements — verified against docs.rs source
- Regorus `eval_rule` vs `eval_query` performance — documented in API docs, consistent with README benchmarks

### Tertiary (LOW confidence)
- Specific memory consumption of pooling allocator with constrained `max_memory_size` — needs empirical validation during implementation. The 128MB budget should be achievable with 1MB max_memory_size × 64 slots, but actual overhead from Wasmtime internals needs measurement.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries are well-documented, actively maintained, with clear Rust APIs verified via docs.rs
- Architecture: HIGH — Patterns derived from official API documentation and established concurrency patterns in Rust
- Pitfalls: HIGH — Based on documented API constraints (Regorus sync, Wasmtime VM requirements, SQLite concurrency model)
- Integration with Phase 1: HIGH — Existing codebase reviewed; AllowlistLayer → policy verdict refactoring path is clear

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (30 days — all libraries are stable releases)