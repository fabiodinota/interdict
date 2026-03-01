# Roadmap: Interdict.io

## Overview

Interdict.io is built in 10 phases that progress from a working streaming proxy kernel through policy enforcement, evidence integrity, control plane management, and finally pilot delivery. The first four phases deliver the Rust data plane (kernel + evidence collector) with all critical pitfalls addressed from day one. Phases 5-7 build the TypeScript control plane with policy distribution, identity, and access control. Phases 8-9 deliver the dashboard and compliance reporting surface. Phase 10 packages everything for the law firm pilot deployment. Every phase delivers a coherent, verifiable capability that the next phase builds on.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6.1 (shipped 2026-03-01)
- 📋 **v1.1** — Phases 7-10 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6.1) — SHIPPED 2026-03-01</summary>

- [x] Phase 1: Kernel Proxy Foundation (3/3 plans) — completed 2026-02-26
- [x] Phase 2: Policy Engine (4/4 plans) — completed 2026-02-26
- [x] Phase 3: PII Detection & Content Inspection (6/6 plans) — completed 2026-02-27
- [x] Phase 4: Evidence Collector (4/4 plans) — completed 2026-02-28
- [x] Phase 5: Control Plane API Core (6/6 plans) — completed 2026-02-28
- [x] Phase 6: Policy Distribution & Kernel Integration (4/4 plans) — completed 2026-03-01
- [x] Phase 6.1: Kernel Integration Wiring (1/1 plan, INSERTED) — completed 2026-03-01

Full details archived in `milestones/v1.0-ROADMAP.md`

</details>

### 📋 Next Milestone (Planned)

- [ ] **Phase 7: Identity, Access & Security** — SAML 2.0 at the TypeScript boundary, RBAC with five roles, mTLS between all components, and signing key management
- [ ] **Phase 8: Dashboard Core** — Next.js policy builder, audit trail search, vendor management, and real-time violation statistics
- [ ] **Phase 9: Compliance Reporting & Advanced Dashboard** — Compliance report generation, evidence verification UI, human review queue, anomaly detection views, and department-level policy management
- [ ] **Phase 10: Infrastructure & Pilot Delivery** — Docker Compose stack, Helm chart, K8s sidecar manifest, container images, CA cert onboarding, and law firm pilot readiness

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Kernel Proxy Foundation | v1.0 | 3/3 | Complete | 2026-02-26 |
| 2. Policy Engine | v1.0 | 4/4 | Complete | 2026-02-26 |
| 3. PII Detection & Content Inspection | v1.0 | 6/6 | Complete | 2026-02-27 |
| 4. Evidence Collector | v1.0 | 4/4 | Complete | 2026-02-28 |
| 5. Control Plane API Core | v1.0 | 6/6 | Complete | 2026-02-28 |
| 6. Policy Distribution & Kernel Integration | v1.0 | 4/4 | Complete | 2026-03-01 |
| 6.1 Kernel Integration Wiring | v1.0 | 1/1 | Complete | 2026-03-01 |
| 7. Identity, Access & Security | — | 0/3 | Not started | - |
| 8. Dashboard Core | — | 0/3 | Not started | - |
| 9. Compliance Reporting & Advanced Dashboard | — | 0/3 | Not started | - |
| 10. Infrastructure & Pilot Delivery | — | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-26*
*Last updated: 2026-03-01 after v1.0 milestone*
