# T03: Plan 03

**Slice:** S01 — **Milestone:** M002

## Description

Wire authentication into all existing API modules, enforce role-based route guards, and implement department-scoped data filtering.

Purpose: This is the integration plan that makes the Phase 7 identity system operational. Without this wiring, the auth middleware exists but no routes use it, and department managers can see cross-department data. This plan closes the loop on IDENT-03 (RBAC enforcement) and IDENT-04 (department scoping).

Output: All API routes protected by auth with appropriate role requirements. Audit queries filtered by the authenticated user's department scope. Health endpoint remains public. Internal gRPC/worker callers unaffected.
