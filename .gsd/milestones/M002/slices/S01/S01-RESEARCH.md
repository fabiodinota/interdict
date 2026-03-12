# Phase 7: Identity Foundation - Research

**Researched:** 2026-03-01
**Domain:** API key authentication, hierarchical RBAC, department-scoped data filtering
**Confidence:** HIGH

## Summary

Phase 7 adds identity to the existing Bun/Elysia control plane API: API key authentication with SHA-256 hashing, a 5-role hierarchical RBAC model, route-level permission guards, and department-scoped data filtering. The control plane already has a PostgreSQL database (Drizzle ORM 0.45), an Elysia 1.4 HTTP server with modular plugin architecture, a users table with a `role` column (forward-declared in Phase 5), and departments/teams tables. The work is primarily schema evolution (adding `api_keys` table, `user_departments` join table, and `is_service` flag to users), a new auth middleware plugin using Elysia's `macro` + `resolve` pattern, and injecting department scope filters into existing audit/query services.

The entire stack stays within TypeScript/Bun -- no new language or runtime is introduced. Bun natively supports SHA-256 via `Bun.CryptoHasher` and constant-time comparison via `crypto.timingSafeEqual` from `node:crypto`. Drizzle Kit handles schema migrations. The `@elysiajs/bearer` plugin extracts Bearer tokens, but is trivial enough to implement inline (3 lines); the recommendation is to skip the dependency and extract the token directly in a `resolve` handler.

**Primary recommendation:** Use Elysia macros with `resolve` for auth context injection and `beforeHandle` for permission enforcement; store API key SHA-256 hashes with a `key_prefix` column for identification; use a `user_departments` join table for multi-department membership.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hierarchical role model: Super Admin > Compliance Officer > Policy Admin > Department Manager > Read-Only Auditor
- Each higher role inherits all permissions from roles below it
- Single role per user -- one role assignment, hierarchy provides lower-role access
- Role permissions are configurable via policy (stored in config/database), not hardcoded -- allows enterprise customers to customize role access
- Initial users and roles loaded from a seed file at first boot, then managed via API afterward
- Prefixed random format: `ik_live_<random>` -- prefix identifies key type at a glance
- Keys stored as SHA-256 hash in the database
- Passed via standard `Authorization: Bearer <key>` header
- No expiration -- keys are valid until explicitly revoked by an admin
- Multiple keys per user -- one per integration/environment, individually revocable
- Departments defined via seed file + API (same pattern as users/roles)
- Department Managers can belong to multiple departments and see data from all assigned departments
- Higher roles (Compliance Officer, Super Admin) default to full visibility across all departments, but can optionally be scoped to specific departments per user
- Read-Only Auditors are also configurable -- default full visibility, optionally scoped to departments
- Scoping pattern: user has a `department_ids` list; empty list = all departments visible (for roles that default to full access)
- Service accounts use the same API key system as human users
- Service accounts have full system access (Super Admin-level permissions)
- Hidden from user management UI -- purely system-internal, managed via seed file only
- Adding/removing service accounts requires updating the seed file and restarting the control plane
- Service accounts are distinguished internally by a `is_service` flag but not exposed to end users

### Claude's Discretion
- Database schema design (tables, indexes, migrations)
- Exact seed file format (TOML, YAML, JSON)
- API key generation algorithm details (beyond SHA-256 hashing)
- Route guard middleware implementation approach
- Error response format for unauthorized/forbidden requests
- Rate limiting on auth endpoints (if any)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-02 | User can authenticate via API key for programmatic access | API key table schema, SHA-256 hashing via `Bun.CryptoHasher`, Bearer token extraction, `resolve` macro for auth context injection, `timingSafeEqual` for secure comparison |
| IDENT-03 | User is assigned one of five roles (Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor) that restricts accessible features and data | Hierarchical role model with permission inheritance, configurable permission matrix stored in DB, Elysia `beforeHandle` permission checks, route-level guard pattern |
| IDENT-04 | User with Department Manager role can only view data for their own department | `user_departments` join table, department scope filter injected into audit ClickHouse queries and PostgreSQL queries, empty `department_ids` = full visibility pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Elysia | 1.4.26 | HTTP framework (already installed) | Project standard; macro + resolve pattern provides type-safe auth injection |
| Drizzle ORM | 0.45.1 | PostgreSQL ORM (already installed) | Project standard; schema-first with typed queries, migration generation via Drizzle Kit |
| postgres (postgres.js) | 3.4.x | PostgreSQL driver (already installed) | Project standard; already configured with connection pooling |
| Bun.CryptoHasher | built-in | SHA-256 hashing of API keys | Native Bun API, no dependency; supports incremental hashing and hex digest |
| node:crypto | built-in | `timingSafeEqual` for key comparison, `randomBytes` for key generation | Bun implements Node.js crypto natively in C++ |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Drizzle Kit | 0.30.x | Schema migration generation | When schema changes need SQL migration files |
| @sinclair/typebox | 0.34.x | Request/response validation (already installed via Elysia) | For auth endpoint request body/query validation schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Bearer extraction | @elysiajs/bearer plugin | Plugin adds a dependency for 3 lines of code; not worth it for this project's simplicity |
| SHA-256 key hash | bcrypt/argon2 key hash | API keys have high entropy (256 bits), making brute-force impractical; SHA-256 is fast for per-request validation without the latency cost of bcrypt |
| Custom role hierarchy | casbin/casl | External RBAC libraries add complexity; 5-role linear hierarchy with configurable permissions is simple enough to implement directly |
| Elysia guard | Elysia macro | Macro is more flexible -- allows per-route role requirements via route options (e.g., `{ auth: true, roles: ["super_admin"] }`) |

**Installation:**
```bash
# No new dependencies needed -- all required libraries already installed
# Drizzle Kit for migrations:
bun run db:generate  # Generate migration SQL from schema changes
bun run db:migrate   # Apply migrations
```

## Architecture Patterns

### Recommended Project Structure
```
control-plane/src/
├── db/
│   └── schema/
│       ├── organization.ts   # MODIFY: add is_service flag to users
│       ├── auth.ts           # NEW: api_keys table, user_departments join table, role_permissions table
│       └── index.ts          # MODIFY: re-export new tables
├── modules/
│   └── auth/                 # NEW MODULE
│       ├── index.ts          # Elysia plugin: auth endpoints (create key, revoke, list keys)
│       ├── middleware.ts     # Auth macro: resolve user from API key, beforeHandle role checks
│       ├── service.ts        # Auth business logic: key generation, validation, user lookup
│       ├── model.ts          # TypeBox schemas for auth endpoints
│       ├── permissions.ts    # Role hierarchy definition, permission matrix, helper functions
│       └── service.test.ts   # Unit tests
├── seed/
│   ├── identity-seed.json    # NEW: initial users, roles, departments, service accounts
│   └── run-seed.ts           # MODIFY: add identity seeding alongside regulatory seeding
└── shared/
    └── utilities.ts          # MODIFY: add AuthError (401) and ForbiddenError (403) classes
```

### Pattern 1: Auth Macro with Resolve
**What:** Elysia macro that extracts the Bearer token, looks up the API key hash in the database, resolves the user with role and department claims, and makes the user available to all downstream route handlers.
**When to use:** Every authenticated endpoint (all existing and new routes)
**Example:**
```typescript
// Source: Elysia macro docs https://elysiajs.com/patterns/macro
import { Elysia } from "elysia";
import { timingSafeEqual } from "node:crypto";

// Auth macro plugin
export const authPlugin = new Elysia({ name: "auth" })
  .macro({
    auth: (requiredRoles?: string[]) => ({
      async resolve({ headers, status }) {
        const authHeader = headers["authorization"];
        if (!authHeader?.startsWith("Bearer ")) {
          return status(401, {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" },
          });
        }

        const token = authHeader.slice(7);
        const tokenHash = hashApiKey(token); // SHA-256 hex digest

        const apiKey = await lookupApiKeyByHash(tokenHash);
        if (!apiKey || !apiKey.isActive) {
          return status(401, {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid API key" },
          });
        }

        const user = await getUserWithDepartments(apiKey.userId);
        if (!user || !user.isActive) {
          return status(401, {
            success: false,
            error: { code: "UNAUTHORIZED", message: "User account is inactive" },
          });
        }

        // Role check (if required roles specified)
        if (requiredRoles && requiredRoles.length > 0) {
          const hasAccess = requiredRoles.some(
            (role) => roleHierarchyLevel(user.role) >= roleHierarchyLevel(role)
          );
          if (!hasAccess) {
            return status(403, {
              success: false,
              error: { code: "FORBIDDEN", message: "Insufficient permissions" },
            });
          }
        }

        return { user }; // Available as context.user in route handlers
      },
    }),
  });

// Usage in route modules:
app.use(authPlugin)
   .get("/api/v1/policies", ({ user }) => { /* user is typed */ }, {
     auth: ["policy_admin"],  // Only Policy Admin and above
   });
```

### Pattern 2: Department-Scoped Data Filtering
**What:** After auth resolves the user, inject the user's department scope into query filters. If `department_ids` is empty, no filter is applied (full visibility). If populated, a WHERE/IN clause restricts results.
**When to use:** Any query that returns department-scoped data (audit trail, department summary, policy enforcement data)
**Example:**
```typescript
// Department scope filter injection
function applyDepartmentScope(
  user: AuthenticatedUser,
  filters: AuditTrailFilters
): AuditTrailFilters {
  // Super Admin, Compliance Officer, Read-Only Auditor with empty dept list = full access
  if (user.departmentIds.length === 0) {
    return filters;
  }

  // Department Manager or scoped higher role: restrict to their departments
  if (user.departmentIds.length === 1) {
    return { ...filters, department: user.departmentIds[0] };
  }

  // Multiple departments: use IN filter
  return { ...filters, department_ids: user.departmentIds };
}
```

### Pattern 3: Configurable Permission Matrix
**What:** Store role-to-permission mappings in the database rather than hardcoding. Default permissions loaded from seed; enterprise customers can customize via API.
**When to use:** All role-based access decisions
**Example:**
```typescript
// Permission matrix (default, overridable via DB)
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  read_only_auditor: ["audit:read", "stats:read"],
  department_manager: ["audit:read", "stats:read", "policies:read", "department:manage"],
  policy_admin: ["audit:read", "stats:read", "policies:read", "policies:write", "vendors:read", "vendors:write", "regulatory:read", "regulatory:write"],
  compliance_officer: ["audit:read", "stats:read", "policies:read", "policies:write", "vendors:read", "vendors:write", "regulatory:read", "regulatory:write", "reports:generate", "reviews:manage"],
  super_admin: ["*"], // Wildcard: all permissions
};

// Hierarchy level for inheritance
const ROLE_HIERARCHY: Record<string, number> = {
  read_only_auditor: 1,
  department_manager: 2,
  policy_admin: 3,
  compliance_officer: 4,
  super_admin: 5,
};

function hasPermission(userRole: string, requiredPermission: string, customPermissions?: Map<string, string[]>): boolean {
  const perms = customPermissions?.get(userRole) ?? DEFAULT_PERMISSIONS[userRole] ?? [];
  return perms.includes("*") || perms.includes(requiredPermission);
}
```

### Pattern 4: API Key Generation and Storage
**What:** Generate cryptographically random API keys with the `ik_live_` prefix, hash with SHA-256 before storage, store only the hash and a short prefix for identification.
**When to use:** Key creation endpoint
**Example:**
```typescript
import { randomBytes } from "node:crypto";

function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("base64url"); // 256 bits of entropy
  const plaintext = `ik_live_${random}`;
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.substring(0, 12); // "ik_live_XXXX" for identification
  return { plaintext, hash, prefix };
}

function hashApiKey(key: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(key);
  return hasher.digest("hex");
}
```

### Anti-Patterns to Avoid
- **Storing plaintext API keys:** Always store SHA-256 hash only. The plaintext is shown exactly once at creation time and never retrievable again.
- **Non-constant-time key comparison:** Use `timingSafeEqual` when comparing hashes to prevent timing attacks. However, since we look up by hash (DB query), the comparison is implicitly safe -- the hash either matches a row or doesn't. Timing-safe comparison is needed only if comparing in application code.
- **Hardcoded role checks scattered in routes:** Centralize role/permission logic in the auth macro and permissions module. Route handlers should declare required roles via the macro option, not contain `if (user.role !== "admin")` checks.
- **Querying users table on every request without caching:** API key lookups happen on every request. Use a small in-memory cache with short TTL (e.g., 60 seconds) or accept the DB hit given PostgreSQL connection pooling. For Phase 7, DB lookup per request is acceptable; caching can be added later if needed.
- **Department filtering in the application layer after fetching all data:** Apply department scope at the query level (WHERE clause) not by fetching all records and filtering in TypeScript.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash implementation | `Bun.CryptoHasher("sha256")` | Native, audited, fast; no reason to use a library |
| Cryptographic random generation | `Math.random()` or custom PRNG | `randomBytes(32)` from `node:crypto` | Cryptographically secure PRNG required for API key entropy |
| Constant-time comparison | `===` string equality | `timingSafeEqual` from `node:crypto` | Prevents timing side-channel attacks |
| Database migrations | Raw SQL scripts | Drizzle Kit `generate` + `migrate` | Already used in project; tracks migration state, generates typed queries |
| Bearer token extraction | Custom header parsing with regex | Simple `startsWith("Bearer ")` + `slice(7)` | The RFC 6750 pattern is trivial; no library needed, but don't use regex for it |

**Key insight:** The auth domain has well-established primitives (SHA-256, CSPRNG, timing-safe comparison) all available natively in Bun. The complexity in this phase is in the permission model design and query-level department scoping, not in the cryptographic primitives.

## Common Pitfalls

### Pitfall 1: Leaking API Keys in Logs or Error Responses
**What goes wrong:** API key plaintext appears in request logs, error stack traces, or 401 response bodies.
**Why it happens:** Default HTTP logging includes Authorization headers; error serialization may include request details.
**How to avoid:** (1) Strip Authorization header from all structured log output. (2) Never include the key value in error responses -- return "Invalid API key" without echoing the key. (3) Add a log scrubbing middleware that redacts `Authorization` header values. This aligns with CLAUDE.md Invariant 6 (no plaintext secrets in logs).
**Warning signs:** Seeing `Bearer ik_live_...` in log output.

### Pitfall 2: Forgetting to Scope ClickHouse Queries by Department
**What goes wrong:** Department Manager sees data from all departments because the department filter is only applied to PostgreSQL queries but not to ClickHouse audit trail queries.
**Why it happens:** The audit module queries ClickHouse directly with its own query builder (`queries.ts`). Department scoping needs to be injected into both PostgreSQL and ClickHouse query paths.
**How to avoid:** Create a shared `applyDepartmentScope` function that works for both query systems. The ClickHouse `queryAuditTrail` function already has a `department` filter parameter -- wire it to the authenticated user's department scope.
**Warning signs:** Writing department filter logic in the PostgreSQL service but not in the ClickHouse query builder.

### Pitfall 3: Breaking Existing Service Callers During Auth Rollout
**What goes wrong:** Adding auth middleware to all routes breaks the gRPC distribution server, compilation worker, or integration tests that don't send API keys.
**Why it happens:** Auth is applied globally but internal service callers have no API keys yet.
**How to avoid:** (1) Seed service account API keys during initial setup. (2) The gRPC distribution server is a separate server (port 50052) -- it does NOT go through Elysia middleware, so it is unaffected by HTTP auth. (3) The compilation worker runs as an in-process function (`startCompilationWorker`), not via HTTP -- also unaffected. (4) Integration tests need to send API keys -- provide a test seed with known service account keys.
**Warning signs:** Tests that passed before Phase 7 suddenly fail with 401.

### Pitfall 4: Role Hierarchy Bypass via Direct Permission Check
**What goes wrong:** A Compliance Officer is blocked from an endpoint that requires Policy Admin, even though Compliance Officer is higher in the hierarchy.
**Why it happens:** Permission check compares exact role strings instead of using hierarchy levels.
**How to avoid:** Always check `roleHierarchyLevel(user.role) >= roleHierarchyLevel(requiredRole)`, never `user.role === requiredRole`.
**Warning signs:** Higher-level roles getting 403 errors on endpoints accessible to lower roles.

### Pitfall 5: Seed File Chicken-and-Egg Problem
**What goes wrong:** The system requires auth to create users, but no users exist at first boot.
**Why it happens:** Auth middleware blocks all routes including user management before any users are seeded.
**How to avoid:** The seed script runs as a direct database operation (like the existing regulatory seed in `run-seed.ts`), bypassing the HTTP API entirely. It inserts users, departments, and API keys directly into PostgreSQL. The first Super Admin API key is printed to stdout (once) during seeding.
**Warning signs:** First deployment hangs because no one can authenticate.

### Pitfall 6: Multi-Department Membership Schema Misdesign
**What goes wrong:** Using a single `department_id` FK on the users table prevents Department Managers from belonging to multiple departments.
**Why it happens:** The existing users table has `department_id` as a single FK -- seems natural to keep using it.
**How to avoid:** Create a `user_departments` join table for multi-department membership. The existing `department_id` on users can be kept as "primary department" for display purposes or deprecated in favor of the join table exclusively.
**Warning signs:** User decision explicitly states "Department Managers can belong to multiple departments."

## Code Examples

Verified patterns from official sources:

### SHA-256 API Key Hashing
```typescript
// Source: Bun docs https://bun.sh/docs/runtime/hashing
function hashApiKey(key: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(key);
  return hasher.digest("hex");
}

// Result: 64-character hex string, suitable for indexed DB column
```

### Cryptographic Key Generation
```typescript
// Source: Node.js crypto docs (Bun compatible)
import { randomBytes } from "node:crypto";

function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  // 32 bytes = 256 bits of entropy, base64url encoded = 43 chars
  const random = randomBytes(32).toString("base64url");
  const plaintext = `ik_live_${random}`;

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(plaintext);
  const hash = hasher.digest("hex");

  // Prefix for dashboard display (never reveals enough to reconstruct)
  const prefix = plaintext.substring(0, 16); // "ik_live_XXXXXXXX"

  return { plaintext, hash, prefix };
}
```

### Elysia Auth Macro Plugin
```typescript
// Source: Elysia macro docs https://elysiajs.com/patterns/macro
import { Elysia } from "elysia";

export const authPlugin = new Elysia({ name: "auth" })
  .macro({
    auth: (requiredRoles?: string[] | boolean) => ({
      async resolve({ headers, status, store }) {
        const authHeader = headers["authorization"];
        if (!authHeader?.startsWith("Bearer ")) {
          return status(401, {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Missing API key" },
          });
        }

        const token = authHeader.slice(7);
        const user = await authenticateByApiKey(store.db, token);

        if (!user) {
          return status(401, {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid API key" },
          });
        }

        // If requiredRoles is specified and not just `true`
        if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
          const minLevel = Math.min(...requiredRoles.map(roleHierarchyLevel));
          if (roleHierarchyLevel(user.role) < minLevel) {
            return status(403, {
              success: false,
              error: { code: "FORBIDDEN", message: "Insufficient role" },
            });
          }
        }

        return { user };
      },
    }),
  });
```

### Drizzle Schema: API Keys Table
```typescript
// Pattern: Drizzle ORM pg-core table definition
import { pgTable, uuid, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./organization";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(), // SHA-256 hex
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(), // "ik_live_XXXXXXXX"
    label: varchar("label", { length: 255 }), // User-provided label (e.g., "CI pipeline")
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("api_keys_hash_idx").on(table.keyHash),
    index("api_keys_user_idx").on(table.userId),
  ]
);
```

### Drizzle Schema: User-Department Join Table
```typescript
import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./organization";
import { departments } from "./organization";

export const userDepartments = pgTable(
  "user_departments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.departmentId] }),
  ]
);
```

### Identity Seed File (JSON)
```json
{
  "departments": [
    { "name": "engineering", "displayName": "Engineering" },
    { "name": "legal", "displayName": "Legal" },
    { "name": "compliance", "displayName": "Compliance" }
  ],
  "users": [
    {
      "email": "admin@interdict.local",
      "displayName": "System Administrator",
      "role": "super_admin",
      "departments": []
    },
    {
      "email": "compliance@interdict.local",
      "displayName": "Compliance Officer",
      "role": "compliance_officer",
      "departments": []
    },
    {
      "email": "eng-manager@interdict.local",
      "displayName": "Engineering Manager",
      "role": "department_manager",
      "departments": ["engineering"]
    }
  ],
  "serviceAccounts": [
    {
      "email": "distribution-service@interdict.internal",
      "displayName": "Policy Distribution Service",
      "isService": true
    },
    {
      "email": "collector-service@interdict.internal",
      "displayName": "Evidence Collector Service",
      "isService": true
    }
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Elysia `beforeHandle` for auth | Elysia `macro` with `resolve` | Elysia 0.8+ (2024) | Macros provide type-safe per-route config; resolve injects typed user into context |
| JWT session tokens | API key + SHA-256 hash | N/A (user decision) | Simpler for programmatic access; no token refresh flow needed; no expiry management |
| Single `department_id` FK | Join table `user_departments` | Phase 7 | Supports multi-department membership per user decision |
| No auth (Phase 5 open API) | API key auth on all routes | Phase 7 | All existing endpoints become protected; seed file bootstraps initial access |

**Deprecated/outdated:**
- Elysia `derive` for auth: Still works but `macro` with `resolve` is the recommended pattern for auth since Elysia 0.8+ because it provides per-route configuration via route options
- `@elysiajs/lucia-auth`: Lucia auth library is deprecated as of 2025; not relevant since we use API keys, not session-based auth

## Open Questions

1. **Permission matrix storage format**
   - What we know: User decision says "configurable via policy (stored in config/database), not hardcoded"
   - What's unclear: Exact schema for the `role_permissions` table -- should it be a flat table (role, permission) or JSON column? Flat table is more queryable; JSON column is simpler for bulk updates.
   - Recommendation: Use a `role_permissions` table with `(role, permission, is_granted)` columns. Load defaults from seed, allow API updates. Cache in memory with short TTL.

2. **Existing `department_id` on users table**
   - What we know: Users table already has a `department_id` FK. Phase 7 adds multi-department membership via `user_departments` join table.
   - What's unclear: Should the existing `department_id` be kept as "primary department" or deprecated?
   - Recommendation: Keep `department_id` as primary/display department for backward compatibility. The `user_departments` join table is the authoritative source for access scope. Ensure `department_id` is also present in `user_departments`.

3. **API key lookup performance at scale**
   - What we know: Every HTTP request requires a DB lookup of the SHA-256 hash. With connection pooling and an indexed column, this should be sub-millisecond.
   - What's unclear: Whether to add an in-memory cache (DashMap/LRU) for key-to-user resolution.
   - Recommendation: Start without caching. PostgreSQL connection pool (20 connections) with an indexed unique column on `key_hash` is fast enough. Add LRU cache if profiling shows auth is a bottleneck.

## Sources

### Primary (HIGH confidence)
- [Elysia Lifecycle Hooks](https://elysiajs.com/essential/life-cycle) - beforeHandle, resolve, derive execution order
- [Elysia Macro Pattern](https://elysiajs.com/patterns/macro) - macro with resolve for auth injection
- [Elysia Guard](https://elysiajs.com/tutorial/getting-started/guard/) - route-scoped hook application
- [Elysia Bearer Plugin](https://elysiajs.com/plugins/bearer) - Bearer token extraction (decided to skip plugin, implement inline)
- [Bun Hashing Docs](https://bun.sh/docs/runtime/hashing) - `Bun.CryptoHasher` SHA-256 API
- [Bun timingSafeEqual](https://bun.com/reference/node/crypto/timingSafeEqual) - constant-time comparison support
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations) - generate + migrate workflow

### Secondary (MEDIUM confidence)
- [Zuplo API Key Best Practices](https://zuplo.com/learning-center/how-to-implement-api-key-authentication) - SHA-256 storage pattern, prefix format, entropy requirements
- [Elysia RBAC Discussion](https://github.com/elysiajs/elysia/discussions/1322) - macro-based permission pattern in community

### Tertiary (LOW confidence)
- None -- all findings verified with official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and proven in existing codebase
- Architecture: HIGH - Elysia macro pattern verified in official docs; schema patterns follow established Drizzle conventions
- Pitfalls: HIGH - identified from direct analysis of existing codebase (audit queries, seed script, middleware patterns)

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (stable domain; Elysia and Drizzle APIs unlikely to change materially)