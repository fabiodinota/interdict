---
id: "18-01"
parent: "18"
milestone: v1.2
provides:
  - Honest report failure surfacing (no silent fake data)
  - Real policy scope filtering in distribution
  - 18 new tests
key_files:
  - control-plane/src/modules/reports/service.ts
  - control-plane/src/modules/distribution/server.ts
  - control-plane/src/modules/compiler/worker.ts
  - control-plane/src/db/schema/policies.ts
key_decisions:
  - "Failed report sections return null with warnings, not fake zeros"
  - "Scope assignments in dedicated Postgres table"
commit: c9e2ba5
---

# Phase 18, Task 1 — Summary

Eliminated 7 silent catch-block zeros in the report service. Fixed N+1 queries. Added `policy_scope_assignments` table and wired scope filtering into distribution and compilation. 128 tests pass, tsc clean.
