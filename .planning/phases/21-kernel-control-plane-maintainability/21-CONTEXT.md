# Phase 21: Kernel and Control Plane Maintainability — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

The control plane had pervasive `db: any` and `store as { db: any; clickhouse: any }` casts across route handlers and services. This loose typing masked real type errors, made refactoring unsafe, and prevented IDE-assisted navigation. Date serialization bugs in reviews (resolvedAt, claimedAt) were a direct symptom.

## Scope

- Create shared type definitions for AppDb, AppClickHouse, AppStore, AuthenticatedUser, RouteContext
- Replace `db: any` with AppDb across high-risk services
- Replace untyped store casts with typed casts
- Add resolveDb() helper to eliminate inline store-access patterns
- Fix Date serialization in review fields

## Key Files

- `control-plane/src/shared/types.ts`
- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reports/service.ts`
