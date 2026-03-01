# Roadmap: Interdict.io

## Overview

Interdict.io is built in 10 phases that progress from a working streaming proxy kernel through policy enforcement, evidence integrity, control plane management, and finally pilot delivery. The first four phases deliver the Rust data plane (kernel + evidence collector) with all critical pitfalls addressed from day one. Phases 5-7 build the TypeScript control plane with policy distribution, identity, and access control. Phases 8-9 deliver the dashboard and compliance reporting surface. Phase 10 packages everything for the law firm pilot deployment. Every phase delivers a coherent, verifiable capability that the next phase builds on.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Kernel Proxy Foundation** - Streaming-first Rust proxy intercepting AI traffic over HTTP/1.1, HTTP/2, SSE, gRPC, and WebSockets with proper connection pooling
- [x] **Phase 2: Policy Engine** - Wasmtime pooling allocator, Regorus evaluation, and 3-layer enforcement pipeline executing block/allow/redact verdicts
- [x] **Phase 3: PII Detection & Content Inspection** - PII, financial data, and secrets detection with category-tagged redaction in both prompts and streaming responses
- [ ] **Phase 4: Evidence Collector** - Separate Rust binary producing SHA-256 hash chains, Ed25519 signatures, Merkle trees, and S3 WORM anchoring with correct ClickHouse batching
- [ ] **Phase 5: Control Plane API Core** - Bun + Elysia API with policy CRUD, Rego-to-Wasm compiler, vendor registry, regulatory framework mappings, and database schemas
- [ ] **Phase 6: Policy Distribution & Kernel Integration** - gRPC xDS-style push from control plane to kernel fleet with hot-reload, session context tracking, and fail-closed/open behavior
- [ ] **Phase 7: Identity, Access & Security** - SAML 2.0 at the TypeScript boundary, RBAC with five roles, mTLS between all components, and signing key management
- [ ] **Phase 8: Dashboard Core** - Next.js policy builder, audit trail search, vendor management, and real-time violation statistics
- [ ] **Phase 9: Compliance Reporting & Advanced Dashboard** - Compliance report generation, evidence verification UI, human review queue, anomaly detection views, and department-level policy management
- [ ] **Phase 10: Infrastructure & Pilot Delivery** - Docker Compose stack, Helm chart, K8s sidecar manifest, container images, CA cert onboarding, and law firm pilot readiness

## Phase Details

### Phase 1: Kernel Proxy Foundation
**Goal**: A running Rust proxy that intercepts outbound AI traffic across all required protocols with streaming-first design, correct HTTP/2 connection pooling, bounded internal channels, and vendor allowlist enforcement
**Depends on**: Nothing (first phase)
**Requirements**: KERN-01, KERN-02, KERN-03, KERN-04, KERN-07, KERN-08, KERN-09, KERN-12, KERN-13
**Success Criteria** (what must be TRUE):
  1. An outbound HTTP request to an AI vendor (e.g., OpenAI) routed through the proxy is forwarded to the vendor and the response streams back to the client with first-token latency overhead under 10ms p99
  2. SSE streaming responses from AI vendors are relayed token-by-token to the client without buffering the full response (verified by observing incremental token delivery)
  3. The proxy handles gRPC streaming and WebSocket connections for AI services without dropping frames or breaking the connection
  4. The proxy maintains multiple HTTP/2 connections per AI vendor backend, verified by sustaining 200+ concurrent streams without stream exhaustion
  5. A request to a vendor not on the allowlist is blocked and the client receives a rejection response indicating the vendor is not approved
**Plans**: 3 plans in 3 waves

Plans:
- [x] 01-01: Project scaffold, config, TLS cert cache, vendor allowlist middleware, logging (Wave 1)
- [x] 01-02: CONNECT tunnel, bidirectional relay, HTTP/2 connection pool, WebSocket support (Wave 2)
- [x] 01-03: Integration tests and criterion benchmarks for latency, throughput, memory (Wave 3)

### Phase 2: Policy Engine
**Goal**: The kernel evaluates policies against intercepted traffic using a 3-layer pipeline (Wasm/Regorus deterministic rules, NLP classifier structure, human review queue structure) and enforces block/allow/redact verdicts on requests and responses
**Depends on**: Phase 1
**Requirements**: PLCY-01, PLCY-02, PLCY-03, PLCY-04, PLCY-07, PLCY-09, KERN-11
**Success Criteria** (what must be TRUE):
  1. A Rego policy rule loaded as a Wasm module evaluates against an intercepted AI request and returns a block/allow/redact verdict in under 2ms
  2. The Wasmtime runtime uses pooling allocator with pre-warmed worker pool, verified by steady-state RAM staying under 128MB after processing 10,000+ policy evaluations
  3. Layer 2 NLP classifier (tract + ONNX) classifies ambiguous requests for intent/risk in under 10ms and routes genuinely ambiguous cases to the Layer 3 queue
  4. A policy configured as fail-closed blocks requests when the policy engine encounters an error; a policy configured as fail-open allows them through
  5. The vendor allowlist check (from Phase 1) integrates with the policy pipeline so that vendor blocking is a policy verdict, not a separate code path
**Plans**: 4 plans in 3 waves

Plans:
- [x] 02-01-PLAN.md — Core types, verdict merge, Regorus engine pool, Wasmtime pooling allocator (Wave 1)
- [x] 02-02-PLAN.md — Vendor allowlist as L1 policy, L2 NLP classifier, redaction engine (Wave 2)
- [x] 02-03-PLAN.md — Layer 3 human review queue with SQLite persistence and connection hold (Wave 2)
- [x] 02-04-PLAN.md — Pipeline orchestrator, proxy integration, integration tests (Wave 3)

### Phase 3: PII Detection & Content Inspection
**Goal**: The kernel detects and redacts PII, financial data, secrets, and custom enterprise patterns in both outbound prompts and inbound streaming responses, replacing detected content with category-tagged placeholders
**Depends on**: Phase 2
**Requirements**: PII-01, PII-02, PII-03, PII-04, PII-05, PII-06, KERN-05, KERN-06, PLCY-11
**Success Criteria** (what must be TRUE):
  1. An AI prompt containing a name, email, phone number, SSN, or address is intercepted and the PII is replaced with category-tagged placeholders (e.g., `[PII:NAME]`, `[PII:EMAIL]`) before reaching the vendor
  2. An AI prompt containing credit card numbers, bank accounts, or API keys is intercepted and the sensitive data is replaced with appropriate category tags (e.g., `[FINANCIAL:CARD]`, `[SECRET:API_KEY]`)
  3. A streaming AI response containing PII is inspected via the sliding window token buffer (5-10 tokens held back) and sensitive content is redacted before reaching the client
  4. The kernel can sever a streaming connection mid-response and inject `[REDACTED BY INTERDICT POLICY: {RULE_NAME}]` when a severe policy violation is detected in the response stream
  5. Custom enterprise patterns (client names, matter numbers, case codes) loaded from policy configuration are detected and redacted alongside built-in patterns
**Plans**: 6 plans in 3 waves

Plans:
- [x] 03-01-PLAN.md — Default pattern library with validators (PII, financial, secrets) (Wave 1)
- [x] 03-02-PLAN.md — Adaptive streaming buffer and pattern detector (Wave 1)
- [x] 03-03-PLAN.md — Content inspection integration with streaming relay and stream severing (Wave 2)
- [x] 03-04-PLAN.md — Integration tests and performance benchmarks (Wave 3)
- [x] 03-05-PLAN.md — Gap closure: PLCY-11 prompt injection / jailbreak heuristic detector (Wave 1)
- [x] 03-06-PLAN.md — Gap closure: Wire ContentInspector into CONNECT tunnel outbound relay (Wave 1)

### Phase 4: Evidence Collector
**Goal**: A separate Rust binary service receives evidence events from the kernel via gRPC, builds a cryptographically linked hash chain with Ed25519 signatures, constructs hourly Merkle trees, anchors root hashes to S3 Object Lock, and batch-inserts to ClickHouse without triggering "too many parts" failures
**Depends on**: Phase 1 (kernel produces evidence events)
**Requirements**: EVID-01, EVID-02, EVID-03, EVID-04, EVID-05, EVID-06, EVID-07, EVID-08, EVID-09, EVID-10, KERN-14
**Success Criteria** (what must be TRUE):
  1. The kernel creates evidence bundles asynchronously (binary compressed, local memory buffer, 500ms background flush) and streams them to the Evidence Collector via gRPC without adding latency to the proxied AI response
  2. Each evidence bundle contains actor identity, AI vendor/model, prompt hash, policy evaluation result, response hash, token count, enforcement latency, chain linkage hash, and Ed25519 digital signature
  3. Evidence bundles form a linked hash chain where each bundle's SHA-256 hash incorporates the previous bundle's hash, and any tampering with a single bundle is detectable by re-computing the chain
  4. Hourly Merkle trees are constructed from evidence bundles and root hashes are anchored to S3 Object Lock (WORM), providing external immutability verification independent of the database
  5. The Evidence Collector batches inserts to ClickHouse (minimum 1000 rows per insert, maximum 1 INSERT/second), verified by monitoring `system.parts` staying well below 150 parts per partition under sustained load
**Plans**: 4 plans in progress

Plans:
- [x] 04-01-PLAN.md — Workspace scaffold, protobuf schema, and crypto primitives (Wave 1)
- [ ] 04-02-PLAN.md — gRPC ingestion service and ClickHouse batching pipeline
- [ ] 04-03-PLAN.md — Merkle tree anchoring and storage integration
- [ ] 04-04-PLAN.md — verifier implementation and end-to-end validation

### Phase 5: Control Plane API Core
**Goal**: The Bun + Elysia API manages policies (CRUD with Rego source), compiles them to Wasm modules via OPA CLI, manages the vendor registry with per-model granularity, maps regulatory frameworks to policy configurations, and provides searchable audit trail queries against ClickHouse with SSE streaming
**Depends on**: Phase 4 (ClickHouse schema and evidence data available)
**Requirements**: CTRL-01, CTRL-02, CTRL-04, CTRL-05, CTRL-06, CTRL-07, CTRL-10, CTRL-11
**Success Criteria** (what must be TRUE):
  1. A compliance officer can create a policy via the API using Rego or YAML source, and the API compiles it into a Wasm module ready for distribution
  2. The vendor registry API allows adding, updating, and removing approved/blocked AI vendors with per-vendor model version allowlists
  3. Selecting a regulatory jurisdiction (e.g., EU AI Act) via the API auto-enables the corresponding pre-built policy configurations covering that framework's requirements
  4. The audit trail query API returns searchable, filterable execution history by user, department, vendor, policy decision, time range, and violation type with sub-second response times
  5. PostgreSQL stores configuration, policies, users, and vendor registry; ClickHouse stores high-volume audit logs and analytics data; the two are never confused
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 05-01-PLAN.md -- Project scaffold, database schemas (PostgreSQL + ClickHouse client), shared utilities (Wave 1)
- [ ] 05-02-PLAN.md -- Policy CRUD with version history, async Rego-to-Wasm compiler, vendor registry (Wave 2)
- [ ] 05-03-PLAN.md -- Regulatory framework engine, seed EU AI Act and GDPR policy packs (Wave 2)
- [ ] 05-04-PLAN.md -- Audit trail queries, SSE streaming, aggregate endpoints (Wave 2)

### Phase 6: Policy Distribution & Kernel Integration
**Goal**: The control plane pushes compiled Wasm policy modules to the kernel fleet in real-time via gRPC server-streaming (Envoy xDS-style), kernels hot-reload policies without restart, and session context enables multi-turn policy enforcement
**Depends on**: Phase 2 (kernel policy engine), Phase 5 (control plane API compiles policies)
**Requirements**: CTRL-03, PLCY-06, PLCY-08, PLCY-10, KERN-10
**Success Criteria** (what must be TRUE):
  1. When a compliance officer updates a policy via the control plane API, the compiled Wasm module is pushed to all connected kernel instances via gRPC server-streaming within seconds, without any kernel polling
  2. Kernels load the new policy module at runtime without restarting the binary, and subsequent AI requests are evaluated against the updated policy
  3. Policies can be configured per department, per user, and per AI vendor, with an inheritance model where organization defaults cascade to department overrides to team overrides
  4. The kernel tracks session context across multi-turn conversations per user/session, detecting policy violations that emerge across multiple exchanges (e.g., slow-leak data exfiltration)
**Plans**: 4 plans in 3 waves

Plans:
- [ ] 06-01-PLAN.md — Proto schema, ArcSwap hot-reload PolicySet, hierarchy resolver, session store (Wave 1)
- [ ] 06-02-PLAN.md — Distribution gRPC client, pipeline refactor to ArcSwap, session wiring, main.rs integration (Wave 2)
- [ ] 06-03-PLAN.md — Control plane gRPC distribution server, kernel tracker, compiler broadcast (Wave 2)
- [ ] 06-04-PLAN.md — Integration tests validating all Phase 6 success criteria (Wave 3)

### Phase 7: Identity, Access & Security
**Goal**: Enterprise identity integration via SAML 2.0 at the TypeScript API boundary, RBAC with five distinct roles controlling all API and dashboard access, mTLS securing all internal service communication, and cryptographic key management for signing key rotation
**Depends on**: Phase 5 (control plane API exists)
**Requirements**: CTRL-09, CTRL-12, CTRL-08, INFR-05, INFR-06, PILOT-02
**Success Criteria** (what must be TRUE):
  1. An enterprise user authenticating via SAML 2.0 (Okta, Azure AD) has their identity verified at the control plane API boundary and their verified identity claims flow through to the kernel for evidence attribution
  2. API key authentication works as a fallback when SAML integration is not yet configured (pilot scenario), with API keys scoped to specific roles
  3. The five RBAC roles (Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor) each see and can do only what their role permits across all API endpoints
  4. All internal service communication (kernel to control plane, kernel to evidence collector, API to databases) is secured with mutual TLS using deployment-unique certificates
  5. Signing key rotation can be performed via the API without downtime, and new evidence bundles are signed with the rotated key while old bundles remain verifiable with the previous key
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

### Phase 8: Dashboard Core
**Goal**: Compliance officers and admins can manage policies, view audit trails, manage vendors, and monitor real-time violation statistics through a Next.js dashboard that communicates exclusively with the control plane API
**Depends on**: Phase 5 (API endpoints), Phase 7 (authentication and RBAC)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. A compliance officer can create and edit policies through a visual policy builder UI without writing Rego directly, and the resulting policy is compiled and distributed to kernels
  2. The regulatory framework selector shows available jurisdictions, and selecting one displays the corresponding technical configurations with toggles for individual policy mappings
  3. The audit trail view displays all AI interactions with policy decisions, identity attribution, and evidence bundle references, with search and filtering by user, department, vendor, time range, and violation type
  4. The vendor management UI allows approving/blocking AI vendors and setting model version allowlists, with changes taking effect on the kernel fleet in real-time
  5. Real-time violation statistics show violations by type, department, vendor, and time period with trend analysis, updating without manual page refresh
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

### Phase 9: Compliance Reporting & Advanced Dashboard
**Goal**: The dashboard supports compliance report generation for regulators, evidence chain verification for auditors, a human review queue for Layer 3 escalations, anomaly detection views for security teams, and department-level policy management with visual inheritance
**Depends on**: Phase 8 (dashboard foundation)
**Requirements**: DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, PLCY-05
**Success Criteria** (what must be TRUE):
  1. A compliance officer can generate automated PDF/CSV compliance reports scoped by time range, department, and regulatory framework, suitable for submission to regulators or legal teams
  2. An external auditor can use the evidence verification UI to verify hash chain integrity, check Ed25519 signatures, view Merkle tree structure, and verify S3 anchor hashes without needing command-line tools
  3. Compliance officers can review Layer 3 escalations in a human review queue, approve or reject with reasoning, and that reasoning feeds back into policy refinement
  4. Anomaly detection views surface volume anomalies (unusual request counts), time-based anomalies (off-hours access), and pattern anomalies (unusual AI usage patterns) with configurable alert thresholds
  5. Department-level policy management shows the inheritance hierarchy (organization defaults to department overrides to team overrides) visually, and changes at any level propagate correctly
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD
- [ ] 09-03: TBD

### Phase 10: Infrastructure & Pilot Delivery
**Goal**: The complete system is packaged for deployment as a Docker Compose stack (law firm pilot) and Kubernetes Helm chart (enterprise), with container images published, K8s sidecar manifests ready, CA certificate onboarding scripted, sample policies pre-loaded, and the law firm pilot deliverable verified end-to-end
**Depends on**: All previous phases
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04, INFR-07, PILOT-01, PILOT-03, PILOT-04
**Success Criteria** (what must be TRUE):
  1. Running `docker compose up` with the provided stack deploys all services (kernel, evidence collector, control plane API, dashboard, PostgreSQL, ClickHouse) and the system is functional with pre-loaded EU AI Act sample policies
  2. The Kubernetes Helm chart deploys to a K8s cluster with configurable resource limits, and the kernel runs as a sidecar container intercepting outbound AI traffic from the application pod
  3. Container images for all four services are built, tagged, and publishable to a container registry
  4. The onboarding script installs the deployment-unique CA certificate on client machines, enabling the explicit proxy mode for the law firm pilot
  5. All data stays inside the customer network perimeter with no phone-home telemetry or external dependencies after initial deployment, verified by running the system in a network-isolated environment
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD
- [ ] 10-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Kernel Proxy Foundation | 3/3 | Complete | 2026-02-26 |
| 2. Policy Engine | 4/4 | Complete | 2026-02-26 |
| 3. PII Detection & Content Inspection | 6/6 | Complete | 2026-02-27 |
| 4. Evidence Collector | 1/4 | In Progress | - |
| 5. Control Plane API Core | 0/4 | Planned | - |
| 6. Policy Distribution & Kernel Integration | 0/4 | Planned | - |
| 7. Identity, Access & Security | 0/3 | Not started | - |
| 8. Dashboard Core | 0/3 | Not started | - |
| 9. Compliance Reporting & Advanced Dashboard | 0/3 | Not started | - |
| 10. Infrastructure & Pilot Delivery | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-26*
*Last updated: 2026-02-27*
