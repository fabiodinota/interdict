# Requirements: Interdict.io

**Defined:** 2026-02-26
**Core Value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model

## Pilot Requirements (Law Firm ~80 Users, March 2026)

- [ ] **PILOT-01**: Docker Compose one-command deploy with sample policies (EU AI Act pack pre-loaded)
- [ ] **PILOT-02**: API key auth fallback if SAML integration not yet production-ready
- [ ] **PILOT-03**: Basic dashboard with audit export (CSV/PDF) for compliance review
- [ ] **PILOT-04**: Onboarding script for CA cert installation on client machines (explicit proxy mode)

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Kernel / Data Plane

- [x] **KERN-01**: Rust transparent proxy intercepts all outbound AI traffic over HTTP/1.1 and HTTP/2
- [x] **KERN-02**: Proxy decodes and handles Server-Sent Events (SSE) streaming responses from AI vendors
- [x] **KERN-03**: Proxy decodes and handles gRPC streaming for enterprise AI services
- [x] **KERN-04**: Proxy decodes and handles WebSocket connections for real-time AI applications
- [x] **KERN-05**: Sliding window token buffer holds 5-10 tokens back for multi-token pattern detection in streaming responses
- [x] **KERN-06**: Kernel can sever a streaming connection mid-response and replace content with `[REDACTED BY INTERDICT POLICY: {RULE_NAME}]`
- [x] **KERN-07**: Kernel achieves <10ms p99 latency overhead (target <5ms) on proxied AI requests
- [x] **KERN-08**: Kernel handles >10,000 requests/second per instance under sustained load
- [x] **KERN-09**: Kernel steady-state RAM usage stays under 128MB with <100m CPU idle, <500m burst
- [ ] **KERN-10**: Kernel maintains session context across multi-turn conversations per user/session, detecting policy violations that emerge across multiple exchanges
- [x] **KERN-11**: Kernel checks vendor allowlist before forwarding any outbound AI request, blocking non-approved vendors
- [x] **KERN-12**: Kernel manages multiple HTTP/2 connections per AI vendor backend to avoid single-connection stream saturation
- [x] **KERN-13**: Kernel uses bounded tokio channels (no unbounded channels) with explicit capacity limits on all internal communication
- [x] **KERN-14**: Evidence bundle creation is fully asynchronous -- binary logs compressed and pushed to local memory buffer, background flush every 500ms via gRPC to Evidence Collector

### PII & Sensitive Data

- [x] **PII-01**: Kernel detects and redacts personally identifiable information (names, emails, phone numbers, addresses, SSNs) in AI prompts before they reach the vendor
- [x] **PII-02**: Kernel detects and redacts financial data (credit card numbers, bank accounts, SWIFT codes, deal values) in AI prompts
- [x] **PII-03**: Kernel detects and redacts secrets and credentials (AWS keys, API tokens, private keys) in AI prompts
- [x] **PII-04**: Kernel detects and redacts PII/sensitive data in streaming AI responses using the sliding window buffer
- [x] **PII-05**: Kernel supports custom pattern definitions per enterprise (client names, matter numbers, case codes, ISIN numbers) loaded from policy configuration
- [x] **PII-06**: Redaction replaces detected content with category-tagged placeholders (e.g., `[PII:NAME]`, `[FINANCIAL:CARD]`) rather than blocking the entire request

### Policy Engine

- [x] **PLCY-01**: Kernel embeds Wasmtime runtime with pooling allocator and pre-warmed worker pool for policy module execution
- [x] **PLCY-02**: Policy modules are compiled Wasm binaries loaded and executed in sandboxed isolation (<2ms per evaluation)
- [x] **PLCY-03**: Layer 1 deterministic rules use Regorus (Rust-native Rego interpreter) for policy evaluation without external OPA dependency
- [x] **PLCY-04**: Layer 2 lightweight NLP classifier (quantized ONNX model via tract) handles intent classification and ambiguous cases (<10ms)
- [ ] **PLCY-05**: Layer 3 async human review queue routes genuinely ambiguous high-stakes decisions to compliance officers with configurable SLA
- [ ] **PLCY-06**: Policy modules can be hot-reloaded at runtime without restarting the kernel binary
- [x] **PLCY-07**: Policies support three enforcement actions: block (reject request), allow (pass through), redact (modify and pass)
- [ ] **PLCY-08**: Policies are configurable per department, per user, and per AI vendor
- [x] **PLCY-09**: Fail-closed / fail-open is a per-policy configuration flag controlling behavior when the kernel encounters errors
- [ ] **PLCY-10**: Department-level policy segmentation with inheritance model: organization defaults -> department overrides -> team overrides
- [x] **PLCY-11**: Prompt injection and jailbreak detection via Layer 2 NLP classifier identifies direct/indirect injection attacks and prompt leaking attempts

### Cryptographic Audit Pipeline

- [x] **EVID-01**: Evidence Collector service receives compressed log events from kernels via gRPC streaming
- [x] **EVID-02**: Every evidence bundle includes SHA-256 hash incorporating the previous bundle's hash (linked chain)
- [x] **EVID-03**: Every evidence bundle is digitally signed with Ed25519 using a kernel-specific private key
- [x] **EVID-04**: Evidence bundles are structured into Merkle trees with hourly root hash computation
- [x] **EVID-05**: Hourly Merkle root hashes are anchored to S3 Object Lock (WORM) for external immutability verification
- [x] **EVID-06**: Evidence bundle captures: actor identity (from SSO), AI vendor/model, prompt hash (not plaintext), prompt classification, policy evaluation result with rules applied, response hash, token count, enforcement latency, chain linkage, and digital signature. Full prompt/response text storage is configurable per enterprise (some regulations require it, others prohibit it)
- [x] **EVID-07**: Evidence Collector batches inserts to ClickHouse (minimum 1000 rows per insert, maximum 1 INSERT/second) to prevent "too many parts" failures
- [x] **EVID-08**: Evidence Collector is a separate Rust binary service (not TypeScript) for CPU-intensive cryptographic operations
- [x] **EVID-09**: Signing private keys are stored in HSM/KMS (AWS KMS or Azure Key Vault), never in environment variables or config files
- [x] **EVID-10**: Open-source regulator verification script that any auditor can run independently to verify chain integrity, signatures, and Merkle root anchoring

### Control Plane API

- [ ] **CTRL-01**: Policy CRUD API -- create, read, update, delete policies with Rego/YAML source
- [ ] **CTRL-02**: Policy compiler transforms human-readable Rego/YAML rules into compiled Wasm modules
- [ ] **CTRL-03**: Policy distribution pushes compiled Wasm modules to kernel fleet via gRPC server-streaming (Envoy xDS-style pattern, not polling)
- [ ] **CTRL-04**: Vendor registry API -- CRUD for approved/blocked AI vendors with per-vendor model version allowlists
- [ ] **CTRL-05**: Regulatory framework mapping engine -- selecting a jurisdiction auto-enables corresponding policy configurations
- [ ] **CTRL-06**: Pre-built regulatory policy packs for EU AI Act, GDPR, NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, GCC frameworks
- [x] **CTRL-07**: Audit trail query API -- searchable, filterable execution history by user, department, vendor, policy decision, time range, violation type
- [ ] **CTRL-08**: Master key management API for cryptographic signing key rotation across kernel fleet
- [ ] **CTRL-09**: RBAC with five roles: Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor
- [x] **CTRL-10**: PostgreSQL for configuration, policies (Rego source + compiled Wasm blobs), users, RBAC, vendor registry, regulatory mappings
- [x] **CTRL-11**: ClickHouse for high-volume audit log analytics, anomaly detection queries, and compliance reporting data
- [ ] **CTRL-12**: SAML 2.0 integration for enterprise IdPs (Okta, Azure AD) -- verify SAML assertions at API boundary, pass verified identity claims downstream

### Dashboard

- [ ] **DASH-01**: Policy Builder UI -- compliance officers can create, edit, enable/disable policies without writing Rego directly
- [ ] **DASH-02**: Regulatory framework selector -- pick jurisdiction, see corresponding technical configurations enabled, toggle individual policy mappings
- [ ] **DASH-03**: Audit trail view -- searchable, filterable view of all AI interactions with policy decisions, identity attribution, and evidence bundle references
- [ ] **DASH-04**: Vendor management UI -- approve/block AI vendors, set model version allowlists, view vendor risk status
- [ ] **DASH-05**: Real-time policy violation statistics -- violations by type, department, vendor, time period with trend analysis
- [ ] **DASH-06**: Compliance reporting -- automated PDF/CSV reports for regulators, legal teams, risk departments
- [ ] **DASH-07**: Department-level policy management -- configure per-department overrides with visual inheritance display
- [ ] **DASH-08**: Evidence bundle verification UI -- verify hash chain integrity, check Ed25519 signatures, view Merkle tree structure, verify S3 anchor hashes
- [ ] **DASH-09**: Human review queue UI -- compliance officers review Layer 3 escalations, approve/reject with reasoning that feeds back into policy refinement
- [ ] **DASH-10**: Anomaly detection views -- volume anomalies (unusual request counts), time-based anomalies (off-hours access), pattern anomalies (unusual AI usage)

### Infrastructure & Deployment

- [ ] **INFR-01**: Docker Compose stack for single-machine deployment (law firm pilot, ~80 employees)
- [ ] **INFR-02**: Kubernetes Helm chart for enterprise K8s deployments with configurable resource limits
- [ ] **INFR-03**: Kernel runs as K8s sidecar container in same pod as company's AI application, intercepting outbound traffic on configurable port
- [ ] **INFR-04**: Container images for all services (kernel, evidence collector, control plane API, dashboard) published to container registry
- [ ] **INFR-05**: mTLS between all internal components -- kernel to control plane, kernel to evidence collector, API to PostgreSQL, API to ClickHouse
- [ ] **INFR-06**: TLS termination for AI vendor connections with deployment-unique CA keypair generation (never ship pre-generated keys)
- [ ] **INFR-07**: All data stays inside customer network perimeter -- no phone-home telemetry, no external dependencies after initial deployment

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Identity & Integration

- **IDENT-01**: OIDC integration (Okta, Azure AD, Google Workspace) -- read identity from enterprise SSO JWT tokens
- **INTG-01**: SIEM integration via webhook/syslog output to Splunk, Sentinel, QRadar
- **INTG-02**: SOAR integration for automated incident response workflows

### Advanced Capabilities

- **ADV-01**: Agentic AI / MCP Gateway governance -- intercept and govern AI agent tool calls
- **ADV-02**: Shadow AI discovery via network-level detection of unapproved AI services
- **ADV-03**: Transparent TLS interception mode (vs. explicit proxy configuration in v1)
- **ADV-04**: Air-gapped deployment mode -- fully functional without internet after initial setup
- **ADV-05**: Multi-instance kernel state synchronization for high availability
- **ADV-06**: TEE integration -- evidence signing inside AWS Nitro Enclaves
- **ADV-07**: eBPF-based syscall interception for agent container sandboxing

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Building/fine-tuning LLMs | Interdict is governance infrastructure, not a model provider; stays model-agnostic |
| LLM-powered inline policy enforcement | Too slow (100ms+), non-deterministic, expensive; LLMs only for async Layer 3 review |
| Blockchain-based audit trail | Merkle tree + S3 Object Lock achieves identical guarantees at vastly lower complexity |
| SaaS-only deployment | Hard procurement blocker for regulated verticals; VPC-native is non-negotiable |
| Chat interface / AI assistant | Interdict is invisible infrastructure; employees never interact with it directly |
| General-purpose API gateway | Dilutes AI governance positioning; competes with Kong/Envoy/NGINX |
| AI ethics / bias detection | Different market segment (Credo AI, Arthur AI); may integrate but won't become one |
| Mobile app | Enterprise governance administered from desktops; web-first dashboard sufficient |
| Custom LLM marketplace | Makes Interdict a vendor, not infrastructure; creates conflicts with AI providers |
| Zero-Knowledge Proofs | Proof generation catastrophically slow; regulators haven't asked for it; Merkle chain sufficient |
| Per-seat SaaS pricing model | Penalizes adoption, encourages shadow AI; price per kernel/throughput instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PILOT-01 | Phase 10 | Pending |
| PILOT-02 | Phase 7 | Pending |
| PILOT-03 | Phase 10 | Pending |
| PILOT-04 | Phase 10 | Pending |
| KERN-01 | Phase 1 | Complete |
| KERN-02 | Phase 1 | Complete |
| KERN-03 | Phase 1 | Complete |
| KERN-04 | Phase 1 | Complete |
| KERN-05 | Phase 3 | Complete |
| KERN-06 | Phase 3 | Complete |
| KERN-07 | Phase 1 | Complete |
| KERN-08 | Phase 1 | Complete |
| KERN-09 | Phase 1 | Complete |
| KERN-10 | Phase 6 | Pending |
| KERN-11 | Phase 2 | Complete |
| KERN-12 | Phase 1 | Complete |
| KERN-13 | Phase 1 | Complete |
| KERN-14 | Phase 4 | Complete |
| PII-01 | Phase 3 | Complete |
| PII-02 | Phase 3 | Complete |
| PII-03 | Phase 3 | Complete |
| PII-04 | Phase 3 | Complete |
| PII-05 | Phase 3 | Complete |
| PII-06 | Phase 3 | Complete |
| PLCY-01 | Phase 2 | Complete |
| PLCY-02 | Phase 2 | Complete |
| PLCY-03 | Phase 2 | Complete |
| PLCY-04 | Phase 2 | Complete |
| PLCY-05 | Phase 9 | Pending |
| PLCY-06 | Phase 6 | Pending |
| PLCY-07 | Phase 2 | Complete |
| PLCY-08 | Phase 6 | Pending |
| PLCY-09 | Phase 2 | Complete |
| PLCY-10 | Phase 6 | Pending |
| PLCY-11 | Phase 3 | Complete |
| EVID-01 | Phase 4 | Complete |
| EVID-02 | Phase 4 | Complete |
| EVID-03 | Phase 4 | Complete |
| EVID-04 | Phase 4 | Complete |
| EVID-05 | Phase 4 | Complete |
| EVID-06 | Phase 4 | Complete |
| EVID-07 | Phase 4 | Complete |
| EVID-08 | Phase 4 | Complete |
| EVID-09 | Phase 4 | Complete |
| EVID-10 | Phase 4 | Complete |
| CTRL-01 | Phase 5 | Pending |
| CTRL-02 | Phase 5 | Pending |
| CTRL-03 | Phase 6 | Pending |
| CTRL-04 | Phase 5 | Pending |
| CTRL-05 | Phase 5 | Pending |
| CTRL-06 | Phase 5 | Pending |
| CTRL-07 | Phase 5 | Complete |
| CTRL-08 | Phase 7 | Pending |
| CTRL-09 | Phase 7 | Pending |
| CTRL-10 | Phase 5 | Complete |
| CTRL-11 | Phase 5 | Complete |
| CTRL-12 | Phase 7 | Pending |
| DASH-01 | Phase 8 | Pending |
| DASH-02 | Phase 8 | Pending |
| DASH-03 | Phase 8 | Pending |
| DASH-04 | Phase 8 | Pending |
| DASH-05 | Phase 8 | Pending |
| DASH-06 | Phase 9 | Pending |
| DASH-07 | Phase 9 | Pending |
| DASH-08 | Phase 9 | Pending |
| DASH-09 | Phase 9 | Pending |
| DASH-10 | Phase 9 | Pending |
| INFR-01 | Phase 10 | Pending |
| INFR-02 | Phase 10 | Pending |
| INFR-03 | Phase 10 | Pending |
| INFR-04 | Phase 10 | Pending |
| INFR-05 | Phase 7 | Pending |
| INFR-06 | Phase 7 | Pending |
| INFR-07 | Phase 10 | Pending |

**Coverage:**
- Pilot requirements: 4 total
- v1 requirements: 70 total
- Total: 74
- Mapped to phases: 74
- Unmapped: 0

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after roadmap creation*
