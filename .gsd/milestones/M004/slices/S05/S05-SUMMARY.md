---
id: S05
parent: M004
milestone: M004
provides:
  - Healthchecks for all services in docker-compose and Dockerfiles
  - Resource limits for all core services
  - Zero config drift between deployment artifacts
  - All env vars documented in env.example
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
# S05: Deployment Completeness Config Parity

**# Phase 29, Task 1 — Summary**

## What Happened

# Phase 29, Task 1 — Summary

Completed deployment configuration by adding healthchecks, resource limits, and fixing config drift across all deployment artifacts. The goal was zero runtime surprises from configuration mismatches.

## What Changed

- Added healthcheck blocks to all services in `docker-compose.yml`
- Added `HEALTHCHECK` instructions to all Dockerfiles (kernel, control-plane, evidence-collector)
- Added `deploy.resources.limits` to all core services in docker-compose
- Fixed `INTERDICT_EVIDENCE_COLLECTOR_ADDR` naming drift to match code expectations
- Fixed `NEXT_PUBLIC_API_URL` port mismatch (env.example now correctly says 3001)
- Added `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` to env.example
- Made `CONTROL_PLANE_URL` configurable via env override instead of hardcoded
- Hardened ClickHouse default user security
- Aligned evidence-collector Helm deployment with new config flags
