# Roadmap: Interdict.io

## Overview

Interdict.io v1.1 (Pilot Ready) converts the working v1.0 data plane and control plane API into a product that enterprises can deploy and use. Six phases deliver identity and access control, container packaging, a 10-view compliance dashboard, security hardening (SAML, mTLS, key rotation), and Kubernetes deployment -- everything needed for two pilot customers (law firm via Docker Compose, bank via Helm). Phase numbering continues from v1.0 (which ended at Phase 6.1).

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-6.1 (shipped 2026-03-01)
- 🚧 **v1.1 Pilot Ready** -- Phases 7-12 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6.1) -- SHIPPED 2026-03-01</summary>

- [x] Phase 1: Kernel Proxy Foundation (3/3 plans) -- completed 2026-02-26
- [x] Phase 2: Policy Engine (4/4 plans) -- completed 2026-02-26
- [x] Phase 3: PII Detection & Content Inspection (6/6 plans) -- completed 2026-02-27
- [x] Phase 4: Evidence Collector (4/4 plans) -- completed 2026-02-28
- [x] Phase 5: Control Plane API Core (6/6 plans) -- completed 2026-02-28
- [x] Phase 6: Policy Distribution & Kernel Integration (4/4 plans) -- completed 2026-03-01
- [x] Phase 6.1: Kernel Integration Wiring (1/1 plan, INSERTED) -- completed 2026-03-01

Full details archived in `milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Pilot Ready (Phases 7-12)

**Milestone Goal:** Make Interdict.io deployable and usable by pilot customers -- a CISO can log in via SSO, configure policies through a dashboard, review audit trails, and IT can deploy via Docker Compose or Helm.

- [x] **Phase 7: Identity Foundation** -- API key auth, 5-role RBAC with route guards and data-level scoping (completed 2026-03-01)
- [x] **Phase 8: Container Images & Docker Compose** -- Multi-stage Dockerfiles for all services, one-command pilot deployment (completed 2026-03-02)
- [x] **Phase 9: Dashboard Core Views** -- Next.js dashboard with 6 core compliance officer views (completed 2026-03-03)
- [x] **Phase 10: SAML SSO & Security Hardening** -- Enterprise SSO, mTLS between all components, evidence signing key rotation (completed 2026-03-03)
- [ ] **Phase 11: Advanced Dashboard Views** -- Evidence verification, human review queue, department policies, anomaly detection
- [ ] **Phase 12: Kubernetes Deployment** -- Helm chart, sidecar manifests, CA certificate onboarding

## Phase Details

### Phase 7: Identity Foundation
**Goal**: Users can authenticate and are restricted to role-appropriate features and data
**Depends on**: Phase 6.1 (v1.0 complete)
**Requirements**: IDENT-02, IDENT-03, IDENT-04
**Success Criteria** (what must be TRUE):
  1. User can authenticate to the control plane API using an API key and receive a session with role claims
  2. User with Super Admin role can access all API endpoints; user with Read-Only Auditor role is blocked from write operations
  3. User with Department Manager role querying audit data sees only their own department's records -- cross-department data is invisible
  4. Existing internal service callers (gRPC distribution, compilation worker, integration tests) continue working via service account API keys
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md -- Schema, permissions model, and identity seed (Wave 1)
- [ ] 07-02-PLAN.md -- Auth middleware macro and API key management endpoints (Wave 2)
- [ ] 07-03-PLAN.md -- Route guards on all modules and department-scoped audit filtering (Wave 3)

### Phase 8: Container Images & Docker Compose
**Goal**: Operator can deploy the full Interdict stack on a single server with one command
**Depends on**: Phase 7
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. All four service images (kernel, control plane API, dashboard, evidence collector) build successfully via multi-stage Dockerfiles and are published to a container registry
  2. Running `docker compose up` on a fresh machine brings up the entire stack with health checks passing for all services
  3. An `env.example` file documents every configuration variable, serving as the single source of truth shared between Docker Compose and future Helm deployment
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md -- Multi-stage Dockerfiles, entrypoint scripts, TOML template, env.example, .dockerignore (Wave 1)
- [ ] 08-02-PLAN.md -- Evidence collector env var config, Docker Compose orchestration (Wave 2)

### Phase 9: Dashboard Core Views
**Goal**: Compliance officer can manage policies, review audit trails, and generate reports through a visual dashboard
**Depends on**: Phase 7 (RBAC), Phase 8 (deployable stack for end-to-end testing)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06
**Success Criteria** (what must be TRUE):
  1. Compliance officer can create a new governance policy through the Policy Builder UI without writing any Rego code, and the policy compiles to a valid Wasm module
  2. Compliance officer can search and filter AI interactions by time range, department, vendor, and policy decision in the Audit Trail dashboard with server-side pagination
  3. Compliance officer can view real-time violation statistics (by type, department, vendor, time period) on the dashboard home screen with charts that auto-refresh
  4. Compliance officer can approve/block AI vendors and select regulatory jurisdictions, with changes reflected in the kernel's enforcement within seconds
  5. Compliance officer can generate a PDF or CSV compliance report covering a specified date range
**Plans**: 4 plans

Plans:
- [x] 09-01-PLAN.md -- Dashboard Foundation & Layout (Wave 1) -- completed 2026-03-03
- [ ] 09-02-PLAN.md -- Dashboard Home Screen & Real-Time Charts (Wave 2)
- [ ] 09-03-PLAN.md -- Policy Builder & Policy List (Wave 2)
- [ ] 09-04-PLAN.md -- Audit Trail, Vendor Management, Regulatory Selector & Report Generation (Wave 3)

### Phase 10: SAML SSO & Security Hardening
**Goal**: Enterprise users can authenticate via their corporate identity provider, and all internal communication is mutually authenticated and encrypted
**Depends on**: Phase 7 (auth middleware skeleton), Phase 8 (Docker Compose for integration testing)
**Requirements**: IDENT-01, IDENT-05, IDENT-06
**Success Criteria** (what must be TRUE):
  1. User can log in via SAML 2.0 SSO through Okta or Azure AD and land in the dashboard with correct role assignment
  2. All gRPC channels between kernel, control plane, and evidence collector use mTLS -- connections without valid client certificates are rejected
  3. Admin can rotate the Ed25519 evidence signing key and the system continues to verify both old (pre-rotation) and new (post-rotation) evidence bundles without breaking the hash chain
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md -- SAML 2.0 SSO with samlify, dual-mode auth, JIT user provisioning (Wave 1)
- [ ] 10-02-PLAN.md -- mTLS for all internal gRPC channels with cert bootstrap (Wave 1)
- [ ] 10-03-PLAN.md -- Ed25519 signing key rotation with admin API and hot-reload (Wave 1)

### Phase 11: Advanced Dashboard Views
**Goal**: Auditors can independently verify evidence integrity, compliance officers can manage escalations and anomalies, and department managers can customize their team's policies
**Depends on**: Phase 9 (dashboard infrastructure), Phase 10 (key rotation for evidence verification)
**Requirements**: DASH-07, DASH-08, DASH-09, DASH-10
**Success Criteria** (what must be TRUE):
  1. Auditor can select any evidence bundle in the UI and verify its hash chain integrity, Ed25519 signature, and Merkle proof -- with a clear pass/fail result
  2. Compliance officer can view Layer 3 escalated interactions in the Human Review Queue and approve or reject them with mandatory reasoning, with SLA countdown timers visible
  3. Department Manager can view inherited policies for their department and override specific settings through the Department Policy Management UI
  4. Compliance officer can view anomaly detection alerts showing volume spikes, off-hours usage, vendor switching, and topic drift against statistical baselines
**Plans**: 4 plans

Plans:
- [ ] 11-01-PLAN.md -- Evidence Verification UI and API (Wave 1)
- [ ] 11-02-PLAN.md -- Human Review Queue with SLA timers (Wave 1)
- [ ] 11-03-PLAN.md -- Department Policy Management with overrides (Wave 1)
- [ ] 11-04-PLAN.md -- Anomaly Detection alerts page (Wave 1)

### Phase 12: Kubernetes Deployment
**Goal**: Operator can deploy Interdict on Kubernetes via Helm chart or as a sidecar, and onboard client machines to trust the proxy CA
**Depends on**: Phase 8 (container images), Phase 10 (mTLS configuration)
**Requirements**: DEPLOY-03, DEPLOY-04, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. Operator can deploy the full Interdict stack on a Kubernetes cluster using `helm install` with configurable values for pilot and enterprise environments
  2. Operator can deploy the kernel as a sidecar container in the same pod as an AI application, with the sidecar intercepting all outbound AI traffic
  3. Operator can run a platform-specific script (macOS, Windows, Linux) to install the Interdict CA certificate on client machines for explicit proxy mode
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD
- [ ] 12-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11 -> 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Kernel Proxy Foundation | v1.0 | 3/3 | Complete | 2026-02-26 |
| 2. Policy Engine | v1.0 | 4/4 | Complete | 2026-02-26 |
| 3. PII Detection & Content Inspection | v1.0 | 6/6 | Complete | 2026-02-27 |
| 4. Evidence Collector | v1.0 | 4/4 | Complete | 2026-02-28 |
| 5. Control Plane API Core | v1.0 | 6/6 | Complete | 2026-02-28 |
| 6. Policy Distribution & Kernel Integration | v1.0 | 4/4 | Complete | 2026-03-01 |
| 6.1 Kernel Integration Wiring | v1.0 | 1/1 | Complete | 2026-03-01 |
| 7. Identity Foundation | v1.1 | Complete    | 2026-03-01 | - |
| 8. Container Images & Docker Compose | v1.1 | 2/2 | Complete | 2026-03-02 |
| 9. Dashboard Core Views | v1.1 | 5/5 | Complete | 2026-03-03 |
| 10. SAML SSO & Security Hardening | 3/3 | Complete    | 2026-03-03 | - |
| 11. Advanced Dashboard Views | v1.1 | 0/4 | Not started | - |
| 12. Kubernetes Deployment | v1.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-02-26*
*Last updated: 2026-03-03 after Phase 11 planning*
