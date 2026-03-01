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
