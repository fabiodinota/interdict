---
id: "20-01"
parent: "20"
milestone: v1.2
provides:
  - Postgres as single authoritative review workflow store
  - Deterministic idempotent review creation via ON CONFLICT DO NOTHING
  - Service-to-service review ingest endpoint
  - Optimized escalation reconciliation (5min, no full-table scan)
key_files:
  - control-plane/src/modules/reviews/service.ts
  - control-plane/src/modules/reviews/index.ts
  - crates/kernel/src/policy/layer3/queue.rs
key_decisions:
  - "Postgres = authoritative store; ClickHouse = read-model only"
  - "Kernel SQLite is local-only, not cross-node authoritative"
  - "UNIQUE constraint on bundle_id for idempotent review creation"
duration: "1 session"
commit: bdd762c
---

# Phase 20, Task 1 — Summary

Made Postgres review_items the single authoritative workflow store. ClickHouse demoted to read-model only. Added UNIQUE constraint on bundle_id and deterministic createReviewItem() with ON CONFLICT DO NOTHING.

Added POST /api/v1/reviews/ingest endpoint for service-to-service webhook delivery. Renamed syncEscalations to reconcileEscalations (catch-up reconciler, 5min instead of 60s). Added escalation_source column. Replaced getQueueStats() full-table scan with COUNT FILTER. 11 new tests added.
