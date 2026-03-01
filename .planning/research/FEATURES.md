# Feature Landscape: v1.1 Pilot Ready

**Domain:** Identity & Security, Dashboard, Deployment for AI Governance Platform
**Researched:** 2026-03-01
**Confidence:** HIGH (multi-source: competitor analysis, enterprise security standards, regulatory requirements, deployment ecosystem research)
**Scope:** NEW features only -- v1.0 data plane, evidence pipeline, and control plane API already shipped

---

## Context: What Already Exists (v1.0)

The v1.1 feature landscape builds on a complete foundation:

- Streaming Rust proxy with 3-layer policy engine (Wasm + NLP + human review)
- PII/financial/secrets detection with redaction in requests and streaming responses
- Cryptographic evidence pipeline (SHA-256 hash chain, Ed25519 signatures, Merkle trees, S3 WORM)
- Control plane API: policy CRUD, Rego-to-Wasm compiler, vendor registry, regulatory mappings, audit trail queries
- gRPC push-based policy distribution with hot-reload
- PostgreSQL (config/users/policies) + ClickHouse (audit analytics)
- Existing DB schema: `users` table with `role` column (unused), `externalId` for SAML (unused), `departments`, `teams`

v1.1 adds the enterprise-facing layer: identity, dashboard, and deployment packaging.

---

## Table Stakes

Features that pilot customers (law firm ~80 employees, small private bank) will expect on day one. Missing any of these means the product cannot be deployed.

| # | Feature | Why Expected | Complexity | Dependencies on Existing | Notes |
|---|---------|--------------|------------|--------------------------|-------|
| TS-1 | **SAML 2.0 SSO** | Enterprise procurement blocks products without SSO. Both pilot targets (law firm, bank) use enterprise IdPs (Okta, Azure AD). Every enterprise security product ships SAML. Non-negotiable for regulated verticals. | Med | Adds auth middleware to existing Elysia API. Maps SAML subject to `users.externalId` column (already in schema). | SAML 2.0 specifically (not just OIDC) because law firms and banks often run on-premises AD/ADFS. OIDC is a v2 fast-follow. Use a proven library (BoxyHQ/SAML-Jackson or saml2-js) rather than hand-rolling XML signature verification -- SAML is a minefield of security bugs. |
| TS-2 | **API Key Auth Fallback** | Pilot deployments need a working auth mechanism from day one, before SAML IdP integration is configured. Service-to-service communication (scripts, CI/CD) always needs API keys. Every API product supports this. | Low | Adds to existing unauthenticated Elysia endpoints. Stores hashed keys in PostgreSQL `users` or new `api_keys` table. | Hash keys with SHA-256 before storage. Support key rotation (create new, revoke old). Rate-limit per key. This ships before SAML because it unblocks everything else. |
| TS-3 | **5-Role RBAC** | Separation of duties is mandatory for regulated enterprises. A compliance officer must not be able to modify policies. An auditor must have read-only access. Every competitor (CalypsoAI, Lasso, Credo AI) has RBAC. | Med | Uses existing `users.role` column. Adds middleware to every existing API endpoint. Requires refactoring all routes to check permissions. | Roles: Super Admin (full access), Compliance Officer (audit + reports + review queue), Policy Admin (policy CRUD + vendor management), Department Manager (own-department view), Read-Only Auditor (view everything, modify nothing). Principle of least privilege. External regulators get Auditor role. |
| TS-4 | **mTLS Between Components** | All internal communication (kernel to control plane, kernel to evidence collector, API to databases) must be encrypted and mutually authenticated. Required for SOC 2, ISO 27001, and any bank deployment. Standard enterprise security practice. | Med | Configures TLS on existing gRPC channels and HTTP connections. Requires CA certificate generation per deployment. | Generate deployment-unique CA keypair during install (never ship pre-generated keys). Mutual authentication prevents rogue components from joining the mesh. For Kubernetes deployments, can leverage service mesh mTLS (Istio/Linkerd) as alternative. For Docker Compose, manual cert generation with helper script. |
| TS-5 | **Key Rotation for Evidence Signing** | Ed25519 signing keys must be rotatable without losing the ability to verify old evidence bundles. Key rotation is table stakes for any cryptographic system. Banks require documented key management procedures. | Med | Extends existing evidence-collector signing module. Adds key version tracking to evidence bundles. Control plane API endpoint to trigger rotation. | Must support: generate new keypair, mark old key as "verify-only", new evidence signed with new key, old evidence still verifiable with old key. Store key metadata (version, creation date, retirement date) in PostgreSQL. The key rotation API is a control plane feature, not a data plane feature. |
| TS-6 | **Policy Builder UI** | CISOs and compliance officers cannot write Rego policy language. A visual policy builder is the primary interface for non-technical users to create and manage governance rules. Every governance dashboard (CalypsoAI, Credo AI, Holistic AI) has a policy builder. | High | Consumes existing `/api/policies` CRUD endpoints. Must translate visual builder output to Rego source that the existing compiler accepts. | Form-based builder, not drag-and-drop (too complex for v1.1). Sections: trigger conditions (vendor, department, content type), detection rules (PII categories, custom patterns), enforcement action (block/allow/redact), scope (departments/teams). Preview mode showing what the policy will do. Enable/disable toggle. The hard part is generating valid Rego from UI inputs. |
| TS-7 | **Audit Trail Dashboard** | The #1 feature compliance officers need. Searchable, filterable view of all AI interactions with policy decisions. Every governance tool has this. Without it, the audit trail API is useless to non-technical users. Pilot customers specifically asked for this. | Med-High | Consumes existing `/api/audit/events` query endpoints. Reads from ClickHouse via control plane API. | Filters: time range, user, department, vendor, policy decision (allow/block/redact), violation type. Search by content hash or event ID. Click-through to evidence bundle detail. Pagination for large result sets (ClickHouse handles volume). Real-time updates via WebSocket or polling. Export to CSV for compliance reports. |
| TS-8 | **Compliance Reporting** | CISOs need PDF/CSV reports for board presentations, regulator inquiries, and legal teams. "Show me all AI interactions in the legal department last quarter" is a day-one request. All compliance tools (Vanta, Drata, Sprinto) generate automated reports. | Med | Aggregates data from existing ClickHouse audit tables and PostgreSQL policy/regulatory data. | Report types: Executive summary (violations by period/department), Regulatory compliance status (per framework), Department activity report, Vendor usage report, Incident detail report. PDF generation (server-side rendering with Puppeteer or react-pdf). CSV export for raw data. Scheduled reports (weekly/monthly email) are a fast-follow, not MVP. |
| TS-9 | **Real-Time Violation Statistics** | Compliance officers need a live overview of what is happening right now. Violation counts, trends, hot spots. This is the "home screen" of the dashboard. Every monitoring/governance tool has a statistics view. | Med | Queries existing ClickHouse audit data. Aggregation queries on existing event schema. | Visualizations: violations over time (line chart), violations by type (bar chart), violations by department (bar chart), violations by vendor (pie chart), top triggered policies. Time range selector (last hour, day, week, month). Auto-refresh interval. This is the first thing a CISO sees when logging in. |
| TS-10 | **Vendor Management UI** | Approve/block AI vendors, set model version allowlists. The visual interface for the existing vendor registry API. Non-technical compliance officers need this to manage which AI tools are approved. | Low-Med | Consumes existing `/api/vendors` CRUD endpoints. Direct mapping to existing schema. | List view of all vendors with status (approved/blocked/pending). Add/edit vendor dialog. Model version allowlist per vendor. Bulk import/export. Risk status indicators (red/yellow/green). Simple CRUD UI -- low complexity because the API already exists. |
| TS-11 | **Docker Compose Stack** | The law firm pilot (~80 employees) runs on a single server, not Kubernetes. Docker Compose is the standard for single-machine multi-container deployments. Without this, they cannot deploy. | Med | Packages existing services: kernel, evidence-collector, control plane API, dashboard, PostgreSQL, ClickHouse. | Single `docker-compose.yml` with all services, networking, volumes, and health checks. Environment variable configuration. One-command deploy: `docker compose up -d`. Include sample policies (EU AI Act pack pre-loaded per PILOT-01). Include onboarding documentation. Resource limits configured for ~80 user scale. |
| TS-12 | **Container Images** | All services must be containerized and published to a registry. This is the deployment primitive for both Docker Compose and Kubernetes. | Med | Multi-stage Dockerfiles for each Rust binary (kernel, evidence-collector) and each Node.js service (control plane API, dashboard). | Minimal base images (distroless or alpine). Multi-stage builds (compile in builder, copy binary to runtime). Image size targets: Rust binaries <50MB, Node.js services <200MB. Publish to GitHub Container Registry (ghcr.io). Tag with version and git SHA. Security scanning (Trivy) in CI. |
| TS-13 | **Regulatory Framework Selector UI** | Visual interface for the existing regulatory mapping engine. Pick a jurisdiction, see what policies are auto-enabled. Compliance officers need this to configure regulatory compliance without understanding individual policies. | Med | Consumes existing `/api/regulatory` endpoints. Existing 8 framework packs (EU AI Act, GDPR, NIST, PDPA, DPDP, China, Canada, GCC). | Framework selection with descriptions. Toggle individual policy mappings on/off. Show which policies are enabled by each framework. Visual display of which articles/requirements are addressed. Jurisdiction conflict detection (what happens when EU AI Act and GDPR both apply). |

## Differentiators

Features that set v1.1 apart from competitors. Not required for pilot launch, but create significant competitive advantage and demonstrate enterprise maturity.

| # | Feature | Value Proposition | Complexity | Dependencies on Existing | Notes |
|---|---------|-------------------|------------|--------------------------|-------|
| DF-1 | **Evidence Bundle Verification UI** | No competitor offers self-service cryptographic evidence verification. Auditors can independently verify hash chain integrity, check Ed25519 signatures, and view Merkle proofs through the dashboard. This is unique to Interdict and directly leverages the cryptographic evidence pipeline built in v1.0. For banks and law firms, the ability to prove evidence was not tampered with is not just nice-to-have -- it is the core value proposition. | Med-High | Reads evidence bundles from ClickHouse. Uses verification logic from existing `interdict-verify` crate. Calls existing verification endpoints or implements client-side verification. | Chain integrity visualization: green chain of bundles, red highlight on any break. Individual bundle detail: hash, previous hash, signature, verification status. Merkle tree view: expandable tree showing hourly roots and leaf bundles. S3 anchor verification: compare computed root with WORM-stored root. External auditor mode: read-only access with full verification capabilities. |
| DF-2 | **Human Review Queue UI** | The Layer 3 human review queue exists in the kernel but has no interface. Compliance officers need a queue of escalated AI interactions to review, with context, approve/reject buttons, and feedback that improves policy. This workflow pattern (green/amber/red lanes with SLA-based escalation) is proven in compliance tooling. No competitor in the AI governance space has a true human-in-the-loop review interface. | High | Consumes Layer 3 queue from kernel. Requires new API endpoints for queue management (list pending, approve, reject, reassign). WebSocket for real-time queue updates. | Queue view with priority sorting. Escalation SLA timers (configurable per policy: 15min for critical, 4hr for standard). Full context display: the prompt, the policy that triggered escalation, the detection confidence score, relevant session history. Approve/reject with mandatory reasoning. Reject feedback feeds back into policy refinement. Role-restricted: only Compliance Officers and Super Admins. |
| DF-3 | **Department-Level Policy Management UI** | Visual configuration of per-department policy overrides with inheritance display. Interdict already supports the backend (organization defaults -> department overrides -> team overrides), but there is no UI. This is a differentiator because most competitors apply policies organization-wide. | Med | Consumes existing department/team hierarchy from PostgreSQL. Extends existing policy API with department scope parameters. | Tree view of department hierarchy. Click department to see: inherited policies (from org default), overridden policies (department-specific), effective policy set (merged). Drag-and-drop or toggle to override/inherit specific policies. Visual diff between org default and department override. Department Managers can only see/modify their own department (enforced by RBAC). |
| DF-4 | **Anomaly Detection Views** | Proactive detection of unusual AI usage patterns goes beyond reactive policy enforcement. Volume anomalies (sudden spike in API calls), time-based anomalies (3 AM usage from finance department), pattern anomalies (user suddenly querying legal topics when they are in engineering). ClickHouse time-series capabilities make this computationally feasible. Most competitors offer monitoring but not anomaly detection. | High | Runs aggregate queries on existing ClickHouse audit data. Anomaly detection logic is server-side (statistical baselines, moving averages, standard deviation thresholds). | Anomaly types: volume spikes (>2 sigma from rolling average), off-hours usage (configurable per department), vendor switching (user suddenly using new AI vendor), topic drift (user's prompt categories change significantly), velocity anomalies (too many requests per minute from single user). Alert configuration: which anomaly types trigger notifications, severity thresholds. Dashboard visualization: timeline with anomaly markers, drill-down to individual events. |
| DF-5 | **Kubernetes Helm Chart** | While Docker Compose serves the law firm pilot, the bank pilot and any larger enterprise will require Kubernetes deployment. A production-quality Helm chart with configurable resource limits, RBAC, and health probes demonstrates enterprise readiness. Replicated's research shows Helm is the standard for enterprise K8s software distribution. | High | Packages same services as Docker Compose but with K8s-native configurations: Deployments, Services, ConfigMaps, Secrets, PersistentVolumeClaims, NetworkPolicies. | Subchart structure: kernel, evidence-collector, control-plane, dashboard, dependencies (PostgreSQL, ClickHouse). Configurable `values.yaml` with documentation. Resource limits per component. Health/readiness probes. NetworkPolicy for component isolation. Optional Ingress configuration. Optional service mesh integration (Istio mTLS as alternative to manual mTLS). Private registry support for air-gapped environments. |
| DF-6 | **Sidecar Deployment Manifest** | Kernel running as a sidecar container in the same pod as the company's AI application is the cleanest deployment model for Kubernetes. Traffic interception happens at the pod level without network-wide changes. This is Interdict's intended deployment model and a key architectural advantage over SaaS competitors. | Med | Kernel container image from TS-12. Sidecar YAML with init container for iptables rules or Istio traffic capture. | Sidecar YAML manifest: kernel container spec, resource limits, volume mounts for policy cache, init container for traffic redirection. Documentation for integrating with existing pods. iptables-based traffic capture for explicit proxy mode. Supports both sidecar injection and manual pod modification. |
| DF-7 | **CA Certificate Onboarding Script** | For explicit proxy mode, client machines need to trust Interdict's CA certificate for TLS interception. An automated onboarding script reduces deployment friction from "multi-day IT ticket" to "10-minute setup." This is a deployment differentiator -- competitors that require manual cert installation lose deals over deployment complexity. | Low | Uses CA cert generated during deployment setup (TS-4 mTLS). Script distributes cert to client machines. | Platform-specific scripts: macOS (`security add-trusted-cert`), Windows (certutil), Linux (update-ca-certificates). Group Policy template for Windows domain environments. MDM profile for macOS (Jamf, Mosyle). Verification command to confirm cert is trusted. Rollback script to remove cert. |

## Anti-Features

Features to explicitly NOT build in v1.1. These are tempting but would either delay the pilot, compromise architecture, or misalign with the product.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| AF-1 | **OIDC Support in v1.1** | OIDC adds a second authentication protocol alongside SAML. The pilot targets (law firm, bank) use SAML-based IdPs (AD/ADFS, Okta SAML). Adding OIDC doubles the auth surface area and testing matrix. Ship SAML first, OIDC in v1.2. | SAML 2.0 only for v1.1. Track OIDC as v2 requirement (already listed as IDENT-01). |
| AF-2 | **SCIM User Provisioning** | Automated user provisioning/deprovisioning from IdP is valuable but not pilot-critical. For 80 users, manual user management is acceptable. SCIM adds significant complexity (webhook receivers, conflict resolution, directory sync). | Manual user creation via API/dashboard. SAML auto-creates user on first login (JIT provisioning). SCIM is v2. |
| AF-3 | **Custom Dashboard Widgets** | Drag-and-drop dashboard customization sounds appealing but adds massive frontend complexity (widget framework, layout persistence, per-user state). Pilot users need a working dashboard, not a customizable one. | Ship a well-designed fixed layout. Iterate based on pilot feedback. Custom layouts are a v3 feature at earliest. |
| AF-4 | **AI-Powered Policy Suggestions** | Using ML/LLM to suggest policies based on usage patterns is interesting but violates the "no LLM in enforcement path" principle and adds unreliable, non-deterministic behavior to governance configuration. | Manual policy creation via builder UI. Pre-built regulatory framework packs cover 80% of needs. Policy templates for common use cases. |
| AF-5 | **Kubernetes Operator** | A custom K8s operator for automated kernel lifecycle management (auto-scaling, rolling upgrades, health monitoring) is enterprise-grade but overkill for pilot. Helm chart + standard K8s primitives suffice. An operator is 2-4 weeks of additional work. | Helm chart with standard Deployment/StatefulSet. K8s operator is v2 feature for fleet management at scale. |
| AF-6 | **Multi-Tenant Dashboard** | Supporting multiple isolated organizations in a single dashboard deployment adds schema complexity, data isolation concerns, and auth complexity. Both pilot targets are single-tenant. | Single-tenant deployment per customer. Multi-tenancy is an MSP/reseller feature for v3+. |
| AF-7 | **Real-Time Streaming Dashboard** | WebSocket-based real-time event streaming to the dashboard (showing AI interactions as they happen) is visually impressive but creates performance problems at scale, adds frontend complexity, and is not what compliance officers actually need (they need historical analysis and reporting). | Poll-based refresh (30s-60s intervals). WebSocket only for human review queue notifications (time-sensitive). Compliance officers analyze trends, not individual live events. |
| AF-8 | **Terraform Provider** | A Terraform provider for infrastructure-as-code deployment of Interdict is a nice-to-have for DevOps teams but premature when the product has two pilot customers. Build when there are 10+ deployments and patterns stabilize. | Docker Compose + Helm chart. CLI tool for configuration management. Terraform provider is v2+. |
| AF-9 | **Embedded BI / Data Exploration** | Integrating a full BI tool (Metabase, Grafana, etc.) into the dashboard for ad-hoc querying provides flexibility but adds dependency complexity, security surface, and maintenance burden. | Fixed report templates cover pilot needs. ClickHouse native SQL access for power users. Grafana integration guide for customers who want custom dashboards (but not embedded). |
| AF-10 | **Dark Mode** | Cosmetic feature that doubles CSS/theme maintenance. Ship one polished light theme. | Single light theme with clean enterprise design. Dark mode in v2 if customers request it. |

## Feature Dependencies (v1.1 Scope)

```
TS-2 (API Key Auth) -> TS-3 (RBAC)
  API keys need role association. API key auth unblocks RBAC testing.

TS-1 (SAML SSO) -> TS-3 (RBAC)
  SSO provides identity; RBAC uses identity to enforce permissions.
  But RBAC can work with API key auth alone for initial testing.

TS-3 (RBAC) -> TS-6 (Policy Builder UI)
  Builder must respect RBAC (only Policy Admin and Super Admin can create policies).

TS-3 (RBAC) -> TS-7 (Audit Trail Dashboard)
  Dashboard shows role-appropriate data (Dept Managers see only their department).

TS-3 (RBAC) -> DF-2 (Human Review Queue)
  Queue is role-restricted (Compliance Officers and Super Admins only).

TS-3 (RBAC) -> DF-3 (Department Policy Management)
  Department Managers scoped to their department only.

TS-7 (Audit Trail Dashboard) -> TS-8 (Compliance Reporting)
  Reports consume same data views as the audit trail dashboard.

TS-7 (Audit Trail Dashboard) -> TS-9 (Violation Statistics)
  Stats are aggregations of the same audit data.

TS-9 (Violation Statistics) -> DF-4 (Anomaly Detection)
  Anomaly detection builds on statistical baselines from violation statistics.

TS-12 (Container Images) -> TS-11 (Docker Compose)
  Compose references container images.

TS-12 (Container Images) -> DF-5 (Helm Chart)
  Helm chart references same container images.

TS-12 (Container Images) -> DF-6 (Sidecar Manifest)
  Sidecar manifest references kernel container image.

TS-4 (mTLS) -> DF-7 (CA Cert Onboarding)
  CA cert onboarding uses the deployment CA generated for mTLS.

TS-5 (Key Rotation) -- standalone
  Extends existing evidence-collector signing; no v1.1 dependencies.

TS-10 (Vendor Management UI) -- low dependency
  Direct CRUD wrapper around existing vendor API.

TS-13 (Regulatory Selector UI) -- low dependency
  Direct wrapper around existing regulatory API.

DF-1 (Evidence Verification UI) -- low dependency
  Reads existing evidence bundles; uses existing interdict-verify logic.
```

**Critical path for pilot deployment:**
```
TS-2 (API Key Auth)
  -> TS-3 (RBAC)
    -> TS-6 (Policy Builder) + TS-7 (Audit Trail) + TS-9 (Stats)
      -> TS-8 (Compliance Reports)

TS-12 (Container Images)
  -> TS-11 (Docker Compose)

TS-1 (SAML SSO) -- parallel with above, not blocking
TS-4 (mTLS) -- parallel, not blocking dashboard work
TS-5 (Key Rotation) -- parallel, not blocking dashboard work
```

## Feature Complexity Assessment

| Feature | Frontend | Backend | Infra | Total | Risk |
|---------|----------|---------|-------|-------|------|
| TS-1 SAML SSO | Low | High (XML signature verification, IdP metadata) | Low | **High** | SAML XML parsing has many CVEs. Use proven library. |
| TS-2 API Key Auth | None | Low (hash, store, validate) | None | **Low** | Straightforward. Ship first. |
| TS-3 RBAC | Low (UI restrictions) | Med (middleware on every route) | None | **Med** | Retrofit to all existing endpoints is the tedious part. |
| TS-4 mTLS | None | Med (cert generation, TLS config) | Med (per-deployment CA) | **Med** | Self-signed CA management. Helper scripts needed. |
| TS-5 Key Rotation | None | Med (versioned keys, verification compat) | Low | **Med** | Must not break verification of old evidence. |
| TS-6 Policy Builder | High (complex form UX) | Low (maps to existing API) | None | **High** | The Rego generation from UI inputs is the hard part. |
| TS-7 Audit Trail | High (table, filters, search, pagination) | Low (existing API) | None | **Med-High** | Large data volume handling in frontend. Pagination critical. |
| TS-8 Compliance Reports | Med (report templates) | Med (aggregation queries, PDF gen) | None | **Med** | PDF generation adds dependency. Server-side rendering. |
| TS-9 Violation Stats | High (charts, visualizations) | Low (ClickHouse aggregations) | None | **Med** | Charting library selection matters. Recharts or similar. |
| TS-10 Vendor Mgmt UI | Low (simple CRUD) | None (existing API) | None | **Low** | Simplest dashboard feature. |
| TS-11 Docker Compose | None | None | Med (multi-service orchestration) | **Med** | Networking, volume management, health checks. |
| TS-12 Container Images | None | None | Med (multi-stage Dockerfiles, CI) | **Med** | Rust cross-compilation. Image size optimization. |
| TS-13 Regulatory Selector | Med (framework display) | None (existing API) | None | **Low-Med** | Visual complexity in showing framework relationships. |
| DF-1 Evidence Verification | High (tree visualization, chain display) | Low (existing verify logic) | None | **Med-High** | Unique UI with no standard component library equivalent. |
| DF-2 Human Review Queue | High (queue, timers, context) | Med (new queue mgmt API) | None | **High** | Real-time updates, SLA timers, role restrictions. |
| DF-3 Dept Policy Mgmt | Med (tree view, inheritance) | Low (extends existing) | None | **Med** | Inheritance visualization is the challenge. |
| DF-4 Anomaly Detection | High (timeline, anomaly markers) | High (statistical baselines) | None | **High** | Requires building anomaly detection logic from scratch. |
| DF-5 Helm Chart | None | None | High (subchart structure, values) | **High** | Enterprise Helm charts require extensive testing. |
| DF-6 Sidecar Manifest | None | None | Med (iptables, traffic capture) | **Med** | Traffic redirection complexity varies by K8s version. |
| DF-7 CA Cert Onboarding | None | None | Low (shell scripts) | **Low** | Cross-platform script testing. |

## MVP Recommendation (Pilot-Ready Minimum)

**Must ship for law firm pilot (Docker Compose deployment):**

1. **TS-2 API Key Auth** -- unblocks everything, lowest complexity
2. **TS-3 RBAC** -- required for any multi-user access
3. **TS-12 Container Images** -- prerequisite for deployment
4. **TS-11 Docker Compose** -- the deployment mechanism
5. **TS-7 Audit Trail Dashboard** -- the #1 compliance officer feature
6. **TS-9 Violation Statistics** -- the dashboard home screen
7. **TS-6 Policy Builder UI** -- how non-technical users create rules
8. **TS-10 Vendor Management UI** -- simple but immediately valuable
9. **TS-13 Regulatory Selector UI** -- enables "turn on EU AI Act"
10. **TS-8 Compliance Reporting** -- PDF/CSV for regulators

**Must ship for bank pilot (adds security hardening):**

11. **TS-1 SAML SSO** -- bank will require enterprise SSO
12. **TS-4 mTLS** -- bank will require encrypted internal comms
13. **TS-5 Key Rotation** -- bank will require key management
14. **DF-5 Helm Chart** -- bank likely runs Kubernetes

**Defer to post-pilot iteration:**

- **DF-1 Evidence Verification UI** -- high value but not blocking pilot launch
- **DF-2 Human Review Queue UI** -- Layer 3 escalation can be API-only initially
- **DF-3 Dept Policy Management UI** -- 80-person law firm has limited department structure
- **DF-4 Anomaly Detection** -- valuable but complex; ship after baseline data exists
- **DF-6 Sidecar Manifest** -- Docker Compose serves pilot; sidecar is K8s-only
- **DF-7 CA Cert Onboarding** -- manual cert install works for 80 users

## Competitive Positioning for v1.1

| Feature Area | Interdict v1.1 | CalypsoAI/F5 | Lasso | Credo AI | Microsoft Purview |
|-------------|----------------|--------------|-------|----------|-------------------|
| SSO/RBAC | SAML + 5 roles | SSO + RBAC | SSO + RBAC | SSO + RBAC | Azure AD native |
| Policy Builder | Visual form -> Rego/Wasm | Custom scanners | Dynamic rules | Policy workflows | JSON rules |
| Audit Dashboard | Searchable + crypto verification | Dashboard | Dashboard | Dashboard | Purview portal |
| Compliance Reports | PDF/CSV automated | Reports | Reports | Audit-ready reports | Built-in |
| Deployment | Docker Compose + Helm + sidecar | Cloud + on-prem | Cloud-first | Cloud | Cloud-only |
| Evidence Integrity | Ed25519 + Merkle + S3 WORM | "Immutable" logs | Basic logging | Basic logging | Microsoft logging |
| Human Review | Queue UI with SLA | None | None | Workflow-based | None |
| Anomaly Detection | Statistical baselines on ClickHouse | Limited | Limited | None | Azure ML |
| VPC-native | Yes (core design) | Optional | No | No | No |

**Key v1.1 differentiators vs competitors:**
1. Evidence verification UI (no competitor has this)
2. Human review queue with SLA-based escalation (unique in AI governance)
3. VPC-native Docker Compose + Helm deployment (CalypsoAI is cloud-first, Purview is cloud-only)
4. Visual policy builder that compiles to Wasm (fastest policy execution in the market)

## Sources

- [10 Best AI Governance Platforms for Enterprise Teams in 2026 (Superblocks)](https://www.superblocks.com/blog/ai-governance-platform) -- HIGH confidence
- [Top 10 AI Security Tools for Enterprises in 2026 (Reco)](https://www.reco.ai/compare/ai-security-tools-for-enterprises) -- HIGH confidence
- [Enterprise AI Security & Governance Roadmap 2026 CISO Strategy (InfoSecToday)](https://www.infosectoday.io/enterprise-ai-security-governance-roadmap-2026-ciso-strategy/) -- MEDIUM confidence
- [6 SSO Best Practices in 2026 (Zluri)](https://www.zluri.com/blog/sso-best-practices) -- MEDIUM confidence
- [What is Enterprise Identity -- SSO & RBAC (Security Boulevard)](https://securityboulevard.com/2026/01/what-is-enterprise-identity-and-why-most-companies-get-sso-rbac-catastrophically-wrong/) -- MEDIUM confidence
- [Top RBAC Providers for Multi-Tenant SaaS 2025 (WorkOS)](https://workos.com/blog/top-rbac-providers-for-multi-tenant-saas-2025) -- MEDIUM confidence
- [Human-in-the-Loop AI Review Queues: Workflow Patterns That Scale 2025 (AllDaysTech)](https://alldaystech.com/guides/artificial-intelligence/human-in-the-loop-ai-review-queue-workflows) -- MEDIUM confidence
- [Designing Human Checkpoints in HITL Workflows (Moxo)](https://www.moxo.com/blog/designing-human-checkpoints-in-hitl-workflow) -- MEDIUM confidence
- [Securing Microservices Communication with mTLS in Kubernetes (The New Stack)](https://thenewstack.io/securing-microservices-communication-with-mtls-in-kubernetes/) -- HIGH confidence
- [Enterprise Helm Chart Best Practices for ISVs (Replicated)](https://www.replicated.com/enterprise-helm) -- HIGH confidence
- [Lasso Security -- Enterprise AI Security Predictions 2026](https://www.lasso.security/blog/enterprise-ai-security-predictions-2026) -- HIGH confidence
- [CalypsoAI Model Leaderboard](https://calypsoai.com/calypsoai-model-leaderboard/) -- HIGH confidence
- [SAML SSO in Next.js: Step-by-Step Guide (ITNEXT)](https://itnext.io/saml-sso-in-next-js-a-step-by-step-guide-for-okta-google-microsoft-entra-dbdd215b98d3) -- MEDIUM confidence
- [BoxyHQ SAML-Jackson for Next.js (BoxyHQ)](https://boxyhq.com/guides/jackson/frameworks/nextjs) -- HIGH confidence (official guide)
- [Best Compliance Automation Software 2026 (Cynomi)](https://cynomi.com/learn/compliance-automation-tools/) -- MEDIUM confidence
- [Dashboard Design UX Patterns (Pencil & Paper)](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards) -- MEDIUM confidence
- [Cryptographic Evidence Structures for Regulated AI Workflows (arXiv)](https://arxiv.org/pdf/2511.17118) -- HIGH confidence
