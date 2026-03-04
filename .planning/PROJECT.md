# Interdict.io

## What This Is

Interdict.io is a kernel-level AI governance and compliance platform for regulated enterprises. It sits as an intercepting infrastructure layer between a company's internal users and every AI tool they use (ChatGPT, Copilot, Anthropic, internal agents, etc.), enforcing configurable policies inline in real time, producing cryptographically signed tamper-proof audit trails, and mapping every AI action to regulatory frameworks (EU AI Act, GDPR, NIST AI RMF, etc.). It deploys inside the customer's own infrastructure (VPC-native) — data never leaves their perimeter.

A CISO can log in via SAML SSO, configure policies through a visual dashboard, review audit trails, generate compliance reports, and manage vendor approvals. IT can deploy the full stack via Docker Compose or Helm chart.

## Core Value

Every AI action an employee takes is routed through a policy-enforcing kernel — logged, signed, and regulatorily mapped — before it reaches any model. Inline prevention, not post-hoc reporting.

## Requirements

### Validated

**Data Plane (Rust Kernel) — v1.0**
- ✓ Rust-based transparent proxy intercepting all outbound AI traffic (HTTP/1.1, HTTP/2, SSE, gRPC, WebSockets) — v1.0
- ✓ Streaming response inspection via sliding window token buffer — v1.0
- ✓ Mid-stream connection severing with redaction replacement — v1.0
- ✓ Fail-Closed / Fail-Open toggle as per-policy configuration — v1.0
- ✓ Embedded Wasmtime runtime for policy modules — v1.0
- ✓ 3-layer policy pipeline: Wasm/Rego (<2ms) → NLP classifier (<10ms) → async human review — v1.0
- ✓ Hot-reload of Wasm policy modules without kernel restart — v1.0
- ✓ Session context tracking across multi-turn conversations — v1.0
- ✓ Asynchronous evidence bundle creation with background flush — v1.0
- ✓ gRPC channel from kernel to evidence collector — v1.0
- ✓ <10ms p99 latency overhead, >10k RPS per instance, <128MB RAM — v1.0
- ✓ Vendor allowlist enforcement — v1.0

**Cryptographic Audit Pipeline — v1.0**
- ✓ SHA-256 linked hash chains on all evidence bundles — v1.0
- ✓ Ed25519 digital signatures on every evidence bundle — v1.0
- ✓ Merkle tree construction for hourly root hash batches — v1.0
- ✓ External anchoring to S3 Object Lock (WORM) — v1.0

**Control Plane API — v1.0**
- ✓ Policy CRUD, Rego-to-Wasm compiler, vendor registry — v1.0
- ✓ gRPC push-based policy distribution with real-time hot-reload — v1.0
- ✓ 8 regulatory framework packs (EU AI Act, GDPR, NIST, PDPA, DPDP, China, Canada, GCC) — v1.0
- ✓ Audit trail query API with ClickHouse — v1.0

**Identity & Security — v1.1**
- ✓ SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD) — v1.1
- ✓ API key authentication for programmatic access — v1.1
- ✓ 5-role RBAC (Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor) — v1.1
- ✓ Department-scoped data access for Department Managers — v1.1
- ✓ mTLS between all internal components — v1.1
- ✓ Ed25519 signing key rotation without breaking prior verification — v1.1

**Dashboard — v1.1**
- ✓ Policy Builder UI (no Rego knowledge required) — v1.1
- ✓ Audit Trail with search/filter and server-side pagination — v1.1
- ✓ Real-time violation statistics with auto-refresh — v1.1
- ✓ Vendor Management with approve/block and model allowlists — v1.1
- ✓ Regulatory Framework Selector — v1.1
- ✓ PDF/CSV compliance report generation — v1.1
- ✓ Evidence Verification UI (hash chain, Ed25519 signature) — v1.1
- ✓ Human Review Queue with SLA timers — v1.1
- ✓ Department Policy Management with overrides — v1.1
- ✓ Anomaly Detection alerts — v1.1

**Deployment — v1.1**
- ✓ Container images for all services — v1.1
- ✓ Docker Compose one-command deployment — v1.1
- ✓ Kubernetes Helm chart with configurable values — v1.1
- ✓ Kernel sidecar deployment (KEP-753) — v1.1
- ✓ CA certificate trust scripts (macOS, Windows, Linux) — v1.1

### Active

(No requirements defined yet — use `/gsd:new-milestone` to start next milestone)

### Out of Scope

- **Building/fine-tuning LLMs** — governance infrastructure, not a model provider
- **eBPF-based syscall interception** — future capability, requires deep Linux kernel expertise
- **TEE / Hardware-backed secure enclaves** — high value but not needed for initial pilots
- **Zero-Knowledge Proofs** — proof generation too slow, regulators haven't asked for it
- **LLM-based inline policy enforcement** — explicitly prohibited; non-deterministic
- **Blockchain for auditability** — Merkle tree with S3 WORM achieves same guarantees at lower complexity
- **Shadow AI / network-level interception** — deferred; v1 works as opt-in proxy
- **Air-gapped deployment mode** — requires offline policy distribution; defer to hardening phase
- **OIDC authentication** — SAML covers both pilot targets; OIDC is fast-follow
- **SCIM user provisioning** — 80-user pilot = manual management acceptable
- **Custom dashboard widgets** — ship fixed layout first
- **Dark mode** — doubles CSS maintenance; one polished light theme
- **Kubernetes Operator** — Helm chart suffices for 2-pilot scope
- **Real-time WebSocket streaming dashboard** — polling with 30s refresh suffices

## Context

**v1.1 shipped 2026-03-04.** Full platform operational: Rust kernel + evidence pipeline + control plane API + Next.js dashboard + Docker Compose + Helm chart. ~61,000 LOC across Rust, TypeScript, and Helm. 16 phases, 52 plans across 2 milestones. 21/21 v1.1 requirements satisfied with 8 tech debt items tracked (none blocking).

**Pilot partners:** Boutique law firm (~80 employees, Docker Compose) and small private bank (Kubernetes/Helm) — both interested, discussions scheduled for March 2026.

**Architecture:** Strict Data Plane (Rust, hot path) / Control Plane (Bun/Elysia API + Next.js dashboard) separation. Zero cross-plane contamination through both milestones.

**Tech stack:** Rust (tokio, hyper, tonic, wasmtime, regorus), Bun + Elysia (API), Next.js + React (dashboard), PostgreSQL (config), ClickHouse (audit logs), protobuf/gRPC (internal comms).

## Constraints

- **Data Plane language**: Rust only
- **Latency budget**: <10ms p99 overhead in the kernel
- **Resource limits**: Kernel sidecar <128MB RAM steady state
- **No LLM in enforcement path**: deterministic methods only
- **VPC-native**: all data stays inside customer perimeter
- **Monorepo**: both planes in this repository

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for Data Plane | Memory safety, zero-copy I/O, sub-ms latency | ✓ Good — 20k+ LOC, <10ms p99 |
| Bun + Elysia for Control Plane API | TypeScript across full stack, Bun speed | ✓ Good — 13 modules operational |
| Next.js + React for dashboard | SSR-capable, enterprise ecosystem | ✓ Good — 10+ views shipped |
| Postgres + ClickHouse split | Config vs audit log performance | ✓ Good — clean separation |
| Wasmtime for policy execution | CNCF-backed, Rust-native, hot-reloadable | ✓ Good — pooling allocator + ArcSwap |
| Ed25519 for evidence signing | Fast, small signatures | ✓ Good — signing + rotation operational |
| Streaming-first inspection | No throwaway code | ✓ Good — zero rework |
| Docker Compose + Helm chart | Both deployment patterns for pilots | ✓ Good — both operational |
| 3-layer policy pipeline | Deterministic first, escalate edge cases | ✓ Good — L1+L2+L3 implemented |
| gRPC push for policy distribution | Real-time updates, no polling | ✓ Good — xDS-style streaming |
| BFF proxy pattern for dashboard | httpOnly cookie auth, no client-side tokens | ✓ Good — secure by default |
| SAML cross-origin callback redirect | Avoids cross-origin cookie loss | ✓ Good — Phase 14 fix |
| ECDSA P-256 for internal CA | Broader TLS library compatibility than Ed25519 | ✓ Good — mTLS operational |
| ArcSwap for signing key hot-reload | Lock-free atomic swaps, no restart needed | ✓ Good — 30s poll cycle |
| KEP-753 native sidecar pattern | Kubernetes-native lifecycle management | ✓ Good — initContainer with restartPolicy |

---
*Last updated: 2026-03-04 after v1.1 milestone completion*
