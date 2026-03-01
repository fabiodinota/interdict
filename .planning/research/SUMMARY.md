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
