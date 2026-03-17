---
id: "21-01"
parent: "21"
milestone: v1.2
provides:
  - Shared type definitions for control plane database and auth access
  - Typed database access in high-risk services (5 sites) and store casts (14 sites)
  - resolveDb() helper eliminating 7 inline patterns
  - Fixed Date serialization in review fields
key_files:
  - control-plane/src/shared/types.ts
  - control-plane/src/modules/reviews/service.ts
  - control-plane/src/modules/reports/service.ts
key_decisions:
  - "27 route-handler untyped annotations preserved (Elysia type inference limitation)"
  - "Shared types introduced incrementally — no full route handler rewrite"
duration: "1 session"
commit: 770a0d3
---

# Phase 21, Task 1 — Summary

Created shared/types.ts with AppDb, AppClickHouse, AppStore, AuthenticatedUser, and RouteContext. Replaced `db: any` with AppDb in 5 high-risk sites and replaced untyped store casts in 14 sites. Added resolveDb() helper in the regulatory module, eliminating 7 inline store-access patterns.

Fixed Date serialization in review fields (resolvedAt, claimedAt). Intentionally preserved 27 route-handler untyped annotations where Elysia's type inference makes explicit typing counterproductive.
