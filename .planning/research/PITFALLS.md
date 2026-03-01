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
