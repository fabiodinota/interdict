# Requirements: Interdict.io

**Defined:** 2026-03-01
**Core Value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model

## v1.1 Requirements

Requirements for Pilot Ready milestone. Each maps to roadmap phases.

### Identity & Security

- [x] **IDENT-01**: User can authenticate via SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD)
- [x] **IDENT-02**: User can authenticate via API key for programmatic access
- [x] **IDENT-03**: User is assigned one of five roles (Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor) that restricts accessible features and data
- [x] **IDENT-04**: User with Department Manager role can only view data for their own department
- [x] **IDENT-05**: All internal component communication (kernel <-> control plane, kernel <-> evidence collector) is encrypted and mutually authenticated via mTLS
- [x] **IDENT-06**: Admin can rotate Ed25519 evidence signing keys without breaking verification of previously signed evidence bundles

### Dashboard -- Core Views

- [x] **DASH-01**: Compliance officer can create, edit, enable/disable governance policies through a visual Policy Builder UI (no Rego knowledge required)
- [x] **DASH-02**: Compliance officer can search and filter all AI interactions and policy decisions in an Audit Trail dashboard
- [x] **DASH-03**: Compliance officer can view real-time violation statistics (by type, department, vendor, time period) on a dashboard home screen
- [x] **DASH-04**: Compliance officer can approve/block AI vendors and set model version allowlists through a Vendor Management UI
- [x] **DASH-05**: Compliance officer can select regulatory jurisdictions and see corresponding policy configurations enabled through a Regulatory Framework Selector
- [x] **DASH-06**: Compliance officer can generate PDF/CSV compliance reports for regulators, legal teams, and risk departments

### Dashboard -- Advanced Views

- [x] **DASH-07**: Auditor can independently verify evidence bundle hash chain integrity, Ed25519 signatures, and Merkle proofs through an Evidence Verification UI
- [x] **DASH-08**: Compliance officer can review, approve, or reject Layer 3 escalated AI interactions through a Human Review Queue with configurable SLA timers
- [x] **DASH-09**: Department Manager can view and override inherited policies for their department through a Department Policy Management UI
- [x] **DASH-10**: Compliance officer can view anomaly detection alerts (volume spikes, off-hours usage, vendor switching, topic drift) based on statistical baselines

### Deployment & Infrastructure

- [x] **DEPLOY-01**: All services (kernel, control plane API, dashboard, evidence collector) are packaged as container images published to a registry
- [x] **DEPLOY-02**: Operator can deploy the full Interdict stack on a single server using Docker Compose with one command
- [ ] **DEPLOY-03**: Operator can deploy the full Interdict stack on Kubernetes using a Helm chart with configurable values
- [ ] **DEPLOY-04**: Operator can deploy the kernel as a sidecar container alongside AI application pods in Kubernetes
- [ ] **DEPLOY-05**: Operator can onboard client machines to trust the Interdict CA certificate using platform-specific scripts (macOS, Windows, Linux)

## v1.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Identity

- **IDENT-07**: User can authenticate via OIDC (OpenID Connect) as alternative to SAML
- **IDENT-08**: Users are automatically provisioned/deprovisioned via SCIM directory sync

### Dashboard

- **DASH-11**: User can customize dashboard layout with draggable widgets
- **DASH-12**: Dashboard supports dark mode theme
- **DASH-13**: Dashboard displays real-time streaming events via WebSocket

### Deployment

- **DEPLOY-06**: Operator can manage Interdict lifecycle via a Kubernetes Operator
- **DEPLOY-07**: Operator can deploy Interdict via Terraform provider
- **DEPLOY-08**: Operator can deploy Interdict in fully air-gapped mode with offline policy distribution

## Out of Scope

| Feature | Reason |
|---------|--------|
| OIDC support | SAML covers both pilot targets (Okta, Azure AD); OIDC is v1.2 fast-follow |
| SCIM user provisioning | 80-user pilot = manual user management acceptable; SCIM adds significant complexity |
| Custom dashboard widgets | Drag-and-drop widget framework is massive frontend complexity; ship fixed layout first |
| AI-powered policy suggestions | Violates "no LLM in enforcement path" principle; non-deterministic governance is unacceptable |
| Kubernetes Operator | Overkill for 2-pilot scope; Helm chart + standard K8s primitives suffice |
| Multi-tenant dashboard | Both pilots are single-tenant deployments; multi-tenancy is MSP/reseller feature |
| Real-time streaming dashboard | WebSocket event streaming creates performance issues at scale; polling with 30s refresh suffices |
| Terraform provider | Premature with 2 customers; build when deployment patterns stabilize |
| Embedded BI / data exploration | Fixed report templates cover pilot needs; Grafana integration guide for power users |
| Dark mode | Doubles CSS/theme maintenance; ship one polished light theme |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDENT-01 | Phase 10 | Complete |
| IDENT-02 | Phase 7 | Complete |
| IDENT-03 | Phase 7 | Complete |
| IDENT-04 | Phase 7 | Complete |
| IDENT-05 | Phase 10 | Complete |
| IDENT-06 | Phase 10 | Complete |
| DASH-01 | Phase 9 | Complete |
| DASH-02 | Phase 9 | Complete |
| DASH-03 | Phase 9 | Complete |
| DASH-04 | Phase 9 | Complete |
| DASH-05 | Phase 9 | Complete |
| DASH-06 | Phase 9 | Complete |
| DASH-07 | Phase 11 | Complete |
| DASH-08 | Phase 11 | Complete |
| DASH-09 | Phase 11 | Complete |
| DASH-10 | Phase 11 | Complete |
| DEPLOY-01 | Phase 8 | Complete |
| DEPLOY-02 | Phase 8 | Complete |
| DEPLOY-03 | Phase 12 | Pending |
| DEPLOY-04 | Phase 12 | Pending |
| DEPLOY-05 | Phase 12 | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after v1.1 roadmap creation*
