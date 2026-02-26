# Interdict.io

## What This Is

Interdict.io is a kernel-level AI governance and compliance platform for regulated enterprises. It sits as an intercepting infrastructure layer between a company's internal users and every AI tool they use (ChatGPT, Copilot, Anthropic, internal agents, etc.), enforcing configurable policies inline in real time, producing cryptographically signed tamper-proof audit trails, and mapping every AI action to regulatory frameworks (EU AI Act, GDPR, NIST AI RMF, etc.). It deploys inside the customer's own infrastructure (VPC-native) — data never leaves their perimeter.

This is not a SaaS wrapper, monitoring dashboard, or chatbot platform. It is infrastructure — analogous to Check Point / Palo Alto for AI traffic, or IAM for AI actions and intent.

## Core Value

Every AI action an employee takes is routed through a policy-enforcing kernel — logged, signed, and regulatorily mapped — before it reaches any model. Inline prevention, not post-hoc reporting.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Data Plane (Rust Kernel)**
- [ ] Rust-based transparent proxy intercepting all outbound AI traffic (HTTP/1.1, HTTP/2, SSE, gRPC, WebSockets)
- [ ] Streaming response inspection via sliding window token buffer (hold 5-10 tokens back for multi-token pattern detection)
- [ ] Mid-stream connection severing with `[REDACTED BY INTERDICT POLICY]` replacement when violations detected
- [ ] Fail-Closed / Fail-Open toggle as a per-policy configuration flag
- [ ] Embedded Wasmtime runtime for loading and executing policy modules as `.wasm` binaries
- [ ] 3-layer policy enforcement pipeline: Layer 1 (Wasm/Rego deterministic rules, <2ms) → Layer 2 (lightweight NLP classifier, <10ms) → Layer 3 (async human review queue for edge cases)
- [ ] Hot-reload of Wasm policy modules without kernel restart (pushed from Control Plane)
- [ ] Session context tracking across multi-turn conversations (not just single-message evaluation)
- [ ] Asynchronous evidence bundle creation — binary log compressed and pushed to local memory buffer, background flush every 500ms
- [ ] gRPC channel from kernel to audit pipeline / evidence collector service
- [ ] Target performance: <10ms p99 latency overhead, >10,000 requests/second per kernel instance, <128MB RAM steady state
- [ ] Vendor allowlist enforcement — kernel checks approved vendor registry before forwarding requests
- [ ] Protocol decoding for all major AI communication protocols

**Cryptographic Audit Pipeline**
- [ ] SHA-256 linked hash chain on all evidence bundles (each bundle includes previous bundle hash)
- [ ] Ed25519 digital signatures on every evidence bundle (kernel signs with private key)
- [ ] Merkle tree construction for hourly root hash batches
- [ ] External anchoring to S3 Object Lock (WORM) or equivalent immutable storage
- [ ] Evidence Collector service receives compressed log events via gRPC stream, computes hashes, builds Merkle tree
- [ ] Evidence bundle structure capturing: actor identity, AI vendor/model, prompt hash (not plaintext), policy evaluation result, response hash, chain linkage, signature

**Control Plane API (Bun + Elysia)**
- [ ] Policy authoring and management API (CRUD for policies, compile to Wasm)
- [ ] Policy compiler: human-readable rules (Rego/YAML) → compiled Wasm modules
- [ ] Policy distribution to kernel fleet via gRPC push (not polling)
- [ ] Vendor registry API — approved/blocked AI vendors and model versions per enterprise
- [ ] Regulatory framework mapping engine — jurisdiction selection auto-enables corresponding policy configurations
- [ ] Pre-built regulatory mappings for EU AI Act, GDPR, NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, GCC frameworks
- [ ] Audit trail query API — searchable execution history with policy decisions
- [ ] Master key management for cryptographic signing key rotation
- [ ] RBAC with roles: Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor
- [ ] ClickHouse integration for high-volume log analytics and search
- [ ] PostgreSQL for config, metadata, user management, policy storage

**Control Plane Dashboard (Next.js + React)**
- [ ] Policy Builder UI — CISO/compliance officer can create, edit, enable/disable policies
- [ ] Regulatory framework selector — pick jurisdiction, see corresponding technical configurations
- [ ] Audit trail dashboard — searchable, filterable view of all AI interactions and policy decisions
- [ ] Vendor management UI — approve/block AI vendors, set model version allowlists
- [ ] Real-time policy violation alerts and statistics
- [ ] Compliance reporting — automated reports for regulators, legal teams, risk departments
- [ ] Department-level policy management — different rules per team/department
- [ ] Anomaly detection views — volume anomalies, time-based anomalies, unusual patterns
- [ ] Evidence bundle verification UI — verify chain integrity, view Merkle proofs

**Deployment & Infrastructure**
- [ ] Docker Compose stack for simpler/smaller deployments (law firm pilot ~80 employees)
- [ ] Kubernetes Helm chart for enterprise K8s deployments
- [ ] Kubernetes sidecar YAML manifest — kernel runs as sidecar container in same pod
- [ ] Container images published to registry (kernel, control plane API, dashboard, evidence collector)
- [ ] gRPC + HTTP/2 for all internal service communication

**Identity & Access**
- [ ] OIDC integration (Okta, Azure AD, Google Workspace) — read identity from enterprise SSO session
- [ ] SAML 2.0 support for legacy enterprise IdPs
- [ ] mTLS between all internal components (kernel ↔ control plane, kernel ↔ audit collector)
- [ ] Every AI action tied to verified corporate identity from JWT/SAML assertion
- [ ] Zero-Trust: verify every request regardless of source IP, short-lived tokens

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

**Market timing:** EU AI Act enforcement is imminent. Regulated enterprises (banks, law firms, hospitals) need to demonstrate compliance. There is no established "AI governance kernel" category yet — Interdict.io aims to define and own it.

**Competitive landscape:** Microsoft Purview (vendor-locked, post-hoc), Lasso Security (post-hoc), CalypsoAI (SaaS dashboard). None offer inline prevention + VPC-native deployment + cryptographic evidence chain. Interdict.io's differentiation is: inline (not post-hoc), model-agnostic (not vendor-locked), infrastructure (not dashboard), VPC-native (not SaaS cloud).

**Pilot partners:** Boutique law firm (~80 employees) and small private bank — both interested, discussions scheduled for March 2026. These are ideal first customers: regulated, compliance-motivated, small enough to iterate with, large enough to be credible references.

**Architecture principle:** Strict separation of Data Plane (Rust, fast, stateless, hot path) and Control Plane (Bun/Elysia + Next.js, smart, stateful, admin). Mixing the two is the #1 architectural mistake that would kill performance at scale.

**Existing prototype:** A working FastAPI + PostgreSQL prototype exists (separate from this repo) with basic execution tracking, vendor management, regulatory mappings for 7 jurisdictions, policy modules, and audit trails. We are rebuilding from scratch with production architecture.

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
- **VPC-native**: All data stays inside customer perimeter. No "phone home" to Interdict.io servers.
- **Monorepo**: Both Data Plane and Control Plane live in this repository.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for Data Plane | Memory safety, zero-copy I/O, no GIL, sub-ms latency, async/await for streaming | — Pending |
| Bun + Elysia for Control Plane API | TypeScript across full Control Plane stack (shared with Next.js frontend), Bun's speed advantage | — Pending |
| Next.js + React for dashboard | SSR-capable, most popular for enterprise dashboards, strong ecosystem | — Pending |
| Postgres + ClickHouse split | Postgres for config/users (appropriate), ClickHouse for high-volume audit logs (10k+ events/sec query performance) | — Pending |
| Wasmtime for policy execution | CNCF-backed, Rust-native, near-native speed, sandboxed, hot-reloadable | — Pending |
| Ed25519 for evidence signing | Fast, small signatures, battle-tested via libsodium | — Pending |
| Streaming-first inspection | Skip non-streaming code entirely; sliding window buffer from day one since non-streaming would be throwaway | — Pending |
| Docker Compose + Helm chart | Both deployment patterns needed — Compose for small pilots, Helm for K8s enterprises | — Pending |
| 3-layer policy pipeline | Wasm/Rego (<2ms) → NLP classifier (<10ms) → async human review. Covers 95%+ deterministically, escalates the rest | — Pending |
| gRPC push for policy distribution | Kernels should not poll; push-based ensures real-time policy updates across fleet | — Pending |
| Monorepo structure | Both planes in one repo — simpler CI/CD, shared types/protos, atomic cross-plane changes | — Pending |

---
*Last updated: 2026-02-26 after initialization*
