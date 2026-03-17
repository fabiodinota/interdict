# Phase 20: Review Workflow Consolidation — Research

**Date:** 2026-03-10

## Summary

The review workflow had no single authoritative store. Kernel SQLite, Postgres, and ClickHouse all held review state, leading to potential inconsistencies in multi-node deployments.

## Decisions

- Postgres review_items is the single authoritative workflow store
- ClickHouse demoted to read-model only for review data
- Kernel SQLite is local-only (not cross-node authoritative)
- UNIQUE constraint on bundle_id ensures idempotent review creation
- createReviewItem() uses ON CONFLICT DO NOTHING for deterministic behavior
- POST /api/v1/reviews/ingest added for service-to-service webhook delivery
- syncEscalations renamed to reconcileEscalations (catch-up only, 5min interval instead of 60s)
- escalation_source column added to track origin
- getQueueStats() replaced full-table scan with COUNT FILTER
