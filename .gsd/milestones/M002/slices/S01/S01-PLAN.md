# S01: Identity Foundation

**Goal:** Create the database schema, permission model, and seed infrastructure for API key authentication and RBAC.
**Demo:** Create the database schema, permission model, and seed infrastructure for API key authentication and RBAC.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Create the database schema, permission model, and seed infrastructure for API key authentication and RBAC.

Purpose: Establish the data layer foundation that auth middleware (Plan 02) and route guards (Plan 03) depend on. Without tables and seed data, no authentication or authorization is possible.

Output: Three new Drizzle schema tables (api_keys, user_departments, role_permissions), is_service flag on users, a permission hierarchy module, and an identity seed script that bootstraps a working control plane on first boot.
- [x] **T02: Plan 02**
  - Build the authentication middleware and API key management endpoints.

Purpose: This plan creates the auth macro that extracts and validates API keys on every request (IDENT-02) and enforces role-based access (IDENT-03). It also provides key management endpoints so administrators can create and revoke API keys. Plan 03 depends on this middleware to protect all existing routes.

Output: An Elysia auth macro plugin, auth service with key generation/validation, API key CRUD endpoints, and error classes for 401/403 responses.
- [x] **T03: Plan 03**
  - Wire authentication into all existing API modules, enforce role-based route guards, and implement department-scoped data filtering.

Purpose: This is the integration plan that makes the Phase 7 identity system operational. Without this wiring, the auth middleware exists but no routes use it, and department managers can see cross-department data. This plan closes the loop on IDENT-03 (RBAC enforcement) and IDENT-04 (department scoping).

Output: All API routes protected by auth with appropriate role requirements. Audit queries filtered by the authenticated user's department scope. Health endpoint remains public. Internal gRPC/worker callers unaffected.

## Files Likely Touched

