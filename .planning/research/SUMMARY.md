# Project Research Summary

**Project:** Interdict.io — AI Governance Kernel & Compliance Proxy
**Domain:** AI Governance Infrastructure / Compliance Proxy for Regulated Enterprises
**Researched:** 2026-02-26
**Confidence:** HIGH (stack, architecture, pitfalls) / MEDIUM-HIGH (features)

## Executive Summary

Interdict.io is a VPC-native, inline AI governance proxy designed for regulated enterprises (banks, law firms, hospitals). It sits between employees and external AI vendors, enforcing policies in real-time at the data plane before AI traffic reaches those vendors. The architecture splits into two strict planes: a Rust kernel (data plane) that handles traffic inspection, policy enforcement, and evidence capture at sub-10ms overhead, and a TypeScript control plane (Bun + Elysia API + Next.js dashboard) that manages policy configuration, audit analytics, and compliance reporting. This separation is the non-negotiable foundation — the kernel never touches PostgreSQL or serves REST, and the control plane never touches live AI traffic.

The recommended approach is to build the Rust kernel as a streaming-first transparent proxy using hyper + tower + tokio, with a 3-layer policy enforcement pipeline: Layer 1 uses Regorus (Rust-native Rego interpreter, 10x faster than OPA) for deterministic sub-2ms rules, Layer 2 uses a quantized ONNX model via tract for NLP classification under 10ms, and Layer 3 routes edge cases to a human review queue. Evidence is captured asynchronously via a gRPC stream to an Evidence Collector service that builds SHA-256 hash chains, hourly Merkle trees, Ed25519 signatures, and S3 Object Lock (WORM) anchoring — creating tamper-evident audit trails that no competitor currently offers. Policy-as-Code via Wasm modules (distributed to the kernel fleet using an Envoy xDS-style gRPC push pattern) enables real-time policy updates without restarts.

The primary risks are all well-documented and must be addressed from day one: SSE streaming must be zero-copy from the first prototype (retrofitting streaming onto a buffered proxy is a full rewrite); Wasmtime must use the pooling allocator and a pre-warmed worker pool immediately (Store-per-request blows the 128MB RAM budget at scale); ClickHouse must receive batched inserts via the Evidence Collector (individual per-event inserts trigger "too many parts" failures); and the cryptographic evidence chain must include external anchoring to S3 Object Lock from the start (self-verifying chains alone fail regulatory scrutiny). TLS interception via a custom CA must generate deployment-unique keypairs — never ship pre-generated keys.

## Key Findings

### Recommended Stack

The stack is well-validated across all layers with HIGH confidence. The Rust data plane centers on tokio 1.47 LTS + hyper 1.7 + tower 0.4 + rustls 0.23, with wasmtime 29.x for sandboxed custom policy extensions and regorus 0.9 for Rego evaluation (the key insight: use Regorus as an embedded Rust library rather than OPA-as-sidecar, eliminating a network hop and reducing policy evaluation from ~45ms to ~4.6ms). The NLP layer uses tract with quantized ONNX models (~30MB) to stay within the 128MB sidecar RAM budget. Cryptographic evidence uses ed25519-dalek 2.2 + sha2 0.10 + rs_merkle 1.5 — all pure-Rust, battle-tested, and no external dependencies.

The control plane uses Bun 1.3 + Elysia 1.4 for the API (4-18x faster than Express, end-to-end TypeScript type safety) and Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui for the dashboard. Both databases are specifically chosen and non-interchangeable: PostgreSQL 17 for ACID config/policies/users, ClickHouse 25.8 LTS for high-volume audit log analytics (handles 10k+ events/sec, 6x compression, sub-second analytical queries). Shared .proto definitions managed by buf CLI ensure type safety across the Rust/TypeScript boundary.

**Core technologies:**
- Rust 1.85 (Edition 2024): Data plane — only viable language for sub-10ms p99 under 128MB RAM with no GC pauses
- tokio 1.47 LTS + hyper 1.7 + tower 0.4: Async runtime, HTTP proxy, composable middleware
- Regorus 0.9: Rust-native Rego interpreter — eliminates OPA sidecar, reduces policy eval from 45ms to 4.6ms
- wasmtime 29.x (pooling allocator): Sandboxed execution for custom Wasm policy extensions
- tract + quantized ONNX: Layer 2 NLP classification, pure Rust, fits 128MB budget
- ed25519-dalek 2.2 + sha2 0.10 + rs_merkle 1.5: Cryptographic evidence chain
- Bun 1.3 + Elysia 1.4: Control plane API — 4-18x faster than Node+Express
- Next.js 16 + React 19 + Tailwind v4 + shadcn/ui: Dashboard
- PostgreSQL 17 + ClickHouse 25.8 LTS: Config/ACID + audit log analytics
- tonic 0.14 + prost 0.14 + buf CLI: gRPC + protobuf across all services
- Docker Compose (pilot) + Helm 3.x (K8s enterprise): Deployment

### Expected Features

**Must have (table stakes — any absence blocks enterprise sales):**
- Real-time prompt and response inspection (T1) — the core capability
- PII/sensitive data detection and redaction (T2) — #1 buyer requirement; GDPR/HIPAA mandate
- Policy enforcement with block/allow/redact actions (T3) — the value proposition
- Audit trail with full identity attribution (T4) — EU AI Act Article 12, regulator requirement
- SSO/IdP integration: OIDC + SAML 2.0 (T5) — hard procurement blocker without it
- RBAC with auditor read-only role (T6) — separation of duties for regulated enterprises
- Vendor and model allowlisting (T7) — controls shadow AI, simple but immediately valuable
- Compliance dashboard and reports (T8) — evidence for CISO board presentations
- Regulatory framework mapping: EU AI Act, GDPR, NIST AI RMF (T9) — EU enforcement August 2026
- Prompt injection and jailbreak detection (T10) — OWASP Top 10 for LLMs #1 threat
- VPC/on-premises deployment (T11) — hard blocker for banks, hospitals, government
- SIEM integration via webhook/syslog (T12) — prevents governance tool becoming a silo

**Should have (differentiators that justify premium pricing):**
- Inline prevention rather than post-hoc monitoring (D1) — Purview/Lasso are primarily post-hoc; this is Interdict's core architectural bet
- Cryptographically signed, tamper-proof audit trails: Ed25519 + Merkle + WORM (D2) — no competitor offers this; stands up in court
- Streaming-first response inspection with mid-stream interception (D3) — no competitor publicly claims this capability
- Policy-as-Code via Wasm with hot-reload and customer extensibility (D4) — "governance-as-infrastructure" positioning
- Multi-turn session context tracking (D5) — detects slow-leak data exfiltration invisible to per-message inspection
- Sub-10ms latency overhead (measurable claim) (D6) — DevOps teams uninstall tools that add perceptible latency
- 3-layer policy pipeline (deterministic + NLP + human escalation) (D7) — avoids both false-positive fatigue and LLM-in-path latency
- Evidence bundle verification UI for external auditors (D8)
- Department-level policy segmentation with inheritance model (D9)
- Fail-closed/fail-open toggle per policy (D11) — signals architectural maturity

**Defer to Phase 3+:**
- Agentic AI / MCP Gateway Governance (D10) — market forming in 2026-2027, roadmap item not MVP
- Shadow AI Discovery via network-level detection (D12) — requires network-level capabilities beyond proxy scope
- Full transparent TLS interception mode — explicit proxy configuration acceptable for pilot

**Explicitly anti-features (do not build):**
- LLM-powered inline enforcement — too slow (100ms+), non-deterministic, expensive
- SaaS-only deployment — hard blocker for regulated verticals
- Blockchain-based audit trail — Merkle + S3 Object Lock achieves identical guarantees at zero overhead
- General-purpose API gateway — dilutes positioning, competes with Kong/Envoy/NGINX

### Architecture Approach

The architecture is a monorepo with strict data plane / control plane separation enforced at the process level. The Rust workspace contains four crates: `kernel` (proxy binary), `evidence-collector` (signing service binary), `policy-compiler` (Rego-to-Wasm library), and `shared` (domain types). The TypeScript side contains three packages: `api` (Bun + Elysia control plane), `dashboard` (Next.js), and `shared` (types + proto-gen). All inter-service communication is gRPC using shared .proto definitions in a root `proto/` directory managed by buf CLI. The kernel never reads from PostgreSQL; the control plane never touches live traffic. Policy distribution uses an Envoy xDS-inspired server-streaming gRPC pattern where kernels subscribe and receive real-time updates. Evidence flows from kernel via a bounded in-memory buffer (500ms flush) to the Evidence Collector via bidirectional gRPC streaming, where it receives cryptographic treatment before ClickHouse batch insert.

**Major components:**
1. Interdict Kernel (Rust sidecar) — transparent proxy, 3-layer enforcement, SSE sliding-window inspector, evidence buffer, gRPC policy receiver
2. Evidence Collector Service (Rust) — SHA-256 hash chain, Merkle tree, Ed25519 signing, S3 WORM anchoring, ClickHouse batch inserter
3. Control Plane API (Bun + Elysia) — policy CRUD, Rego-to-Wasm compilation, gRPC policy push to kernel fleet, vendor registry, RBAC, audit queries
4. Dashboard (Next.js + React 19) — policy builder, audit trail UI, compliance reporting, evidence verification — communicates with Control Plane API only, never kernel directly
5. PostgreSQL 17 — config, policy source (Rego), compiled Wasm blobs, users, RBAC, vendor registry, regulatory mappings
6. ClickHouse 25.8 LTS — high-volume audit log storage, analytics, anomaly detection data

### Critical Pitfalls

1. **SSE buffering destroys streaming inspection** — Design the streaming inspection pipeline as a zero-copy async byte stream from day one. Use tokio-util codec for SSE frame parsing. Set `X-Accel-Buffering: no` everywhere. Test with real LLM APIs from first prototype. Time-to-first-token overhead must be the primary metric. Retrofitting streaming onto a buffered architecture is a full rewrite (2-3 week recovery cost).

2. **Wasmtime Store-per-request blows 128MB RAM budget** — Enable `PoolingAllocationConfig` in the first Wasm integration. Pre-compile policy modules with `Engine::precompile_module()`. Use a fixed-size pool of pre-warmed Stores with bounded channels. Never use `InstanceAllocationStrategy::OnDemand` in production. Recovery requires redesigning the entire evaluation pipeline (1-2 week cost).

3. **ClickHouse "too many parts" from frequent small inserts** — The Evidence Collector must batch events (1000+ rows, 1 INSERT/second). Enable async inserts as a safety net. Partition by `toYYYYMM(inserted_at)` — never by event timestamp. Monitor `system.parts` and alert at 150 parts per partition. Trigger.dev lost 275k inserts over 3 days from this exact failure pattern.

4. **Cryptographic evidence chain is self-verifying without external anchoring** — Three-layer evidence architecture is mandatory: per-event Ed25519 signatures + hourly Merkle trees + external S3 Object Lock (WORM) anchoring. Self-referential chains are cryptographically correct but legally insufficient — an admin with DB access can recompute the whole chain. Schema must accommodate external anchor references from the start.

5. **TLS interception ships pre-generated CA keypairs** — Generate deployment-unique CA keypairs. Never ship keys in container images. Validate upstream certificates fully (chain, hostname, revocation). 4 out of 13 enterprise TLS interception appliances in a 2020 ACM study performed no upstream certificate validation. Set CA cert expiry to 1 year with automated rotation.

6. **Unbounded tokio channels exhaust memory under sustained load** — Use `tokio::sync::mpsc::channel(N)` with explicit bounded capacity everywhere. Zero unbounded channels in production code paths. Worker pool pattern for policy evaluation with `JoinSet` concurrency limits. Memory must stay under 128MB under 24-hour sustained load.

7. **HTTP/2 single connection per backend throttles throughput** — Implement a custom connection pool maintaining multiple HTTP/2 connections per AI vendor backend. 80 users each with 2-3 concurrent requests = 160-240 concurrent streams, which saturates a single HTTP/2 connection (server limit typically 100-250 streams). Design this from the first proxy implementation.

## Implications for Roadmap

Based on research, the dependency graph and pitfall phase mapping both strongly suggest a 4-phase structure. Phases 1 and 2 are the most technically complex and must be sequential. Phases 3 and 4 add enterprise surface area onto a validated core.

### Phase 1: Core Data Plane (Rust Kernel)

**Rationale:** All other work depends on a working proxy kernel. The pitfall research is unambiguous: streaming, Wasm pooling, bounded channels, TLS certificate management, and HTTP/2 connection pooling must all be correct from the initial implementation — none can be retrofitted cheaply. This phase has the highest per-mistake recovery cost.

**Delivers:** A working transparent proxy kernel that intercepts AI traffic, evaluates Layer 1 Wasm policies (via Regorus), applies block/allow/redact verdicts, streams SSE responses via sliding-window inspector, and batches evidence events to gRPC. VPC-native via Docker Compose. Vendor allowlisting. Basic JWT authentication. Fail-closed default.

**Addresses features:** T1 (prompt/response inspection), T3 (policy enforcement), T7 (vendor allowlisting), T11 (VPC deployment), D1 (inline prevention), D4 (policy-as-code via Wasm), D6 (sub-10ms latency), D3 (streaming inspection)

**Must avoid:** SSE buffering (Pitfall 1), Wasmtime Store-per-request (Pitfall 5), unbounded channels (Pitfall 2), HTTP/2 single connection (Pitfall 7), hardcoded policies, `unwrap()` in hot paths

**Needs research during planning:** SSE sliding-window token buffer implementation details, HTTP/2 custom connection pool design, Wasmtime pooling allocator configuration specifics

### Phase 2: Evidence Pipeline & Control Plane API

**Rationale:** Once the kernel produces evidence events, the Evidence Collector and Control Plane API can be built in parallel. ClickHouse schema must be designed correctly before any data lands (partition key, table separation). Cryptographic anchoring must be included from the start — adding it later is feasible but weakens prior evidence. SSO is required before expanding beyond the pilot.

**Delivers:** Evidence Collector service (hash chain, Merkle trees, Ed25519 signing, S3 WORM anchoring), ClickHouse integration with correct batch-insert pattern, Control Plane API (policy CRUD, Rego compilation, gRPC push to kernel fleet), PostgreSQL schema, OIDC/SAML SSO, RBAC, PII detection (Layer 2 NLP classifier via tract + ONNX), T4 audit trail with full identity attribution.

**Addresses features:** T2 (PII detection), T4 (audit trail), T5 (SSO/IdP), T6 (RBAC), T9 (regulatory framework mapping policy packs), T10 (prompt injection detection via NLP), T12 (SIEM webhooks), D2 (cryptographic audit trail), D7 (3-layer pipeline complete), D9 (department segmentation), D11 (fail-closed/fail-open toggle)

**Must avoid:** ClickHouse too-many-parts (Pitfall 3), self-verifying evidence chain (Pitfall 4), signing key accessible to kernel process, OIDC token validation gaps, gRPC stream not reconnecting with backoff

**Needs research during planning:** ClickHouse schema design (table separation, MergeTree partition keys), ONNX model selection and benchmarking (MiniLM-L6 vs DistilBERT-tiny for PII + injection detection), Regorus policy patterns for Interdict-specific rules, SAML-to-JWT boundary design

### Phase 3: Dashboard & Enterprise Hardening

**Rationale:** The dashboard is the interface that makes audit data actionable for compliance officers. It depends on Phase 2 data being available. Enterprise hardening (dual-anchor TSA, transparent TLS interception mode, K8s Helm chart, multi-tenant hardening) builds on a validated evidence pipeline. This phase makes the product saleable to enterprise accounts beyond the law firm pilot.

**Delivers:** Next.js + React 19 dashboard (policy builder UI, audit trail search, compliance reporting, evidence verification UI), PDF/CSV report export, visual policy builder generating Rego under the hood, K8s Helm chart for enterprise deployment, dual-anchor TSA integration for Merkle roots, full transparent TLS interception mode, D8 (evidence verification UI), T8 (compliance dashboard).

**Addresses features:** T8 (compliance dashboard), T9 (regulatory reporting), D8 (evidence verification UI), D5 (multi-turn session context)

**Must avoid:** Dashboard latency over 2 seconds (pre-aggregate in ClickHouse materialized views, target <500ms), policy builder requiring Rego knowledge from compliance officers, showing raw JSON to CISOs instead of human-readable compliance language, CA cert management gaps (expired certs break all proxied traffic)

**Standard patterns:** Next.js + shadcn/ui dashboard is well-documented. TanStack Query + TanStack Table for data-heavy views. This phase needs less exploratory research than Phases 1 and 2.

### Phase 4: Agentic AI & Advanced Enterprise Features

**Rationale:** The agentic AI governance market is forming in 2026-2027. Lasso just shipped an open-source MCP security gateway. Proofpoint acquired Acuvity. Singapore published agentic AI governance guidelines January 2026. Interdict's inline proxy architecture extends naturally to govern MCP tool-call traffic — agents cannot bypass an inline proxy. Shadow AI discovery and advanced SOAR integration are additive once the core is solid.

**Delivers:** MCP Gateway Governance (D10) — intercept and govern AI agent tool calls, enforce authorization policies on tool usage, log agent action audit trail. Shadow AI discovery (D12) — network-level detection of unapproved AI service usage. SOAR integration for automated incident response. Advanced anomaly detection on ClickHouse audit data.

**Addresses features:** D10 (agentic AI governance), D12 (shadow AI discovery)

**Needs research during planning:** MCP protocol specification and governance insertion points, shadow AI detection approaches (DNS analysis, CASB integration vs. pure proxy approach), SOAR integration patterns

### Phase Ordering Rationale

- The kernel must precede the control plane because there is nothing to configure until the enforcement engine exists and can receive policies
- Evidence pipeline and control plane API are Phase 2 together because policy CRUD requires the Rego-to-Wasm compilation pipeline (policy-compiler crate), and the Evidence Collector needs ClickHouse schema designed before any data lands
- SSO is Phase 2 not Phase 1 because the law firm pilot can use API key or basic JWT auth temporarily, but SSO is required before any larger enterprise engagement
- The dashboard is Phase 3 because it visualizes data from the evidence pipeline — building it before that data exists creates a demo-only shell with no real content
- Agentic governance is Phase 4 because the MCP protocol ecosystem is still stabilizing and Interdict needs a proven track record with standard AI chat traffic first

### Research Flags

Phases needing deeper research during planning:
- **Phase 1:** SSE sliding-window token buffer implementation (zero-copy ring buffer design), HTTP/2 custom connection pooling beyond hyper's built-in pool, Regorus performance benchmarking with Interdict-specific policy patterns, Wasmtime WIT Component Model adapter for OPA-compiled Wasm
- **Phase 2:** ClickHouse schema design (table separation strategy, MergeTree sort keys for audit query patterns), ONNX model selection and benchmarking for PII + injection detection, nice-grpc stability on Bun under sustained gRPC streaming load, SAML 2.0 handling boundary design (samael crate production readiness vs. Node.js SAML library)
- **Phase 4:** MCP protocol specification and where governance hooks should be inserted, shadow AI discovery network-level approaches

Phases with standard patterns (skip research-phase):
- **Phase 3 (Dashboard):** Next.js 16 + React 19 + shadcn/ui is well-documented, TanStack Query/Table patterns are standard, recharts/tremor for compliance charts are drop-in. May still benefit from ClickHouse materialized view design research.
- **Phase 2 (gRPC patterns):** Envoy xDS-style server streaming is a well-documented pattern. tonic bidirectional streaming with reconnection is documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core libraries verified against crates.io, npm, and official docs. Specific version pinning validated. The Regorus-over-OPA-sidecar decision has strong source backing (Microsoft official repo, benchmarks). Only medium-confidence items are nice-grpc on Bun stability and opentelemetry integration. |
| Features | MEDIUM-HIGH | Competitive analysis from direct competitor docs (CalypsoAI, Lasso, Purview) is HIGH confidence. Regulatory requirements (EU AI Act, GDPR, HIPAA) are HIGH confidence. Gartner AI TRiSM positioning is MEDIUM (paywall summary). Shadow AI 90% statistic is MEDIUM (vendor-cited). |
| Architecture | HIGH | Core patterns (data plane / control plane separation, xDS-style policy push, async evidence pipeline) are validated by production systems (Envoy, service mesh world, Trigger.dev post-mortem). Proto definitions and WIT interface design are sound. |
| Pitfalls | MEDIUM-HIGH | SSE buffering, ClickHouse too-many-parts, Wasmtime pooling are all backed by official docs and production incident reports. TLS interception pitfall backed by ACM peer-reviewed research. Unbounded channel claim (43% of issues) is LOW confidence (single unverified source) but the mitigation is correct regardless. |

**Overall confidence:** HIGH

### Gaps to Address

1. **Regorus performance under Interdict-specific policies:** Benchmarked at 4.6ms for OPA test suite. Need to validate that common Interdict patterns (vendor allowlists, PII regex, classification rules) hit the <2ms Layer 1 target. Address during Phase 1 kernel development with a dedicated benchmarking sprint.

2. **ONNX model selection for PII + injection detection:** tract with MiniLM-L6 vs. DistilBERT-tiny accuracy/latency tradeoff on this specific classification task needs empirical testing. Model pipeline (HuggingFace train -> ONNX export -> INT8 quantize -> tract load) needs validation. Address during Phase 2 planning.

3. **nice-grpc on Bun under sustained gRPC streaming load:** nice-grpc uses grpc-js designed for Node.js. Bun's Node compatibility is high but not 100%. Bidirectional gRPC streaming stability under production-like load needs a dedicated integration test. Address during Phase 2 development.

4. **samael crate production readiness:** Only Rust SAML library. Less mature than OIDC options. Recommend architectural decision: handle SAML at the Control Plane TypeScript boundary (where a Node.js SAML library is available as fallback), pass verified identity claims to the kernel via signed headers or mTLS. Address during Phase 2 planning before committing to implementation path.

5. **ClickHouse query patterns for audit trail:** The specific `ORDER BY` columns and materialized view design depend on how compliance officers will actually query audit data (by user, by violation type, by time range, by department). Cloudflare schema design patterns provide a starting point but Interdict-specific queries need to be identified during Phase 2 planning.

6. **Pilot deployment TLS mode:** For the law firm pilot (Docker Compose, 80 users), explicit proxy configuration with CA cert installation is the right approach. Transparent TLS interception (where the proxy intercepts without client configuration) is more complex and should be Phase 3. This needs to be clearly scoped in Phase 1 to avoid scope creep.

## Sources

### Primary (HIGH confidence)
- [crates.io/crates/tokio](https://crates.io/crates/tokio) — tokio 1.47.x LTS lifecycle, async runtime
- [crates.io/crates/hyper](https://crates.io/crates/hyper) — hyper 1.7.x stable API
- [crates.io/crates/tonic](https://crates.io/crates/tonic) — tonic 0.14.x gRPC
- [github.com/microsoft/regorus](https://github.com/microsoft/regorus) — Regorus 0.9.x, 10x OPA speed benchmark
- [crates.io/crates/rs_merkle](https://crates.rs/crates/rs_merkle) — rs_merkle 1.5.x Merkle trees
- [crates.io/crates/ed25519-dalek](https://crates.io/crates/ed25519-dalek) — ed25519-dalek 2.2.x signing
- [npmjs.com/package/elysia](https://www.npmjs.com/package/elysia) — Elysia 1.4.26
- [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16) — Next.js 16.1.x
- [clickhouse.com/blog/clickhouse-2025-roundup](https://clickhouse.com/blog/clickhouse-2025-roundup) — ClickHouse 25.8 LTS
- [postgresql.org releases](https://www.postgresql.org/about/news/) — PostgreSQL 17.x
- [wasmtime PoolingAllocationConfig docs](https://docs.wasmtime.dev/api/wasmtime/struct.PoolingAllocationConfig.html) — Wasmtime pooling allocator
- [clickhouse.com/docs/knowledgebase/exception-too-many-parts](https://clickhouse.com/docs/knowledgebase/exception-too-many-parts) — too-many-parts pitfall
- [trigger.dev/blog/clickhouse-too-many-parts-postmortem](https://trigger.dev/blog/clickhouse-too-many-parts-postmortem) — production incident, Dec 2025
- [github.com/hyperium/hyper/issues/3338](https://github.com/hyperium/hyper/issues/3338) — HTTP/2 single connection throttle
- [dl.acm.org/doi/fullHtml/10.1145/3372802](https://dl.acm.org/doi/fullHtml/10.1145/3372802) — TLS interception appliance security failures (peer-reviewed)
- [lasso.security/blog/blog-enterprise-ai-governance](https://www.lasso.security/blog/blog-enterprise-ai-governance) — competitive feature analysis
- [calypsoai.com/inference-platform](https://calypsoai.com/inference-platform/) — CalypsoAI competitor docs
- [learn.microsoft.com/en-us/purview/ai-microsoft-purview](https://learn.microsoft.com/en-us/purview/ai-microsoft-purview) — Microsoft Purview competitor docs
- [arxiv.org/abs/2511.17118](https://arxiv.org/abs/2511.17118) — Cryptographic Evidence Structures for Regulated AI (peer-reviewed)
- [artificialintelligenceact.eu/high-level-summary](https://artificialintelligenceact.eu/high-level-summary/) — EU AI Act official reference

### Secondary (MEDIUM confidence)
- [github.com/sonos/tract](https://github.com/sonos/tract) — Pure Rust ONNX runtime benchmarks
- [connectrpc.com](https://connectrpc.com/) — ConnectRPC Bun support gap
- [npmjs.com/package/nice-grpc](https://www.npmjs.com/package/nice-grpc) — TypeScript gRPC on grpc-js
- [github.com/rustls/rustls](https://github.com/rustls/rustls) — rustls 0.23.x TLS
- [opentelemetry.io/docs/languages/rust](https://opentelemetry.io/docs/languages/rust/) — OTel Rust 0.30.x
- [lasso.security/resources/lasso-releases-first-open-source-security-gateway-for-mcp](https://www.lasso.security/resources/lasso-releases-first-open-source-security-gateway-for-mcp) — agentic AI governance market signal
- [proofpoint.com acquires Acuvity](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-acquires-acuvity-deliver-ai-security-and-governance-across) — agentic AI market signal

### Tertiary (LOW confidence — verify during implementation)
- Tokio memory leak analysis (43% unbounded channel claim) — mitigation is correct regardless of statistic accuracy
- Rust Performance Working Group async task lifecycle analysis — directionally valid

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
