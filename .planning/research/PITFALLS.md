# Pitfalls Research

**Domain:** AI Governance Kernel / Compliance Proxy Platform
**Researched:** 2026-02-26
**Confidence:** MEDIUM-HIGH (most pitfalls verified across multiple sources; some Bun/Elysia-specific items are LOW confidence due to ecosystem immaturity)

## Critical Pitfalls

### Pitfall 1: Buffering SSE Streams Destroys Latency and Breaks Inspection

**What goes wrong:**
The proxy buffers entire SSE responses before forwarding them to clients, causing AI responses to arrive in large delayed chunks instead of token-by-token. Every layer in the stack -- Nginx, reverse proxies, load balancers, antivirus proxies, and even the kernel's own inspection logic -- defaults to buffering HTTP responses. Since Interdict's core value proposition is inline inspection with minimal latency overhead, buffering at any layer turns a <10ms overhead into multi-second delays that make the product unusable.

Simultaneously, KrakenD and other API gateways have documented that streaming proxies can only operate in pass-through mode -- response payloads are not available to transformation or inspection when streaming is enabled. This creates a fundamental tension: you need to inspect the stream, but inspecting it requires buffering, and buffering breaks the stream.

**Why it happens:**
HTTP proxies default to response buffering for good reason (efficiency, compression, etc.). The sliding window inspection design requires holding back 5-10 tokens, which means the kernel *must* partially buffer. Developers often prototype with small payloads where buffering is invisible, then discover catastrophic latency under real LLM streaming workloads.

**How to avoid:**
- Design the streaming inspection pipeline as a zero-copy async byte stream from day one. Never materialize the full response body.
- Implement a token-aware ring buffer that emits tokens as soon as the sliding window clears them, not after the full response completes.
- Set `X-Accel-Buffering: no` on all proxied SSE responses. Disable `proxy_buffering` in any upstream Nginx. Use `flush_interval -1` in Caddy if applicable.
- Test with real LLM API responses (GPT-4, Claude) from the first prototype. Synthetic test data does not expose buffering issues.
- Measure time-to-first-token (TTFT) overhead as a primary metric, not just throughput.

**Warning signs:**
- TTFT with proxy is >100ms higher than without proxy
- AI chat responses appear in bursts instead of smooth streaming
- Integration tests pass but real-world demo feels laggy
- `Content-Encoding: gzip` appearing on proxied SSE responses (compression forces full buffering)

**Phase to address:**
Phase 1 (Core Kernel). This must be correct from the first working prototype. Retrofitting streaming inspection onto a buffered architecture is a full rewrite.

---

### Pitfall 2: Unbounded Tokio Task Spawning and Channel Memory Exhaustion

**What goes wrong:**
Under high load, the kernel spawns unbounded async tasks (one per request, one per policy evaluation, one per evidence bundle) and uses unbounded channels for internal communication. When the producer rate exceeds consumer capacity -- e.g., audit log flushing falls behind during a traffic spike -- unbounded channels grow without limit, consuming all available memory. A 2025 analysis from the Rust Performance Working Group found that 43% of memory issues in async Rust applications stem from task lifecycle mismanagement.

For a proxy targeting <128MB RAM steady state, this is catastrophic. A single traffic spike can push memory past limits, triggering OOM kills in the K8s sidecar, which then disrupts all AI traffic for that pod.

**Why it happens:**
Tokio's `mpsc::unbounded_channel()` is easier to use than bounded channels (no `.await` on send). Developers default to unbounded during prototyping. Spawning `tokio::spawn` per-request feels natural but creates no backpressure. The system appears fine in testing because test loads don't sustain high rates long enough to exhaust memory.

**How to avoid:**
- Use `tokio::sync::mpsc::channel(N)` with explicit bounded capacity everywhere. Zero unbounded channels in production code.
- Implement a worker pool pattern for policy evaluation: fixed number of Wasm evaluation workers pulling from a bounded queue.
- Set `tokio::task::JoinSet` with a concurrency limit rather than raw `tokio::spawn` loops.
- Add memory monitoring that alerts at 80% of the 128MB limit.
- Use `jemalloc` or `mimalloc` with `MALLOC_CONF` stats enabled -- Rust's default allocator may not return freed memory to the OS, creating apparent leaks.

**Warning signs:**
- Memory usage climbs under sustained load and never returns to baseline
- `grep -r "unbounded_channel" src/` returns any matches in production code paths
- `tokio::spawn` called inside request handlers without a concurrency semaphore
- Load tests crash after 10+ minutes but pass on short runs

**Phase to address:**
Phase 1 (Core Kernel). Bounded channels and worker pools must be the foundation from the start. Converting unbounded to bounded channels later requires touching every component boundary.

---

### Pitfall 3: ClickHouse "Too Many Parts" From Frequent Small Inserts

**What goes wrong:**
The evidence pipeline sends individual or small-batch inserts to ClickHouse for every policy evaluation event. ClickHouse's MergeTree engine creates a new "part" on disk for each INSERT statement. When inserts arrive faster than background merges can consolidate parts, ClickHouse throws "Too many parts (300+). Merges are processing significantly slower than inserts" and begins rejecting writes. Audit log data is silently lost.

This is not a hypothetical risk. Trigger.dev experienced this exact failure in production (November-December 2025), losing 275,000+ insert operations over a 3-day window due to a combination of frequent small inserts and poor partition key design.

**Why it happens:**
The kernel generates events at >10,000/second. Developers familiar with PostgreSQL (where frequent small inserts are fine) apply the same pattern to ClickHouse. The ClickHouse documentation explicitly warns: "you should never send too many INSERT statements per second. Ideally one insert per second." But this is easy to miss when ClickHouse "works" during development with low event rates.

Additionally, partitioning by event timestamp (a natural-seeming choice for audit logs) creates fragmentation when late-arriving events land in already-merged old partitions. Trigger.dev's post-mortem confirmed this: partitioning by `start_time` instead of `inserted_at` caused tiny parts to fragment stable old partitions.

**How to avoid:**
- Buffer events in-memory in the Evidence Collector service and flush to ClickHouse in batches (1x per second, 1000+ rows per INSERT).
- Enable ClickHouse async inserts (`async_insert=1, wait_for_async_insert=0`) as a safety net, but do not rely on it as the primary mechanism.
- Partition by `toYYYYMM(inserted_at)` (monthly by insertion time), never by event timestamp or high-cardinality fields.
- Monitor `system.parts` table for partition part counts; alert at 150 parts per partition.
- Use a Buffer table in front of MergeTree as a secondary protection layer.
- Keep partition granularity coarse: monthly, not daily or hourly.

**Warning signs:**
- ClickHouse error log shows "Too many parts" warnings
- INSERT rate per second exceeds 5-10 statements (before batching fix)
- Partitioned by anything other than insertion timestamp
- `system.parts` query shows >100 active parts per partition

**Phase to address:**
Phase 2 (Evidence Pipeline). This must be designed correctly when the ClickHouse schema is first created. Changing partition keys on populated tables requires full data migration.

---

### Pitfall 4: Cryptographic Evidence Chain Allows Self-Verification Without External Anchoring

**What goes wrong:**
The hash chain and Merkle tree are computed and stored entirely within Interdict's own infrastructure. An attacker (or compromised system) with access to the signing keys can silently recompute the entire chain with modified data, producing a valid-looking but tampered audit trail. Without external anchoring, the cryptographic evidence is self-referential and proves nothing to a skeptical auditor or regulator.

The 2025 Two Sigma incident demonstrated this directly: audit logs that could be modified by the systems they audited allowed a researcher to manipulate 14 models undetected for 2 years, causing $165M in losses.

**Why it happens:**
Building the hash chain is technically satisfying and demonstrably "works" in unit tests. External anchoring (to a TSA, transparency log, or immutable storage) feels like a later optimization. The cryptography is correct in isolation, but the trust model is wrong: Ed25519 signatures prove who signed, but not that the data wasn't replaced wholesale.

**How to avoid:**
- Implement three-layer evidence architecture from day one:
  1. Per-event Ed25519 signatures (tamper detection for individual events)
  2. Hourly Merkle tree batching per RFC 6962 (deletion detection across batches)
  3. External anchoring of Merkle roots to S3 Object Lock (WORM) or a Time Stamp Authority (TSA)
- The external anchor is the critical piece. It must be immutable storage that Interdict cannot overwrite.
- Implement dual-anchor minimum: at least two independent external anchoring targets.
- Key management: signing keys must be rotatable, with old roots remaining verifiable under previous keys.
- Never allow the same process that generates evidence to also be the sole verifier.

**Warning signs:**
- Evidence verification only checks internal chain consistency, never external anchors
- Merkle root storage is in the same database as the events
- No TSA or WORM storage integration exists
- Key rotation procedure does not exist or has never been tested
- Sales demos show "tamper-proof" without explaining how tampering by admins is prevented

**Phase to address:**
Phase 2 (Evidence Pipeline) for basic anchoring, Phase 3 (Enterprise Hardening) for dual-anchor and TSA integration. The schema must accommodate external anchor references from the start even if implementation comes later.

---

### Pitfall 5: Wasmtime Store-Per-Request Without Pooling Allocator Blows Memory Budget

**What goes wrong:**
Each policy evaluation creates a new Wasmtime `Store` and instantiates the Wasm module from scratch. At 10,000 requests/second, this means 10,000 Store allocations per second, each requiring virtual memory mapping, linear memory allocation, and module instantiation. Without the pooling allocator, each instantiation calls `mmap`/`munmap` for memory regions, creating massive kernel overhead. The 128MB RAM budget is consumed within seconds.

Furthermore, Wasmtime's `Store` borrows the entire store context during safe memory operations, meaning you cannot access your application state (`Store<T>`) while a Wasm function is executing. This creates deadlock-like patterns if the host function callback needs to read other state.

**Why it happens:**
The naive pattern -- `Store::new(&engine, data)` per request -- is the first example in every Wasmtime tutorial. It works perfectly for low-throughput use cases. The pooling allocator is an advanced feature that requires upfront capacity planning (max instances, max memory per instance, max tables). Developers defer it as "optimization" but it's actually a correctness requirement at kernel-level throughput.

**How to avoid:**
- Enable `PoolingAllocationConfig` from the first Wasm integration. Configure with explicit limits:
  - `max_component_instance_size`: based on policy module size
  - `total_memories`: based on expected concurrent evaluations
  - `max_memory_size`: 1-4MB per policy instance (policies should be small)
- Pre-compile policy modules with `Engine::precompile_module()` and cache the compiled artifacts. Module compilation is the expensive step; instantiation from precompiled modules is fast.
- Use a fixed-size pool of pre-warmed `Store` instances with bounded channels for request routing (worker pool pattern).
- Design host function interfaces to minimize data passed across the Wasm boundary. Pass input as a single JSON blob, get output as a single JSON blob.
- Be aware: Wasm memory can grow and change its base pointer during execution. Never hold raw pointers across function calls.

**Warning signs:**
- `InstanceAllocationStrategy::OnDemand` in production configuration
- Memory spikes correlating with request rate
- `mmap`/`munmap` syscalls visible in `strace` under load
- Policy evaluation latency >2ms (target is <1ms for simple rules)
- Deadlocks or panics when host functions access Store state

**Phase to address:**
Phase 1 (Core Kernel). The pooling allocator and worker pool pattern must be the initial Wasm integration design. Retrofitting pooling onto a Store-per-request design requires rearchitecting the evaluation pipeline.

---

### Pitfall 6: TLS Interception Certificate Management Creates Security Vulnerabilities

**What goes wrong:**
As a transparent proxy intercepting HTTPS traffic to AI vendors, Interdict must perform TLS termination using a custom CA certificate installed in the client's trust store. Implementation mistakes in this area are severe: academic research ("The Sorry State of TLS Security in Enterprise Interception Appliances," ACM 2020) found that 4 out of 13 tested enterprise interception appliances performed no upstream certificate validation at all, 3 used pre-generated certificates shared across all installations, and 11 accepted certificates signed with MD5.

If Interdict makes any of these mistakes, it actively weakens the security of every AI connection it proxies, turning a governance tool into an attack surface.

**Why it happens:**
TLS interception is inherently complex. Developers focus on getting the proxy working (decrypting traffic, inspecting content, re-encrypting) and treat upstream certificate validation as secondary. Pre-generated CA keys ship in Docker images for convenience. Certificate rotation is deferred. Self-signed upstream certificates are silently accepted to avoid connection failures during testing, and the permissive setting leaks to production.

**How to avoid:**
- Generate unique CA keypairs per deployment. Never ship pre-generated keys in container images.
- Validate upstream certificates fully: chain verification, hostname verification, revocation checking (OCSP stapling), reject self-signed and MD5-signed certificates.
- Store CA private keys encrypted at rest with HSM-backed protection where possible, or at minimum restrict access to the root account only.
- Implement certificate transparency checking for upstream connections.
- Document and test the CA certificate deployment process for every supported enterprise IdP and OS combination.
- Provide a "verify mode" that tests the TLS pipeline without proxying real traffic.
- For the initial pilot (Docker Compose, 80 users): explicit proxy configuration with CA cert installation is acceptable. Do not attempt transparent interception yet.

**Warning signs:**
- CA private key exists unencrypted in the container image
- Upstream certificate validation disabled or relaxed in any environment
- No automated test for upstream certificate chain validation
- Self-signed certificate acceptance enabled (even "just for development")
- CA key identical across multiple customer deployments

**Phase to address:**
Phase 1 (Core Kernel) for proxy-mode TLS with explicit CA trust, Phase 3 (Enterprise Hardening) for transparent interception mode. This is a security-critical path that needs dedicated review.

---

### Pitfall 7: Hyper HTTP/2 Single Connection Per Backend Throttles Throughput

**What goes wrong:**
Hyper's connection pool opens only one TCP connection per HTTP/2 backend, relying on HTTP/2 multiplexing for concurrency. However, HTTP/2 servers typically limit concurrent streams to 100-250 per connection. When the kernel proxies traffic for 80+ users all hitting the same AI vendor (e.g., OpenAI), all requests funnel through a single TCP connection. At 250 concurrent streams, additional requests queue, adding latency. Under heavy load, hyper issue #3338 documents that communication gets stuck entirely when too many requests are spawned.

**Why it happens:**
HTTP/2 multiplexing is supposed to eliminate the need for multiple connections. In practice, server-side stream limits, head-of-line blocking at the TCP layer, and flow control windows create bottlenecks. Hyper does not currently expose configuration for multiple connections per HTTP/2 host. Developers assume HTTP/2 handles connection pooling automatically.

**How to avoid:**
- Implement a custom connection pool that maintains multiple HTTP/2 connections per backend, not just one. This requires working below hyper's built-in pool.
- Set explicit per-connection concurrency limits below the server's max (e.g., 100 streams per connection).
- Monitor active stream counts per connection; open additional connections when utilization exceeds 70%.
- Consider using `reqwest` (which wraps hyper) with connection pool configuration, or implement connection rotation.
- Test with realistic concurrency: 80 users * average 2-3 concurrent AI requests = 160-240 concurrent streams to a single backend.

**Warning signs:**
- Tail latency spikes when concurrent request count exceeds ~200
- All traffic to a single AI vendor routes through one TCP connection (visible in `netstat`)
- Request queuing appears under moderate load despite low CPU/memory utilization
- HTTP/2 flow control `WINDOW_UPDATE` frames dominate traffic analysis

**Phase to address:**
Phase 1 (Core Kernel). Connection pooling strategy must be designed with the proxy architecture. A single-connection design works for demos but fails immediately at pilot scale.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `unwrap()` / `expect()` in request handling paths | Faster prototyping | Single malformed request panics the proxy, killing all connections on that thread | Never in hot path; acceptable only in startup/config loading |
| Skip streaming, implement request/response buffering first | Simpler initial implementation | Full rewrite required; non-streaming code is throwaway (PROJECT.md already identifies this) | Never -- streaming-first is a stated project constraint |
| Hardcode policy evaluation to a single Wasm module | Simpler first milestone | Cannot support per-department policies, hot-reload, or A/B testing | Acceptable for first 2 weeks of development only |
| Use PostgreSQL for audit events instead of ClickHouse | One fewer database to operate | Cannot sustain >1000 events/sec query performance; migration at scale is painful | Acceptable for MVP demo (first month), must migrate before pilot |
| Inline evidence hashing in request path | Simpler architecture, fewer services | Adds 2-5ms to every request; violates async audit pipeline constraint | Never -- async evidence creation is a stated constraint |
| Single-process monolith (kernel + API + dashboard) | Simpler deployment | Violates data plane / control plane separation; kernel latency affected by API load | Never -- this is the #1 architectural mistake called out in PROJECT.md |

## Integration Gotchas

Common mistakes when connecting to external services and between internal components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI/Anthropic API proxying | Assuming consistent SSE format across providers; OpenAI uses `data: [DONE]` sentinel, Anthropic uses different event types | Build provider-specific SSE parsers. Do not assume a universal SSE format for AI vendors. Test against each vendor's actual streaming output. |
| OIDC/SAML identity extraction | Not validating issuer, audience, and nonce claims in JWT tokens. Recent vulnerabilities in IBM Verify and Apache APISIX (2024-2025) exploited issuer-mismatch in multi-tenant deployments. | Always validate issuer, audience, expiry, and nonce. Use 15-minute token lifetimes. Pin to specific IdP configurations per tenant. |
| gRPC between kernel and evidence collector | Using unary RPCs for high-volume event shipping, or recreating the stream on every message (tonic pitfall where stream gets recreated per-send) | Use bidirectional streaming with `mpsc` channels feeding an `UnboundedReceiverStream`. Keep the stream open. Implement reconnection with exponential backoff. |
| Wasm policy hot-reload | Replacing the module while evaluations are in-flight, causing panics or use-after-free of the old Store | Use an `Arc<RwLock<CompiledModule>>` pattern. New requests get the new module; in-flight evaluations complete on the old module. Atomic swap on the Arc. |
| SAML 2.0 in modern frontends | Attempting SAML redirect flows in a React SPA, which breaks due to XML/redirect requirements | SAML integration should happen server-side in the Bun/Elysia API. The Next.js frontend should use OIDC for browser flows. Translate SAML to internal JWT at the API boundary. |
| ClickHouse from Bun/Elysia | Using the ClickHouse HTTP interface with individual queries per dashboard request | Use the official `@clickhouse/client` Node.js library. Implement query result caching (30-60 second TTL) for dashboard views. Batch analytical queries. |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| JSON serialization for every policy evaluation input/output | Latency increases linearly with policy count; >5ms for complex policies | Use zero-copy deserialization (`serde` with borrowed data) or pass structured data through Wasm memory directly | >5 policies evaluated per request, or >5000 req/sec |
| Regex-based pattern matching for content inspection | CPU spikes to 100% on long AI responses; ReDoS vulnerability on crafted inputs | Use the `aho-corasick` crate for multi-pattern matching. Validate regex complexity. Set match timeouts. | >1000 req/sec or responses >10KB with >50 patterns |
| Synchronous Merkle tree computation in evidence path | Evidence collector blocks on tree computation; backpressure propagates to kernel | Compute Merkle trees in a dedicated background task on a timer (hourly batches). Never block the insert path. | >10,000 events/hour per tree |
| Cargo workspace feature unification | Debug builds include unnecessary features from other workspace members, inflating compile times and binary size | Use `resolver = "2"` in workspace Cargo.toml. Build kernel binary with `--manifest-path` to avoid feature bleeding from control plane crates. | When Rust workspace exceeds 5-6 crates with divergent dependency features |
| Single ClickHouse table for all event types | Queries slow as table grows; cannot optimize sort key for different query patterns | Separate tables: `policy_decisions` (hot, queried frequently), `evidence_bundles` (cold, queried for audits), `raw_traffic_metadata` (analytics). Different sort keys per table. | >100M rows or >3 months of data |
| gRPC message size defaults (4MB) | Evidence bundles with large prompt/response hashes exceed default limits | Configure `max_decoding_message_size` and `max_encoding_message_size` explicitly. Keep individual messages small; stream large payloads in chunks. | When any single evidence bundle exceeds 4MB |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging plaintext prompts/responses in audit trail | Customer data exfiltration; violates the very compliance the product enforces; GDPR violation | Store only prompt/response *hashes* (SHA-256) in evidence bundles. Plaintext stored separately with encryption-at-rest and strict access controls. This is already in PROJECT.md but must be enforced at the code level. |
| Signing key accessible to application code at runtime | Compromised kernel can forge evidence bundles, destroying audit trail integrity | Key should be in a separate process or HSM. Kernel sends unsigned bundles to Evidence Collector, which holds the signing key. Separation of concerns between data collection and evidence signing. |
| Fail-open as default mode | Policy engine crash means all AI traffic flows unchecked, exactly when governance is most needed | Default to fail-closed. Implement circuit breaker: if policy evaluation fails 3 times in 10 seconds, block all traffic and alert. Fail-open should require explicit per-policy opt-in with compliance officer approval. |
| No rate limiting on policy evaluation bypass | Attacker floods the kernel to trigger fail-open mode, then exfiltrates data while governance is disabled | Implement per-user rate limiting before policy evaluation. Rate limit applies regardless of fail mode. Anomaly detection on request volume spikes. |
| CA certificate deployed without expiry or rotation plan | Expired CA cert breaks all proxied traffic simultaneously across entire deployment | Set CA cert expiry to 1 year. Implement automated rotation 30 days before expiry. Test rotation procedure quarterly. |
| RBAC bypass through direct ClickHouse access | Users with database credentials can read audit data without RBAC enforcement | ClickHouse should only be accessible through the Control Plane API, never directly. Use separate ClickHouse users with row-level security for different tenants. Network policy: only the API container can reach ClickHouse. |

## UX Pitfalls

Common user experience mistakes for compliance platform dashboards.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw policy evaluation JSON to compliance officers | CISOs cannot interpret technical output; product feels like a developer tool, not a compliance platform | Translate every policy decision into human-readable compliance language: "This prompt was blocked because it contained patient data (HIPAA Rule 164.502(a))" |
| No explanation when AI response is blocked or redacted | End users see `[REDACTED BY INTERDICT POLICY]` with no recourse; they work around the proxy | Provide a link/reference code the user can share with their compliance officer for review. Include the policy name (not ID) that triggered the block. |
| Dashboard latency >2 seconds on audit trail search | Compliance officers abandon the tool and request CSV exports, defeating the purpose | Pre-aggregate common queries (last 24h violations, per-department stats) in ClickHouse materialized views. Target <500ms for common queries. |
| Policy builder requires Rego knowledge | Only developers can create policies; compliance officers become dependent on engineering | Build a visual policy builder that generates Rego/YAML under the hood. Provide pre-built policy templates for each regulation (EU AI Act Article 14, GDPR Article 35, etc.). |
| Regulatory mapping as a static dropdown | Regulations change; static mapping becomes stale; customers lose trust | Version regulatory mappings. Show "last updated" dates. Provide a changelog for regulatory updates. Make mappings editable (with audit trail of changes). |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **SSE streaming proxy:** Often missing reconnection handling when upstream drops the connection mid-stream. Verify: force-kill the upstream connection during a streaming response and confirm the client gets a clean error, not a hang.
- [ ] **Policy hot-reload:** Often missing rollback on compilation failure. Verify: push a syntactically invalid Rego policy and confirm the kernel keeps the previous valid policy, not crash or run with no policy.
- [ ] **Merkle tree verification:** Often missing partial tree verification (proving a single event is in the tree without downloading the full tree). Verify: given an event ID, produce a Merkle inclusion proof that an external auditor can verify independently.
- [ ] **OIDC integration:** Often missing token refresh handling. Verify: set token expiry to 60 seconds and confirm the dashboard maintains the session without forcing re-login.
- [ ] **Fail-closed mode:** Often missing graceful degradation. Verify: kill the policy engine process and confirm traffic is blocked with a meaningful error, not a TCP connection reset.
- [ ] **Evidence chain continuity:** Often missing handling of kernel restart. Verify: restart the kernel and confirm the first post-restart evidence bundle correctly references the last pre-restart bundle's hash (chain continuity).
- [ ] **Multi-turn session tracking:** Often missing session boundary detection. Verify: user starts a conversation, switches AI vendors mid-conversation, and confirm the kernel correctly identifies this as two separate sessions, not one.
- [ ] **ClickHouse schema migration:** Often missing backward-compatible migration path. Verify: add a new column to the evidence table and confirm old evidence bundles remain queryable without data loss.
- [ ] **K8s sidecar resource limits:** Often missing OOM behavior testing. Verify: set kernel memory limit to 128MB, generate sustained traffic, and confirm graceful degradation (request rejection) rather than OOM kill.
- [ ] **gRPC reconnection:** Often missing backoff between kernel and evidence collector. Verify: kill the evidence collector, confirm the kernel buffers events locally, and reconnects with exponential backoff when the collector returns.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SSE buffering destroys latency | HIGH | Requires rearchitecting the inspection pipeline to streaming-first. Cannot be patched incrementally. Budget 2-3 weeks for a clean rewrite. |
| Unbounded channel memory exhaustion | MEDIUM | Add bounded channels at component boundaries. Requires touching each producer/consumer pair but logic remains the same. Budget 3-5 days. |
| ClickHouse too many parts | MEDIUM | Enable async inserts immediately (minutes). Fix partition key requires creating new table and migrating data (1-2 days). No data loss if caught early. |
| Evidence chain without external anchoring | LOW | External anchoring can be added to existing chain without invalidating prior evidence. Prior evidence is weaker (self-verifiable only) but not invalid. Budget 1 week. |
| Wasmtime Store-per-request memory blow | HIGH | Switching to pooling allocator requires redesigning the Store lifecycle, worker pool, and all host function interfaces. Budget 1-2 weeks. |
| TLS certificate vulnerability | HIGH | Requires security audit of all TLS paths, key rotation for compromised deployments, customer notification if keys were shared. Budget 1-2 weeks plus customer communication. |
| HTTP/2 single connection throttling | MEDIUM | Implement custom connection pool layer. Can be inserted between existing proxy and hyper client without full rewrite. Budget 3-5 days. |
| Cargo feature unification build issues | LOW | Add `resolver = "2"` and separate build commands. Immediate fix, no architecture change. Budget hours. |
| Bun/Elysia performance regression | MEDIUM | Set `aot: false` as immediate workaround. Monitor Elysia releases for fixes. Consider migration to Hono if regressions recur. Budget hours for workaround, weeks for migration. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SSE buffering breaks streaming | Phase 1: Core Kernel | TTFT overhead <10ms with real LLM APIs; streaming tokens arrive within 50ms of upstream emission |
| Unbounded memory growth | Phase 1: Core Kernel | 24-hour sustained load test at 10k req/sec stays under 128MB; no unbounded channels in `cargo clippy` audit |
| ClickHouse too many parts | Phase 2: Evidence Pipeline | Insert rate never exceeds 2 statements/sec to ClickHouse; partition part count stays <100 under load |
| Self-verifying evidence chain | Phase 2: Evidence Pipeline, Phase 3: Enterprise | External auditor can verify Merkle root against S3 Object Lock without Interdict access |
| Wasmtime memory blow | Phase 1: Core Kernel | Pooling allocator config in initial Wasm integration; memory stable under 10k concurrent evaluations |
| TLS certificate vulnerabilities | Phase 1: Core Kernel (proxy mode), Phase 3: Enterprise (transparent mode) | Automated test validates upstream cert chain; no pre-generated keys in container images |
| HTTP/2 connection throttling | Phase 1: Core Kernel | 250+ concurrent requests to single backend complete without queuing; multiple TCP connections visible |
| Cargo feature unification | Phase 1: Repository Setup | `resolver = "2"` in workspace Cargo.toml; CI builds each crate independently |
| Bun/Elysia AOT regression | Phase 2: Control Plane | Load test API at 1000 req/sec; confirm `aot` setting is explicit in configuration |
| OIDC/SAML token validation | Phase 2: Control Plane | Automated tests for expired tokens, wrong issuer, wrong audience all return 401 |
| Policy hot-reload race condition | Phase 1: Core Kernel | Push invalid policy during load test; confirm zero failed evaluations and automatic rollback |
| ClickHouse partition key design | Phase 2: Evidence Pipeline | Partition key is `toYYYYMM(inserted_at)`; verified in schema migration scripts |
| gRPC stream reconnection | Phase 2: Evidence Pipeline | Kill evidence collector during load test; confirm zero event loss after reconnection |
| Fail-closed default | Phase 1: Core Kernel | Kill policy engine; confirm all requests blocked with HTTP 503 and meaningful error body |
| Signing key isolation | Phase 2: Evidence Pipeline | Kernel process has no access to signing key; evidence collector is sole signer |

## Sources

**Streaming and Proxy:**
- [Async Rust with Tokio I/O Streams: Backpressure](https://biriukov.dev/docs/async-rust-tokio-io/1-async-rust-with-tokio-io-streams-backpressure-concurrency-and-ergonomics/) - MEDIUM confidence
- [KrakenD SSE Streaming Documentation](https://www.krakend.io/docs/enterprise/endpoints/streaming/) - HIGH confidence (official docs)
- [Hyper HTTP/2 stuck with too many requests - Issue #3338](https://github.com/hyperium/hyper/issues/3338) - HIGH confidence (primary source)
- [Hyper single HTTP/2 connection - Apollo Router Issue #2063](https://github.com/apollographql/router/issues/2063) - HIGH confidence (primary source)

**Wasmtime:**
- [Wasmtime PoolingAllocationConfig Documentation](https://docs.wasmtime.dev/api/wasmtime/struct.PoolingAllocationConfig.html) - HIGH confidence (official docs)
- [Wasmtime ResourceLimiter Documentation](https://docs.wasmtime.dev/api/wasmtime/trait.ResourceLimiter.html) - HIGH confidence (official docs)
- [Wasmtime Memory Safety Documentation](https://docs.wasmtime.dev/api/wasmtime/struct.Memory.html) - HIGH confidence (official docs)

**ClickHouse:**
- [ClickHouse "Too Many Parts" Official Knowledge Base](https://clickhouse.com/docs/knowledgebase/exception-too-many-parts) - HIGH confidence (official docs)
- [Trigger.dev ClickHouse Post-Mortem (Dec 2025)](https://trigger.dev/blog/clickhouse-too-many-parts-postmortem) - HIGH confidence (production incident report)
- [ClickHouse Schema Design for Observability](https://clickhouse.com/docs/use-cases/observability/schema-design) - HIGH confidence (official docs)
- [Cloudflare Log Analytics with ClickHouse](https://blog.cloudflare.com/log-analytics-using-clickhouse/) - MEDIUM confidence

**Cryptographic Evidence:**
- [Building Tamper-Proof Audit Trails: 2025 Trading Disasters](https://dev.to/veritaschain/building-tamper-proof-audit-trails-what-three-2025-trading-disasters-teach-us-about-cryptographic-378g) - MEDIUM confidence
- [Ed25519 + Merkle Tree + UUIDv7 for Decision Logs](https://dev.to/veritaschain/ed25519-merkle-tree-uuidv7-building-tamper-proof-decision-logs-o1e) - MEDIUM confidence

**TLS Interception:**
- [The Sorry State of TLS Security in Enterprise Interception Appliances (ACM)](https://dl.acm.org/doi/fullHtml/10.1145/3372802) - HIGH confidence (peer-reviewed)
- [mitmproxy: How it Works](https://docs.mitmproxy.org/stable/concepts/how-mitmproxy-works/) - HIGH confidence (official docs)

**Bun/Elysia:**
- [Elysia Performance Regression Issue #1604](https://github.com/elysiajs/elysia/issues/1604) - HIGH confidence (primary source, resolved in v1.4.19)
- [Elysia Deployment Documentation](https://elysiajs.com/patterns/deploy) - HIGH confidence (official docs)

**OPA/Rego Wasm:**
- [OPA WebAssembly Documentation](https://www.openpolicyagent.org/docs/latest/wasm/) - HIGH confidence (official docs)
- [Regorus: Rust Rego Interpreter](https://github.com/microsoft/regorus) - HIGH confidence (Microsoft official repo)

**AI Governance:**
- [The Architecture Gap: Enterprise AI Governance](https://ajithp.com/2025/12/14/enterprise-ai-governance-framework/) - MEDIUM confidence
- [EU AI Act Compliance Timeline](https://vodworks.com/blogs/ai-compliance/) - MEDIUM confidence

**Rust Async:**
- [Tokio Memory Leak Analysis (Nov 2025)](https://medium.com/@shkmonty35/i-profiled-rusts-async-runtime-for-30-days-found-memory-leak-in-tokio-the-fix-52f612d4c4e2) - LOW confidence (single source, unverified 43% claim)
- [Cargo Workspace Feature Unification Pitfall](https://nickb.dev/blog/cargo-workspace-and-the-feature-unification-pitfall/) - MEDIUM confidence

**Kubernetes:**
- [K8s Pod Level Resources Beta (v1.34)](https://kubernetes.io/blog/2025/09/22/kubernetes-v1-34-pod-level-resources/) - HIGH confidence (official K8s blog)
- [Native Sidecar Containers Stable (v1.33)](https://signoz.io/guides/kubernetes-sidecar/) - MEDIUM confidence

---
*Pitfalls research for: AI Governance Kernel / Compliance Proxy Platform (Interdict.io)*
*Researched: 2026-02-26*
