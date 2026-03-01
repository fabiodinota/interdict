# Interdict.io

## What This Is

Interdict.io is a kernel-level AI governance and compliance platform for regulated enterprises. It sits as an intercepting infrastructure layer between a company's internal users and every AI tool they use (ChatGPT, Copilot, Anthropic, internal agents, etc.), enforcing configurable policies inline in real time, producing cryptographically signed tamper-proof audit trails, and mapping every AI action to regulatory frameworks (EU AI Act, GDPR, NIST AI RMF, etc.). It deploys inside the customer's own infrastructure (VPC-native) — data never leaves their perimeter.

This is not a SaaS wrapper, monitoring dashboard, or chatbot platform. It is infrastructure — analogous to Check Point / Palo Alto for AI traffic, or IAM for AI actions and intent.

**Current state (v1.0 shipped):** Data plane kernel with streaming proxy, 3-layer policy engine, PII/financial/secrets detection with category-tagged redaction, cryptographic evidence pipeline (hash chains + Merkle trees + S3 WORM), and control plane API with policy CRUD, Rego-to-Wasm compiler, vendor registry, and 8 regulatory framework packs. gRPC push-based policy distribution with hot-reload is operational. Identity, dashboard, and deployment packaging are next.

## Core Value

Every AI action an employee takes is routed through a policy-enforcing kernel — logged, signed, and regulatorily mapped — before it reaches any model. Inline prevention, not post-hoc reporting.

## Requirements

### Validated

**Data Plane (Rust Kernel) — v1.0**
- ✓ Rust-based transparent proxy intercepting all outbound AI traffic (HTTP/1.1, HTTP/2, SSE, gRPC, WebSockets) — v1.0
- ✓ Streaming response inspection via sliding window token buffer (hold 5-10 tokens back for multi-token pattern detection) — v1.0
- ✓ Mid-stream connection severing with `[REDACTED BY INTERDICT POLICY]` replacement when violations detected — v1.0
- ✓ Fail-Closed / Fail-Open toggle as a per-policy configuration flag — v1.0
- ✓ Embedded Wasmtime runtime for loading and executing policy modules as `.wasm` binaries — v1.0
- ✓ 3-layer policy enforcement pipeline: Layer 1 (Wasm/Rego deterministic rules, <2ms) → Layer 2 (lightweight NLP classifier, <10ms) → Layer 3 (async human review queue for edge cases) — v1.0
- ✓ Hot-reload of Wasm policy modules without kernel restart (pushed from Control Plane) — v1.0
- ✓ Session context tracking across multi-turn conversations (not just single-message evaluation) — v1.0
- ✓ Asynchronous evidence bundle creation — binary log compressed and pushed to local memory buffer, background flush every 500ms — v1.0
- ✓ gRPC channel from kernel to audit pipeline / evidence collector service — v1.0
- ✓ Target performance: <10ms p99 latency overhead, >10,000 requests/second per kernel instance, <128MB RAM steady state — v1.0
- ✓ Vendor allowlist enforcement — kernel checks approved vendor registry before forwarding requests — v1.0
- ✓ Protocol decoding for all major AI communication protocols — v1.0

**Cryptographic Audit Pipeline — v1.0**
- ✓ SHA-256 linked hash chain on all evidence bundles (each bundle includes previous bundle hash) — v1.0
- ✓ Ed25519 digital signatures on every evidence bundle (kernel signs with private key) — v1.0
- ✓ Merkle tree construction for hourly root hash batches — v1.0
- ✓ External anchoring to S3 Object Lock (WORM) or equivalent immutable storage — v1.0
- ✓ Evidence Collector service receives compressed log events via gRPC stream, computes hashes, builds Merkle tree — v1.0
- ✓ Evidence bundle structure capturing: actor identity, AI vendor/model, prompt hash (not plaintext), policy evaluation result, response hash, chain linkage, signature — v1.0

**Control Plane API — v1.0**
- ✓ Policy authoring and management API (CRUD for policies, compile to Wasm) — v1.0
- ✓ Policy compiler: human-readable rules (Rego/YAML) → compiled Wasm modules — v1.0
- ✓ Policy distribution to kernel fleet via gRPC push (not polling) — v1.0
- ✓ Vendor registry API — approved/blocked AI vendors and model versions per enterprise — v1.0
- ✓ Regulatory framework mapping engine — jurisdiction selection auto-enables corresponding policy configurations — v1.0
- ✓ Pre-built regulatory mappings for EU AI Act, GDPR, NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, GCC frameworks — v1.0
- ✓ Audit trail query API — searchable execution history with policy decisions — v1.0
- ✓ ClickHouse integration for high-volume log analytics and search — v1.0
- ✓ PostgreSQL for config, metadata, user management, policy storage — v1.0

### Active

**Identity & Security**
- [ ] SAML 2.0 integration for enterprise IdPs (Okta, Azure AD)
- [ ] RBAC with roles: Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor
- [ ] Master key management for cryptographic signing key rotation
- [ ] mTLS between all internal components (kernel ↔ control plane, kernel ↔ audit collector)
- [ ] API key auth fallback for pilot deployments

**Dashboard (Next.js + React)**
- [ ] Policy Builder UI — CISO/compliance officer can create, edit, enable/disable policies
- [ ] Regulatory framework selector — pick jurisdiction, see corresponding technical configurations
- [ ] Audit trail dashboard — searchable, filterable view of all AI interactions and policy decisions
- [ ] Vendor management UI — approve/block AI vendors, set model version allowlists
- [ ] Real-time policy violation alerts and statistics
- [ ] Compliance reporting — automated reports for regulators, legal teams, risk departments
- [ ] Department-level policy management — different rules per team/department
- [ ] Anomaly detection views — volume anomalies, time-based anomalies, unusual patterns
- [ ] Evidence bundle verification UI — verify chain integrity, view Merkle proofs
- [ ] Human review queue UI for Layer 3 escalations

**Deployment & Infrastructure**
- [ ] Docker Compose stack for simpler/smaller deployments (law firm pilot ~80 employees)
- [ ] Kubernetes Helm chart for enterprise K8s deployments
- [ ] Kubernetes sidecar YAML manifest — kernel runs as sidecar container in same pod
- [ ] Container images published to registry (kernel, control plane API, dashboard, evidence collector)
- [ ] CA cert onboarding script for explicit proxy mode

### Out of Scope

- **Building/fine-tuning LLMs** — Interdict.io is governance infrastructure, not a model provider; stays model-agnostic
- **eBPF-based syscall interception** — Phase 3+ capability; requires deep Linux kernel expertise and testing matrices across kernel versions
- **TEE / Hardware-backed secure enclaves** — Phase 2-3; high value but not needed for initial pilot deployments
- **Zero-Knowledge Proofs** — Phase 5+ if ever; proof generation too slow, circuit design is PhD-level, regulators haven't asked for it
- **LLM-based inline policy enforcement** — explicitly prohibited; too slow, expensive, non-deterministic; LLMs only for async edge case review
- **Blockchain for auditability** — private Merkle tree with S3 Object Lock achieves identical guarantees at vastly lower complexity
- **Shadow AI / network-level interception** — important but deferred; v1 works as opt-in proxy, network-level interception comes later
- **Air-gapped deployment mode** — requires offline policy distribution; defer to enterprise hardening phase
- **Multi-instance kernel state synchronization / HA** — defer to enterprise hardening
- **Interdict.io Transcription / Note-taking products** — future ecosystem expansion, not core kernel
- **Mobile app** — web-first
- **Custom binary protocols** — gRPC is the industry standard

## Context

**v1.0 shipped 2026-03-01.** Data plane (Rust kernel + evidence collector) and control plane API (Bun + Elysia) operational. 20,838 LOC Rust, 314 files, 144 commits across 7 phases. 49/49 v1.0 requirements satisfied. 18 tech debt items tracked (none blocking).

**Market timing:** EU AI Act enforcement is imminent. Regulated enterprises (banks, law firms, hospitals) need to demonstrate compliance. There is no established "AI governance kernel" category yet — Interdict.io aims to define and own it.

**Competitive landscape:** Microsoft Purview (vendor-locked, post-hoc), Lasso Security (post-hoc), CalypsoAI (SaaS dashboard). None offer inline prevention + VPC-native deployment + cryptographic evidence chain. Interdict.io's differentiation is: inline (not post-hoc), model-agnostic (not vendor-locked), infrastructure (not dashboard), VPC-native (not SaaS cloud).

**Pilot partners:** Boutique law firm (~80 employees) and small private bank — both interested, discussions scheduled for March 2026. These are ideal first customers: regulated, compliance-motivated, small enough to iterate with, large enough to be credible references.

**Architecture principle:** Strict separation of Data Plane (Rust, fast, stateless, hot path) and Control Plane (Bun/Elysia + Next.js, smart, stateful, admin). Mixing the two is the #1 architectural mistake that would kill performance at scale. v1.0 validated this — zero cross-plane contamination.

**Tech stack (confirmed):** Rust (tokio, hyper, tonic, wasmtime, regorus), Bun + Elysia (API), PostgreSQL (config), ClickHouse (audit logs), protobuf/gRPC (internal comms).

**Target users:**
- CISOs and compliance officers (policy authoring, regulatory mapping, audit review)
- IT/DevOps teams (deployment, kernel fleet management)
- Department managers (team-level audit visibility)
- External auditors/regulators (read-only evidence verification)
- End-user employees are **invisible** — they never interact with Interdict.io directly

## Constraints

- **Data Plane language**: Rust only — Python's GIL prevents true concurrency, which is catastrophic for a proxy handling thousands of simultaneous streaming connections. Go is acceptable fallback but Rust is strongly preferred for memory safety without GC pauses.
- **Control Plane stack**: Bun + Elysia (API) + Next.js + React (dashboard) + PostgreSQL (config/metadata) + ClickHouse (log analytics)
- **Latency budget**: <10ms p99 overhead in the kernel (target <5ms). Audit pipeline must be fully asynchronous — zero impact on AI response latency.
- **Resource limits**: Kernel sidecar must stay under 128MB RAM steady state, <100m CPU idle, <500m burst. DevOps teams will uninstall governance tools that consume excessive resources.
- **No LLM in enforcement path**: 99% of policy enforcement through fast deterministic methods. LLMs only as async fallback for the most ambiguous edge cases.
- **VPC-native**: All data stays inside customer perimeter. No "phone home" to Interdict.io servers. No external dependencies post-deploy.
- **Monorepo**: Both Data Plane and Control Plane live in this repository.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for Data Plane | Memory safety, zero-copy I/O, no GIL, sub-ms latency, async/await for streaming | ✓ Good — 20k+ LOC Rust, <10ms p99 overhead achieved |
| Bun + Elysia for Control Plane API | TypeScript across full Control Plane stack (shared with Next.js frontend), Bun's speed advantage | ✓ Good — API operational with all CRUD, compiler, distribution |
| Next.js + React for dashboard | SSR-capable, most popular for enterprise dashboards, strong ecosystem | — Pending (Phase 8) |
| Postgres + ClickHouse split | Postgres for config/users (appropriate), ClickHouse for high-volume audit logs (10k+ events/sec query performance) | ✓ Good — clean separation, batch enrichment bridges the two |
| Wasmtime for policy execution | CNCF-backed, Rust-native, near-native speed, sandboxed, hot-reloadable | ✓ Good — pooling allocator works, hot-reload via ArcSwap |
| Regorus over OPA | 10x faster (4.6ms vs 45ms), embedded Rust library (no sidecar latency), full Rego compatibility | ✓ Good — embedded Rego evaluation, OPA CLI for Wasm compilation |
| Ed25519 for evidence signing | Fast, small signatures, battle-tested via libsodium | ✓ Good — signing and verification operational |
| Streaming-first inspection | Skip non-streaming code entirely; sliding window buffer from day one since non-streaming would be throwaway | ✓ Good — zero throwaway code, every line production-relevant |
| Docker Compose + Helm chart | Both deployment patterns needed — Compose for small pilots, Helm for K8s enterprises | — Pending (Phase 10) |
| 3-layer policy pipeline | Wasm/Rego (<2ms) → NLP classifier (<10ms) → async human review. Covers 95%+ deterministically, escalates the rest | ✓ Good — L1+L2+L3 implemented, L2 feature extraction needs real ONNX model |
| gRPC push for policy distribution | Kernels should not poll; push-based ensures real-time policy updates across fleet | ✓ Good — xDS-style server-streaming with snapshot+delta |
| Monorepo structure | Both planes in one repo — simpler CI/CD, shared types/protos, atomic cross-plane changes | ✓ Good — shared proto definitions, workspace-level builds |

---
*Last updated: 2026-03-01 after v1.0 milestone*
