# Project Research Summary

**Project:** Interdict.io v1.1 — Pilot Ready (Identity, Dashboard, Deployment)
**Domain:** AI Governance Platform — enterprise identity layer, compliance dashboard, and deployment packaging on top of a complete v1.0 Rust kernel
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

Interdict v1.1 is an enterprise readiness milestone, not a new product. The v1.0 data plane — Rust kernel with 3-layer policy enforcement, cryptographic evidence pipeline, gRPC policy distribution, ClickHouse audit storage — is complete and unchanged. v1.1 adds the three layers that convert a working technical system into a product enterprises can actually procure: identity (SAML 2.0 SSO + 5-role RBAC + mTLS between all internal services), a compliance dashboard (10 views in Next.js 16 with shadcn/ui + TanStack Query), and deployment packaging (Docker Compose for the law firm pilot, Helm chart for the bank pilot). The recommended approach is to treat identity as the first phase because every dashboard route and every deployment artifact depends on having auth in place. The critical path is: API Key Auth → RBAC → Container Images → Docker Compose → Dashboard Core Views → SAML SSO → mTLS + Key Rotation → Helm Chart.

The architecture is additive. The Rust hot path does not change. New TypeScript modules are registered on the existing Elysia API chain; the new Next.js dashboard calls the Elysia API as a Backend-for-Frontend client. The Rust codebase changes only in two places: the gRPC channels gain mTLS TLS configuration (adding `ClientTlsConfig`/`ServerTlsConfig` to existing tonic code), and the evidence-collector signing module gains versioned key-ID tracking. Every other new component — SAML module, RBAC middleware, key rotation service, dashboard, Docker Compose, Helm chart — is net-new TypeScript or YAML on top of the existing foundation.

The most dangerous risks for v1.1 are SAML implementation errors (signature wrapping attacks that allow identity claim tampering), retrofitting authentication onto an existing unauthenticated API that has internal service callers that will break simultaneously, and mTLS certificate bootstrapping without an automated pre-deploy cert-generation step. All three risks are well-understood and preventable with design-before-code discipline. The evidence-chain key rotation design is a fourth high-stakes item: the `signing_key_id` field in the `EvidenceBundle` proto currently ships as `String::new()` in v1.0, and any rotation implementation must backfill this definition or define the empty value as "key v1" before rotation can be safely tested.

## Key Findings

### Recommended Stack

The v1.0 stack (Rust kernel, Bun + Elysia API, PostgreSQL, ClickHouse, gRPC, Wasmtime, Regorus, ed25519-dalek, rustls) is completely unchanged. v1.1 adds a small, focused set of libraries to the control plane and introduces the dashboard as a new application. The most critical addition is `samlify ^2.10.2` — the minimum version is non-negotiable because 2.10.0 patches CVE-2025-47949 (signature wrapping attack). The dashboard is built as a separate Next.js 16 application consuming the Elysia API, with shadcn/ui + TanStack Query + TanStack Table as the primary UI stack.

**Control plane additions:**
- `samlify ^2.10.2`: SAML 2.0 SP implementation — framework-agnostic, actively maintained, CVE-patched; Bun runtime compatibility is MEDIUM confidence and must be validated before committing
- `@elysiajs/bearer`: RFC6750 bearer token extraction for API key auth fallback path
- `@elysiajs/cors`: CORS headers for cross-origin dashboard calls
- `drizzle-orm pgPolicy` (existing, extended): declarative RLS for multi-tenant department isolation
- `rustls WebPkiClientVerifier` (existing, configured): mTLS server-side client cert verification with `WebPkiClientVerifier::builder()`
- `rcgen` (existing, extended): internal CA + per-service cert generation at deploy time

**Dashboard (new application):**
- `Next.js 16.1.x + React 19 + TypeScript 5.7+`: dashboard framework with Turbopack stable and React Compiler auto-memoization
- `shadcn/ui + Tailwind CSS 4.2.x`: single unified design system; includes Chart (Recharts), DataTable, Sidebar patterns; no vendor lock-in
- `@tanstack/react-query ^5.90.x + @tanstack/react-table ^8.21.x`: server state management and tabular data with server-side pagination/sorting
- `react-hook-form ^7.71.x + @hookform/resolvers ^5.2.x + zod ^3.24.x`: policy builder form management with type-safe validation
- `zustand`: minimal client UI state (sidebar collapse, filters, theme)

**Deployment additions:**
- Docker multi-stage builds: `debian:bookworm-slim` for Rust images (NOT Alpine — musl breaks jemalloc and aws-lc-rs), `oven/bun:1.3-slim` for control plane, `node:22-slim` for Next.js standalone output
- Helm 3 umbrella chart with per-service subcharts and `values-pilot.yaml` / `values-enterprise.yaml` environment splits
- Kubernetes native sidecars (stable since K8s 1.33, April 2025): kernel as `initContainer` with `restartPolicy: Always`

**What to explicitly not add:** NextAuth.js, Passport.js, CASL/casbin, Socket.IO/WebSocket for dashboard alerts, Redis, cert-manager bundled into Helm, AG Grid, D3.js, Tremor (second component library). Each adds complexity without value for the fixed 5-role, single-tenant, server-push-only dashboard use case.

### Expected Features

**Must have for law firm pilot (Docker Compose, 80 users):**
- TS-2: API Key Auth — lowest complexity, unblocks all internal service callers before auth middleware is enabled; ship first
- TS-3: 5-Role RBAC — Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor as a PostgreSQL enum + Elysia middleware; two-layer enforcement (route guard + data filter)
- TS-12: Container Images — multi-stage Dockerfiles for all 4 services; <50MB Rust images, <150MB dashboard image
- TS-11: Docker Compose Stack — one-command pilot deploy with health checks, named volumes, and pre-deploy cert generation script
- TS-7: Audit Trail Dashboard — searchable/filterable ClickHouse queries with mandatory time bounds and server-side pagination (the #1 compliance officer feature)
- TS-9: Violation Statistics — home screen with Recharts area/bar/pie charts, auto-refresh, role-appropriate data scope
- TS-6: Policy Builder UI — visual form → Rego/Wasm compiler; valid Rego generation from UI inputs is the hard part
- TS-10: Vendor Management UI — simple CRUD wrapper on existing vendor API
- TS-13: Regulatory Framework Selector — visual toggle for the 8 existing framework packs
- TS-8: Compliance Reporting — PDF/CSV output, server-side aggregation, <10s for 30-day range

**Must add for bank pilot (hardens security):**
- TS-1: SAML 2.0 SSO — bank requires enterprise IdP integration with Okta/Azure AD
- TS-4: mTLS Between Components — SOC 2 / ISO 27001 requirement for all internal gRPC channels
- TS-5: Key Rotation for Evidence Signing — documented key management procedures with PENDING/ACTIVE/DRAINING/RETIRED lifecycle
- DF-5: Helm Chart — bank runs Kubernetes

**Should have (competitive differentiators, high value):**
- DF-1: Evidence Bundle Verification UI — no competitor offers self-service cryptographic verification; directly exposes Interdict's core technical advantage
- DF-2: Human Review Queue UI — Layer 3 escalation with SLA timers; unique in AI governance market
- DF-3: Department-Level Policy Management UI — policy inheritance visualization
- DF-4: Anomaly Detection Views — statistical baselines on ClickHouse time-series data

**Defer to v1.2+ (explicitly not in v1.1 scope):**
- OIDC support (SAML first, OIDC fast-follow — both pilot targets use SAML-based IdPs)
- SCIM user provisioning (80 users = manual user management is acceptable)
- Custom dashboard widgets, dark mode, real-time streaming dashboard
- Kubernetes Operator / Terraform provider
- Multi-tenant dashboard (both pilots are single-tenant)

**Critical dependency chain:** TS-2 (API keys) → TS-3 (RBAC) → all dashboard views. TS-12 (images) → TS-11 (Compose) → DF-5 (Helm). TS-4 (mTLS) → DF-7 (CA onboarding). TS-1 (SAML) and TS-4/TS-5 are parallel to dashboard work and not blocking law firm pilot.

### Architecture Approach

The v1.1 architecture is layered on top of the unchanged v1.0 system. The Rust data plane (kernel + evidence collector) is touched only to add mTLS TLS configuration to existing gRPC channels and to activate the already-present `signing_key_id` field in evidence bundles. All net-new functionality lives in TypeScript: the Elysia API gains an auth module (SAML, API keys, RBAC middleware), a key rotation service, and new PostgreSQL schema tables (`sessions`, `api_keys`, `signing_keys`); the dashboard is a new Next.js 16 application using the Backend-for-Frontend pattern against the Elysia API. Deployability stays cloud-agnostic: Docker Compose for small pilots, Helm for K8s enterprises, with a shared `env.example` file as the single source of truth for all configuration variable names.

**Major components and responsibilities:**

1. **SAML/Auth Module** (`control-plane/src/modules/auth/`) — SAML 2.0 SP-initiated flow via samlify, API key generation/validation/revocation, JWT session creation with role claims, three-plane auth design: browser sessions, API keys (programmatic), mTLS client certs (service-to-service)
2. **RBAC Middleware** (`control-plane/src/modules/auth/rbac.ts`) — two-layer enforcement: route guard (can this role access this endpoint at all?) + data filter (`scopeQuery(user)` utility injected into all Drizzle and ClickHouse queries to add `WHERE department_id = ?` for scoped roles)
3. **Key Rotation Service** (`control-plane/src/modules/crypto/`) — PENDING → ACTIVE → DRAINING → RETIRED key lifecycle; all public keys stored in PostgreSQL `signing_keys` table, rows never deleted; private keys in environment/KMS only; rotation state pushed to kernel fleet via gRPC
4. **Next.js Dashboard** (`dashboard/`) — 10 views served via App Router; Next.js server components for SSR with session cookie, client components via TanStack Query for interactive state; Next.js API routes as BFF proxy for client-side calls to Elysia API
5. **Docker Compose Stack** (`deploy/docker-compose/`) — 6 containers (kernel, control-plane, dashboard, evidence-collector, postgres, clickhouse) with `healthcheck` on every service, `depends_on: condition: service_healthy` for startup ordering, named volumes for data persistence, pre-deploy `gen-internal-certs.sh` script
6. **Helm Chart** (`deploy/helm/interdict/`) — umbrella chart with subcharts per service; `global.mtls.enabled` and `global.saml.enabled` toggles; ExternalSecret CRD refs for all credentials, never embedded in values.yaml; K8s 1.33+ native sidecar with pre-1.33 fallback manifest

### Critical Pitfalls

1. **Retrofitting auth breaks all existing internal callers** — The Elysia API is currently fully unauthenticated. Adding SAML/RBAC middleware simultaneously 401s the gRPC distribution server, compilation worker, seed scripts, and integration tests. Prevention: design three auth planes (browser session, API key, mTLS service account) before writing any auth code; create service account API keys for all internal callers first; update all integration tests to use API key auth before enabling middleware; never bypass auth by URL pattern.

2. **SAML signature wrapping attacks** — Validating only the Response envelope signature while not validating the inner Assertion signature allows attackers to modify role and email claims with no detectable tampering. Prevention: use samlify (which validates both); pin expected `Issuer` and `Audience` server-side; validate `InResponseTo` to prevent replay; set clock skew tolerance to 5 minutes maximum; test with both Okta and Azure AD; never ship with signature validation disabled.

3. **RBAC at route level but not data level** — A Department Manager that passes the route guard reads all departments' audit data from ClickHouse if `WHERE department_id = ?` is absent from queries. Prevention: implement `scopeQuery(user)` utility that all Drizzle and ClickHouse queries pass through; add cross-department isolation integration tests proving two Department Managers with different departments see different data.

4. **mTLS certificate bootstrap deadlock** — On a fresh deploy, every service needs a valid cert to reach every other service, but no cert-provisioning step exists yet. Prevention: run `gen-internal-certs.sh` as a pre-deploy step before any service starts; in Docker Compose use `healthcheck` + entrypoint script that waits for cert files; in Helm use a pre-install Job; design kernel gRPC client with `INTERDICT_MTLS_ENABLED=false` development mode that logs CRITICAL warning if mTLS is not active after a configurable grace period.

5. **Key rotation breaks evidence chain verification** — `signing_key_id: String::new()` in existing v1.0 `EvidenceBundle` protos means old bundles have no key reference. Implementing rotation without resolving this makes all historical bundles unverifiable, destroying the core value proposition. Prevention: define empty `signing_key_id` as canonical "key-v1" in the key registry before any rotation code ships; hash chain must continue unbroken across rotations (no chain reset); verify a pre-rotation bundle with a post-rotation system as the acceptance test.

6. **Dashboard polling kills ClickHouse under multi-user load** — 5 concurrent admins with 3 tabs each at 5s polling intervals = ~3 complex analytical queries/second competing with evidence ingestion. Prevention: implement server-side query cache in Elysia API with 15-30s TTL; create ClickHouse materialized views (`mv_violations_hourly`, `mv_vendor_stats_daily`, `mv_anomaly_metrics`) before dashboard goes live; enforce mandatory time-bound parameters (`from`/`to`) on all audit API calls.

7. **Docker Compose restart cascade failures** — Restarting any single container (PostgreSQL, control plane, evidence collector) causes cascading 401s, evidence drops, or kernel fail-closed events that block all AI traffic at the pilot. Prevention: `healthcheck` on every service; `restart: unless-stopped`; kernel disconnect behavior must distinguish brief restart (keep last policy) from extended outage (fail-closed); evidence buffer must replay missed events on reconnection, never permanently drop.

8. **Helm/Docker Compose config drift** — Features added during Docker Compose development never land in Helm `values.yaml`, creating two products with different behavior. Prevention: `env.example` as single source of truth for all configuration variable names; CI must test both deployment paths on every PR touching config.

## Implications for Roadmap

### Phase 1: Identity Foundation

**Rationale:** Auth is the dependency of everything else. RBAC must be in place before any dashboard route can be secured. API key auth is the lowest-complexity auth mechanism and unblocks all internal service callers. Ship this before touching any UI or deployment packaging. This phase also locks in the three-plane auth design (browser sessions, API keys, mTLS) so the later SAML and mTLS phases slot in cleanly without breaking existing callers.
**Delivers:** API key auth (TS-2), 5-role RBAC middleware with both route guard and data-filter layers (TS-3), PostgreSQL schema additions (`sessions`, `api_keys`, `signing_keys`), service account keys for all existing internal callers, integration tests updated for authenticated API
**Addresses:** TS-2, TS-3
**Avoids:** Pitfall 1 (auth breaks callers), Pitfall 3 (route-only RBAC without data scoping)
**Research flag:** Standard patterns. Elysia middleware, SHA-256 hashed API keys, JWT session tokens, Drizzle schema additions are all well-documented. No phase research needed.

### Phase 2: Container Images and Docker Compose

**Rationale:** The law firm pilot needs a one-command deploy. Container images are a prerequisite for Docker Compose, which is a prerequisite for any end-to-end integration testing. Building this in parallel with or immediately after Phase 1 — before UI work begins — means the full stack can be smoke-tested throughout dashboard development rather than only at the end. The shared `env.example` config source of truth must be established here to prevent Helm drift later.
**Delivers:** Multi-stage Dockerfiles for all 4 services targeting debian-slim (TS-12), Docker Compose stack with `healthcheck` and named volumes (TS-11), pre-deploy CA cert generation script, `env.example` config source of truth, CI pipeline that tests Docker Compose smoke test on every PR
**Addresses:** TS-11, TS-12
**Avoids:** Pitfall 7 (Docker Compose restart cascade), Pitfall 8 (config drift begins here)
**Research flag:** Standard patterns. debian-slim vs Alpine decision is already resolved (musl incompatibility with jemalloc/aws-lc-rs). No phase research needed.

### Phase 3: Dashboard Core Views

**Rationale:** The compliance officer needs a working dashboard for the law firm pilot. The backend APIs for all 8 core views already exist in v1.0. This phase is primarily frontend engineering: wiring Next.js to existing Elysia endpoints with RBAC-aware sessions from Phase 1. The most complex view is the Policy Builder (valid Rego generation from UI inputs is non-trivial); the simplest are Vendor Management and Regulatory Selector (pure CRUD wrappers). The ClickHouse materialized views and server-side query cache must be implemented in this phase before the dashboard goes live to avoid Pitfall 6.
**Delivers:** Next.js 16 dashboard application with 8 core views: Audit Trail (TS-7), Violation Statistics (TS-9), Policy Builder (TS-6), Vendor Management (TS-10), Regulatory Selector (TS-13), Compliance Reporting (TS-8), dashboard login/session flow, server-side query cache in Elysia API, ClickHouse materialized views
**Addresses:** TS-6, TS-7, TS-8, TS-9, TS-10, TS-13
**Avoids:** Pitfall 6 (ClickHouse polling overload — materialized views and server-side cache required before go-live); UX pitfall of empty states with no guidance on fresh deployment
**Research flag:** shadcn/ui + TanStack Query patterns are well-documented. The Policy Builder Rego generation from visual inputs is the one non-standard piece — consider a focused spike on the generation logic and safety constraints before implementing.

### Phase 4: SAML SSO and Security Hardening

**Rationale:** The bank pilot requires enterprise SSO. SAML is deliberately deferred from Phase 1 because it is the highest-risk identity feature (XML signature attacks, IdP-specific quirks) and is not blocking the law firm pilot. By Phase 4, the auth middleware skeleton from Phase 1 is already in place; SAML slots in as an additional credential provider. mTLS and key rotation are grouped here because they share the same PKI infrastructure (internal CA from rcgen).
**Delivers:** SAML 2.0 SSO via samlify with Okta and Azure AD validation (TS-1), mTLS on all internal gRPC channels with automated cert provisioning (TS-4), Ed25519 key rotation with PENDING/ACTIVE/DRAINING/RETIRED lifecycle and `signing_key_id` backfill (TS-5)
**Addresses:** TS-1, TS-4, TS-5
**Avoids:** Pitfall 2 (SAML signature wrapping), Pitfall 4 (mTLS bootstrap deadlock), Pitfall 5 (key rotation breaks evidence chain)
**Research flag:** NEEDS PHASE RESEARCH. samlify on Bun runtime (xml-crypto dependencies) is MEDIUM confidence — must be tested in isolation before committing. mTLS cert bootstrap automation in Docker Compose entrypoint also benefits from a targeted spike. SAML metadata exchange quirks with Okta and Azure AD require test tenant validation.

### Phase 5: Advanced Dashboard Views

**Rationale:** These views (Evidence Verification UI, Human Review Queue, Department Policy Management, Anomaly Detection) are competitive differentiators that make Interdict unique. They depend on the RBAC scoping from Phase 1 and the core dashboard infrastructure from Phase 3. They are deferred because they require new backend API endpoints and more complex frontend logic (SLA timers, tree visualizations, statistical baselines). Anomaly detection also requires ClickHouse pre-computed materialized views.
**Delivers:** Evidence Bundle Verification UI with hash chain visualization (DF-1), Human Review Queue with configurable SLA timers and mandatory reasoning for rejection (DF-2), Department Policy Management with inheritance tree view (DF-3), Anomaly Detection Views with statistical baselines (DF-4)
**Addresses:** DF-1, DF-2, DF-3, DF-4
**Avoids:** Pitfall 6 (anomaly detection ClickHouse queries must use pre-computed materialized views, not on-demand aggregations)
**Research flag:** Anomaly detection statistical baseline logic (rolling averages, sigma thresholds on ClickHouse at 1000+ events/sec ingestion rate) is non-trivial. Flag for phase research before implementing DF-4. DF-2 human review queue real-time updates (SSE vs polling) also warrants a quick spike.

### Phase 6: Kubernetes Helm Chart and Sidecar

**Rationale:** Production-grade K8s deployment for the bank pilot and subsequent enterprise customers. This phase can be parallelized from an infrastructure track with Phases 3-5 once Phase 2 delivers stable container images and Phase 4 delivers stable mTLS configuration. Helm is last in the serial track because the chart needs stable images and stable mTLS cert configuration to be testable.
**Delivers:** Helm 3 umbrella chart with `values-pilot.yaml` and `values-enterprise.yaml` (DF-5), K8s 1.33+ native sidecar manifest with pre-1.33 regular-container fallback (DF-6), CA cert onboarding scripts for macOS/Windows/Linux (DF-7), CI parity test comparing Docker Compose and Helm config keys
**Addresses:** DF-5, DF-6, DF-7
**Avoids:** Pitfall 8 (Helm/Compose config drift — CI parity check is the enforcement mechanism); mTLS cert management in Helm (cert-manager as optional integration, manual cert injection for air-gapped environments)
**Research flag:** The cert-manager optional integration and manual cert injection path for air-gapped environments (an explicit CLAUDE.md constraint) may benefit from a quick spike on the Helm init container/Job cert bootstrap pattern.

### Phase Ordering Rationale

- **Identity before UI:** All 10 dashboard views require an authenticated user with a role. Building UI before RBAC is in place means all frontend work must be retrofitted — this is exactly Pitfall 1.
- **Containers before UI polish:** Docker Compose running throughout dashboard development means every feature can be smoke-tested end-to-end rather than against mocked APIs. Integration failures surface early.
- **Core dashboard before SAML:** SAML is only required for the bank pilot. The law firm pilot uses API key auth with Phase 1 RBAC. Deferring SAML avoids blocking law firm deployment on the highest-risk identity feature.
- **Advanced dashboard views after core:** DF-1 through DF-4 each depend on the RBAC scoping from Phase 1 and the ClickHouse materialized views from Phase 3. Building them before the foundation is set creates rework.
- **Helm as final (or parallel infrastructure track):** The Helm chart wraps stable container images with stable configuration. An infrastructure engineer can work on Phase 6 in parallel with Phases 3-5 once Phase 2 delivers stable images, reducing total elapsed time.

### Research Flags

Phases requiring deeper research before implementation:
- **Phase 4 (SAML SSO):** samlify compatibility with Bun's xml-crypto module is MEDIUM confidence. Requires an isolated proof-of-concept test before Phase 4 begins. Fallback is `@node-saml/node-saml`. Also requires Okta and Azure AD test tenants for metadata exchange validation.
- **Phase 4 (mTLS bootstrap):** cert-generation automation in Docker Compose entrypoint (and the Helm pre-install Job alternative) needs a spike to validate startup ordering on a completely fresh deploy with zero pre-existing certificates.
- **Phase 5 (Anomaly Detection):** ClickHouse query patterns for rolling average/sigma-threshold anomaly detection at production ingestion rates. Materialized view design should be prototyped before implementation.
- **Phase 3 (Policy Builder Rego generation):** Generating valid, safe Rego from a visual builder with no Rego knowledge required by the user is the hardest UI problem in the product. Consider a focused spike on the generation logic and security constraints before full implementation.

Phases with well-documented standard patterns (skip research-phase):
- **Phase 1 (Identity Foundation):** Elysia middleware patterns, SHA-256 hashed API keys, JWT session tokens, Drizzle schema additions are all standard and well-documented.
- **Phase 2 (Container Images + Docker Compose):** Rust multi-stage Docker builds on debian-slim, Bun container images, Docker Compose health check patterns are all well-documented with official guides.
- **Phase 6 (Helm Chart):** Helm 3 umbrella chart pattern, subchart structure, ExternalSecret CRD refs, `values-pilot.yaml` overrides are well-documented in official Helm and enterprise ISV guides.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All v1.1 additions build on an already-validated v1.0 stack. The one gap is samlify on Bun runtime (xml-crypto dependencies), which is MEDIUM confidence and requires validation during Phase 4. Next.js 16 + Bun as package manager is also MEDIUM confidence (works in practice, not officially supported by Vercel). |
| Features | HIGH | Feature set derived from competitor analysis (CalypsoAI, Lasso, Credo AI, Microsoft Purview), enterprise security standards, regulatory requirements, and direct pilot customer context (law firm ~80 users, small private bank). The 13 table-stakes and 7 differentiators are grounded in verified sources. Anti-features list is opinionated but defensible for a two-pilot, single-tenant, fixed-role scope. |
| Architecture | HIGH | Integration patterns are well-understood because the existing codebase is thoroughly mapped. The SAML redirect flow split between Next.js and Elysia, the mTLS integration points in existing tonic code, and the `signing_key_id` gap in existing proto definitions are all precisely identified. The only architectural unknown is samlify's Bun XML crypto compatibility. |
| Pitfalls | HIGH | 8 critical/moderate pitfalls identified by cross-referencing security standards, deployment best practices, and direct codebase analysis. Three pitfalls cite specific lines of existing code (`signing_key_id: String::new()` in bundle.rs, absence of auth middleware in control-plane/src/index.ts, missing TLS config on gRPC endpoint in evidence/client.rs). All are directly actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **samlify on Bun runtime compatibility:** Must be tested in an isolated proof-of-concept before Phase 4 begins. Test XML signature verification and assertion parsing under Bun v1.3. Fallback is `@node-saml/node-saml`. If both fail on Bun, last resort is a standalone SAML validation microservice.
- **SAML metadata exchange with specific IdPs:** Okta and Azure AD have quirks in SAML metadata format. Two-IdP testing is mandatory, not optional. Need test tenant access before Phase 4 implementation.
- **ClickHouse materialized views for dashboard:** The specific views needed (`mv_violations_hourly`, `mv_vendor_stats_daily`, `mv_anomaly_metrics`) should be prototyped before dashboard Phase 3 begins so the API layer queries the right tables from day one.
- **Next.js 16 + Bun as package manager:** Verify `bun run build` and `bun run start` with Next.js 16 standalone output before committing the dashboard framework in Phase 3. Fallback: pnpm (officially supported by Vercel).
- **mTLS cert bootstrap on completely fresh Docker Compose deploy:** The pre-deploy cert generation script must be tested in CI with zero pre-existing certificates to confirm the flow works before Phase 4 ships.
- **Helm cert-manager optional integration for air-gapped environments:** CLAUDE.md explicitly requires air-gapped compatibility. The manual cert injection path (no cert-manager) needs documentation and testing in Phase 6.
- **Policy Builder Rego generation safety:** The visual builder must generate Rego that is semantically correct and cannot be crafted by a user to produce policies with unintended permissions. The generation logic needs security review.

## Sources

### Primary (HIGH confidence)
- samlify npm v2.10.2 — library selection, published 17 days ago (as of research date), 77 dependent projects
- CVE-2025-47949 (Endor Labs) — signature wrapping vulnerability patched in samlify 2.10.0; MUST NOT use older version
- Next.js 16 blog + Next.js 16.1 blog — Turbopack stable, React Compiler built-in, Turbopack File System Caching stable
- shadcn/ui React 19 compatibility docs — full Tailwind v4 support confirmed
- shadcn/ui Chart component docs — built on Recharts, replaces deprecated Toast with Sonner
- rustls WebPkiClientVerifier docs — mTLS server-side configuration API
- rcgen GitHub (rustls team) — X.509 cert generation for internal CA pattern
- Kubernetes native sidecars blog — stable since K8s 1.33 (April 2025), `restartPolicy: Always` on initContainer
- Tonic transport docs — `ClientTlsConfig` and `ServerTlsConfig` for gRPC mTLS
- OWASP Key Management Cheat Sheet — key rotation lifecycle and never-delete-keys rule
- Drizzle ORM RLS docs — `pgPolicy` and `pgRole` for row-level security
- Helm Best Practices (official) — ExternalSecret refs, chart structure, values strategy
- ClickHouse real-time analytics docs — materialized view patterns for pre-aggregation
- Enterprise Helm Chart Best Practices for ISVs (Replicated) — subchart structure for enterprise distribution
- Oso RBAC Best Practices — two-layer RBAC (route guard + data filter) design
- TanStack Query v5.90.x docs — stale-while-revalidate, Suspense integration, background refetch
- TanStack Table v8.21.x docs — server-side pagination for large audit trail datasets
- 10 Best AI Governance Platforms for Enterprise Teams 2026 (Superblocks) — competitive positioning
- Lasso Security: Enterprise AI Security Predictions 2026 — market feature expectations
- Securing Microservices Communication with mTLS in Kubernetes (The New Stack) — mTLS deployment patterns
- Cryptographic Evidence Structures for Regulated AI Workflows (arXiv 2511.17118) — evidence chain integrity requirements

### Secondary (MEDIUM confidence)
- samlify docs (samlify.js.org) — IdP + SP implementation guide, SSO flow patterns
- @node-saml/node-saml npm v5.1.0 — fallback SAML option if samlify/Bun compatibility fails
- Bun Node.js compatibility docs — crypto module supported in Bun v1.3 (basis for samlify inference)
- Docker multi-stage Rust builds guide — optimization patterns, debian-slim rationale
- ClickHouse Docker Compose (official) — multi-service setup, ulimits configuration
- WorkOS: Common SAML Errors — SAML integration pitfalls, IdP-specific quirks
- Oso: How to Build RBAC — data-level scoping patterns, department isolation
- Zuplo: Zero Downtime API Auth Migration — retrofit auth onto existing API without breaking callers
- Anchore: Helm vs Docker Compose for Production — deployment model trade-offs
- RaftLabs: Next.js Best Practices 2025 — SSR vs CSR split, server component data loading
- Ksolves: Next.js SaaS Dashboard Development — empty state guidance, enterprise UX patterns
- nuqs — type-safe URL state for shareable dashboard filter views (Next.js Conf 2025)

### Tertiary (LOW confidence — validate during implementation)
- samlify + Bun runtime compatibility — no explicit documentation; inferred from Bun's Node.js crypto compatibility coverage
- Next.js 16 + Bun as package manager — works in practice but not officially supported by Vercel

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*

# Architecture Research: v1.1 Integration

**Domain:** AI Governance Platform -- Identity, Dashboard, and Deployment integration with existing Rust kernel + Bun/Elysia API
**Researched:** 2026-03-01
**Confidence:** HIGH (integration patterns are well-understood; existing codebase is thoroughly mapped)

## System Overview: v1.1 Additions

The diagram below shows the v1.0 architecture (unchanged) with v1.1 additions marked as `[NEW]`.

```
                         ENTERPRISE NETWORK BOUNDARY
 ============================================================================

  EMPLOYEES                       DATA PLANE (Rust) -- UNCHANGED
  =========                       ===================================

  Browser  ----\                 +--------------------------------------------+
  IDE      -----+--- HTTPS/SSE  | INTERDICT KERNEL (per-pod sidecar)         |
  Agent    ----/    ------------>|                                            |
                                 |  Protocol Decoder -> Session Tracker ->    |
                                 |  3-Layer Enforcer (L1/L2/L3) ->           |
                                 |  Streaming Inspector -> Evidence Buffer    |
                                 |                                            |
                                 |  [NEW] mTLS on gRPC channels (tonic+      |
                                 |        rustls ClientTlsConfig/             |
                                 |        ServerTlsConfig)                    |
                                 +--------+------------------+----------------+
                                          |                  |
                              HTTPS/H2    |  gRPC (mTLS)     |  gRPC (mTLS)
                           to AI Vendors  |  [UPGRADED]      |  [UPGRADED]
                                          |                  |
  AI VENDORS <----------------------------+                  |
                                                             |
               CONTROL PLANE (TypeScript)                    |
               ==========================                    |
                                                             |
  +----------------------------------------------------------v---------+
  |                                                                    |
  |  +------------------+    +------------------+                      |
  |  | EVIDENCE         |    | CONTROL PLANE    |                      |
  |  | COLLECTOR        |    | API              |                      |
  |  | (Rust)           |    | (Bun + Elysia)   |                      |
  |  |                  |    |                  |                      |
  |  | [NEW] mTLS on    |    | [NEW] SAML 2.0  |                      |
  |  |   gRPC listener  |    |   SSO module     |                      |
  |  |                  |    | [NEW] RBAC       |                      |
  |  +--------+---------+    |   middleware     |                      |
  |           |              | [NEW] API key    |                      |
  |           |              |   auth fallback  |                      |
  |           |              | [NEW] Key        |                      |
  |           |              |   rotation svc   |                      |
  |           |              +--------+---------+                      |
  |           |                       |                                |
  |     +-----v-------+        +-----v--------+                       |
  |     | ClickHouse  |        | PostgreSQL   |                       |
  |     | (unchanged) |        | [NEW] SAML   |                       |
  |     +-------------+        |  sessions,   |                       |
  |                            |  api_keys,   |                       |
  |                            |  key_store   |                       |
  |                            +-----^--------+                       |
  |                                  |                                 |
  |  +-------------------------------+------+                          |
  |  | [NEW] DASHBOARD                     |                          |
  |  | (Next.js 15 + React + shadcn/ui)    |                          |
  |  |                                     |                          |
  |  | SSR + server components             |                          |
  |  | Calls Elysia API (HTTP)             |                          |
  |  | Session cookie from SAML/API key    |                          |
  |  |                                     |                          |
  |  | 10 views: Policy Builder, Audit     |                          |
  |  | Trail, Vendor Mgmt, Regulatory,     |                          |
  |  | Alerts, Compliance Reports,         |                          |
  |  | Departments, Anomaly Detection,     |                          |
  |  | Evidence Verification, Review Queue |                          |
  |  +-------------------------------------+                          |
  |                                                                    |
  +--------------------------------------------------------------------+

 ============================================================================
```

## Component Classification: New vs Modified

### New Components (to build from scratch)

| Component | Location | Language | Responsibility |
|-----------|----------|----------|----------------|
| **SAML SSO Module** | `control-plane/src/modules/auth/` | TypeScript | SAML 2.0 SP-initiated login, assertion parsing, session creation |
| **RBAC Middleware** | `control-plane/src/modules/auth/rbac.ts` | TypeScript | Per-route role enforcement as Elysia middleware |
| **API Key Auth** | `control-plane/src/modules/auth/api-key.ts` | TypeScript | API key generation, validation, rate limiting |
| **Key Rotation Service** | `control-plane/src/modules/crypto/` | TypeScript | Ed25519 key lifecycle, overlapping rotation, fleet notification |
| **Dashboard** | `dashboard/` | TypeScript (Next.js) | All 10 UI views, SSR, RBAC-aware rendering |
| **Docker Compose Stack** | `deploy/docker-compose/` | YAML | Full-stack dev/pilot deployment |
| **Helm Chart** | `deploy/helm/interdict/` | YAML + Go templates | K8s production deployment |
| **Sidecar Manifest** | `deploy/k8s/sidecar.yaml` | YAML | Kernel as sidecar container |
| **Container Images** | `Dockerfile.*` | Dockerfile | Multi-stage builds for all 4 services |
| **CA Cert Onboarding Script** | `deploy/scripts/ca-onboard.sh` | Shell | Client CA cert installation |

### Modified Components (existing, need changes)

| Component | What Changes | Why |
|-----------|-------------|-----|
| **Elysia API entry point** (`control-plane/src/index.ts`) | Add auth middleware, CORS for dashboard, new module registration | SAML/RBAC/API key auth wraps all routes |
| **PostgreSQL schema** (`control-plane/src/db/schema/`) | Add `sessions`, `api_keys`, `signing_keys`, `audit_log` tables; extend `users` table with SAML fields | Identity and key rotation state |
| **gRPC distribution server** (`control-plane/src/modules/distribution/server.ts`) | Upgrade `createInsecure()` to `createSsl()` with mTLS | Secure kernel-to-control-plane channel |
| **Kernel gRPC clients** (`crates/kernel/src/policy/distribution/client.rs`, `crates/kernel/src/evidence/client.rs`) | Add `ClientTlsConfig` with client cert + CA cert | mTLS for outbound gRPC connections |
| **Evidence collector gRPC server** (`crates/evidence-collector/src/grpc/service.rs`) | Add `ServerTlsConfig` with server cert + client CA | mTLS for inbound gRPC connections |
| **Policy distribution proto** (`proto/interdict/policy/v1/policy_distribution.proto`) | Add `signing_key_id` field to `PolicyEntry` for key rotation awareness | Fleet needs to know which signing key to use |
| **Control plane config** (`control-plane/src/config.ts`) | Add SAML, mTLS cert paths, JWT secret, dashboard URL configs | New subsystems need configuration |
| **Policies schema** (`control-plane/src/db/schema/policies.ts`) | Populate `created_by` FK now that users exist | RBAC audit trail |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| **Kernel proxy hot path** (proxy, relay, streaming, TLS interception) | Identity/auth is control plane concern, not data plane |
| **Policy pipeline** (L1/L2/L3, Wasm engine, Regorus, content inspection) | No changes to enforcement logic |
| **Evidence bundle creation** (kernel-side) | Hash chain and signing logic unchanged; only gRPC transport gets mTLS |
| **Merkle tree builder** (evidence collector) | Internal to collector, no interface change |
| **ClickHouse schema** | Audit queries unchanged; dashboard reads via Elysia API |

## Detailed Integration Architecture

### 1. Identity & Authentication Flow

```
Browser (CISO)
    |
    |  GET /dashboard/login
    v
[Next.js Dashboard] -- renders login page with "SSO Login" button
    |
    |  Click "SSO Login"
    v
[Next.js API Route: /api/auth/saml/login]
    |
    |  Generates SAML AuthnRequest
    |  Redirects to IdP (Okta / Azure AD)
    v
[Enterprise IdP]
    |
    |  User authenticates (MFA, etc.)
    |  IdP sends SAML Response (POST binding)
    v
[Next.js API Route: /api/auth/saml/callback]
    |
    |  Validates SAML assertion (samlify library)
    |  Extracts: email, name, groups, external_id
    |
    |  POST /api/v1/auth/saml/callback  (to Elysia API)
    v
[Elysia API: auth module]
    |
    |  Upsert user in PostgreSQL (match on external_id or email)
    |  Map IdP groups -> Interdict roles (configurable mapping)
    |  Create session record in PostgreSQL
    |  Return session token (JWT with role, user_id, org_id)
    v
[Next.js Dashboard]
    |
    |  Sets httpOnly cookie with session token
    |  Redirects to /dashboard (role-appropriate landing)
    v
[Subsequent requests]
    |
    |  Next.js server components read cookie
    |  Validate JWT, extract role
    |  Call Elysia API with Authorization header
    |  Elysia RBAC middleware checks role vs route permission
```

**Key Design Decisions:**

1. **SAML processing split between Next.js and Elysia.** The Next.js app handles the HTTP redirect flow (SAML is browser-redirect-heavy), while the Elysia API handles user upsert and session creation. This keeps user state management in the API where it belongs.

2. **samlify for SAML parsing** because it is the most actively maintained TypeScript SAML 2.0 library with proper XML signature validation and runs on Bun without Node.js-specific dependencies. Confidence: MEDIUM (need to verify Bun compatibility of samlify's XML crypto dependencies).

3. **JWT session tokens** (not opaque tokens) because the dashboard's Next.js server components need to decode the role without an API round-trip on every page load. Short-lived JWTs (15 min) + refresh via Elysia API.

4. **API key auth as parallel path** for programmatic access, CI/CD integrations, and pilot customers who do not yet have SAML IdP configured. API keys stored as SHA-256 hashes in PostgreSQL.

### 2. RBAC Model

```
Role Hierarchy (most to least privilege):

  super_admin
      |
  compliance_officer
      |
  policy_admin
      |
  department_manager
      |
  read_only_auditor
```

**Permission Matrix:**

| Resource | super_admin | compliance_officer | policy_admin | dept_manager | read_only_auditor |
|----------|:-----------:|:------------------:|:------------:|:------------:|:-----------------:|
| Users CRUD | RW | R | - | - | - |
| Policies CRUD | RW | RW | RW | R | R |
| Vendor CRUD | RW | RW | R | R | R |
| Regulatory CRUD | RW | RW | R | R | R |
| Audit trail read | RW | RW | R | R (dept) | R (dept) |
| Evidence verify | RW | RW | R | R | R |
| Key rotation | RW | - | - | - | - |
| Department mgmt | RW | R | R | RW (own) | R (own) |
| Human review queue | RW | RW | RW | R (dept) | - |
| Compliance reports | RW | RW | R | R (dept) | R (dept) |
| System config | RW | - | - | - | - |

**Implementation as Elysia middleware:**

```typescript
// control-plane/src/modules/auth/rbac.ts
import { Elysia } from "elysia";

type Role = "super_admin" | "compliance_officer" | "policy_admin"
           | "department_manager" | "read_only_auditor";

const ROLE_RANK: Record<Role, number> = {
  super_admin: 5,
  compliance_officer: 4,
  policy_admin: 3,
  department_manager: 2,
  read_only_auditor: 1,
};

// Route-level permission check
export function requireRole(minRole: Role) {
  return new Elysia()
    .derive(({ headers, set }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      // Validate JWT, extract role
      const user = validateSession(token);
      if (!user || ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
        set.status = 403;
        throw new Error("Insufficient permissions");
      }
      return { user };
    });
}
```

**Department scoping:** `department_manager` and `read_only_auditor` roles are automatically scoped to their assigned department. Elysia middleware injects `user.departmentId` into the request context; service layer filters queries by department.

### 3. mTLS Integration

mTLS secures all internal gRPC channels. Three integration points:

```
                     mTLS Channel 1                    mTLS Channel 2
Kernel (Rust)  <========================>  Control Plane  <--- HTTP (no mTLS)
  tonic client       gRPC policy push        @grpc/grpc-js         |
  ClientTlsConfig    server-streaming       ServerCredentials      Dashboard
                                            .createSsl()           (Next.js)
                     mTLS Channel 3
Kernel (Rust)  ========================>  Evidence Collector (Rust)
  tonic client       gRPC evidence push      tonic server
  ClientTlsConfig                            ServerTlsConfig
```

**Rust side (kernel clients):**

```rust
// Kernel's distribution client upgrade (crates/kernel/src/policy/distribution/client.rs)
use tonic::transport::{Certificate, ClientTlsConfig, Identity, Channel, Endpoint};

let ca_cert = std::fs::read("certs/ca.pem")?;
let client_cert = std::fs::read("certs/kernel-client.pem")?;
let client_key = std::fs::read("certs/kernel-client.key")?;

let tls = ClientTlsConfig::new()
    .ca_certificate(Certificate::from_pem(ca_cert))
    .identity(Identity::from_pem(client_cert, client_key))
    .domain_name("control-plane.interdict.local");

let channel = Endpoint::from_shared(distribution_addr)?
    .tls_config(tls)?
    .connect()
    .await?;
```

**Rust side (evidence collector server):**

```rust
// Evidence collector server upgrade (crates/evidence-collector/src/grpc/service.rs)
use tonic::transport::{Certificate, Identity, Server, ServerTlsConfig};

let server_cert = std::fs::read("certs/collector-server.pem")?;
let server_key = std::fs::read("certs/collector-server.key")?;
let ca_cert = std::fs::read("certs/ca.pem")?;

let tls = ServerTlsConfig::new()
    .identity(Identity::from_pem(server_cert, server_key))
    .client_ca_root(Certificate::from_pem(ca_cert));

Server::builder()
    .tls_config(tls)?
    .add_service(evidence_service)
    .serve(addr)
    .await?;
```

**TypeScript side (control plane gRPC server):**

```typescript
// control-plane/src/modules/distribution/server.ts upgrade
import * as grpc from "@grpc/grpc-js";
import { readFileSync } from "node:fs";

const rootCert = readFileSync("certs/ca.pem");
const serverCert = readFileSync("certs/control-plane-server.pem");
const serverKey = readFileSync("certs/control-plane-server.key");

const credentials = grpc.ServerCredentials.createSsl(
  rootCert,
  [{ private_key: serverKey, cert_chain: serverCert }],
  true  // checkClientCertificate = true (require mTLS)
);

server.bindAsync(bindAddress, credentials, (err, port) => { ... });
```

**Certificate hierarchy:**

```
interdict-ca (self-signed root, generated at deployment)
    |
    +-- control-plane-server.pem  (SAN: control-plane.interdict.local)
    +-- collector-server.pem      (SAN: evidence-collector.interdict.local)
    +-- kernel-client.pem         (SAN: kernel-*.interdict.local)
```

All certs generated by a deployment-time script (`deploy/scripts/gen-internal-certs.sh`). Docker Compose mounts them as volumes. Helm chart generates them via an init container or cert-manager.

**Fallback for mTLS-disabled mode:** Configuration flag `INTERDICT_MTLS_ENABLED=false` allows insecure gRPC for development. Production deployments MUST have this set to `true`. The kernel config gains `[policy.distribution.tls]` section; evidence collector gains similar.

### 4. Signing Key Rotation

```
Key Lifecycle:

  PENDING -----> ACTIVE -----> DRAINING -----> RETIRED
  (generated)   (signing)     (verify only)   (archived)

  At any time, exactly ONE key is ACTIVE.
  During rotation, the OLD key is DRAINING while the NEW key is ACTIVE.
  Verification accepts signatures from ACTIVE + all DRAINING keys.
```

**Schema addition:**

```sql
CREATE TABLE signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id VARCHAR(64) NOT NULL UNIQUE,  -- human-friendly "key-2026-03"
  public_key_pem TEXT NOT NULL,
  -- private key stored encrypted or in KMS, NOT in DB
  private_key_encrypted BYTEA,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending/active/draining/retired
  activated_at TIMESTAMPTZ,
  drained_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Rotation flow:**

1. Admin triggers rotation via API (`POST /api/v1/crypto/keys/rotate`)
2. Control plane generates new Ed25519 keypair, stores with status `pending`
3. Control plane transitions new key to `active`, old key to `draining`
4. Control plane pushes key update to kernel fleet via gRPC (new proto message or piggyback on policy push)
5. Kernels begin signing new evidence bundles with the new key
6. After configurable drain period (e.g., 24 hours), old key moves to `retired`
7. Evidence verification uses `signing_key_id` field in `EvidenceBundle` proto to select correct public key

**Integration with existing evidence pipeline:** The kernel already includes `signing_key_id` and `dev_signed` fields in `EvidenceBundle` proto. The evidence collector's `signing/mod.rs` already has `SigningMode::File` and `SigningMode::Kms` variants. Key rotation extends `SigningMode::File` to accept a key directory with versioned keys, and adds a `SigningMode::Managed` variant where keys are fetched from the control plane API.

### 5. Dashboard Architecture

```
dashboard/                          # NEW: Next.js 15 app
  app/
    layout.tsx                      # Root layout: auth guard, sidebar
    (auth)/
      login/page.tsx                # SAML login page
      api/auth/saml/login/route.ts  # SAML AuthnRequest redirect
      api/auth/saml/callback/route.ts  # SAML assertion handler
    (dashboard)/
      layout.tsx                    # Dashboard shell: sidebar, topbar
      page.tsx                      # Overview/home (role-based)
      policies/
        page.tsx                    # Policy list (server component)
        [id]/page.tsx               # Policy detail/edit
        new/page.tsx                # Policy builder
      audit/
        page.tsx                    # Audit trail search
      vendors/
        page.tsx                    # Vendor management
      regulatory/
        page.tsx                    # Regulatory framework selector
      alerts/
        page.tsx                    # Real-time violation alerts
      reports/
        page.tsx                    # Compliance report generation
      departments/
        page.tsx                    # Department management
      anomaly/
        page.tsx                    # Anomaly detection views
      evidence/
        page.tsx                    # Evidence verification UI
      review/
        page.tsx                    # Human review queue
    api/                            # Next.js API routes (BFF pattern)
      v1/[...path]/route.ts         # Proxy to Elysia API with auth
  components/
    ui/                             # shadcn/ui primitives
    layout/                         # Sidebar, topbar, breadcrumbs
    policies/                       # Policy builder components
    audit/                          # Audit trail components
    charts/                         # recharts or tremor wrappers
  lib/
    api-client.ts                   # Typed Elysia API client
    auth.ts                         # Session helpers, JWT decode
    rbac.ts                         # Client-side role checks
  package.json
  next.config.ts
  tailwind.config.ts
```

**Dashboard-to-API communication pattern:**

The dashboard uses a Backend-for-Frontend (BFF) pattern. Next.js server components call the Elysia API directly (server-to-server, localhost in Docker/K8s). Client components use Next.js API routes as a proxy, which adds the auth token and forwards to Elysia.

```
Server Component (SSR):
  fetch("http://control-plane:3000/api/v1/policies", {
    headers: { Authorization: `Bearer ${sessionToken}` }
  })

Client Component (CSR):
  fetch("/api/v1/policies")  --> Next.js API route --> Elysia API
```

**Technology choices for dashboard:**

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | Next.js 15 (App Router) | SSR, server components, already decided in PROJECT.md |
| UI components | shadcn/ui + Tailwind CSS | Enterprise-grade, accessible, customizable, no vendor lock-in |
| Data tables | TanStack Table | Server-side pagination/sorting/filtering, most mature React table |
| Charts | Recharts | Lightweight, composable, React-native, good for time-series |
| Forms | React Hook Form + Zod | Type-safe validation, integrates with shadcn/ui form components |
| State management | React Server Components + SWR for client mutations | Minimal client state; server components handle most data fetching |
| Code editor (policy builder) | Monaco Editor (react) | Rego syntax highlighting, autocompletion potential, same as VS Code |

### 6. Deployment Architecture

#### Docker Compose (for pilot: law firm ~80 employees)

```yaml
# deploy/docker-compose/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    volumes: [pg-data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: interdict
      POSTGRES_USER: interdict
      POSTGRES_PASSWORD: ${PG_PASSWORD}

  clickhouse:
    image: clickhouse/clickhouse-server:24.8
    volumes: [ch-data:/var/lib/clickhouse]
    ulimits: { nofile: { soft: 262144, hard: 262144 } }

  control-plane:
    build: { context: ../.., dockerfile: Dockerfile.control-plane }
    depends_on: [postgres, clickhouse]
    environment:
      DATABASE_URL: postgres://interdict:${PG_PASSWORD}@postgres:5432/interdict
      CLICKHOUSE_URL: http://clickhouse:8123
      INTERDICT_MTLS_ENABLED: "true"
    volumes:
      - certs:/app/certs:ro
      - wasm-storage:/app/data/wasm

  evidence-collector:
    build: { context: ../.., dockerfile: Dockerfile.evidence-collector }
    depends_on: [clickhouse]
    volumes:
      - certs:/app/certs:ro

  dashboard:
    build: { context: ../.., dockerfile: Dockerfile.dashboard }
    depends_on: [control-plane]
    ports: ["443:3000"]  # Only public-facing service
    environment:
      CONTROL_PLANE_URL: http://control-plane:3000
      NEXTAUTH_URL: https://interdict.lawfirm.local

  kernel:
    build: { context: ../.., dockerfile: Dockerfile.kernel }
    depends_on: [control-plane, evidence-collector]
    ports: ["8443:8443"]  # Proxy port
    volumes:
      - certs:/app/certs:ro
      - ./interdict.toml:/app/interdict.toml:ro

  # Init container: generates internal CA + component certs
  cert-init:
    build: { context: ../.., dockerfile: Dockerfile.cert-init }
    volumes:
      - certs:/certs
    entrypoint: /app/gen-internal-certs.sh

volumes:
  pg-data:
  ch-data:
  wasm-storage:
  certs:
```

**Key decisions:**
- Only the dashboard exposes a port externally (HTTPS on 443)
- The kernel exposes 8443 for proxy traffic (configured in client machines)
- All internal communication uses Docker networking (no exposed ports)
- Certificate init container runs once, generates internal mTLS certs into a shared volume

#### Helm Chart (for enterprise K8s)

```
deploy/helm/interdict/
  Chart.yaml
  values.yaml
  templates/
    _helpers.tpl
    namespace.yaml
    configmap.yaml
    secret.yaml
    postgres/
      statefulset.yaml       # Or ExternalName if customer provides DB
      service.yaml
    clickhouse/
      statefulset.yaml
      service.yaml
    control-plane/
      deployment.yaml
      service.yaml
      hpa.yaml
    evidence-collector/
      deployment.yaml
      service.yaml
    dashboard/
      deployment.yaml
      service.yaml
      ingress.yaml           # Only externally-routable service
    kernel/
      daemonset.yaml         # One per node for sidecar injection
      # OR deployment.yaml   # Standalone proxy deployment
    cert-init/
      job.yaml               # Generate internal certs on install
    networkpolicy.yaml       # Restrict inter-pod communication
```

**Sidecar pattern (separate manifest):**

```yaml
# deploy/k8s/sidecar.yaml -- injected into customer app pods
apiVersion: v1
kind: Pod
metadata:
  name: customer-app
spec:
  containers:
  - name: app
    image: customer/their-app:latest
    env:
    - name: HTTP_PROXY
      value: "http://localhost:8443"
    - name: HTTPS_PROXY
      value: "http://localhost:8443"
  - name: interdict-kernel
    image: interdict/kernel:1.1
    ports:
    - containerPort: 8443
    resources:
      requests: { memory: "64Mi", cpu: "50m" }
      limits:   { memory: "128Mi", cpu: "500m" }
    volumeMounts:
    - name: kernel-config
      mountPath: /app/interdict.toml
      subPath: interdict.toml
    - name: certs
      mountPath: /app/certs
      readOnly: true
  volumes:
  - name: kernel-config
    configMap: { name: interdict-kernel-config }
  - name: certs
    secret: { secretName: interdict-internal-certs }
```

#### Container Images (multi-stage builds)

| Image | Base | Build Strategy | Expected Size |
|-------|------|----------------|---------------|
| `interdict/kernel` | `debian:bookworm-slim` | Rust release build, copy binary only | ~30MB |
| `interdict/evidence-collector` | `debian:bookworm-slim` | Rust release build, copy binary only | ~25MB |
| `interdict/control-plane` | `oven/bun:1-alpine` | Copy source + node_modules | ~80MB |
| `interdict/dashboard` | `node:22-alpine` | Next.js standalone output | ~120MB |
| `interdict/cert-init` | `alpine:3.19` | openssl + shell script | ~10MB |

## Data Flow Changes

### New Data Flow: Authentication

```
IdP SAML Response
    |
    v
Dashboard (validate XML signature, extract assertions)
    |
    v
Elysia API /auth/saml/callback
    |
    +---> PostgreSQL: upsert user (match external_id or email)
    +---> PostgreSQL: create session (JWT claims: user_id, role, org_id, dept_id)
    |
    v
Dashboard: set httpOnly cookie
    |
    v
All subsequent Elysia API calls: Authorization: Bearer <jwt>
    |
    v
Elysia RBAC middleware: validate JWT, check role >= required_role
```

### New Data Flow: Key Rotation

```
Admin: POST /api/v1/crypto/keys/rotate
    |
    v
Elysia API: generate Ed25519 keypair
    +---> PostgreSQL: insert signing_keys (status: pending -> active)
    +---> PostgreSQL: old key status: active -> draining
    |
    v
Elysia API: notify kernel fleet via gRPC push
    (piggyback on PolicyUpdate or new dedicated KeyUpdate message)
    |
    v
Kernel: update local signing key reference (ArcSwap)
    |
    v
Evidence bundles: new bundles use new signing_key_id
    |
    v
Evidence collector: verify signatures using key_id lookup
    (accepts active + draining keys)
```

### Modified Data Flow: gRPC with mTLS

```
BEFORE (v1.0):
  Kernel --[insecure gRPC]--> Control Plane
  Kernel --[insecure gRPC]--> Evidence Collector

AFTER (v1.1):
  Kernel --[mTLS gRPC (rustls)]--> Control Plane (@grpc/grpc-js SSL)
  Kernel --[mTLS gRPC (rustls)]--> Evidence Collector (tonic ServerTlsConfig)

  Both sides present certificates signed by the internal CA.
  Control plane verifies kernel client cert.
  Evidence collector verifies kernel client cert.
```

### New Data Flow: Dashboard SSR

```
Browser request: GET /dashboard/audit
    |
    v
Next.js Server Component
    |
    +---> Read session cookie, extract JWT
    +---> Validate JWT (check expiry, signature)
    +---> Call Elysia API: GET /api/v1/audit?filters...
    |       (server-to-server, Authorization: Bearer <jwt>)
    |
    v
Elysia API
    +---> RBAC middleware: validate role has audit read permission
    +---> AuditService.search() -> ClickHouse + PostgreSQL enrichment
    |
    v
Next.js: render server component HTML with data
    |
    v
Browser: receives fully-rendered page (no loading spinners for initial data)
```

## New PostgreSQL Schema Additions

```sql
-- Sessions (JWT is primary, but server tracks for revocation)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash VARCHAR(64) NOT NULL,  -- SHA-256 of JWT
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash) WHERE revoked_at IS NULL;

-- API Keys (for programmatic access)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of the key
  key_prefix VARCHAR(8) NOT NULL,  -- first 8 chars for identification
  permissions JSONB NOT NULL DEFAULT '[]',  -- scoped permissions
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Signing Keys (Ed25519 key rotation)
CREATE TABLE signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id VARCHAR(64) NOT NULL UNIQUE,
  public_key_pem TEXT NOT NULL,
  private_key_encrypted BYTEA,  -- encrypted at rest
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  activated_at TIMESTAMPTZ,
  drained_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SAML configuration per organization
CREATE TABLE saml_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(255) NOT NULL UNIQUE,
  idp_metadata_xml TEXT NOT NULL,
  sp_entity_id VARCHAR(1024) NOT NULL,
  sp_acs_url VARCHAR(1024) NOT NULL,
  attribute_mapping JSONB NOT NULL DEFAULT '{}',
  role_mapping JSONB NOT NULL DEFAULT '{}',  -- IdP group -> Interdict role
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  saml_name_id VARCHAR(512);
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  idp_groups JSONB DEFAULT '[]';
```

## Architectural Patterns

### Pattern 1: Auth Middleware Chain (Elysia)

**What:** Composable authentication that supports both SAML sessions and API keys with a single middleware stack.

**When to use:** Every Elysia API route (except `/health` and SAML callback endpoints).

**Implementation:**

```typescript
// Resolve auth from either JWT cookie or API key header
export const authMiddleware = new Elysia()
  .derive(async ({ headers, cookie }) => {
    // Try JWT first (dashboard sessions)
    const bearer = headers.authorization?.replace("Bearer ", "");
    if (bearer) {
      const user = await validateJwt(bearer);
      if (user) return { user, authMethod: "jwt" as const };
    }

    // Try API key (programmatic access)
    const apiKey = headers["x-api-key"];
    if (apiKey) {
      const user = await validateApiKey(apiKey);
      if (user) return { user, authMethod: "api_key" as const };
    }

    throw new AuthError("Authentication required", 401);
  });

// Role check composes on top of auth
export const requireRole = (minRole: Role) =>
  new Elysia()
    .use(authMiddleware)
    .derive(({ user, set }) => {
      if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
        set.status = 403;
        throw new AuthError("Insufficient permissions", 403);
      }
      return { user };
    });
```

### Pattern 2: Server Component Data Loading (Next.js)

**What:** Server components fetch data from the Elysia API during SSR, avoiding client-side loading states for initial page render.

**When to use:** All dashboard pages that display data.

```typescript
// app/(dashboard)/audit/page.tsx
import { getSession } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  const data = await apiClient.audit.search({
    token: session.token,
    filters: {
      from_date: params.from,
      to_date: params.to,
      vendor: params.vendor,
      action: params.action,
    },
  });

  return <AuditTrailTable initialData={data} session={session} />;
}
```

### Pattern 3: mTLS Certificate Loading with Graceful Fallback

**What:** Components attempt to load mTLS certificates, falling back to insecure transport in development when certs are missing.

**When to use:** All gRPC client and server initialization points.

```rust
// Shared pattern for kernel gRPC clients
fn build_grpc_tls_config(cert_dir: &Path) -> Option<ClientTlsConfig> {
    let ca = cert_dir.join("ca.pem");
    let cert = cert_dir.join("client.pem");
    let key = cert_dir.join("client.key");

    if ca.exists() && cert.exists() && key.exists() {
        let ca_pem = std::fs::read(&ca).ok()?;
        let cert_pem = std::fs::read(&cert).ok()?;
        let key_pem = std::fs::read(&key).ok()?;
        Some(
            ClientTlsConfig::new()
                .ca_certificate(Certificate::from_pem(ca_pem))
                .identity(Identity::from_pem(cert_pem, key_pem))
        )
    } else {
        tracing::warn!("mTLS certs not found at {:?}, using insecure transport", cert_dir);
        None
    }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Auth in the Data Plane

**What people do:** Put JWT validation or RBAC checks in the Rust kernel.
**Why it is wrong:** The kernel is a stateless proxy. Adding user/session lookup to the hot path violates plane separation, adds latency, and requires the kernel to access PostgreSQL -- breaking the architecture invariant that the data plane never writes to the DB.
**Do this instead:** Auth lives entirely in the control plane (Elysia API) and dashboard (Next.js). The kernel trusts the control plane implicitly (mTLS ensures it is talking to the real control plane).

### Anti-Pattern 2: Dashboard Direct DB Access

**What people do:** Have Next.js server components query PostgreSQL or ClickHouse directly.
**Why it is wrong:** Bypasses RBAC middleware, duplicates query logic, creates two sources of truth for data access patterns, and couples the dashboard to the database schema.
**Do this instead:** Dashboard always goes through the Elysia API. The API is the single authority for data access and authorization. Next.js API routes act as a thin proxy when needed.

### Anti-Pattern 3: Storing Private Keys in PostgreSQL

**What people do:** Store Ed25519 private keys as plaintext in the database.
**Why it is wrong:** Database backups, replication, and SQL injection could expose signing keys. Violates CLAUDE.md invariant #6 (never log/store plaintext secrets).
**Do this instead:** Store private keys encrypted at rest (AES-256-GCM with a master key from environment/KMS). Or better: use `SigningMode::Kms` when available. Database stores only the encrypted blob and the public key.

### Anti-Pattern 4: Monolithic Container Image

**What people do:** Build one container with all services.
**Why it is wrong:** Violates plane separation, prevents independent scaling, creates massive images, and makes sidecar deployment impossible.
**Do this instead:** One Dockerfile per service. Multi-stage builds. Shared base images where practical.

### Anti-Pattern 5: Polling for SAML Session Validity

**What people do:** Check session validity against the IdP on every request.
**Why it is wrong:** Adds 50-200ms latency per API call, creates IdP dependency for availability.
**Do this instead:** Short-lived JWTs (15 min). Validate locally (check signature + expiry). Background refresh. Session revocation table checked only on refresh.

## Build Order (Dependency-Driven)

The following order minimizes blocked dependencies:

```
Phase 7: Identity, Access & Security
  7.1: PostgreSQL schema migrations (sessions, api_keys, signing_keys, saml_configs)
       + users table extensions
       WHY FIRST: Everything else depends on the schema existing.

  7.2: Auth module (JWT creation/validation, API key generation/validation)
       + RBAC middleware
       WHY SECOND: Dashboard and all protected routes need auth.

  7.3: SAML SSO integration (samlify, IdP config, assertion handling)
       WHY THIRD: Builds on auth module. Can test with Okta dev account.

  7.4: mTLS (cert generation script, tonic TLS config, @grpc/grpc-js TLS config)
       WHY FOURTH: Independent of auth, but same phase for security cohesion.

  7.5: Key rotation service
       WHY FIFTH: Requires auth (admin-only endpoint) and mTLS (fleet notification).

Phase 8: Dashboard Core
  8.1: Next.js project scaffold + layout + auth flow
       WHY FIRST: All views need the shell and login.

  8.2: Policy Builder + Vendor Management + Regulatory Selector (3 CRUD views)
       WHY SECOND: Most straightforward, validates API integration pattern.

  8.3: Audit Trail + Real-time Alerts (data-heavy views)
       WHY THIRD: ClickHouse queries already exist in API; UI is the work.

Phase 9: Compliance & Advanced Dashboard
  9.1: Compliance Reports + Evidence Verification UI
       WHY FIRST: Highest value for pilot customers (auditor-facing).

  9.2: Department Management + Human Review Queue
       WHY SECOND: Uses department scoping from RBAC.

  9.3: Anomaly Detection views
       WHY THIRD: Requires ClickHouse aggregation queries (new API endpoints).

Phase 10: Deployment & Packaging
  10.1: Dockerfiles (all 4 services + cert-init)
        WHY FIRST: Everything else in this phase needs working images.

  10.2: Docker Compose stack + integration test
        WHY SECOND: Validates full stack before Helm complexity.

  10.3: Helm chart + sidecar manifest + CA onboarding script
        WHY THIRD: K8s packaging, uses proven images from 10.1.
```

## Integration Points Summary

### Internal Boundaries

| Boundary | Communication | Direction | Auth | Changes in v1.1 |
|----------|---------------|-----------|------|------------------|
| Dashboard <-> Elysia API | HTTP REST | Dashboard calls API | JWT Bearer token | NEW (dashboard is new) |
| Kernel <-> Control Plane | gRPC (server-streaming) | CP pushes to kernel | mTLS client cert | MODIFIED (add mTLS) |
| Kernel <-> Evidence Collector | gRPC (client-streaming) | Kernel pushes to EC | mTLS client cert | MODIFIED (add mTLS) |
| Elysia API <-> PostgreSQL | SQL (drizzle ORM) | API reads/writes | Connection string | MODIFIED (new tables) |
| Elysia API <-> ClickHouse | HTTP SQL | API reads | Connection string | UNCHANGED |
| Dashboard <-> IdP | SAML 2.0 (HTTP redirect) | SP-initiated flow | SAML assertions | NEW |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Enterprise IdP (Okta/Azure AD) | SAML 2.0 SP-initiated SSO | Dashboard redirects to IdP; IdP POSTs assertion back |
| Container Registry | Docker push during CI | Images published for customer pull |
| Customer's K8s cluster | Helm install | Air-gapped friendly: images can be pre-loaded |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Pilot (80 users, single kernel) | Docker Compose on a single VM. All services on one host. PostgreSQL and ClickHouse have trivial load. |
| Medium (1k users, 10 kernels) | Helm chart. Multiple kernel instances. Control plane handles 10 gRPC streams. Dashboard behind a load balancer. |
| Enterprise (10k users, 100 kernels) | Horizontal pod autoscaler on control plane and dashboard. ClickHouse cluster for query throughput. Consider Redis session store for JWT validation if PostgreSQL becomes a bottleneck. |

### Scaling priorities for v1.1

1. **Dashboard SSR latency:** Server components with proper caching (Next.js fetch cache + revalidation). Not a concern at pilot scale.
2. **gRPC connection count on control plane:** 100 kernel connections is trivial for @grpc/grpc-js. Only matters at 1000+ kernels.
3. **ClickHouse query load from dashboard:** Already optimized with materialized views (v1.0). Dashboard adds UI, not new query patterns.

## Sources

- [Tonic mTLS Rustls Example](https://github.com/hyperium/tonic/blob/master/examples/src/tls_rustls/server.rs) -- HIGH confidence, official example
- [Tonic Transport Docs](https://docs.rs/tonic/latest/tonic/transport/index.html) -- HIGH confidence, official docs
- [@grpc/grpc-js mTLS](https://grpc.io/docs/guides/auth/) -- HIGH confidence, official gRPC docs
- [samlify SAML 2.0 library](https://github.com/tngan/samlify) -- MEDIUM confidence, most maintained TS SAML lib
- [Next.js App Router Architecture 2026](https://www.yogijs.tech/blog/nextjs-project-architecture-app-router) -- MEDIUM confidence, community patterns
- [Next.js Dashboard Learn Tutorial](https://nextjs.org/learn/dashboard-app) -- HIGH confidence, official Next.js tutorial
- [Next.js + shadcn/ui Admin Dashboard Template](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard) -- HIGH confidence, Vercel official template
- [Helm Best Practices](https://helm.sh/docs/chart_best_practices/) -- HIGH confidence, official Helm docs
- [ClickHouse Docker Compose Architectures](https://clickhouse.com/blog/clickhouse-architectures-with-docker-compose) -- HIGH confidence, official ClickHouse blog
- [Key Rotation Best Practices](https://www.kiteworks.com/regulatory-compliance/encryption-key-rotation-strategies/) -- MEDIUM confidence, industry guidance
- [RBAC in Next.js App Router](https://www.jigz.dev/blogs/how-to-implement-role-based-access-control-rbac-in-next-js-app-router) -- MEDIUM confidence, community guide
- [WorkOS Next.js App Router Auth Guide 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026) -- MEDIUM confidence, vendor guide

---
*Architecture research for: Interdict.io v1.1 Integration (Identity, Dashboard, Deployment)*
*Researched: 2026-03-01*

# Technology Stack

**Project:** Interdict.io v1.1 -- Pilot Ready (Identity, Dashboard, Deployment)
**Researched:** 2026-03-01
**Scope:** Stack ADDITIONS and CHANGES for v1.1 features only
**Overall confidence:** HIGH

> **Note:** This document supersedes the v1.0 STACK.md. The existing validated stack (Rust kernel, Bun + Elysia API, PostgreSQL, ClickHouse, gRPC, Wasmtime, Regorus, cryptographic pipeline) is unchanged. This document covers only the NEW libraries and configuration changes needed for v1.1.

---

## Recommended Stack Additions

### Identity & Security -- SAML 2.0 SSO

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| samlify | ^2.10.2 | SAML 2.0 SP implementation | Framework-agnostic Node.js SAML library. Supports both IdP-initiated and SP-initiated SSO flows. Version 2.10.0+ patches CVE-2025-47949 (signature wrapping attack) -- do NOT use anything older. Actively maintained (published 17 days ago as of research). 77 dependent projects. | HIGH |
| xml-crypto | (peer dep of samlify) | XML signature verification | Required for SAML assertion signature validation. Pulled in by samlify. | HIGH |

**Why samlify over alternatives:**

| Library | Status | Why Not |
|---------|--------|---------|
| samlify | **USE THIS** | Active, TypeScript, framework-agnostic, IdP+SP support, patched CVE |
| @node-saml/node-saml (v5.1.0) | Alternative | Passport-coupled heritage, heavier API surface. Viable fallback but samlify is cleaner for Elysia integration. |
| saml2-js (v4.0.4) | Avoid | Lower activity (40 dependents), no recent security patches |
| @boxyhq/saml-jackson (now Ory Polis) | Avoid | Separate service deployment -- overkill. We need a library, not a service. Adds operational complexity for pilot. |

**Architecture decision:** SAML validation happens EXCLUSIVELY in the Bun + Elysia control plane. The kernel never sees SAML XML. After SAML assertion is validated, the control plane issues a short-lived JWT (via existing @elysiajs/jwt) that the dashboard and API routes use for session management. This keeps SAML complexity out of the hot path.

**Integration pattern:**
1. Enterprise IdP (Okta/Azure AD) sends SAML assertion to Elysia `/auth/saml/acs` endpoint
2. samlify validates assertion signature and extracts identity claims
3. Elysia issues JWT session token with user identity + role
4. Dashboard stores JWT in HttpOnly cookie
5. API routes verify JWT via existing @elysiajs/jwt plugin

### Identity & Security -- RBAC

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| drizzle-orm (existing) | ^0.45.0 | RBAC schema tables | Already in stack. Add `users`, `roles`, `user_roles`, `sessions` tables using pgEnum for the 5 fixed roles. Drizzle supports pgEnum natively for type-safe role definitions. No new ORM needed. | HIGH |
| drizzle-orm pgPolicy | ^0.45.0 | Row-level security | Drizzle's `pgPolicy` and `pgRole` from `drizzle-orm/pg-core` enable declarative RLS policies in schema-as-code. Use for multi-tenant department isolation. | MEDIUM |

**No new library needed.** RBAC is implemented as:
- A PostgreSQL `role` enum: `super_admin`, `compliance_officer`, `policy_admin`, `department_manager`, `read_only_auditor`
- Elysia middleware that extracts role from JWT claims and checks against route-level permission maps
- The 5 roles are FIXED (not dynamic) for v1.1, so a simple permission map (`Record<Role, Permission[]>`) in TypeScript is sufficient -- no need for a CASL/casbin library

### Identity & Security -- mTLS (Inter-Service)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| rustls (existing) | 0.23.x | TLS with client cert verification | Already in kernel. Add `WebPkiClientVerifier` configuration for server-side mTLS. `WebPkiClientVerifier::builder()` accepts trust anchors and returns an `Arc<dyn ClientCertVerifier>` for `ServerConfig::with_client_cert_verifier()`. | HIGH |
| rcgen (existing) | 0.13.x | Internal CA + cert generation | Already in kernel for dynamic cert generation. Extend to generate: (1) internal root CA, (2) per-service certificates signed by that CA. `rustls-cert-gen` (built on rcgen) can generate Root CA + end-entity certs. | HIGH |
| tokio-rustls (existing) | 0.26.x | Async TLS streams | Already in kernel. No version change needed. | HIGH |

**No new Rust crates needed for mTLS.** The existing rustls + rcgen + tokio-rustls stack already supports everything required:
- `rustls::server::WebPkiClientVerifier` for requiring client certificates
- `rcgen` for generating the internal CA and per-service certificates
- The control plane (Bun) needs TLS client cert support -- Bun's `Bun.serve()` supports `tls` options with `ca`, `cert`, `key`, and `requestCert` natively

### Identity & Security -- Key Rotation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ed25519-dalek (existing) | 2.2.x | Signing key generation/rotation | Already in stack. Key rotation is an operational feature, not a new library. Generate new keypair, distribute via gRPC push, retain old public keys for verification of historical evidence bundles. | HIGH |

**No new library needed.** Key rotation is implemented as:
- New keypair generation via `ed25519_dalek::SigningKey::generate()`
- Store key metadata (key ID, creation timestamp, status) in PostgreSQL
- Distribute active public key to kernel fleet via existing gRPC policy push channel
- Evidence bundles include `key_id` field for verification against correct public key

### Identity & Security -- API Key Authentication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @elysiajs/bearer (existing ecosystem) | latest | Bearer token extraction | Official Elysia plugin for RFC6750 bearer token extraction from Authorization header. Extracts token; does NOT validate -- validation logic is ours. | HIGH |
| sha2 / crypto | built-in | API key hashing | Hash API keys with SHA-256 before storage (never store plaintext). Bun has built-in `crypto` module. Use `Bun.password.hash()` or raw SHA-256. | HIGH |

**API key implementation:**
- Generate random 256-bit API key, return to user ONCE
- Store SHA-256 hash in PostgreSQL `api_keys` table
- On request: extract bearer token, hash it, compare against stored hash
- API keys are scoped to a role (same RBAC roles) and have optional expiration

---

### Dashboard -- Next.js Application

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.1.x | Dashboard framework | Turbopack stable for dev and prod. React Compiler built-in (auto-memoization). Layout deduplication. `cacheLife`/`cacheTag` stable. This is the current production-ready version (shipped Oct 2025). | HIGH |
| React | 19.x | UI library | Server Components for initial data loads. Client components for interactive dashboard views. Required by Next.js 16. | HIGH |
| TypeScript | 5.7+ | Type safety | Strict mode. Shared types with Elysia control plane API. | HIGH |
| Tailwind CSS | 4.2.x | Styling | CSS-first config, no JS config file. 5x faster builds. Ships with Next.js 16 template. | HIGH |
| shadcn/ui | latest (CLI) | Component library | Copy-paste components on Radix UI primitives. Full React 19 + Tailwind v4 compatibility confirmed. Includes Chart component (built on Recharts), DataTable patterns, Sidebar, Card, Dialog, Form, Toast (Sonner). Not a dependency -- components are owned. | HIGH |

### Dashboard -- Data Fetching & State

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @tanstack/react-query | ^5.90.x | Server state management | Data fetching, caching, background refetch for all dashboard views. Stale-while-revalidate for real-time violation alerts. Suspense integration for RSC hydration. 40-70% faster initial loads when combined with RSC. | HIGH |
| zustand | latest | Client state | Global UI state: sidebar collapse, selected filters, theme preference. Smallest bundle, no Provider wrapper. Use alongside TanStack Query (not instead of). | HIGH |
| nuqs | latest | URL state | Type-safe search params for audit trail filters, policy list sorting, date ranges. Enables shareable/bookmarkable dashboard views. Presented at Next.js Conf 2025 and React Advanced 2025. | MEDIUM |

### Dashboard -- Forms & Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| react-hook-form | ^7.71.x | Form state management | Minimal re-renders, uncontrolled components by default. Required for Policy Builder UI (complex multi-field forms), Vendor Management forms, Department Management forms. 8600+ dependents. | HIGH |
| @hookform/resolvers | ^5.2.x | Schema validation bridge | Connects react-hook-form to Zod schemas. Supports Zod v4. | HIGH |
| zod | ^3.24.x | Schema validation | TypeScript-first validation. Shared schemas between dashboard (client validation) and API (server validation). Already implicit dependency via Elysia ecosystem. | HIGH |

### Dashboard -- Data Display

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @tanstack/react-table | ^8.21.x | Data tables | Headless table for: Audit Trail (sortable, filterable, paginated), Policy list, Vendor list, Human Review Queue. Supports column resizing, row selection, server-side pagination. Handles <10k rows smoothly with react-window virtualization. | HIGH |
| recharts | ^2.15.x | Charts & analytics | Used by shadcn/ui Chart component under the hood. Area charts (violation trends), bar charts (department usage), pie charts (policy distribution). No separate install needed if using shadcn/ui charts. | HIGH |
| date-fns | ^4.1.x | Date formatting | Tree-shakeable, functional API, TypeScript-first. Used for audit trail timestamps, report date ranges, evidence bundle dates. Lighter than dayjs for tree-shaking. | MEDIUM |
| sonner | latest | Toast notifications | Shadcn/ui's recommended toast library (the `<Toast />` component is deprecated in favor of Sonner). Used by OpenAI, Adobe. Provides success/error/warning/info notifications for policy save, deployment status, etc. | HIGH |

### Dashboard -- Real-time Updates

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Server-Sent Events (browser native) | N/A | Real-time violation alerts | No library needed. Use `EventSource` API in browser + Elysia SSE endpoint. TanStack Query's `refetchInterval` for polling as simpler alternative. SSE is appropriate for one-directional server-to-client alert streaming. | HIGH |

**No WebSocket library needed for v1.1.** Policy violation alerts and audit stream updates use one of:
1. TanStack Query polling (simplest, 5-second interval)
2. SSE from Elysia (if near-real-time needed, <1s latency)

WebSocket is overkill for dashboard alerts where server-to-client push is sufficient.

---

### Deployment -- Docker

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker multi-stage builds | latest | Container images | Rust: `rust:1.85-slim` builder -> `debian:bookworm-slim` runtime (NOT Alpine -- jemalloc and aws-lc-rs have musl issues). Bun: `oven/bun:1.3` builder -> `oven/bun:1.3-slim` runtime. Next.js: `oven/bun:1.3` builder -> `node:22-slim` runtime (Next.js standalone output). | HIGH |
| Docker Compose | v2 (compose.yaml) | Pilot deployment | Single `compose.yaml` with all services: kernel, control-plane, dashboard, evidence-collector, postgres, clickhouse, minio. Named volumes for data persistence. Health checks for startup ordering. | HIGH |

**Container images to build:**

| Image | Base (runtime) | Target size | Notes |
|-------|---------------|-------------|-------|
| `interdict/kernel` | debian:bookworm-slim | <50MB | Static Rust binary + TLS certs + ONNX model |
| `interdict/evidence-collector` | debian:bookworm-slim | <30MB | Static Rust binary |
| `interdict/control-plane` | oven/bun:1.3-slim | <100MB | Bun runtime + compiled TS |
| `interdict/dashboard` | node:22-slim | <150MB | Next.js standalone output |

**Why debian-slim over Alpine for Rust images:** The kernel uses `tikv-jemallocator` and `rustls` with `aws_lc_rs` backend. Both have known issues with musl libc (Alpine). Using `debian:bookworm-slim` avoids these while keeping images small (~25MB base).

### Deployment -- Helm Chart

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Helm | 3.x | K8s packaging | Standard K8s application distribution. One umbrella chart with subcharts per service. Values files per environment. | HIGH |

**Helm chart structure:**

```
deploy/helm/interdict/
  Chart.yaml              # Umbrella chart, appVersion: 1.1.0
  values.yaml             # Defaults
  values-pilot.yaml       # Law firm pilot overrides
  values-enterprise.yaml  # Enterprise K8s overrides
  charts/
    kernel/               # Subchart: Deployment + Service + sidecar ConfigMap
    control-plane/        # Subchart: Deployment + Service + Ingress
    dashboard/            # Subchart: Deployment + Service + Ingress
    evidence-collector/   # Subchart: Deployment + Service
  templates/
    _helpers.tpl          # Shared template helpers
    namespace.yaml
    secrets.yaml          # ExternalSecret refs (never plain values)
    networkpolicy.yaml    # Zero-trust inter-service network policies
    certificates.yaml     # cert-manager Certificate CRDs for mTLS
```

**Key Helm values:**
- `global.mtls.enabled: true` -- toggles mTLS between all services
- `global.saml.enabled: false` -- toggles SAML SSO (pilot may start with API keys)
- `kernel.replicaCount` -- kernel fleet size
- `kernel.resources.limits.memory: 128Mi` -- enforces sidecar budget
- Secrets reference `ExternalSecret` CRDs -- never embed in values.yaml

### Deployment -- Sidecar Manifests

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Kubernetes native sidecars | K8s 1.33+ (stable) | Kernel as sidecar | Native sidecar containers (init containers with `restartPolicy: Always`) graduated to stable in K8s 1.33 (April 2025). Start before main container, run throughout pod lifecycle, terminate gracefully. No webhook injection needed. | HIGH |

**Sidecar manifest pattern:**
```yaml
initContainers:
  - name: interdict-kernel
    image: interdict/kernel:1.1.0
    restartPolicy: Always    # Makes it a native sidecar
    resources:
      limits:
        memory: 128Mi
        cpu: 500m
      requests:
        memory: 64Mi
        cpu: 100m
    ports:
      - containerPort: 8080   # Proxy port
    readinessProbe:
      httpGet:
        path: /healthz
        port: 8080
```

### Deployment -- CA Certificate Onboarding

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| rcgen (existing) | 0.13.x | CA cert generation | Generate root CA cert for explicit proxy mode. Script outputs PEM files for distribution to client machines. | HIGH |
| Shell scripts | N/A | CA cert installation | Platform-specific scripts for installing CA cert: macOS (`security add-trusted-cert`), Windows (`certutil`), Linux (`update-ca-certificates`). | HIGH |

---

## Control Plane API Additions

These libraries are added to the existing Bun + Elysia control plane.

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| samlify | ^2.10.2 | SAML 2.0 SP | Enterprise SSO integration with Okta, Azure AD, OneLogin | HIGH |
| @elysiajs/bearer | latest | Bearer token extraction | API key auth fallback path | HIGH |
| @elysiajs/cors | latest | CORS headers | Dashboard (separate origin) calling API | HIGH |

**Already in stack, no changes:**
- `@elysiajs/jwt` -- JWT session tokens after SAML validation
- `drizzle-orm` -- RBAC tables, API key storage, session management
- `@clickhouse/client` -- Audit trail queries for dashboard
- `@grpc/grpc-js` -- Policy distribution, kernel fleet management

---

## Shared Types Package

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| zod | ^3.24.x | Shared validation schemas | Define API request/response schemas ONCE, share between Elysia (server validation) and Next.js (client validation + type inference). Eliminates type drift. | HIGH |
| TypeScript project references | 5.7+ | Monorepo type sharing | `packages/shared-types/` referenced by both `control-plane/` and `dashboard/`. Contains: role enums, API response types, policy types, audit event types. | HIGH |

---

## What NOT to Add for v1.1

| Technology | Why Not |
|------------|---------|
| **NextAuth.js / Auth.js** | Unnecessary abstraction. We have a custom auth flow (SAML -> JWT) that is simpler to implement directly with samlify + @elysiajs/jwt than to wrangle NextAuth's provider model. NextAuth adds complexity without value for a single-IdP enterprise flow. |
| **Passport.js** | Express-coupled. Does not integrate with Elysia. Legacy architecture. |
| **CASL / casbin** | RBAC is 5 FIXED roles with a static permission map. A full ABAC/RBAC library is overkill. A 50-line TypeScript permission checker is sufficient and more auditable. |
| **Socket.IO / ws** | WebSocket is overkill for server-to-client dashboard alerts. SSE or TanStack Query polling is sufficient for v1.1. |
| **Redis** | No session store needed -- JWT sessions are stateless. No cache needed -- TanStack Query handles client-side caching. ClickHouse handles audit queries fast enough. |
| **Traefik / Nginx ingress** | Helm chart should be ingress-controller-agnostic. Use standard `Ingress` resources with annotations. Customer provides their own ingress controller. |
| **cert-manager** | Do NOT bundle cert-manager in the Helm chart. Reference it as an optional integration. Many enterprises already have cert-manager; others use Vault. Provide both paths in values.yaml. |
| **Prisma** | Already rejected in v1.0. Binary engine overhead. Drizzle is established. |
| **AG Grid** | Enterprise license required. TanStack Table handles all audit trail / policy list needs with <10k visible rows. |
| **D3.js** | Too low-level. Recharts (via shadcn/ui Chart component) covers all v1.1 dashboard chart needs. |
| **Tremor** | While viable, shadcn/ui's Chart component (built on Recharts) provides sufficient charting and keeps the component system unified. Using both shadcn + Tremor creates inconsistent design language. |

---

## Installation Commands

### Control Plane API Additions

```bash
cd control-plane/

# SAML 2.0 SSO
bun add samlify

# Bearer token extraction for API key auth
bun add @elysiajs/bearer

# CORS (if not already added)
bun add @elysiajs/cors
```

### Dashboard (New Application)

```bash
# Initialize Next.js 16 project
bunx create-next-app@latest dashboard --typescript --tailwind --eslint --app --turbopack

cd dashboard/

# Core data fetching and state
bun add @tanstack/react-query @tanstack/react-table
bun add zustand
bun add nuqs

# Forms and validation
bun add react-hook-form @hookform/resolvers zod

# Date formatting
bun add date-fns

# shadcn/ui initialization
bunx shadcn@latest init

# shadcn/ui components (add as needed during development)
bunx shadcn@latest add button card dialog dropdown-menu form input label \
  select separator sheet sidebar sonner table tabs textarea badge \
  alert alert-dialog avatar checkbox command popover scroll-area \
  tooltip chart calendar date-picker data-table

# Dev dependencies
bun add -d @types/react @types/react-dom
```

### Proto / Shared Types

```bash
# Shared types package (new)
mkdir -p packages/shared-types
cd packages/shared-types
bun init
bun add zod
```

### Docker / Deployment

```bash
# No package installs needed -- Docker and Helm are CLI tools

# Verify Helm is installed
helm version  # Requires 3.x

# Create Helm chart scaffold
helm create deploy/helm/interdict

# Docker Compose -- create compose.yaml at repo root
# (file authored manually, no tooling needed)
```

---

## Version Pinning Strategy (v1.1 Additions)

| Component | Pin Strategy | Rationale |
|-----------|-------------|-----------|
| samlify | ^2.10.2 (minimum 2.10.0) | CVE-2025-47949 patched in 2.10.0. MUST NOT use older. |
| Next.js | 16.1.x | Current stable with Turbopack. Do not jump to 16.2+ without testing. |
| react-hook-form | ^7.71.x | Stable v7 line. v8 not released yet. |
| @hookform/resolvers | ^5.2.x | Zod v4 support included. |
| @tanstack/react-query | ^5.90.x | Stable v5 line. |
| @tanstack/react-table | ^8.21.x | Stable v8 line. |
| zod | ^3.24.x | v3 stable. Zod v4 exists but ecosystem compatibility (hookform, etc.) is still settling. |
| Helm chart apiVersion | v2 | Helm 3 chart format. |
| Kubernetes sidecar | K8s 1.29+ (beta) / 1.33+ (stable) | Native sidecars. Verify customer K8s version. |

---

## Integration Points

### SAML -> JWT -> RBAC Flow

```
[Enterprise IdP] --SAML Assertion--> [Elysia /auth/saml/acs]
                                          |
                                    samlify.parseLoginResponse()
                                          |
                                    Extract: email, name, groups
                                          |
                                    Lookup/create user in PostgreSQL
                                    Map IdP groups -> Interdict roles
                                          |
                                    @elysiajs/jwt.sign({ sub, role, ... })
                                          |
                                    Set HttpOnly cookie
                                          |
[Dashboard] <--JWT cookie--> [Elysia API routes]
                                          |
                                    JWT verification + role check
                                          |
                                    Route-level RBAC enforcement
```

### mTLS Between Services

```
[Kernel] --mTLS--> [Evidence Collector]    (rustls client cert -> rustls server verifier)
[Kernel] --mTLS--> [Control Plane gRPC]    (rustls client cert -> Bun TLS server)
[Control Plane] --mTLS--> [Kernel gRPC]    (Bun TLS client -> rustls server verifier)
```

All services present certificates signed by the internal CA (generated with rcgen). Each service validates the peer's certificate against the CA trust anchor.

### Dashboard -> API -> Databases

```
[Next.js Dashboard]
    |
    | fetch() with JWT cookie (HttpOnly, Secure, SameSite=Strict)
    |
[Elysia Control Plane API]
    |
    |-- drizzle-orm --> [PostgreSQL]     (policies, users, roles, config)
    |-- @clickhouse/client --> [ClickHouse]  (audit trail, analytics)
    |-- @grpc/grpc-js --> [Kernel fleet]     (policy push, status)
```

---

## Key Technical Decisions for v1.1

### 1. samlify for SAML 2.0 -- RECOMMENDED (HIGH confidence)

samlify is framework-agnostic (works with Elysia without Express dependency), actively maintained, and the 2.10.0+ release addresses the critical signature wrapping CVE. The alternative (`@node-saml/node-saml`) works but carries Passport.js heritage that adds unnecessary abstraction.

**Risk:** samlify's Bun compatibility is not explicitly documented. The library uses `xml-crypto` which depends on Node.js `crypto` module -- Bun has full `crypto` module support as of v1.3. LOW risk of incompatibility, but must be validated during implementation.

### 2. No Auth Framework for Dashboard -- RECOMMENDED (HIGH confidence)

NextAuth.js / Auth.js would add complexity without value. The auth flow is simple: SAML assertion -> JWT session. This is 100 lines of Elysia middleware, not a framework problem. Enterprise customers with custom IdPs prefer explicit auth code they can audit over opaque framework magic.

### 3. shadcn/ui + Recharts for All Dashboard UI -- RECOMMENDED (HIGH confidence)

Using a single design system (shadcn/ui) with its built-in Chart component (Recharts) keeps the UI consistent. Adding Tremor or a second component library creates design fragmentation. All 10 dashboard views can be built with shadcn/ui primitives.

### 4. TanStack Query + Zustand Split -- RECOMMENDED (HIGH confidence)

Server state (API data) managed by TanStack Query. Client state (UI preferences) managed by Zustand. This is the dominant pattern in 2025-2026 React applications and avoids the Redux boilerplate that enterprise dashboards historically suffered from.

### 5. Native K8s Sidecars -- RECOMMENDED (HIGH confidence)

Kubernetes native sidecar containers (stable since K8s 1.33, April 2025) eliminate the need for webhook-based sidecar injection. The kernel sidecar starts before the main application container, runs throughout the pod lifecycle, and terminates gracefully. This is the correct deployment model for an inline proxy.

**Caveat:** Some enterprise customers may run K8s < 1.33. Provide a fallback regular-container sidecar manifest that uses lifecycle hooks for startup ordering.

### 6. debian-slim over Alpine for Rust Images -- RECOMMENDED (HIGH confidence)

The kernel uses `tikv-jemallocator` (requires glibc) and `rustls` with `aws_lc_rs` (has musl build issues). Alpine uses musl libc. Using `debian:bookworm-slim` avoids these issues while keeping images small (~25MB base). The final kernel image will be <50MB.

---

## Gaps Requiring Phase-Specific Research

1. **samlify on Bun validation** -- Must test XML signature verification and assertion parsing under Bun runtime during implementation. Have `@node-saml/node-saml` as fallback.

2. **SAML metadata exchange with specific IdPs** -- Okta and Azure AD each have quirks in their SAML metadata format. Need to test with actual IdP test instances during the identity phase.

3. **ClickHouse query patterns for dashboard** -- The 10 dashboard views will generate specific query patterns (time-series aggregations, department rollups, anomaly detection). ClickHouse materialized views may be needed for sub-second dashboard loads. Design during audit trail dashboard phase.

4. **Next.js 16 + Bun as package manager compatibility** -- Next.js officially supports npm/yarn/pnpm. Bun works but is not officially listed. Test `bun run build` and `bun run start` with Next.js 16 standalone output during dashboard setup.

5. **Helm chart templating for mTLS certificates** -- The CA cert bootstrap process (generate CA, sign per-service certs, inject into pods) needs careful Helm templating. Consider cert-manager integration as optional but document manual cert injection for air-gapped environments.

---

## Sources

### Verified (HIGH confidence)
- [samlify npm](https://www.npmjs.com/package/samlify) -- v2.10.2, published 17 days ago
- [CVE-2025-47949 samlify](https://www.endorlabs.com/learn/cve-2025-47949-reveals-flaw-in-samlify-that-opens-door-to-saml-single-sign-on-bypass) -- Signature wrapping vulnerability, patched in 2.10.0
- [Next.js 16 blog](https://nextjs.org/blog/next-16) -- Turbopack stable, React Compiler built-in
- [Next.js 16.1 blog](https://nextjs.org/blog/next-16-1) -- Turbopack File System Caching stable
- [shadcn/ui React 19 compatibility](https://ui.shadcn.com/docs/react-19) -- Full React 19 + Tailwind v4 support
- [shadcn/ui Chart component](https://ui.shadcn.com/docs/components/radix/chart) -- Built on Recharts
- [shadcn/ui Sonner component](https://ui.shadcn.com/docs/components/radix/sonner) -- Replaces deprecated Toast
- [react-hook-form npm](https://www.npmjs.com/package/react-hook-form) -- v7.71.2
- [@hookform/resolvers npm](https://www.npmjs.com/package/@hookform/resolvers) -- v5.2.2, Zod v4 support
- [TanStack Query](https://tanstack.com/query/latest) -- v5.90.x
- [TanStack Table](https://tanstack.com/table/v8) -- v8.21.x
- [Elysia JWT plugin](https://elysiajs.com/plugins/jwt) -- Official JWT plugin
- [Elysia Bearer plugin](https://elysiajs.com/plugins/bearer) -- Official Bearer token extraction
- [Elysia Cookie docs](https://elysiajs.com/patterns/cookie) -- Cookie support merged into core
- [rustls WebPkiClientVerifier](https://docs.rs/rustls/latest/rustls/server/struct.WebPkiClientVerifier.html) -- mTLS server-side verification
- [rustls ClientCertVerifierBuilder](https://docs.rs/rustls/latest/rustls/server/struct.ClientCertVerifierBuilder.html) -- Builder for client cert verification
- [rcgen GitHub](https://github.com/rustls/rcgen) -- X.509 cert generation, maintained by rustls team
- [Kubernetes native sidecars](https://kubernetes.io/blog/2025/06/03/start-sidecar-first/) -- Stable in K8s 1.33
- [Drizzle ORM RLS](https://orm.drizzle.team/docs/rls) -- Row-level security support
- [Drizzle ORM PostgreSQL Best Practices 2025](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) -- pgEnum patterns
- [Helm Best Practices](https://helm.sh/docs/chart_best_practices/) -- Official chart best practices guide
- [nuqs](https://nuqs.dev/) -- Type-safe URL state, presented at Next.js Conf 2025

### Verified (MEDIUM confidence)
- [Bun Node.js compatibility](https://bun.com/docs/runtime/nodejs-compat) -- crypto module supported
- [@node-saml/node-saml npm](https://www.npmjs.com/package/@node-saml/node-saml) -- v5.1.0, fallback SAML option
- [samlify docs](https://samlify.js.org/) -- IdP + SP implementation guide
- [Docker multi-stage Rust builds](https://dev.to/mattdark/rust-docker-image-optimization-with-multi-stage-builds-4b6c) -- Multi-stage patterns
- [ClickHouse Docker Compose](https://clickhouse.com/docs/use-cases/observability/clickstack/deployment/docker-compose) -- Official Docker Compose guide

### Web Search (LOW confidence -- verify during implementation)
- samlify + Bun runtime compatibility -- No explicit documentation found, inferred from Bun's Node.js crypto compatibility
- Next.js 16 + Bun as package manager -- Works in practice but not officially supported by Vercel

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

# Pitfalls Research

**Domain:** Adding Enterprise Identity, Dashboard UI, and Deployment Packaging to an Existing AI Governance Platform
**Researched:** 2026-03-01
**Confidence:** HIGH (pitfalls verified across multiple sources, existing codebase analyzed for specific integration risks)

NOTE: This file supersedes the v1.0 pitfalls research. v1.0 pitfalls (streaming, Wasmtime pooling, ClickHouse partitioning, etc.) were addressed during v1.0 development. This document focuses exclusively on pitfalls for the v1.1 milestone: Identity & Security, Dashboard, and Deployment.

## Critical Pitfalls

### Pitfall 1: Retrofitting Auth Onto an Unauthenticated API Breaks All Existing Internal Callers

**What goes wrong:**
The existing Elysia control plane API (`/api/v1/policies`, `/api/v1/vendors`, `/api/v1/regulatory`, `/api/v1/audit`) currently has zero authentication. Every endpoint is open. Adding SAML SSO + RBAC middleware means every existing internal caller -- the gRPC distribution server, the compilation worker, seed scripts, integration tests, and the future dashboard -- suddenly gets 401 responses. The system appears to "break everywhere at once" and developers scramble to add auth bypass exceptions, creating swiss-cheese security.

Simultaneously, the kernel-to-control-plane gRPC channel (`policy.distribution`) and kernel-to-evidence-collector gRPC channel are also unauthenticated. Adding auth to HTTP but not gRPC creates an inconsistent security boundary where the most privileged channels (policy push, evidence submission) remain wide open.

**Why it happens:**
The v1.0 API was built for developer-to-API interaction during development. No auth middleware exists in `src/index.ts`. The Elysia app chain (`.use(policiesModule).use(compilerModule)...`) has no authentication guard. Developers add SAML to the front door but forget the internal service-to-service callers that bypass the front door entirely.

**How to avoid:**
- Design three distinct authentication planes before writing any auth code:
  1. **Browser sessions** (SAML SSO -> session cookie/JWT for dashboard users)
  2. **API keys** (for programmatic access, CI/CD, scripts -- pilot fallback)
  3. **Service-to-service** (mTLS client certificates for kernel <-> control plane, kernel <-> evidence collector)
- Implement auth as Elysia middleware that checks for any valid credential type, not just SAML tokens.
- Create a service account with API key for the compilation worker and distribution server from day one.
- Update all integration tests to use API key auth before enabling the auth middleware.
- Never add auth exceptions by URL path (e.g., "skip auth for /internal/*"). Use credential type to determine access, not URL patterns.

**Warning signs:**
- Integration tests start failing after auth middleware is added
- Auth bypass list grows beyond `/health` and `/saml/callback`
- gRPC channels still use plaintext after HTTP API has auth
- Seed scripts and workers hardcode "skip auth" flags

**Phase to address:**
Phase 7 (Identity & Security). Auth design must cover all three planes in the architecture plan before any code is written.

---

### Pitfall 2: SAML Implementation Trusts Unsigned Assertions or Mismatches Entity IDs

**What goes wrong:**
SAML 2.0 has two signature locations: the Response envelope and the Assertion inside it. Some IdPs (Okta) sign both, some (Azure AD) may sign only one. If the implementation validates the Response signature but not the Assertion signature, an attacker can modify the Assertion contents (change the user's email, role, or group membership) while the Response signature remains valid. This is called a "signature wrapping attack" and has been exploited in production against major platforms.

A second common failure: the SAML Response contains an `Issuer` and `Audience` field. If these aren't validated against expected values, any SAML IdP (including attacker-controlled ones) can authenticate users. The existing users table has an `external_id` column for "SAML subject" -- if this is populated without issuer validation, a rogue IdP can impersonate any user.

**Why it happens:**
SAML libraries abstract away the XML complexity but many developers treat SAML parsing as "decode the XML, extract the email, done." The signature validation code is technically present but tests only cover the happy path. No two IdPs implement SAML identically -- Okta, Azure AD, and OneLogin all produce differently-structured responses, and the variations are where vulnerabilities hide.

**How to avoid:**
- Use an established SAML library (e.g., `@node-saml/node-saml` for Node/Bun) rather than hand-parsing XML. Verify it validates both Response and Assertion signatures.
- Pin the expected `Issuer` (IdP entity ID) and `Audience` (Interdict SP entity ID) in server-side config. Reject any response that doesn't match exactly, including trailing slashes and http vs https.
- Store the IdP's X.509 signing certificate in config. Reject assertions signed by unknown certificates.
- Validate `InResponseTo` field to prevent replay attacks -- each SAML response must correspond to a request Interdict initiated.
- Test with at least two IdPs (Okta + Azure AD) during development, not just one. The second IdP always reveals assumptions baked into the first integration.
- Validate `NotBefore` and `NotOnOrAfter` timestamps with clock skew tolerance of at most 5 minutes.

**Warning signs:**
- SAML integration tests only cover one IdP
- No test for signature wrapping (modified assertion with valid response signature)
- `Audience` field not validated or hardcoded to a wildcard
- XML signature validation disabled "for development"
- Clock skew tolerance set to hours instead of minutes

**Phase to address:**
Phase 7 (Identity & Security). SAML is a security-critical integration. Ship with strict validation from the first commit; never ship with relaxed validation intending to "tighten later."

---

### Pitfall 3: RBAC Checks at the Route Level but Not at the Data Level

**What goes wrong:**
The five roles (Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor) are enforced at the API endpoint level: "Policy Admins can POST to `/api/v1/policies`." But the data returned by GET endpoints is not filtered by role scope. A Department Manager can view audit trails for ALL departments, not just their own. A Read-Only Auditor can see all policies including draft/disabled ones. The RBAC appears complete (every route has a role check) but the authorization boundary is actually porous.

This is especially dangerous because the system already has department and team associations in the database schema (`organization.ts` defines `departments`, `teams`, `users` with department/team references, and policies have department-scoping). The data model supports scoping but the API doesn't enforce it.

**Why it happens:**
Route-level RBAC is the simplest to implement -- a middleware checks the user's role against a route permission map. Data-level scoping requires every query to include a WHERE clause filtering by the user's department/team. This touches every service method, every SQL query, and every ClickHouse query. Developers ship route-level RBAC, demo it, and defer data-level filtering.

**How to avoid:**
- Design RBAC as two layers from the start:
  1. **Route guard** (middleware): can this role access this endpoint at all?
  2. **Data filter** (query scoping): within this endpoint, what data can this user see?
- Implement a `scopeQuery(user)` utility that every Drizzle query and ClickHouse query passes through. For Super Admins it returns no filter; for Department Managers it adds `WHERE department_id = user.department_id`.
- Add integration tests that create two Department Managers in different departments and verify each can only see their own department's data.
- Audit trail queries (ClickHouse) must also be scoped. A Department Manager querying `/api/v1/audit` should only see events from their department.
- The human review queue in the kernel (SQLite) also needs RBAC scoping when exposed through the dashboard.

**Warning signs:**
- RBAC test suite only tests "can/cannot access endpoint," never tests data returned
- No `department_id` filter in ClickHouse audit queries
- All roles see identical data on GET endpoints, just different UI components hidden
- Department Manager role exists but no query filters reference `user.departmentId`

**Phase to address:**
Phase 7 (Identity & Security) for the RBAC framework with data scoping design, Phase 8 (Dashboard Core) for enforcing scoping in every dashboard API call.

---

### Pitfall 4: mTLS Retrofit Causes Coordinated Startup Failures (Certificate Bootstrap Problem)

**What goes wrong:**
Adding mTLS between kernel <-> control plane and kernel <-> evidence collector creates a circular dependency at startup: the kernel needs a valid client certificate to connect to the control plane, but the control plane might issue/distribute certificates, and the evidence collector needs the kernel's certificate to accept connections. If any component starts before certificates are provisioned, it crashes or enters a reconnect loop. In Docker Compose (no orchestrator), startup order is non-deterministic, so the first deployment attempt fails.

The existing code confirms this risk: `EvidenceGrpcClient::connect_inner()` in `crates/kernel/src/evidence/client.rs` creates an `Endpoint` with no TLS config. `startDistributionServer()` in the control plane starts a plain gRPC server. Adding mTLS to both simultaneously means both sides must have valid certificates before either can start.

**Why it happens:**
mTLS works beautifully in service meshes (Istio, Linkerd) where the mesh injects certificates via sidecar. Without a service mesh, you must provision certificates before services start. Developers test mTLS by generating certificates manually and placing them on disk, which works. But in automated deployment (Docker Compose, Helm), the certificate provisioning step is missing or races with service startup.

**How to avoid:**
- Provision certificates as a pre-deploy step, not an in-band operation. Generate a per-deployment CA + component certificates during `docker compose up` or Helm install, before any service starts.
- In Docker Compose, use an init container or entrypoint script that waits for certificate files to exist before starting the main process.
- In Helm, use a Job or init container that generates certificates using `cfssl` or `openssl`, stores them in a Secret, and completes before the main pods start.
- Design the kernel's gRPC client to support a "TLS optional" mode during initial bootstrap, with a hard requirement to upgrade to mTLS within a configurable timeout (e.g., 60 seconds). Log a CRITICAL warning if running without mTLS after the grace period.
- Support both `http://` (plain) and `https://` (mTLS) in the `distribution_addr` config to enable gradual migration. But fail-closed if mTLS is configured but the certificate is missing.
- Test the full lifecycle: fresh deploy with no pre-existing certificates, certificate rotation, and certificate expiry.

**Warning signs:**
- Services crash-loop on fresh deployment with "certificate not found" errors
- Docker Compose requires manual certificate generation before `docker compose up`
- mTLS works in development (pre-generated certs) but fails in CI/CD
- No health check distinguishes "healthy but no mTLS" from "healthy with mTLS"
- Certificate paths hardcoded instead of configurable

**Phase to address:**
Phase 7 (Identity & Security) for mTLS implementation, Phase 10 (Deployment) for certificate provisioning automation. These phases MUST be coordinated -- mTLS code without automated provisioning is unusable.

---

### Pitfall 5: Ed25519 Signing Key Rotation Breaks Evidence Chain Verification

**What goes wrong:**
The evidence pipeline uses Ed25519 to sign every evidence bundle. The current code in `bundle.rs` shows `signing_key_id: String::new()` and `signature: Vec::new()` -- the signing infrastructure exists in the evidence collector but key rotation was deferred. When key rotation is implemented, old evidence bundles (signed with key v1) must remain verifiable even after the active signing key rotates to v2. If the old public key is discarded or overwritten, the entire historical audit trail becomes unverifiable, destroying the product's core value proposition.

The problem compounds with the hash chain: each bundle references the previous bundle's hash. If a key rotation causes a gap or resets the chain, auditors will flag the discontinuity as potential evidence tampering.

**Why it happens:**
Key rotation is conceptually simple ("generate new key, start using it") but the verification side is complex. Developers implement rotation for the signing side but forget that verifiers need access to ALL historical public keys. The `signing_key_id` field in the proto bundle exists for this purpose, but if it's not populated in v1.0 bundles, there's no way to know which key signed them.

**How to avoid:**
- Before implementing key rotation, backfill the `signing_key_id` field in all existing evidence bundles. If v1.0 bundles have `signing_key_id: ""`, define this as "key v1" in the key registry.
- Implement a key registry table in PostgreSQL: `signing_keys(id, version, public_key_pem, created_at, retired_at, status)`. Never delete rows from this table.
- Key rotation procedure: generate new key -> add to registry as "pending" -> switch active signing to new key -> mark old key as "retired" (not deleted) -> all verifiers can still look up retired keys.
- The hash chain must continue unbroken across key rotations. A key rotation is NOT a chain reset. The first bundle signed with key v2 still references the hash of the last bundle signed with key v1.
- Implement a verification endpoint that accepts a bundle ID and returns the verification result, automatically selecting the correct public key by `signing_key_id`.
- Test: rotate the key, then verify a bundle signed with the old key. This test must pass.

**Warning signs:**
- Key rotation test only verifies new bundles, not old ones
- `signing_key_id` empty or not populated in evidence bundles
- Key registry allows DELETE operations
- Chain hash resets to zero after key rotation
- Only one public key stored in the system at any time

**Phase to address:**
Phase 7 (Identity & Security) for key rotation implementation. Must be designed alongside mTLS certificate management (shared CA/PKI infrastructure).

---

### Pitfall 6: Dashboard Polling Kills ClickHouse Under Multi-User Load

**What goes wrong:**
The 10-view dashboard (audit trail, violations, anomalies, compliance reports, etc.) makes each view poll ClickHouse every 5-10 seconds for fresh data. With 5 concurrent dashboard users viewing 3 tabs each, that's 15 queries every 5 seconds = 3 queries/second to ClickHouse. These are complex analytical queries (time-series aggregations, group-by department, count violations by policy). ClickHouse handles these individually fast, but concurrent dashboard queries compete with the evidence ingestion pipeline for resources. Under real load (80 users generating AI traffic + 5 admins on dashboard), ClickHouse query latency spikes from <100ms to >5 seconds, making the dashboard unusable.

**Why it happens:**
Each dashboard component is built independently with its own data fetching. The audit trail view queries ClickHouse. The violation stats widget queries ClickHouse. The anomaly chart queries ClickHouse. No shared caching layer exists. React Query / SWR help with client-side caching per component, but each user's browser maintains its own cache, so N users = N x identical queries.

**How to avoid:**
- Implement a server-side query cache in the control plane API with 15-30 second TTL for dashboard queries. One ClickHouse query serves all dashboard users viewing the same time range.
- Use ClickHouse materialized views for the most common dashboard aggregations:
  - `mv_violations_hourly`: pre-aggregated violation counts by department, policy, hour
  - `mv_vendor_stats_daily`: request counts by vendor/model per day
  - `mv_anomaly_metrics`: pre-computed anomaly scores per time window
- The dashboard should poll the control plane API, never ClickHouse directly. The API manages the cache and materialized view routing.
- Use WebSocket or SSE for real-time violation alerts instead of polling. Push new violations to connected dashboard clients.
- Implement query budgets: each dashboard session gets max N ClickHouse queries per minute. Exceeded budget falls back to cached data.
- Test with realistic concurrent dashboard load (5+ users, all tabs open) while the kernel is processing 1000+ requests/second.

**Warning signs:**
- Dashboard components each make independent ClickHouse queries
- No server-side cache layer between API and ClickHouse
- ClickHouse CPU spikes correlate with dashboard user count, not AI traffic volume
- Dashboard latency degrades when more admins are logged in
- Materialized views not created during schema setup

**Phase to address:**
Phase 8 (Dashboard Core) for the caching layer and materialized views, Phase 9 (Advanced Dashboard) for real-time push and anomaly pre-computation.

---

### Pitfall 7: Docker Compose Stack Cannot Survive Single-Component Restart

**What goes wrong:**
The Docker Compose deployment starts 6 containers (kernel, control plane API, dashboard, evidence collector, PostgreSQL, ClickHouse). Restarting any single container causes cascading failures: restarting PostgreSQL causes the control plane to crash (no reconnection). Restarting the evidence collector causes the kernel's evidence buffer to fill and start dropping events permanently (no recovery after reconnection). Restarting the control plane causes the kernel to enter fail-closed mode and block all AI traffic (per the 30-second disconnect timeout), even if the control plane is only down for 5 seconds during a config change.

The pilot customer (law firm, 80 users) will need to update configuration, apply patches, and restart individual components without an outage window. If restarting the control plane blocks all AI traffic firm-wide, the CISO will pull the plug.

**Why it happens:**
Each component was developed to start cleanly from a fresh state. Reconnection logic exists (the evidence client has retry-on-failure) but it wasn't designed for frequent restart cycles. Docker Compose provides `restart: unless-stopped` but this only restarts crashed containers; it doesn't help with graceful restart scenarios. Developers test "start everything" and "stop everything" but not "restart one component while others are running."

**How to avoid:**
- Implement health check endpoints on every component that Docker Compose `healthcheck` can probe. Use `depends_on` with `condition: service_healthy` for startup ordering.
- The kernel's disconnect behavior must distinguish "control plane is restarting" (brief outage, keep last policy) from "control plane is gone" (extended outage, fail-closed). Use the existing `disconnect_mode: "keep_last"` for the default Docker Compose profile, with `fail_closed` reserved for high-security profiles.
- The evidence buffer must handle collector restarts gracefully: buffer events during outage, replay on reconnection, never permanently drop events unless the buffer is full.
- Add a `docker compose restart <service>` test to CI: restart each component one at a time while traffic is flowing and verify zero dropped requests and zero lost evidence events.
- PostgreSQL and ClickHouse must use Docker volumes for data persistence. A `docker compose down && docker compose up` must not lose data.

**Warning signs:**
- No `healthcheck` in Docker Compose YAML
- `depends_on` without `condition: service_healthy`
- No data volumes defined for PostgreSQL and ClickHouse
- Restarting one container requires restarting all containers
- Evidence events lost during evidence collector restart (check counts before/after)

**Phase to address:**
Phase 10 (Deployment). But the reconnection and resilience behaviors must be verified during Phase 7-9 development. Phase 10 is too late to discover that components don't handle restarts.

---

### Pitfall 8: Helm Chart Values Drift From Docker Compose Config

**What goes wrong:**
Two deployment targets (Docker Compose for small pilots, Helm for K8s enterprises) means two sets of configuration. Environment variables, port mappings, volume mounts, resource limits, and certificate paths are defined in both `docker-compose.yml` and Helm `values.yaml`. When a new config option is added (e.g., mTLS CA path), it gets added to Docker Compose but not Helm, or vice versa. After a few weeks, the two deployment methods require different config and behave differently. A bug reproduced in Docker Compose doesn't reproduce in Helm, and vice versa.

**Why it happens:**
Docker Compose and Helm have completely different configuration languages (YAML vs Go templates). There's no shared source of truth. The developer adding a feature tests with Docker Compose (faster iteration) and never tests with Helm. Helm values accumulate undocumented defaults that differ from Docker Compose env vars.

**How to avoid:**
- Define a single `env.example` file that is the source of truth for all configuration variables. Both `docker-compose.yml` and Helm `values.yaml` must reference the same variable names.
- Create a configuration validation script that parses both Docker Compose and Helm values and asserts they define the same set of config keys.
- Use a shared `.env` template that Docker Compose reads directly (`env_file:`) and that a Helm ConfigMap is generated from.
- CI must test BOTH deployment methods. Not just Docker Compose. Every PR that touches config must pass both Docker Compose and Helm smoke tests.
- Document which config values are deployment-method-specific (e.g., K8s resource limits don't apply to Docker Compose) vs shared.

**Warning signs:**
- Config values exist in Docker Compose but not Helm, or vice versa
- Default values differ between the two deployment methods
- No automated test compares config parity
- Bugs are "Helm only" or "Docker Compose only"
- README documents only one deployment method

**Phase to address:**
Phase 10 (Deployment). But the configuration design (shared variable names, validation script) should be established in Phase 7 when the first new config values (SAML, mTLS paths) are added.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing SAML session state in Elysia server memory | No Redis dependency, simpler setup | Server restart logs out all users; cannot scale to multiple API instances | Acceptable for single-instance pilot only. Add Redis/persistent sessions before multi-instance. |
| Skipping mTLS for Docker Compose deployments | Faster pilot onboarding, fewer cert headaches | Two security postures to maintain; Docker Compose pilots have weaker security than K8s | Acceptable for initial pilot ONLY if documented as known limitation. Must not ship as default. |
| Using Next.js API routes for dashboard auth instead of Elysia middleware | Faster dashboard development, one less integration | Auth logic split across two codebases (Next.js + Elysia); inconsistent session handling | Never. Auth belongs in Elysia. Dashboard calls Elysia API with session cookie. |
| Hardcoding the 5 RBAC roles instead of a permission table | Simpler, fewer database queries, 5 roles is all the spec requires | Cannot add new roles (e.g., "Incident Responder") without code changes and migration | Acceptable for v1.1. Roles are few and well-defined. Add permission table when role count exceeds 8. |
| Building dashboard views without server-side pagination | Faster UI development, simpler component code | Audit trail with 100k+ entries crashes browser tab; ClickHouse returns massive payloads | Never for audit trail or evidence views. Acceptable for policy list (typically <100 items). |
| Generating self-signed CA for mTLS in Docker entrypoint | Zero manual cert setup for pilot | Non-deterministic CA on each `docker compose up`; previous certificates become invalid | Acceptable if CA is persisted in a Docker volume. Never if CA is ephemeral. |

## Integration Gotchas

Common mistakes when connecting v1.1 components to the existing v1.0 system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SAML 2.0 in Bun/Elysia | Using a passport-saml library designed for Express/Node.js; Bun's compatibility layer may not handle XML parsing, crypto callbacks, or redirect flows correctly | Test the specific SAML library against Bun runtime before committing. Validate XML signature verification works in Bun (not just Node). Consider `@node-saml/node-saml` with explicit Bun compatibility testing. Have a fallback plan to use a standalone SAML proxy (e.g., `saml2-js`) if Bun compat fails. |
| Next.js dashboard calling Elysia API | Using Next.js server actions or API routes to proxy Elysia calls, adding unnecessary latency and auth complexity | Dashboard calls Elysia API directly from the browser with session cookie (same-origin) or Bearer token (cross-origin). Next.js is a static/SSR shell, not an API proxy. Server components can call Elysia during SSR for initial data, but interactive state uses client-side fetching. |
| Tonic (Rust) gRPC with mTLS | Loading certificates at startup and never refreshing; when certificates rotate, the gRPC channel fails until the kernel restarts | Use `tonic`'s `TlsConfig` with file-watching or periodic reload. Alternatively, use `tower` middleware to intercept the TLS handshake and reload certificates. Design the kernel to detect cert file changes (inotify/polling) and reconnect the gRPC channel without full restart. |
| ClickHouse audit queries with user scoping | Running `WHERE department_id = ?` on a ClickHouse table where `department_id` is not in the primary key or sort order, causing full table scans | Ensure the ClickHouse `ORDER BY` clause includes `department_id` for tables queried by the dashboard. If the primary key is `(timestamp, vendor)`, add a materialized view sorted by `(department_id, timestamp)` for department-scoped queries. |
| Evidence collector signing key accessible from control plane | Storing the Ed25519 signing private key in PostgreSQL so the control plane can "manage" it, making the database a single point of compromise | Signing key lives only in the evidence collector's filesystem/environment. The control plane stores only public keys. Key rotation is coordinated via gRPC command from control plane to evidence collector, but the private key never transits the network. |
| Docker Compose networking between kernel and external AI vendors | Using Docker's default bridge network, which requires the kernel to route through the host's network stack, adding latency and complicating firewall rules | Use `network_mode: host` for the kernel container (needs to intercept traffic) or configure Docker's DNS and iptables correctly. Test that the kernel can reach external AI vendors (api.openai.com) from inside the container. |

## Performance Traps

Patterns that work during development but fail at pilot scale.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Next.js SSR for every dashboard page load | TTFB >1 second on dashboard navigation; server CPU spikes with 5+ concurrent users | Use SSR only for initial page load. Subsequent navigation uses client-side rendering with cached API data. Use React Query with stale-while-revalidate for dashboard widgets. | >3 concurrent dashboard users |
| Full audit trail query without time bounds | ClickHouse scans entire table (months of data) for every dashboard load | Force time range selection in UI (default: last 24 hours). API rejects queries without `from`/`to` parameters. Add max time range limit (e.g., 30 days per query). | >1 week of production data (millions of rows) |
| RBAC permission check on every API call hitting PostgreSQL | Permission queries add 2-5ms to every request; under load, PostgreSQL connection pool saturates | Cache user role and permissions in memory (or Redis) with 5-minute TTL. Invalidate on role change. JWT claims can carry role information to avoid database lookup entirely. | >50 API requests/second from dashboard users |
| Unoptimized Helm chart with no resource limits | Kubernetes scheduler places all pods on one node; one component's memory spike kills others via OOM | Set explicit `resources.requests` and `resources.limits` for every container. Use PodDisruptionBudget for critical components. Test with `kubectl top pods` under load. | Any production K8s deployment |
| Dashboard WebSocket connections without cleanup | Browser tabs left open maintain WebSocket connections to the API server indefinitely; 50 forgotten tabs = 50 persistent connections consuming server memory | Implement connection timeout (30 minutes idle disconnect). Use SSE instead of WebSocket where unidirectional push suffices. Limit max connections per user. | >20 concurrent browser sessions |

## Security Mistakes

Security issues specific to adding identity, dashboard, and deployment to an AI governance platform.

| Mistake | Risk | Prevention |
|---------|------|------------|
| SAML response replay attack | Attacker captures a valid SAML response and replays it to authenticate as the legitimate user | Validate `InResponseTo` matches a request ID Interdict generated. Cache seen response IDs for the validity window. Reject any response older than 5 minutes. |
| JWT session tokens without expiry or with long expiry | Stolen token grants indefinite access to the governance platform; attacker can exfiltrate audit data or modify policies | Set JWT expiry to 15 minutes. Implement refresh tokens with 8-hour expiry. Store refresh tokens server-side (not just client-side). Revoke all tokens on password change or account deactivation. |
| Dashboard XSS exposing governance data | Audit trail contains user-generated content (prompt snippets, policy names). If rendered without sanitization, XSS can exfiltrate compliance data. | Never render raw user content in React. Use React's built-in JSX escaping. Sanitize all API responses that contain user-generated strings. Set `Content-Security-Policy` header. |
| mTLS certificates with excessively long validity | Certificates valid for 10+ years never get rotated; compromised certificate grants permanent access | Set component certificates to 90-day validity. Automate rotation at 60 days. Set CA certificate to 2-year validity. Alert at 30 days before any certificate expiry. |
| API key auth without rate limiting or scope restriction | Stolen API key has full admin access to all endpoints; no way to limit blast radius | Scope API keys to specific roles (e.g., "read-only audit" key vs "policy admin" key). Rate limit per API key. Log all API key usage. Implement key expiry (90 days default). |
| Helm chart deploying with default credentials | PostgreSQL and ClickHouse passwords left as defaults in `values.yaml`; anyone with cluster access can read governance data | Generate random credentials during `helm install` if not explicitly provided. Validate that passwords are not the defaults in a pre-install hook. Use Kubernetes Secrets, not ConfigMaps, for credentials. |

## UX Pitfalls

Common user experience mistakes for enterprise compliance dashboards.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| SSO login flow redirects to a blank page or error on first attempt | CISOs evaluating the product get a broken first impression; 40% of enterprise SSO evaluations fail on first attempt due to misconfigured redirect URIs | Implement a SAML diagnostic page that shows the configuration status, expected entity ID, ACS URL, and IdP metadata URL. If SAML fails, redirect to this diagnostic page with the error, not a generic 500. |
| Dashboard shows empty states without guidance | New deployment has zero audit data, zero policies, zero violations. Every dashboard tab shows "No data." CISO concludes the product doesn't work. | Every empty state should show a clear call-to-action: "Create your first policy" with a link to the policy builder, "Generate test traffic" with instructions, "Import sample data" for demo purposes. |
| Policy builder requires Rego knowledge | Only developers can create policies; compliance officers become dependent on engineering (carried forward from v1.0 pitfalls, still relevant for dashboard) | Build a visual policy builder with template selection (e.g., "Block PII in prompts", "Require approval for GPT-4 usage") that generates Rego under the hood. Show Rego only in an "Advanced" toggle. |
| Compliance report generation takes >30 seconds with no progress indicator | Users click "Generate Report," nothing happens, they click again, queue doubles | Show a progress indicator with estimated time. Use background job processing. Notify user when report is ready (in-app notification or email). Allow report scheduling. |
| Audit trail search has no syntax guidance | Users type free text into the search box and get zero results because the query syntax is ClickHouse SQL fragments | Provide a structured filter UI (date range picker, department dropdown, policy dropdown, vendor dropdown, action type radio buttons). Free-text search should search across all relevant fields with a simple LIKE match, not require SQL syntax. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces for v1.1.

- [ ] **SAML SSO:** Often missing IdP-initiated login flow -- only SP-initiated (Interdict starts login) is tested. Verify: configure the IdP to have an "Interdict" app tile that initiates login, and confirm it works without Interdict sending a SAML request first.
- [ ] **RBAC:** Often missing role enforcement on the gRPC policy distribution channel. Verify: a kernel connecting to the distribution server cannot request policies for a different org/department than its configured identity.
- [ ] **mTLS:** Often missing certificate expiry monitoring. Verify: set a certificate to expire in 1 hour, wait, and confirm the system alerts before expiry and rotates automatically (or at least alerts with time to act).
- [ ] **Dashboard auth:** Often missing CSRF protection on state-changing API calls. Verify: craft a cross-origin POST request to `/api/v1/policies` with a valid session cookie and confirm it's rejected (SameSite cookie + CSRF token).
- [ ] **Key rotation:** Often missing verification that old bundles remain verifiable after rotation. Verify: rotate the signing key, then call the verification endpoint for a bundle signed with the old key and confirm it passes.
- [ ] **Docker Compose:** Often missing data persistence. Verify: run `docker compose down && docker compose up` and confirm all policies, users, audit data, and certificates survive.
- [ ] **Helm chart:** Often missing PodDisruptionBudget. Verify: drain a node and confirm at least one replica of each critical component stays running.
- [ ] **API key auth:** Often missing key revocation. Verify: create an API key, use it, revoke it, and confirm the next request with that key returns 401 immediately (not after cache TTL).
- [ ] **Dashboard real-time alerts:** Often missing reconnection after network blip. Verify: disconnect the WebSocket/SSE connection, wait 10 seconds, reconnect, and confirm missed alerts are backfilled.
- [ ] **Compliance reports:** Often missing timezone handling. Verify: generate a report for "last 7 days" from a user in UTC+8 and confirm it covers the correct calendar dates in their timezone, not UTC.
- [ ] **Evidence verification UI:** Often missing error states. Verify: corrupt a single evidence bundle hash and confirm the UI clearly shows which bundle is invalid, not just "verification failed."

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Auth breaks all internal callers | MEDIUM | Add API key bypass for service accounts immediately. Audit all callers. Budget 2-3 days. |
| SAML signature wrapping vulnerability | HIGH | Patch immediately. Audit all sessions created via SAML. Invalidate all active sessions. Notify affected users. Budget 1-2 days for fix + 1 week for security review. |
| RBAC data leakage (Department Manager sees all departments) | MEDIUM | Add `WHERE department_id` to all affected queries. Deploy hotfix. Audit logs to determine if sensitive data was accessed. Budget 2-3 days. |
| mTLS bootstrap failure in deployment | LOW | Provide manual certificate generation script as fallback. Fix the automation. Budget 1-2 days. |
| Key rotation breaks evidence verification | HIGH | Restore old public key to key registry. Re-sign affected bundles with correct key ID metadata. Budget 3-5 days + audit trail integrity review. |
| Dashboard kills ClickHouse | MEDIUM | Add query cache immediately (hours). Create materialized views (1 day). Add query budget limits (hours). Budget 1-2 days total. |
| Docker Compose restart cascading failure | MEDIUM | Add health checks and restart policies. Fix reconnection logic. Budget 2-3 days of testing. |
| Helm/Docker Compose config drift | LOW | Create config parity test. Synchronize values. Budget 1 day. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Auth breaks internal callers | Phase 7: Identity & Security | All integration tests pass with auth enabled; service accounts documented |
| SAML signature wrapping | Phase 7: Identity & Security | Automated test with modified SAML assertion rejected; tested against 2 IdPs |
| RBAC data leakage | Phase 7 (framework) + Phase 8 (enforcement) | Cross-department data isolation test: two Department Managers see different data |
| mTLS bootstrap failure | Phase 7 (implementation) + Phase 10 (automation) | Fresh `docker compose up` and `helm install` succeed with zero manual cert steps |
| Key rotation breaks verification | Phase 7: Identity & Security | Post-rotation verification of pre-rotation bundles passes; key registry has all historical keys |
| Dashboard kills ClickHouse | Phase 8: Dashboard Core | 5 concurrent dashboard users + 1000 req/sec kernel load: dashboard latency <1s, ClickHouse CPU <70% |
| Docker Compose restart failures | Phase 10: Deployment | Each component restarted individually while traffic flows; zero dropped requests, zero lost evidence |
| Helm/Compose config drift | Phase 10: Deployment | CI parity check comparing config keys between Docker Compose and Helm values |
| SAML response replay | Phase 7: Identity & Security | Replay a captured SAML response; confirm 401 rejection |
| JWT without expiry | Phase 7: Identity & Security | Set token expiry to 30 seconds in test; confirm forced re-auth after expiry |
| Dashboard empty states | Phase 8: Dashboard Core | Screenshot review of every dashboard tab on fresh deployment; all show guided onboarding |
| Compliance report slow generation | Phase 9: Advanced Dashboard | Report generation for 30-day range completes in <10 seconds; progress indicator visible |

## Sources

**SAML/SSO:**
- [WorkOS: Stop Building SAML From Scratch](https://workos.com/blog/stop-building-saml-from-scratch) - MEDIUM confidence
- [WorkOS: Common SAML Errors](https://workos.com/guide/common-saml-errors) - MEDIUM confidence
- [Scalekit: Read This Before You Implement SAML](https://www.scalekit.com/blog/read-this-before-you-implement-saml) - MEDIUM confidence
- [Stack Overflow: The Many Problems With Implementing SSO](https://stackoverflow.blog/2022/09/12/the-many-problems-with-implementing-single-sign-on/) - MEDIUM confidence
- [SSO Protocol Security Vulnerabilities 2025](https://guptadeepak.com/security-vulnerabilities-in-saml-oauth-2-0-openid-connect-and-jwt/) - MEDIUM confidence
- [Avatier: Common SSO Implementation Mistakes](https://www.avatier.com/blog/common-sso-implementation/) - MEDIUM confidence

**RBAC:**
- [Oso: 10 RBAC Best Practices 2025](https://www.osohq.com/learn/rbac-best-practices) - HIGH confidence
- [Oso: How to Build RBAC](https://www.osohq.com/learn/rbac-role-based-access-control) - HIGH confidence
- [Permify: RBAC Enterprise Guide](https://permify.co/post/role-based-access-control-rbac/) - MEDIUM confidence

**mTLS/gRPC:**
- [ByteSizeGo: gRPC Security Best Practices](https://www.bytesizego.com/blog/grpc-security) - MEDIUM confidence
- [OneUptime: gRPC TLS/SSL Configuration 2026](https://oneuptime.com/blog/post/2026-01-24-grpc-tls-ssl/view) - MEDIUM confidence
- [Tonic transport documentation](https://docs.rs/tonic/latest/tonic/transport/index.html) - HIGH confidence (official docs)

**Key Management:**
- [SSL.com: Key Management Best Practices](https://www.ssl.com/article/key-management-best-practices-a-practical-guide/) - MEDIUM confidence
- [OWASP: Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html) - HIGH confidence
- [Encryption Consulting: Key Management 2026](https://www.encryptionconsulting.com/best-practices-for-key-management-in-2026/) - MEDIUM confidence

**Dashboard/Next.js:**
- [RaftLabs: Next.js Best Practices 2025](https://www.raftlabs.com/blog/building-with-next-js-best-practices-and-benefits-for-performance-first-teams/) - MEDIUM confidence
- [Ksolves: Next.js SaaS Dashboard Development](https://www.ksolves.com/blog/next-js/best-practices-for-saas-dashboards) - MEDIUM confidence

**Deployment:**
- [Anchore: Helm vs Docker Compose for Production](https://anchore.com/blog/helm-vs-docker-compose/) - MEDIUM confidence
- [Helm: Chart Development Tips](https://helm.sh/docs/howto/charts_tips_and_tricks/) - HIGH confidence (official docs)

**ClickHouse:**
- [ClickHouse: Query Performance Optimization 2025](https://www.e6data.com/query-and-cost-optimization-hub/how-to-optimize-clickhouse-query-performance) - MEDIUM confidence
- [ClickHouse: Real-time Analytics](https://clickhouse.com/use-cases/real-time-analytics) - HIGH confidence (official docs)

**Auth Migration:**
- [Zuplo: Zero Downtime API Auth Migration](https://zuplo.com/blog/zero-downtime-api-auth-migration) - MEDIUM confidence
- [Theneo: Managing API Changes 2026](https://www.theneo.io/blog/managing-api-changes-strategies) - MEDIUM confidence

**Existing Codebase Analysis:**
- `control-plane/src/index.ts` - No auth middleware in Elysia chain (HIGH confidence, direct observation)
- `crates/kernel/src/evidence/client.rs` - No TLS config on gRPC endpoint (HIGH confidence, direct observation)
- `crates/kernel/src/evidence/bundle.rs` - `signing_key_id: String::new()` (HIGH confidence, direct observation)
- `control-plane/src/db/schema/organization.ts` - User table with role column, no RBAC enforcement (HIGH confidence, direct observation)

---
*Pitfalls research for: Adding Enterprise Identity, Dashboard, and Deployment to Interdict.io v1.1*
*Researched: 2026-03-01*