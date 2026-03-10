# Milestones
## v1.2 Trustworthiness & Hardening (Planned: 2026-03-10)

**Phases planned:** 9 phases
**Status:** Planning complete, execution not started
**Roadmap:** `.planning/phases/v1.2-trustworthiness-hardening/EXECUTION-ROADMAP.md`

**Delivered by this planning step:** A ruthless ordered execution program focused on evidence truth, auth hardening, JS/TS quality gates, scope enforcement, identity attribution, durable evidence delivery, workflow consolidation, deployment hardening, observability, and final release gating.

**Planned phases:**
- Phase 16: Evidence Verification Truth
- Phase 17: Auth Secret Hardening and JS Gates
- Phase 18: Reporting Integrity and Scope Truth
- Phase 19: Identity Attribution and Durable Evidence Delivery
- Phase 20: Review Workflow Consolidation
- Phase 21: Kernel and Control Plane Maintainability
- Phase 22: Dashboard Reliability and Operator Trust
- Phase 23: Deployment Truth and Artifact Hardening
- Phase 24: Platform Hardening and Release Gate

---

## v1.1 Pilot Ready (Shipped: 2026-03-04)

**Phases completed:** 9 phases, 24 plans
**Files modified:** 287 | **Feature commits:** 45
**Lines of code:** ~40,800 insertions (Rust + TypeScript + Helm)
**Timeline:** 3 days (2026-03-02 → 2026-03-04)
**Git range:** `feat(07-01)` → `feat(15-01)`
**Audit:** TECH DEBT (21/21 requirements, 9/9 phases, 20/21 integrations, 8/8 E2E flows)

**Delivered:** A deployable, enterprise-ready AI governance platform with SAML SSO, 10-view compliance dashboard, Docker Compose and Kubernetes deployment, mTLS, and signing key management — everything needed for two pilot customers.

**Key accomplishments:**
1. API key auth with 5-role RBAC and department-scoped data access across all 13 API modules
2. Docker Compose one-command deployment with 8 services, health-based ordering, and automated cert/migration/seed bootstrap
3. Next.js compliance dashboard with 10+ views: policies, audit trail, vendors, regulatory, reports, evidence verification, review queue, department policies, anomalies, signing keys
4. SAML 2.0 SSO with JIT user provisioning, cross-origin cookie fix, and dual-mode auth (API key + session token)
5. mTLS on all internal gRPC channels with automated ECDSA P-256 certificate bootstrap
6. Kubernetes Helm chart with KEP-753 native sidecar injection, pilot/enterprise overlay profiles, and cross-platform CA trust scripts

**Phases:**
- Phase 7: Identity Foundation (3 plans) — completed 2026-03-01
- Phase 8: Container Images & Docker Compose (2 plans) — completed 2026-03-02
- Phase 9: Dashboard Core Views (5 plans) — completed 2026-03-03
- Phase 10: SAML SSO & Security Hardening (3 plans) — completed 2026-03-03
- Phase 11: Advanced Dashboard Views (4 plans) — completed 2026-03-03
- Phase 12: Kubernetes Deployment (3 plans) — completed 2026-03-03
- Phase 13: Deployment Wiring for SAML & Key Rotation (2 plans) — completed 2026-03-03
- Phase 14: SAML SSO Cross-Origin Cookie Fix (1 plan) — completed 2026-03-04
- Phase 15: Signing Key Management Dashboard UI (1 plan) — completed 2026-03-04

**Tech debt:** 8 items tracked (see v1.1-MILESTONE-AUDIT.md). Notable: Helm NEXT_PUBLIC_ bake-time issue for SAML, Merkle proof verification stub, reviews/anomalies not department-scoped (mitigated by role guards).

---


## v1.0 MVP (Shipped: 2026-03-01)

**Phases completed:** 7 phases, 28 plans
**Files modified:** 314 | **Commits:** 144
**Lines of code:** ~20,838 Rust + TypeScript control plane
**Timeline:** 4 days (2026-02-26 → 2026-03-01)
**Git range:** `feat(01-01)` → `feat(06.1-01)`
**Audit:** PASSED (49/49 requirements, 7/7 phases, 8/8 integrations, 2/2 E2E flows)

**Delivered:** A complete AI governance kernel with inline policy enforcement, cryptographic evidence chain, and control plane API — the data plane and API foundation for enterprise AI compliance.

**Key accomplishments:**
1. Streaming-first Rust proxy intercepting AI traffic across HTTP/1.1, HTTP/2, SSE, gRPC, and WebSockets with <10ms p99 latency overhead
2. 3-layer policy engine (Wasm/Regorus deterministic rules + NLP classifier + human review queue) with hot-reloadable Wasm policy modules
3. PII, financial data, and secrets detection with category-tagged redaction in both outbound prompts and streaming responses
4. Cryptographic evidence pipeline: SHA-256 hash chains, Ed25519 signatures, hourly Merkle trees, S3 Object Lock WORM anchoring
5. Bun + Elysia control plane API with policy CRUD, Rego-to-Wasm compiler, vendor registry, and 8 regulatory framework packs (EU AI Act, GDPR, NIST, PDPA, DPDP, China, Canada, GCC)
6. gRPC push-based policy distribution with real-time hot-reload, department/team hierarchy, and session context tracking for multi-turn exfiltration detection

**Phases:**
- Phase 1: Kernel Proxy Foundation (3 plans) — completed 2026-02-26
- Phase 2: Policy Engine (4 plans) — completed 2026-02-26
- Phase 3: PII Detection & Content Inspection (6 plans) — completed 2026-02-27
- Phase 4: Evidence Collector (4 plans) — completed 2026-02-28
- Phase 5: Control Plane API Core (6 plans) — completed 2026-02-28
- Phase 6: Policy Distribution & Kernel Integration (4 plans) — completed 2026-03-01
- Phase 6.1: Kernel Integration Wiring (1 plan, INSERTED) — completed 2026-03-01

**Tech debt:** 18 items tracked (see v1.0-MILESTONE-AUDIT.md). Notable: evidence stubs for actor identity (Phase 7), unauthenticated endpoints (Phase 7), benchmark coverage gaps (low severity).

---

