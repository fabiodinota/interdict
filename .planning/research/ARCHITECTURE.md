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
