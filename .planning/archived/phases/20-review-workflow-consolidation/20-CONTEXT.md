# Phase 20: Review Workflow Consolidation — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

Review workflow state was split between kernel SQLite, Postgres, and ClickHouse with no clear authority. Review creation was non-deterministic — duplicate escalations could produce duplicate review items. The escalation sync loop ran every 60 seconds with a full-table scan for queue stats.

## Scope

- Make Postgres the single authoritative store for review items
- Ensure deterministic, idempotent review creation
- Add service-to-service review ingest endpoint
- Demote ClickHouse to read-model only for review data
- Optimize escalation reconciliation and queue stats queries

## Key Files

- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reviews/index.ts`
- `crates/kernel/src/policy/layer3/queue.rs`
