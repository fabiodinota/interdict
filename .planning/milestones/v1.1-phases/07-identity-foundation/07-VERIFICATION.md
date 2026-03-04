---
phase: 07-identity-foundation
verified: 2026-03-02T01:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Make a request without Authorization header to a protected route"
    expected: "401 Unauthorized with structured error body"
    why_human: "Requires running server — cannot verify HTTP response behavior statically"
  - test: "Authenticate with a read_only_auditor API key and attempt POST /api/v1/policies"
    expected: "403 Forbidden"
    why_human: "Requires running server and live API key"
  - test: "Authenticate as eng-manager and query GET /api/v1/audit/search"
    expected: "Only records from engineering department are returned"
    why_human: "Requires running ClickHouse and scoped data to validate filter behavior"
  - test: "GET /health with no Authorization header"
    expected: "200 OK — health endpoint is public"
    why_human: "Requires running server to confirm auth macro is opt-in, not global"
---

# Phase 7: Identity Foundation Verification Report

**Phase Goal:** Users can authenticate and are restricted to role-appropriate features and data
**Verified:** 2026-03-02
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | api_keys table with SHA-256 key_hash (unique indexed), key_prefix, user FK, is_active, timestamps | VERIFIED | `auth.ts` lines 30-49: full column set, unique constraint on keyHash, cascade FK to users |
| 2 | user_departments join table with composite PK (user_id, department_id) | VERIFIED | `auth.ts` lines 60-74: both FK columns, primaryKey on (userId, departmentId) |
| 3 | role_permissions table with unique index on (role, permission) | VERIFIED | `auth.ts` lines 84-96: id/role/permission/isGranted columns, uniqueIndex on (role, permission) |
| 4 | users table has is_service boolean flag | VERIFIED | `organization.ts` line 56: `isService: boolean("is_service").notNull().default(false)` |
| 5 | Permission hierarchy: Super Admin(5) > Compliance Officer(4) > Policy Admin(3) > Department Manager(2) > Read-Only Auditor(1) | VERIFIED | `permissions.ts` ROLE_HIERARCHY; 27 passing unit tests; roleHierarchyLevel("invalid_role") returns 0 |
| 6 | Seed script bootstraps departments, users (5 roles), service accounts, API keys, default permissions | VERIFIED | `run-seed.ts` seedIdentity() function; `identity-seed.json` has all required entities |
| 7 | Valid API key in Authorization Bearer resolves to AuthenticatedUser with role and departmentIds | VERIFIED | `middleware.ts`: authenticateByApiKey called in resolve handler; `service.ts` returns {id, email, displayName, role, isService, departmentIds} |
| 8 | Missing/invalid API key returns 401; insufficient role returns 403 | VERIFIED | `middleware.ts` lines 37-78: status(401) for missing header or bad key, status(403) for insufficient role |
| 9 | API key can be created (plaintext once), listed (no hash), revoked (soft delete) | VERIFIED | `index.ts` auth module has POST /keys (201+plaintext), GET /keys (prefix only, no hash), DELETE /keys/:keyId (204); `service.ts` never returns keyHash in listApiKeys |
| 10 | All existing API endpoints require valid API key (except /health) | VERIFIED | policies/vendors/regulatory/audit modules all .use(authPlugin) and have {auth: [...]} on every route; health endpoint defined before .use(authPlugin) at line 77-82 of index.ts |
| 11 | Super Admin can access all endpoints; Read-Only Auditor blocked from write operations | VERIFIED | policies/vendors/regulatory write routes: `{ auth: ["policy_admin"] }` — requires level 3+; read routes: `{ auth: ["read_only_auditor"] }` — level 1+ |
| 12 | Department Manager querying audit data sees only their assigned departments' records | VERIFIED | `audit/index.ts` passes `ctx.user.departmentIds` to search/stream/dept-summary; `service.ts` applyDepartmentScope applies WHERE IN clause for scoped users |
| 13 | Users with empty departmentIds see all data (full visibility for higher roles) | VERIFIED | `service.ts` applyDepartmentScope: `if (!departmentIds \|\| departmentIds.length === 0) return filters;` |

**Score: 13/13 truths verified**

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `control-plane/src/db/schema/auth.ts` | VERIFIED | Exports apiKeys, userDepartments, rolePermissions — all columns, FKs, indexes correct |
| `control-plane/src/db/schema/organization.ts` | VERIFIED | isService boolean added to users table |
| `control-plane/src/db/schema/index.ts` | VERIFIED | Line 29: `export { apiKeys, userDepartments, rolePermissions } from "./auth"` |
| `control-plane/src/modules/auth/permissions.ts` | VERIFIED | Exports ROLE_HIERARCHY, DEFAULT_PERMISSIONS, PERMISSIONS, hasPermission, roleHierarchyLevel, roleInheritsFrom |
| `control-plane/src/seed/identity-seed.json` | VERIFIED | 4 departments, 5 users (all roles), 2 service accounts, defaultPermissions for all 5 roles |
| `control-plane/src/seed/run-seed.ts` | VERIFIED | seedIdentity() runs before regulatory seed; inserts departments, users, service accounts, userDepartments, apiKeys (SHA-256 hashed), rolePermissions |
| `control-plane/src/db/migrations/0001_white_dust.sql` | VERIFIED | Creates api_keys, role_permissions, user_departments tables; adds is_service column; correct FKs and indexes |
| `control-plane/src/modules/auth/middleware.ts` | VERIFIED | Exports authPlugin with .macro("auth") using resolve pattern; extracts Bearer token, validates key, checks role hierarchy |
| `control-plane/src/modules/auth/service.ts` | VERIFIED | Exports createAuthService, AuthenticatedUser, hashApiKey, generateApiKey; all 5 methods present and non-stub |
| `control-plane/src/modules/auth/model.ts` | VERIFIED | Exports CreateApiKeyBody, ApiKeyListQuery, RevokeApiKeyParams, WhoAmIResponse, ApiKeyResponse, CreateApiKeyResponse |
| `control-plane/src/modules/auth/index.ts` | VERIFIED | Exports authModule with 4 endpoints: GET /me, POST /keys, GET /keys, DELETE /keys/:keyId |
| `control-plane/src/shared/utilities.ts` | VERIFIED | AuthError (401) and ForbiddenError (403) classes present at lines 59-71 |
| `control-plane/src/index.ts` | VERIFIED | authPlugin and authModule imported and registered; health endpoint before .use(authPlugin) |
| `control-plane/src/modules/policies/index.ts` | VERIFIED | .use(authPlugin); 7 routes with correct auth guards |
| `control-plane/src/modules/vendors/index.ts` | VERIFIED | .use(authPlugin); 8 routes with correct auth guards |
| `control-plane/src/modules/regulatory/index.ts` | VERIFIED | .use(authPlugin); 6 routes with correct auth guards |
| `control-plane/src/modules/audit/index.ts` | VERIFIED | .use(authPlugin); 5 routes with auth guards; departmentIds passed to search/stream/dept-summary |
| `control-plane/src/modules/audit/service.ts` | VERIFIED | applyDepartmentScope handles empty/single/multi/out-of-scope; search/streamEvents/getDepartmentSummary accept departmentIds |
| `control-plane/src/modules/audit/queries.ts` | VERIFIED | AuditTrailFilters has department_ids field; queryAuditTrail uses `department IN {dept_ids:Array(String)}`; queryDepartmentSummary accepts departmentIds |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `schema/auth.ts` | `schema/organization.ts` | FK references to users.id and departments.id | WIRED | Lines 36, 65, 68: .references(() => users.id) and .references(() => departments.id) |
| `schema/index.ts` | `schema/auth.ts` | re-export of apiKeys, userDepartments, rolePermissions | WIRED | Line 29: `export { apiKeys, userDepartments, rolePermissions } from "./auth"` |
| `seed/run-seed.ts` | `schema/auth.ts` | import of apiKeys, userDepartments, rolePermissions | WIRED | Lines 25-27: imports all three new tables; inserts into all three |
| `auth/middleware.ts` | `auth/service.ts` | authenticateByApiKey call in resolve handler | WIRED | Line 53: `const user = await authService.authenticateByApiKey(token)` |
| `auth/middleware.ts` | `auth/permissions.ts` | roleHierarchyLevel call for role checking | WIRED | Line 21: imported; lines 67-70: used to compute minRequiredLevel and compare |
| `auth/service.ts` | `schema/auth.ts` | Drizzle queries on apiKeys, userDepartments tables | WIRED | Lines 15-16: imports apiKeys and userDepartments; all CRUD operations use them |
| `auth/index.ts` | `auth/middleware.ts` | .use(authPlugin) to apply auth macro | WIRED | Line 28: `.use(authPlugin)` |
| `index.ts` | `auth/index.ts` | .use(authModule) registration | WIRED | Line 82: `.use(authModule)` |
| `index.ts` | `auth/middleware.ts` | .use(authPlugin) global application | WIRED | Line 81: `.use(authPlugin)` |
| `audit/service.ts` | `audit/queries.ts` | department scope filter injected into query filters | WIRED | applyDepartmentScope sets department_ids on scopedFilters; passed to queryAuditTrail |
| `policies/index.ts` | `auth/middleware.ts` | auth macro option on each route | WIRED | Line 23: .use(authPlugin); 7 routes with { auth: ["policy_admin"] } or { auth: ["read_only_auditor"] } |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| IDENT-02 | 07-01, 07-02 | User can authenticate via API key for programmatic access | SATISFIED | apiKeys table with SHA-256 hash; authPlugin validates Bearer token against DB; POST /auth/keys creates keys; service.authenticateByApiKey is the auth hot path |
| IDENT-03 | 07-01, 07-02, 07-03 | User assigned one of five roles restricts accessible features and data | SATISFIED | ROLE_HIERARCHY with 5 levels; authPlugin enforces minRequiredLevel; all routes have role guards; policy/vendor/regulatory write = policy_admin+, read = read_only_auditor+; audit = read_only_auditor+ |
| IDENT-04 | 07-01, 07-03 | Department Manager can only view data for their own department | SATISFIED | userDepartments join table tracks membership; authenticateByApiKey fetches departmentIds; applyDepartmentScope adds WHERE IN clause for scoped users; passed to search/stream/getDepartmentSummary |

No orphaned requirements detected. REQUIREMENTS.md marks all three as Complete for Phase 7.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `control-plane/src/index.ts` | 48, 55, 61 | Pre-existing TypeScript errors in onError handler (Elysia type incompatibility with `error.message`) | Info | Pre-existing from Phase 5, documented in all 3 plan summaries. Does not affect runtime behavior — the JS coercion works at runtime. Not introduced by Phase 7 changes. |

**No stub implementations found.** The two `return null` occurrences in service.ts (lines 143, 151) are intentional early-exit guards in authenticateByApiKey when key or user is not found — correct behavior, not placeholders.

---

### Test Results

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| `src/modules/auth/permissions.test.ts` | 27 | 27 | 0 |
| `src/modules/auth/service.test.ts` | 12 | 12 | 0 |
| All control-plane tests | 94 | 94 | 0 |

---

### Human Verification Required

The following items require a running server with a live database to fully verify:

#### 1. Auth enforcement — unauthenticated request

**Test:** Send `GET /api/v1/policies` with no Authorization header
**Expected:** 401 response with body `{ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" } }`
**Why human:** Requires running Elysia server with Postgres

#### 2. Auth enforcement — wrong role

**Test:** Obtain a read_only_auditor API key from seed, then send `POST /api/v1/policies` with valid Bearer token
**Expected:** 403 response with body `{ success: false, error: { code: "FORBIDDEN", message: "Insufficient role permissions" } }`
**Why human:** Requires live API key and running server

#### 3. Department scoping — audit results filtered

**Test:** Authenticate as eng-manager (engineering department only), then query `GET /api/v1/audit/search`
**Expected:** Only audit records with department="engineering" are returned; no records from other departments appear
**Why human:** Requires running ClickHouse with multi-department data

#### 4. Health endpoint public access

**Test:** Send `GET /health` with no Authorization header
**Expected:** 200 OK with `{ status: "ok", timestamp: ... }`
**Why human:** Requires running server to confirm opt-in macro behavior (health is defined before .use(authPlugin), but macro is opt-in anyway)

#### 5. API key creation and plaintext one-time display

**Test:** `POST /api/v1/auth/keys` with valid Bearer token; note the plaintext key; call `GET /api/v1/auth/keys` after creation
**Expected:** POST returns `{ id, plaintext, prefix, label, created_at }`; subsequent GET returns only `{ id, prefix, label, is_active, last_used_at, created_at }` — never keyHash or plaintext
**Why human:** Requires running server to confirm one-shot plaintext behavior

---

### Security Invariant Checks (CLAUDE.md)

| Invariant | Status | Evidence |
|-----------|--------|----------|
| #6 — No plaintext keys in logs | SATISFIED | middleware.ts returns only generic error messages; service.ts plaintext returned once in createApiKey, never stored or logged; seed prints plaintext ONCE to stdout then discards |
| #3 — Deterministic policy logic only | SATISFIED | Auth decisions are deterministic SHA-256 hash lookup + role level comparison; no LLM involvement |
| #2 — Control-plane/data-plane separation | SATISFIED | Auth runs in control-plane HTTP layer only; kernel data-plane is unaffected |
| #4 — Fail-closed defaults | SATISFIED | auth macro returns 401 on any missing or invalid key; 403 on insufficient role |

---

### Gaps Summary

No gaps. All 13 observable truths verified. All artifacts are substantive and wired. All key links confirmed in code. All 3 requirement IDs (IDENT-02, IDENT-03, IDENT-04) are fully satisfied. Pre-existing TypeScript errors in the onError handler of index.ts are not introduced by Phase 7 and do not affect runtime behavior.

The phase goal — **"Users can authenticate and are restricted to role-appropriate features and data"** — is achieved.

---

_Verified: 2026-03-02_
_Verifier: Claude (gsd-verifier)_
