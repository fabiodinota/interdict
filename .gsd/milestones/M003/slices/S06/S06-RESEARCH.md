# Phase 21: Kernel and Control Plane Maintainability — Research

**Date:** 2026-03-10

## Summary

Loose typing in the control plane was a compounding risk: each new module copied the `db: any` pattern, making the problem worse over time. The fix needed to be incremental — a shared types module that could be adopted without rewriting route handlers.

## Decisions

- Created shared/types.ts with AppDb, AppClickHouse, AppStore, AuthenticatedUser, RouteContext
- Replaced `db: any` with AppDb in 5 high-risk sites (ReviewService, ReportService, distribution, compiler)
- Replaced `store as { db: any; clickhouse: any }` with typed casts in 14 sites
- Added resolveDb() helper in regulatory module (replaced 7 inline patterns)
- Fixed Date serialization in reviews (resolvedAt, claimedAt)
- 27 route-handler untyped annotations intentionally preserved — Elysia's type inference makes explicit typing counterproductive in route handlers