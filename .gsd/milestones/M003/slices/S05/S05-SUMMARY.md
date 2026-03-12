---
id: S05
parent: M003
milestone: M003
provides:
  - Postgres as single authoritative review workflow store
  - Deterministic idempotent review creation via ON CONFLICT DO NOTHING
  - Service-to-service review ingest endpoint
  - Optimized escalation reconciliation (5min, no full-table scan)
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 1 session
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S05: Review Workflow Consolidation

**# Phase 20, Task 1 — Summary**

## What Happened

# Phase 20, Task 1 — Summary

Made Postgres review_items the single authoritative workflow store. ClickHouse demoted to read-model only. Added UNIQUE constraint on bundle_id and deterministic createReviewItem() with ON CONFLICT DO NOTHING.

Added POST /api/v1/reviews/ingest endpoint for service-to-service webhook delivery. Renamed syncEscalations to reconcileEscalations (catch-up reconciler, 5min instead of 60s). Added escalation_source column. Replaced getQueueStats() full-table scan with COUNT FILTER. 11 new tests added.
