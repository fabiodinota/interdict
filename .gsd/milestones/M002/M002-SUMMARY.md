---
id: M002
provides:
  - SAML 2.0 SSO with JIT provisioning and cross-origin cookie fix
  - API key authentication with SHA-256 hashing and prefix display
  - 5-role RBAC with department-scoped data access
  - mTLS on all internal gRPC channels with ECDSA P-256 cert bootstrap
  - Ed25519 signing key rotation with ArcSwap hot-reload
  - Next.js dashboard with 10+ views (policy builder, audit trail, vendor/regulatory management, evidence verification, review queue, anomaly detection, reports, department policy overrides, signing key management)
  - BFF proxy pattern with httpOnly cookie auth
  - Multi-stage Docker images for all four services
  - Docker Compose one-command deployment with health-based ordering
  - Helm chart with Bitnami subcharts, KEP-753 sidecar templates, and pilot/enterprise overlays
  - CA certificate trust scripts for macOS, Linux, and Windows
  - PDF/CSV compliance report generation with PDFKit
key_decisions:
  - D008 Docker Compose + Helm chart for both pilot deployment patterns
  - D011 BFF proxy pattern — httpOnly cookie auth, no client-side tokens
  - D012 SAML cross-origin callback redirect to avoid cookie loss
  - D013 ECDSA P-256 for internal CA (broader TLS library compatibility)
  - D014 ArcSwap for signing key hot-reload (lock-free, no restart)
  - D015 KEP-753 native sidecar pattern for Kubernetes
patterns_established:
  - Elysia named macro with resolve for per-route auth injection
  - TanStack Query hooks with BFF proxy for all dashboard data fetching
  - ClickHouse parameterized Array(String) IN clause for department scoping
  - samlify 2.10.2+ for SAML SP (CVE-2025-47949 patched)
  - cargo-chef multi-stage Dockerfiles for Rust services
  - Bitnami subchart pattern with existingSecret for BYO infrastructure
  - cert-init Job as pre-install Helm hook for mTLS and SAML cert bootstrap
observability_surfaces:
  - SSE activity feed with reconnection status indicator
  - Anomaly detection alerts with severity-coded dashboard cards and 60s auto-refresh
  - Compilation status polling for policy build verification
  - SLA countdown timers on human review queue items
  - Evidence verification three-step stepper with raw cryptographic detail display
requirement_outcomes:
  - id: v1.1-identity-security
    from_status: active
    to_status: validated
    proof: "S01 (auth schema, RBAC, route guards), S04 (SAML SSO, mTLS, key rotation), S08 (cookie fix), S09 (signing key UI) — all 6 Identity & Security requirements delivered"
  - id: v1.1-dashboard
    from_status: active
    to_status: validated
    proof: "S03 (core views: home, policies, audit, vendors, regulatory, reports), S05 (evidence verification, review queue, department policies, anomalies), S09 (signing key management) — all 10 Dashboard requirements delivered"
  - id: v1.1-deployment
    from_status: active
    to_status: validated
    proof: "S02 (Docker images + Compose), S06 (Helm chart, sidecar templates, CA scripts), S07 (SAML/key-rotation deployment wiring) — all 5 Deployment requirements delivered"
duration: "2026-03-01 to 2026-03-04 (4 days)"
verification_result: passed
completed_at: 2026-03-04
---

# M002: Pilot Ready

**Full enterprise platform operational: SAML SSO, 5-role RBAC, 10+ dashboard views, Docker Compose + Helm chart deployment, mTLS internal security, and Ed25519 signing key rotation — 21/21 v1.1 requirements delivered across 9 slices**

## What Happened

M002 transformed the v1.0 data-plane-only system into a complete, deployable enterprise platform. The work progressed through three logical phases: identity and security foundations, dashboard feature build-out, and deployment packaging.

**Identity Foundation (S01, S04, S08, S09):** The first slice established Drizzle auth schema tables (api_keys, user_departments, role_permissions), a 5-role RBAC permission model with hierarchy and wildcard support, and idempotent identity seeding. An Elysia auth macro plugin with dual-mode Bearer token validation (API key + session token) was layered on top, followed by route guards on all existing modules with ClickHouse department-scoped IN clause filtering. S04 added SAML 2.0 SP with samlify, JIT user provisioning, mTLS on all internal gRPC channels via ECDSA P-256 cert bootstrap, and Ed25519 signing key rotation using ArcSwap for lock-free hot-reload. S08 fixed a cross-origin cookie loss bug by redirecting SAML ACS through a dashboard callback route. S09 added a settings page for signing key management.

**Dashboard Build-Out (S03, S05):** S03 scaffolded a Next.js 15 dashboard with 20 shadcn/ui components, BFF auth proxy, collapsible sidebar, and dark/light theme. Four plans delivered the home screen (KPI cards, charts, SSE feed), policy builder (6 Rego templates, 5-step wizard, raw editor, version history), audit trail (TanStack Table with cursor pagination and filters), vendor management (card grid with model management), regulatory selector (framework cards grouped by jurisdiction), and PDF/CSV report generation (PDFKit server-side with BFF binary passthrough). S05 added evidence verification (three-step cryptographic stepper with batch verify and inline quick-verify), human review queue (optimistic-lock claim, SLA timers, background ClickHouse sync), department policy overrides (mandatory enforcement, toggle UI), and anomaly detection (four ClickHouse queries with severity-coded alert cards).

**Deployment Packaging (S02, S06, S07):** S02 created multi-stage Dockerfiles for all four services with cargo-chef caching, envsubst TOML templating, and auto-CA-cert generation, plus a docker-compose.yml orchestrating 8 services with health-based startup ordering. S06 translated the entire Docker Compose stack into a 20-file Helm chart with Bitnami subcharts, cert-init Job, sidecar injection templates (KEP-753), iptables/HTTP_PROXY dual-mode traffic routing, pilot/enterprise overlays, and cross-platform CA trust scripts. S07 wired SAML and key rotation into both Docker Compose and Helm, fixing the MODULES array to 13 entries.

The milestone delivered ~61,000 LOC across Rust, TypeScript, and Helm over 4 days.

## Cross-Slice Verification

**Success Criteria Note:** The roadmap's Success Criteria section was empty (migrated milestone). Verification was performed against the 21 v1.1 requirements tracked in PROJECT.md.

**Identity & Security (6/6 validated):**
- SAML 2.0 SSO: S04 Plan 1 commit 7c8c458 (SP module with ACS/SLO/metadata) + S08 commit d7d628d (callback route fixing cross-origin cookie loss). Dashboard SSO button conditionally displayed.
- API key auth: S01 Plan 2 commits 3ad9074, 96e174b (auth service with SHA-256 hash lookup, 12 unit tests passing).
- 5-role RBAC: S01 Plan 1 commit a584c54 (permission model, 27 unit tests), Plan 3 commit 9e5070a (route guards on all modules).
- Department scoping: S01 Plan 3 commit 7a88296 (ClickHouse parameterized IN clause, applyDepartmentScope helper).
- mTLS: S04 Plan 2 commits bccd17c, c6ba408 (cert-init container, ServerTlsConfig/ClientTlsConfig on all gRPC channels).
- Key rotation: S04 Plan 3 commit aecdf27 (RotatingSigningProvider with ArcSwap, file watcher unit tests) + S09 commits db19918, 160a30a (dashboard UI).

**Dashboard (10/10 validated):**
- Policy Builder: S03 Plan 3 commits 0eccb68, 15ca2a8 (6 templates, 5-step wizard, raw editor).
- Audit Trail: S03 Plan 4 commit 0e2ee67 (TanStack Table, cursor pagination, filter panel).
- Real-time stats: S03 Plan 2 commits ad59339, 9b660f7 (KPI cards, Recharts charts, SSE feed).
- Vendor Management: S03 Plan 4 commit 186f598 (card grid, model management, add vendor dialog).
- Regulatory Selector: S03 Plan 4 commit 186f598 (framework cards, jurisdiction grouping, policy toggles).
- Reports: S03 Plan 4 commit 186f598 (PDFKit PDF + CSV) + Plan 5 commit 71fde36 (BFF binary passthrough).
- Evidence Verification: S05 Plan 1 commits 6571c85, e8e6344 (three-step stepper, batch verify, inline quick-verify).
- Review Queue: S05 Plan 2 commits 7d7e5cd, e5edec0 (SLA timers, claim/resolve, background sync).
- Department Policies: S05 Plan 3 commits 8ef6646, 95fbe9e (override toggles, mandatory enforcement).
- Anomaly Detection: S05 Plan 4 commits 0b80caf, 920650a (four ClickHouse queries, severity-coded cards).

**Deployment (5/5 validated):**
- Container images: S02 Plan 1 commits 7e08d99, 0a43721 (4 multi-stage Dockerfiles).
- Docker Compose: S02 Plan 2 commit 3ea24f1 (8 services, health-based ordering, 5 named volumes).
- Helm chart: S06 Plan 1 commits 12a0899, 595d7d8 (20 templates, Bitnami subcharts, cert-init Job).
- Sidecar: S06 Plan 2 commits e6ac3aa, 4f29d35 (KEP-753 templates, pilot/enterprise overlays).
- CA trust scripts: S06 Plan 3 commits ed57f01, eb1eaa2 (macOS/Linux shell + Windows PowerShell).

**All 9 slice summaries verified present on disk. All slices marked [x] in roadmap.**

## Requirement Changes

- v1.1-identity-security: Active → Validated — 6/6 requirements delivered across S01, S04, S08, S09 with 39+ auth unit tests, SAML e2e flow, mTLS cert bootstrap, and key rotation with ArcSwap hot-reload.
- v1.1-dashboard: Active → Validated — 10/10 requirements delivered across S03, S05, S09. Dashboard builds successfully. All views wired with TanStack Query hooks through BFF proxy.
- v1.1-deployment: Active → Validated — 5/5 requirements delivered across S02, S06, S07. Docker Compose and Helm chart both complete with documented env.example (45+ variables).

## Forward Intelligence

### What the next milestone should know
- The Elysia error handler type issue in control-plane/src/index.ts is pre-existing and was never fixed during M002. It doesn't break runtime but causes TypeScript warnings. Address it with proper Elysia generic typing.
- samlify must stay at ≥2.10.0 due to CVE-2025-47949 (CVSS 9.9). Pin checks should be added to CI.
- The MODULES array in index.ts needs to stay in sync manually when adding new Elysia modules. There's no auto-discovery.
- Dashboard Next.js was v15 during M002; later upgraded to v16 in M003. The `useSearchParams` Suspense wrapper pattern may need revisiting.

### What's fragile
- **BFF proxy Content-Type detection** — relies on isJsonResponse guard added in S03 Plan 5. Non-JSON responses without Content-Type headers will be treated as JSON. Any new binary endpoint needs testing through the proxy.
- **SAML cert file paths** — loaded from file system paths only (SAML_SP_KEY_PATH, etc.). If Docker volume mount order changes, SAML silently degrades to disabled.
- **ClickHouse anomaly detection queries** — four complex CTE queries that depend on specific column names in the audit_events table. Schema changes will silently return empty results rather than errors.
- **Signing key file watcher** — 30-second mtime polling. If the file is written and overwritten within the same second, the change can be missed.

### Authoritative diagnostics
- `control-plane/src/index.ts` MODULES array — single place to verify all API modules are wired
- `docker-compose.yml` service definitions — source of truth for Docker deployment topology
- `helm/interdict/values.yaml` — source of truth for all configurable Helm values (292 lines)
- `env.example` — documents all 45+ configuration variables with inline comments

### What assumptions changed
- **Original: RwLock for signing key rotation** — Changed to ArcSwap because SigningProvider trait returns references that can't safely outlive a lock guard. This was a soundness issue caught during implementation (D014).
- **Original: Cookie set on control-plane origin for SAML** — Changed to dashboard callback redirect because cross-origin Set-Cookie fails in modern browsers (D012).
- **Original: nginx for dashboard Docker image** — Changed to multi-stage Next.js standalone build with node runner for SSR support.

## Files Created/Modified

- `.gsd/milestones/M002/slices/S01-S09/` — 9 slice directories with summaries and plans
- `control-plane/src/db/schema/auth.ts` — api_keys, sessions, signing_keys, userDepartments, rolePermissions tables
- `control-plane/src/modules/auth/` — Auth service, SAML SP, middleware, permissions, API endpoints
- `control-plane/src/modules/signing-keys/` — Key rotation registry and admin API
- `control-plane/src/modules/evidence/` — Evidence verification API with three-step check
- `control-plane/src/modules/reviews/` — Human review queue with background ClickHouse sync
- `control-plane/src/modules/department-overrides/` — Department policy override CRUD
- `control-plane/src/modules/anomalies/` — Four ClickHouse anomaly detection queries
- `control-plane/src/modules/reports/` — PDFKit PDF + CSV report generation
- `dashboard/` — Full Next.js 15 application with 10+ views, 20 shadcn/ui components, BFF proxy
- `docker/` — Dockerfiles and entrypoint scripts for kernel, evidence-collector, control-plane, dashboard
- `docker-compose.yml` — 8-service orchestration with health-based startup ordering
- `helm/interdict/` — 20-file Helm chart with subcharts, sidecar templates, and overlays
- `scripts/install-ca-trust.sh` — macOS/Linux CA certificate trust installer
- `scripts/install-ca-trust.ps1` — Windows CA certificate trust installer (PowerShell)
- `env.example` — 121-line configuration reference covering all services
