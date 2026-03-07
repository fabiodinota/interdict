# Interdict Security & Quality Fix Plan

Generated: 2026-03-06
Sources: PASS1_BULLETIN.md, PASS2_FINAL_MATRIX.json, RUNTIME_VALIDATION.md, /scan output (2026-03-06 re-scan)
Total issues: 31 distinct findings (7 fixed, 24 open)

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| FIXED  | Confirmed resolved in current working tree |
| OPEN   | Not yet addressed |
| NEW    | Found in 2026-03-06 re-scan; not in original plan |

---

## Master Issue Table

| ID | Severity | CVSS | Status | Title | Files |
|----|----------|------|--------|-------|-------|
| CRIT-001 | Critical | 9.4 | **FIXED** | SAML role claim trusted for privileged role assignment | `auth/service.ts` |
| CRIT-002 | Critical | 9.1 | **FIXED** | Session token in URL during SAML callback | `saml/handlers.ts`, `saml-callback/route.ts` |
| HIGH-003 | High | 8.2 | **FIXED** | Logout does not invalidate server-side sessions | `logout/route.ts`, `auth/service.ts` |
| HIGH-004 | High | 8.7 | **FIXED (partial)** | gRPC distribution scope not enforced server-side — orgId guard added; DB filter deferred until `policies.org_id` schema migration | `distribution/server.ts:61` |
| HIGH-011 | High | 8.0 | **FIXED** | Audit aggregate stats unscoped across departments | `audit/index.ts:158`, `audit/service.ts:110` |
| HIGH-S1 | High | — | **FIXED** | N+1 query in GET /frameworks | `regulatory/index.ts:47` |
| HIGH-S2 | High | — | **FIXED** | `store: any` in auth middleware (implicitly resolved by LOW-S16) | `auth/middleware.ts:46` |
| HIGH-S3 | High | — | **FIXED** | `extractAttributes` untyped (SamlExtract now defined) | `saml/handlers.ts` |
| HIGH-S4 | High | — | **FIXED** | Route handlers typed `ctx: any` across auth module — AuthCtx defined, all handlers updated | `auth/index.ts:48,60,85,110,130,151` |
| HIGH-S5 | High | — | **FIXED** | `unsafe` blocks without `// SAFETY:` comments | `kernel/build.rs`, `evidence-collector/build.rs`, `interdict-verify/build.rs` |
| HIGH-S6 | High | — | **FIXED** | Blocking `std::fs` inside async fn (now tokio::fs) | `kernel/src/main.rs` |
| NEW-TOCTOU | High | — | **FIXED** | Non-atomic SELECT+UPDATE in `exchangeSamlHandoffCode` breaks single-use guarantee | `auth/service.ts:452` |
| NEW-HARDCODE-1 | High | — | **FIXED** | Hard-coded `http://localhost:8080` fallback for DASHBOARD_URL | `saml/handlers.ts:22` |
| NEW-HARDCODE-2 | High | — | **FIXED** | Hard-coded `http://[::1]:50051` IPv6 default for evidence collector | `kernel/src/main.rs:233` |
| NEW-BOUNDARY | High | — | **FIXED** | Dashboard route handlers call control-plane directly — architectural exception documented in both route files | `logout/route.ts:15`, `saml-callback/route.ts:25` |
| MED-005 | Medium | 6.8 | **FIXED** | gRPC can downgrade to insecure transport in production | `distribution/server.ts:280` |
| MED-006 | Medium | 6.5 | **FIXED** | Session tokens stored in plaintext (migration 0003 applied, token_hash column) | `db/schema/auth.ts`, `auth/service.ts` |
| MED-007 | Medium | 6.9 | OPEN | Default credentials in deployment templates | `env.example`, `docker-compose.yml` |
| MED-008 | Medium | 5.9 | OPEN | Unresolved JS dependency vulnerabilities | `dashboard/package.json`, `control-plane/package.json` |
| MED-012 | Medium | — | OPEN | Containers run as root with writable rootfs | `docker/*/Dockerfile`, `docker-compose.yml` |
| MED-S7 | Medium | — | OPEN | Pervasive `async (ctx: any)` in all route handlers (~40 occurrences) | All `control-plane/src/modules/*/index.ts` |
| MED-S8 | Medium | — | OPEN | DB access bypasses `.derive()` in regulatory module | `regulatory/index.ts:42` |
| MED-S9 | Medium | — | **FIXED** | Stale/misleading comment in regulatory module | `regulatory/index.ts:8` |
| MED-S10 | Medium | — | **FIXED** | `conditions: any[]` in auth service listApiKeys | `auth/service.ts:256` |
| MED-S11 | Medium | — | **FIXED** | API key logged plaintext in seed script — gated behind SEED_SHOW_KEYS | `seed/run-seed.ts:282` |
| MED-S12 | Medium | — | **FIXED** | TODO comment in shipped enrichment code | `audit/enrichment.ts:99` |
| NEW-PII | Medium | — | **FIXED** | User email logged in plaintext during JIT provisioning | `auth/service.ts:509` |
| NEW-RAW-TOKEN | Medium | — | OPEN | Raw session token stored in `saml_handoff_codes` table for 60s window | `db/schema/auth.ts:116`, `auth/service.ts:443` |
| LOW-009 | Low | 3.4 | **FIXED** | Missing security headers / X-Powered-By exposed | `dashboard/next.config.ts` |
| LOW-010 | Low | 3.9 | **FIXED** | Error handler leaks internals / wrong status codes | `control-plane/src/index.ts:79` |
| LOW-013 | Low | 3.6 | OPEN | CI lacks artifact signing and provenance checks | `.github/workflows/ci-quality-security.yml` |
| LOW-S14 | Low | — | **FIXED** | Inline SAFETY comment in wasm_engine.rs (present) | `wasm_engine.rs:84` |
| LOW-S16 | Low | — | **FIXED** | `createAuthService(db: any)` factory type | `auth/service.ts:149` |

---

## Wave 1 — Critical Blockers (fix before any merge)

These are the findings that introduce active exploitability or break an explicit CLAUDE.md invariant.

---

### NEW-TOCTOU — Non-atomic handoff code exchange

**File:** `control-plane/src/modules/auth/service.ts:452-473`

**Problem:** `exchangeSamlHandoffCode` does SELECT (check used=false) then UPDATE (set used=true) as two separate statements. Two concurrent requests with the same code both pass the SELECT before either UPDATE runs, both receive the session token — breaking the single-use guarantee of CRIT-002.

**Fix:** Replace with a single `UPDATE ... RETURNING` that applies all conditions atomically:

```typescript
async exchangeSamlHandoffCode(code: string): Promise<string | null> {
  const [row] = await db
    .update(samlHandoffCodes)
    .set({ used: true })
    .where(
      and(
        eq(samlHandoffCodes.code, code),
        eq(samlHandoffCodes.used, false),
        gt(samlHandoffCodes.expiresAt, new Date())
      )
    )
    .returning({ sessionToken: samlHandoffCodes.sessionToken });
  return row?.sessionToken ?? null;
},
```

**Verification:** Send two simultaneous POST /saml/exchange-code requests with the same code. Exactly one must return 200 with a token; the other must return 410.

---

### NEW-HARDCODE-1 — Hard-coded DASHBOARD_URL fallback

**File:** `control-plane/src/modules/auth/saml/handlers.ts:22`

**Problem:** `process.env.DASHBOARD_URL || "http://localhost:8080"` — an http (not https) localhost default is used in production if the env var is missing. SAML callback codes are redirected there; a misconfigured deployment silently routes auth tokens to a non-existent or attacker-controlled host.

**Fix:**

```typescript
const DASHBOARD_URL = process.env.DASHBOARD_URL;
if (!DASHBOARD_URL) {
  throw new Error("[saml] DASHBOARD_URL env var is required");
}
```

If a dev-mode fallback is needed for local testing, gate it explicitly:

```typescript
const DASHBOARD_URL =
  process.env.DASHBOARD_URL ??
  (process.env.NODE_ENV !== "production" ? "http://localhost:8080" : undefined);
if (!DASHBOARD_URL) {
  throw new Error("[saml] DASHBOARD_URL env var is required in production");
}
```

**Verification:** Start control-plane without `DASHBOARD_URL` set and `NODE_ENV=production` — must throw at startup, not at request time.

---

### NEW-HARDCODE-2 — Hard-coded IPv6 loopback for evidence collector

**File:** `crates/kernel/src/main.rs:233`

**Problem:** `INTERDICT_EVIDENCE_COLLECTOR_ADDR` has a hard-coded default of `http://[::1]:50051`. In an air-gapped or VPC deployment the evidence collector may not be on loopback, so evidence is silently dropped to a wrong host. This also violates CLAUDE.md Invariant 8.

**Fix:**

```rust
let evidence_collector_addr = std::env::var("INTERDICT_EVIDENCE_COLLECTOR_ADDR")
    .map_err(|_| anyhow::anyhow!(
        "INTERDICT_EVIDENCE_COLLECTOR_ADDR must be set (e.g. http://evidence-collector:50051)"
    ))?;
```

If a local dev fallback is acceptable, isolate it behind a `cfg(debug_assertions)` guard:

```rust
let evidence_collector_addr = std::env::var("INTERDICT_EVIDENCE_COLLECTOR_ADDR")
    .unwrap_or_else(|_| {
        #[cfg(not(debug_assertions))]
        panic!("INTERDICT_EVIDENCE_COLLECTOR_ADDR must be set in release builds");
        #[cfg(debug_assertions)]
        "http://[::1]:50051".to_string()
    });
```

**Verification:** `cargo test` still passes; starting kernel without the env var in a release build exits with a clear error.

---

### NEW-BOUNDARY — Dashboard calling control-plane directly

**Files:**
- `dashboard/src/app/api/auth/logout/route.ts:15`
- `dashboard/src/app/api/auth/saml-callback/route.ts:25`

**Problem:** Both routes call `getControlPlaneUrl()` directly, bypassing the `/api/proxy/` boundary that all other dashboard→control-plane calls use. Per the Interdict dashboard boundary rule, all control-plane calls must go through `/api/proxy/`.

**Options (pick one and document the decision):**

Option A — Route through proxy (preferred, maintains boundary invariant):
```
/api/proxy/auth/logout  ->  control-plane /api/v1/auth/logout
/api/proxy/auth/saml/exchange-code  ->  control-plane /api/v1/auth/saml/exchange-code
```
The proxy handler must forward the Authorization header for logout and the Content-Type + body for exchange-code.

Option B — Declare explicit exception in CONTEXT.md:
```markdown
## Architectural Exception: Auth Bootstrap Routes

`/api/auth/logout` and `/api/auth/saml-callback` call control-plane directly
because they are part of the session lifecycle itself (bootstrapping or tearing
down the credential that the proxy relies on). They do not carry user data and
do not require the request-enrichment the proxy provides.
```

Either option is acceptable; the current state has an undocumented implicit exception. Pick one and encode it.

**Verification:** All other dashboard routes confirmed to use `/api/proxy/`; the two auth routes either route through it or have the exception documented and reviewed.

---

## Wave 2 — High Security (fix before next release)

---

### HIGH-004 — gRPC distribution scope not enforced server-side

**File:** `control-plane/src/modules/distribution/server.ts:61`

**Fix:** Remove underscore prefix from `_orgId`/`_deptId` parameters, validate that `orgId` is present, and pass it to `buildFullSnapshot`:

```typescript
export async function buildFullSnapshot(
  db: Db,
  orgId: string,
  deptId: string | undefined,
  teamId: string | undefined
) {
  if (!orgId) throw new Error("orgId required for policy snapshot");
  const activePolicies = await db
    .select(...)
    .from(policies)
    .where(and(
      eq(policies.isActive, true),
      eq(policies.orgId, orgId),
      ...(deptId ? [eq(policies.departmentId, deptId)] : []),
    ));
  // rest unchanged
}
```

In the `Subscribe` gRPC handler:

```typescript
const { orgId, deptId, teamId } = call.request;
if (!orgId) {
  call.destroy(new Error("org_id is required in SubscribeRequest"));
  return;
}
```

**Note:** Full cert-binding of `orgId` (verifying it matches the mTLS cert's SAN) is a follow-on; activating scope enforcement on the provided value is the minimum viable fix now.

**Verification:** gRPC Subscribe without `org_id` returns an error. A kernel in org A cannot receive policies scoped to org B.

---

### HIGH-011 — Audit aggregate stats unscoped across departments

**Files:** `audit/index.ts:158,177`, `audit/service.ts:110,117`, `audit/queries.ts`

**Handler change (`audit/index.ts`):**

```typescript
const data = await ctx.auditService.getHourlyViolations(
  ctx.query.from,
  ctx.query.to,
  ctx.user.departmentIds   // scopes query to user's visible departments
);
```

Apply the same change to `getVendorUsage`.

**Service change (`audit/service.ts`):**

```typescript
async getHourlyViolations(from: string, to: string, departmentIds?: string[]) {
  return queryHourlyViolations(this.clickhouse, from, to, departmentIds);
}
```

**Query change (`audit/queries.ts`):** Add `WHERE department_id IN (...)` when `departmentIds` is non-empty. Super-admins and compliance officers pass `undefined` (unscoped access).

**Verification:** A `department_manager` in dept-A calling `GET /audit/stats` cannot see violations from dept-B.

---

### HIGH-S1 — N+1 query in GET /frameworks

**File:** `control-plane/src/modules/regulatory/index.ts:47`

**Fix:** Replace per-framework queries with two bulk queries + in-memory join:

```typescript
const [allFrameworks, allPolicyCounts, allActivations] = await Promise.all([
  db.select().from(frameworks),
  db
    .select({
      frameworkId: frameworkPolicies.frameworkId,
      count: count(),
    })
    .from(frameworkPolicies)
    .groupBy(frameworkPolicies.frameworkId),
  db
    .select({ frameworkId: frameworkActivations.frameworkId })
    .from(frameworkActivations)
    .where(eq(frameworkActivations.isActive, true)),
]);

const policyCountMap = new Map(
  allPolicyCounts.map((r) => [r.frameworkId, r.count])
);
const activeSet = new Set(allActivations.map((r) => r.frameworkId));

return allFrameworks.map((fw) => ({
  ...fw,
  policyCount: policyCountMap.get(fw.id) ?? 0,
  isActive: activeSet.has(fw.id),
}));
```

**Verification:** `GET /api/v1/regulatory/frameworks` with 20 frameworks produces exactly 3 DB queries.

---

### HIGH-S2, HIGH-S4 — `any` types in auth/SAML route handlers

**Files:** `auth/middleware.ts:44`, `auth/index.ts:48,60,85,110,130,151`

These are related; fixing S2 unblocks reducing the `ctx: any` occurrences in S4.

**S2 — middleware.ts:** The resolve handler already has an explicit interface shape but the `createAuthService` cast still uses `Parameters<typeof createAuthService>[0]` which resolves to `PostgresJsDatabase<any>`. Fix after LOW-S16 is applied (they must be done together):

```typescript
// After LOW-S16 tightens the createAuthService signature:
const authService = createAuthService(
  ((store as { db?: PostgresJsDatabase<typeof schema> }).db) ?? db
);
```

**S4 — auth/index.ts route handlers:** Define a shared context type for this module:

```typescript
// At top of auth/index.ts
interface AuthCtx {
  user: AuthenticatedUser;
  authService: AuthService;
  body: unknown;
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  headers: Record<string, string | undefined>;
  set: { status: number };
}
```

Replace all `async (ctx: any)` with `async (ctx: AuthCtx)`. Add narrower body types per handler (e.g., `body: CreateApiKeyBodyType` for the POST /keys handler) using Elysia's inferred context type or explicit casts at the body access site.

**Verification:** `tsc --noEmit` passes; no `@ts-ignore` added.

---

## Wave 3 — Medium Security & Quality

---

### NEW-PII — User email in JIT provisioning log

**File:** `control-plane/src/modules/auth/service.ts:509-511`

**Problem:** `console.info` logs `email` (PII) and `roleHint` (IdP claim detail) in plaintext. Email should not appear in production log lines.

**Fix:**

```typescript
// Before creating user, log without PII
console.info(
  `[auth] SAML JIT provisioning new user as read_only_auditor` +
    (roleHint ? ` (IdP roleHint ignored)` : "")
);
// After insert, log the opaque user ID only
console.info(`[auth] JIT provisioned user ${newUser.id}`);
```

If structured logging is already set up (tracing), use it:

```typescript
tracing::info!(user_id = %newUser.id, "SAML JIT provisioned new user as read_only_auditor");
```

**Verification:** Run a SAML login flow; `grep -i email /var/log/control-plane.log` returns no results.

---

### NEW-RAW-TOKEN — Raw session token stored in saml_handoff_codes

**Files:** `control-plane/src/db/schema/auth.ts:116`, `control-plane/src/modules/auth/service.ts:437-449`

**Problem:** The `saml_handoff_codes` table stores the raw (unhashed) session token as `session_token VARCHAR(128)`. While the 60s TTL limits exposure, a DB read in that window yields a valid bearer credential. The `sessions` table correctly stores only a hash; handoff codes should follow the same pattern.

**Fix — two-column approach (no loss of function):**

Schema change: store the hash for lookup integrity, keep the raw token for the one-time return.

Actually, because the handoff code IS the one-time credential and the raw token must be returned on exchange, the minimal fix is to encrypt the stored value using a symmetric key that lives only in application memory (not the DB), so a DB dump alone is insufficient:

```typescript
// Key loaded once at startup from env var (not stored in DB)
const HANDOFF_ENCRYPTION_KEY = Buffer.from(
  process.env.HANDOFF_ENCRYPTION_KEY ?? "", "hex"
);
if (HANDOFF_ENCRYPTION_KEY.length !== 32) {
  throw new Error("HANDOFF_ENCRYPTION_KEY must be 32 bytes hex");
}

async createSamlHandoffCode(sessionToken: string, userId: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", HANDOFF_ENCRYPTION_KEY, iv);
  const enc = Buffer.concat([cipher.update(sessionToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store: iv(12) + tag(16) + ciphertext, base64
  const stored = Buffer.concat([iv, tag, enc]).toString("base64");
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60_000);
  await db.insert(samlHandoffCodes).values({ code, sessionToken: stored, userId, expiresAt });
  return code;
}

async exchangeSamlHandoffCode(code: string): Promise<string | null> {
  const [row] = await db
    .update(samlHandoffCodes)
    .set({ used: true })
    .where(and(
      eq(samlHandoffCodes.code, code),
      eq(samlHandoffCodes.used, false),
      gt(samlHandoffCodes.expiresAt, new Date())
    ))
    .returning({ sessionToken: samlHandoffCodes.sessionToken });
  if (!row) return null;
  const buf = Buffer.from(row.sessionToken, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", HANDOFF_ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}
```

**Add to env.example:**
```
HANDOFF_ENCRYPTION_KEY=<REQUIRED: 32 random bytes as hex, e.g. openssl rand -hex 32>
```

**Verification:** A DB dump of `saml_handoff_codes` shows only base64-opaque values. The round-trip login flow still works.

---

### MED-005 — gRPC insecure fallback in production

**File:** `control-plane/src/modules/distribution/server.ts:280-306`

```typescript
} else {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[distribution] mTLS is required in production. Set MTLS_ENABLED=true."
    );
  }
  credentials = grpc.ServerCredentials.createInsecure();
  console.warn("[distribution] WARNING: insecure gRPC transport active — dev only");
}
```

**Verification:** Starting distribution server in production without mTLS enabled throws at startup.

---

### MED-007 — Default credentials in deployment templates

**Files:** `env.example`, `docker-compose.yml`

**env.example:**

```diff
- POSTGRES_PASSWORD=interdict
+ POSTGRES_PASSWORD=<REQUIRED: generate with: openssl rand -base64 32>
- JWT_SECRET=dev-secret-key
+ JWT_SECRET=<REQUIRED: minimum 32 random bytes — generate with: openssl rand -hex 32>
- CLICKHOUSE_PASSWORD=interdict
+ CLICKHOUSE_PASSWORD=<REQUIRED: generate with: openssl rand -base64 32>
```

**docker-compose.yml:** Replace permissive defaults with required-or-fail:

```yaml
- POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-interdict}
+ POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set — see env.example}
```

**Startup guard in `control-plane/src/index.ts`:**

```typescript
const INSECURE_DEFAULTS = ["interdict", "dev-secret-key", "password", "changeme", "secret"];
const jwtSecret = process.env.JWT_SECRET ?? "";
if (process.env.NODE_ENV === "production" &&
    (INSECURE_DEFAULTS.includes(jwtSecret) || jwtSecret.length < 32)) {
  throw new Error("[startup] JWT_SECRET is insecure or unset. Set a strong random value.");
}
```

**Verification:** `docker-compose up` without `.env` exits immediately with a clear error message.

---

### MED-008 — Dependency vulnerabilities

**Actions (in order):**

1. `cd control-plane && bun update && bun audit`
2. `cd dashboard && bun update && bun audit`
3. For each remaining advisory: document in `security-review/DEP_AUDIT.md` whether it is dev-only (esbuild, vitest) or production-runtime. Dev-only advisories are acceptable with a comment in `package.json`; production advisories must be patched.
4. Add a required CI gate:

```yaml
# .github/workflows/ci-quality-security.yml
- name: JS dependency audit
  run: |
    cd control-plane && bun audit --audit-level=high
    cd ../dashboard && bun audit --audit-level=high
```

**Verification:** `bun audit --audit-level=high` exits 0 in both directories, or all remaining high-severity advisories have documented risk-acceptance entries in `DEP_AUDIT.md`.

---

### MED-S7 — Pervasive `ctx: any` in route handlers

**Files:** All `control-plane/src/modules/*/index.ts` (~40 occurrences)

Define a shared base context type, then replace progressively per module. Start with auth (done in Wave 2), then policy, audit, regulatory, distribution, vendors.

```typescript
// control-plane/src/types/elysia-context.ts
import type { AuthenticatedUser } from "../modules/auth/service";

/**
 * Base shape of an Elysia route context after the authPlugin macro resolves.
 * Per-module handler types extend this with their service injection.
 */
export interface BaseCtx {
  user: AuthenticatedUser;
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  headers: Record<string, string | undefined>;
}

/** Extend for a module that injects a service via .derive() */
export type ModuleCtx<S extends Record<string, unknown>> = BaseCtx & S;
```

Usage per module:

```typescript
// e.g. policy/index.ts
type PolicyCtx = ModuleCtx<{ policyService: PolicyService }>;

.get("/policies", async (ctx: PolicyCtx) => {
  // ctx.user, ctx.policyService are now fully typed
})
```

**Scope:** All handlers in `auth`, `policy`, `audit`, `regulatory`, `distribution`, `vendors`, `reviews` modules.

**Verification:** `tsc --noEmit` in `control-plane/` passes with no `any` type errors in module handler files.

---

### MED-S8 — DB access bypasses `.derive()` in regulatory module

**File:** `control-plane/src/modules/regulatory/index.ts:42`

```typescript
// Replace inline cast with top-level .derive() matching other modules:
.derive(({ store }) => ({
  db: (store as { db: typeof pgDb }).db ?? pgDb,
  regulatoryService: createRegulatoryService(
    (store as { db: typeof pgDb }).db ?? pgDb
  ),
}))
// Remove ad-hoc cast from each handler
```

---

### MED-S9 — Stale comment in regulatory module

**File:** `control-plane/src/modules/regulatory/index.ts:8`

Remove the line `// NOT wired into src/index.ts` — the module is wired. Delete it entirely; no replacement comment needed.

---

### MED-S10 — `conditions: any[]` in auth service

**File:** `control-plane/src/modules/auth/service.ts:256` (also `service.ts:311` for `(r: any)`)

```diff
- const conditions: any[] = [];
+ import type { SQL } from "drizzle-orm";
+ const conditions: SQL<unknown>[] = [];
```

For the map:

```diff
- const serialized = items.map((r: any) => ({
+ const serialized = items.map((r) => ({
```

The `r` type is inferred from the `db.select({ ... })` shape; the explicit `any` annotation defeats the inference.

---

### MED-S11 — Plaintext API key in seed script

**File:** `control-plane/src/seed/run-seed.ts:282`

```typescript
if (process.env.SEED_SHOW_KEYS === "true") {
  console.log(`  [seed] API key for ${email}: ${key}`);
} else {
  console.log(`  [seed] API key created for ${email} (set SEED_SHOW_KEYS=true to reveal — local dev only)`);
}
```

---

### MED-S12 — TODO comment in enrichment

**File:** `control-plane/src/modules/audit/enrichment.ts:99`

Delete the `// TODO: enrich when department lookup is needed` comment. If the enrichment work is tracked, create a GitHub issue instead.

---

### MED-012 — Containers run as root with writable rootfs

**Files:** `docker/control-plane/Dockerfile`, `docker/dashboard/Dockerfile`, `docker-compose.yml`

**Each Dockerfile (runtime stage, before CMD/ENTRYPOINT):**

```dockerfile
RUN useradd -r -u 10001 -g root -s /sbin/nologin interdict
USER interdict
```

**docker-compose.yml per service (`control-plane`, `dashboard`):**

```yaml
security_opt:
  - no-new-privileges:true
read_only: true
cap_drop:
  - ALL
tmpfs:
  - /tmp:size=64m,mode=1777
user: "10001"
```

For the kernel crate container, also drop `CAP_NET_ADMIN` and `CAP_NET_RAW` unless explicitly needed for proxy operation.

**Verification:** `docker inspect <container> | jq '.[].HostConfig.ReadonlyRootfs'` returns `true`. `docker exec <container> whoami` returns `interdict`.

---

## Wave 4 — Low Priority & Infrastructure

---

### LOW-009 — Missing security headers

**File:** `dashboard/next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "X-Frame-Options",          value: "DENY" },
          { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",   // tighten after nonce/hash adoption
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self'",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
```

---

### LOW-010 — Error handler leaks internals

**File:** `control-plane/src/index.ts:79`

```typescript
.onError(({ error, set }) => {
  const status =
    "status" in error && typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;
  set.status = status;
  const errCode =
    "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
  console.error("[error]", { code: errCode, status, message: error.message });
  return {
    success: false,
    error: {
      code: errCode,
      message: status >= 500 ? "Internal server error" : error.message,
    },
  };
})
```

---

### LOW-013 — CI lacks artifact signing

**File:** `.github/workflows/ci-quality-security.yml`

Add after the existing build job:

```yaml
sign-image:
  needs: build
  runs-on: ubuntu-latest
  permissions:
    id-token: write
    packages: write
  steps:
    - uses: sigstore/cosign-installer@v3
    - name: Sign container image
      run: cosign sign --yes ${{ env.IMAGE_DIGEST }}

provenance:
  needs: build
  uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2
  with:
    image: ${{ env.IMAGE_NAME }}
    digest: ${{ env.IMAGE_DIGEST }}
```

---

### LOW-S16 — `createAuthService` factory type

**File:** `control-plane/src/modules/auth/service.ts:149`

```typescript
// Use the project's Db type alias or import directly:
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";

export function createAuthService(
  db: PostgresJsDatabase<typeof schema>
): AuthService {
```

This unblocks Wave 2 HIGH-S2 middleware fix.

---

## Execution Schedule

### Day 1 — Wave 1 (block merge)
- [ ] **NEW-TOCTOU**: Replace SELECT+UPDATE with atomic UPDATE...RETURNING in `service.ts:452`
- [ ] **NEW-HARDCODE-1**: Remove DASHBOARD_URL fallback in `saml/handlers.ts:22`
- [ ] **NEW-HARDCODE-2**: Remove hard-coded IPv6 default in `kernel/src/main.rs:233`
- [ ] **NEW-BOUNDARY**: Document auth route exception or route through `/api/proxy/` (pick one, write decision)

### Day 2 — Wave 2, security-critical (HIGH)
- [ ] **HIGH-004**: Activate org/dept scope in `buildFullSnapshot` + guard missing `orgId`
- [ ] **HIGH-011**: Thread `departmentIds` through audit stats handler → service → ClickHouse query
- [ ] **HIGH-S1**: Collapse N+1 to 3 bulk queries in `regulatory/index.ts`
- [ ] **LOW-S16**: Tighten `createAuthService` factory type (prerequisite for HIGH-S2)
- [ ] **HIGH-S2**: Type `AuthResolveCtx` in `auth/middleware.ts`
- [ ] **HIGH-S4**: Define `AuthCtx` and replace `ctx: any` in `auth/index.ts`

### Day 3 — Wave 3, medium security
- [ ] **NEW-PII**: Remove email from JIT provisioning log line
- [ ] **NEW-RAW-TOKEN**: Encrypt session token in `saml_handoff_codes` at rest (add `HANDOFF_ENCRYPTION_KEY`)
- [ ] **MED-005**: Production guard for insecure gRPC fallback
- [ ] **MED-007**: Remove default credentials from `env.example` + compose + add startup guard
- [ ] **MED-008**: `bun update` in both dirs + audit triage + add CI gate
- [ ] **MED-S10**: `SQL<unknown>[]` and inferred row type in `auth/service.ts`
- [ ] **MED-S11**: Gate seed key logging behind `SEED_SHOW_KEYS` env var
- [ ] **MED-S12**: Delete TODO comment in `enrichment.ts`
- [ ] **MED-S9**: Delete stale comment in `regulatory/index.ts:8`

### Day 4 — Wave 3 continued (quality)
- [ ] **MED-S7**: Define `BaseCtx`/`ModuleCtx` types + replace `ctx: any` across all modules
- [ ] **MED-S8**: Move regulatory DB access to `.derive()` pattern
- [ ] **MED-012**: Add non-root `USER` to Dockerfiles + `read_only` + `cap_drop` to compose

### Day 5 — Wave 4 (low + infra)
- [ ] **LOW-009**: Add security headers to `next.config.ts`
- [ ] **LOW-010**: Fix error handler in `control-plane/src/index.ts`
- [ ] **LOW-013**: Add cosign signing + SLSA provenance to CI workflow

---

## Verification Checklist (run after each wave)

```bash
# Rust
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cargo test -p kernel --test content_inspection_test
cargo audit

# TypeScript
cd control-plane && bun typecheck && bun test
cd dashboard && bun typecheck && bun build
bun audit --audit-level=high   # in both control-plane/ and dashboard/
```

Security scenario re-runs (from RUNTIME_VALIDATION.md):
- [ ] Scenario 1: Auth boundary — API key and session token auth both work (must PASS)
- [ ] Scenario 2: Session lifecycle — after `POST /api/auth/logout`, bearer returns 401 (PASS — already fixed)
- [ ] Scenario 3: IDOR/tenant boundary — audit stats scoped to department (PARTIAL → PASS after HIGH-011)
- [ ] Scenario 4: SAML abuse — handoff code is single-use, no token in URL (PASS — verify atomicity after NEW-TOCTOU fix)
- [ ] Scenario 5: SAML handoff race — two simultaneous exchange requests, only one succeeds (NEW — add test)
- [ ] Scenario 10: Container/K8s — non-root user, readonly rootfs (FAIL → PASS after MED-012)
