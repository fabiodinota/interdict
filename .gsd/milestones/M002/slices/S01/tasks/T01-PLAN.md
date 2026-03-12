# T01: Plan 01

**Slice:** S01 — **Milestone:** M002

## Description

Create the database schema, permission model, and seed infrastructure for API key authentication and RBAC.

Purpose: Establish the data layer foundation that auth middleware (Plan 02) and route guards (Plan 03) depend on. Without tables and seed data, no authentication or authorization is possible.

Output: Three new Drizzle schema tables (api_keys, user_departments, role_permissions), is_service flag on users, a permission hierarchy module, and an identity seed script that bootstraps a working control plane on first boot.
