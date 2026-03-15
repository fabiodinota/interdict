---
id: S04
parent: M008
milestone: M008
provides:
  - 3-tier Docker Compose network segmentation (frontend/backend/data) isolating dashboard from databases
  - Parameterized Grafana credentials with fail-closed :? syntax
  - Resource limits (memory + CPU) on all 9 services (4 app + 3 infra + 2 monitoring)
  - Operator guide v1.6 upgrade section with ASCII topology diagram and migration instructions
requires: []
affects:
  - S08
key_files:
  - docker-compose.yml
  - docker-compose.monitoring.yml
  - env.example
  - docs/operator/guide.md
key_decisions:
  - "D052: Grafana ADMIN_PASSWORD uses :? (required) syntax, ADMIN_USER uses :- (optional default)"
patterns_established:
  - All services explicitly declare network membership; no service uses the default network
  - Init containers (minio-init, cert-init) assigned to the data tier
  - All services have deploy.resources.limits (memory + CPU) — pattern consistent across both compose files
  - Monitoring credentials follow same CHANGE_ME_ placeholder pattern as other secrets in env.example
  - Upgrade sections follow versioned naming with numbered subsections
observability_surfaces:
  - "docker compose config | grep -A3 networks: — per-service network assignments"
  - "docker network inspect interdict_frontend / interdict_backend / interdict_data — runtime container membership"
  - "docker compose config | grep -B1 limits: — per-service resource caps"
  - "GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config | grep GF_SECURITY_ADMIN_PASSWORD — verify no literal password"
drill_down_paths:
  - .gsd/milestones/M008/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M008/slices/S04/tasks/T03-SUMMARY.md
duration: 40m
verification_result: passed
completed_at: 2026-03-15
---

# S04: Docker Compose & Monitoring Hardening

**3-network segmentation isolates dashboard from databases, Grafana credentials are fail-closed parameterized, all 9 services have resource limits, and operator guide documents the v1.6 migration.**

## What Happened

Added three named Docker Compose networks — `frontend` (browser-facing), `backend` (inter-service), `data` (database access) — and assigned every service to the correct tier. Dashboard connects only to frontend+backend, preventing direct database access from a compromised dashboard. Application services (control-plane, kernel, evidence-collector) bridge backend+data. Infrastructure services (postgres, clickhouse, minio) connect to data only. Monitoring services follow the same pattern: prometheus on backend (scrapes app metrics), grafana on frontend+backend (browser-accessible, queries prometheus).

Replaced hardcoded Grafana admin/admin credentials with environment variable substitution: `GRAFANA_ADMIN_PASSWORD` uses `:?` syntax (compose refuses to start without it set), `GRAFANA_ADMIN_USER` defaults to admin via `:-`. Added both variables to `env.example` with `CHANGE_ME_GRAFANA_PASSWORD` placeholder.

Added `deploy.resources.limits` to all 9 services: 4 application services (already had limits from M004), 3 infrastructure services (postgres 1GB/1CPU, clickhouse 2GB/2CPU, minio 512MB/0.5CPU), and 2 monitoring services (prometheus 512MB/0.5CPU, grafana 256MB/0.25CPU).

Updated operator guide with a "v1.5 → v1.6" upgrade section covering network segmentation (ASCII topology diagram, service-network assignment table), Grafana credential requirement, and resource limits table. Updated Quick Start sed commands, monitoring credentials table, and configuration reference with new Grafana variables.

## Verification

All 6 slice verification checks pass:

- ✅ `docker compose config | grep -c "networks:"` → 10 (network definitions present)
- ✅ `docker compose config | grep -c "frontend\|backend\|data"` → 50 (≥3)
- ✅ `grep "GRAFANA_ADMIN_PASSWORD" docker-compose.monitoring.yml` → `${GRAFANA_ADMIN_PASSWORD:?...}` (parameterized)
- ✅ `grep -c "limits:" docker-compose.yml` → 7 (≥7: 4 app + 3 infra)
- ✅ `grep -c "network" docs/operator/guide.md` → 15 (network migration documented)
- ✅ `docker compose config` exits 0 (valid configuration)

Additional checks:
- ✅ `grep -c "limits:" docker-compose.monitoring.yml` → 2 (prometheus + grafana)
- ✅ `GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config` exits 0
- ✅ Merged config shows 9 total `limits:` blocks
- ✅ `grep "GRAFANA" env.example` shows both vars with CHANGE_ME placeholder

## Requirements Advanced

- AR-INFRA-01 — Docker Compose uses 3 isolated networks (frontend, backend, data). Grafana monitoring credentials are parameterized via environment variables. All services have resource limits.

## Requirements Validated

- AR-INFRA-01 — `docker compose config` validates 3-network topology. Grafana credentials use fail-closed `:?` syntax. 9 services have memory+CPU limits. Operator guide documents migration.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Slice plan referenced `zookeeper` service for network assignment and resource limits — no zookeeper service exists in docker-compose.yml. Skipped without impact; the plan likely inherited it from an earlier design.

## Known Limitations

- Network isolation is validated structurally (`docker compose config`) but not tested at runtime with actual container connectivity checks — would require running Docker containers.
- Resource limits use `deploy.resources.limits` which requires Docker Compose deploy support (default in Compose v2+).

## Follow-ups

- S08 will document the final state of all M008 changes in the operator guide and regenerate final_assessment.md.

## Files Created/Modified

- `docker-compose.yml` — Added 3 top-level networks (frontend/backend/data), per-service network assignments for all 9 services, resource limits on 3 infrastructure services
- `docker-compose.monitoring.yml` — Added network assignments for prometheus and grafana, parameterized Grafana credentials with fail-closed syntax, resource limits on 2 monitoring services, updated header comment
- `env.example` — Added GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD with CHANGE_ME placeholder, updated header sed instructions
- `docs/operator/guide.md` — Added v1.6 upgrade section with ASCII topology diagram, Grafana credential migration, resource limits table; added Monitoring config reference section; updated Quick Start and monitoring credentials table

## Forward Intelligence

### What the next slice should know
- Docker Compose now has 3 networks — any new service added must be assigned to the correct tier(s). The pattern is: browser-facing → frontend+backend, app-to-app → backend+data, database → data only.
- `GRAFANA_ADMIN_PASSWORD` is required for monitoring profile — tests/CI that use `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config` must set this env var.

### What's fragile
- The `:?` syntax for GRAFANA_ADMIN_PASSWORD means any compose command that includes the monitoring file will fail without the env var set — this is intentional (fail-closed) but could surprise CI scripts that don't set it.

### Authoritative diagnostics
- `docker compose config` is the canonical validation — it exits 0 only when all networks, variables, and resource limits parse correctly.
- `docker compose config | grep -B1 "limits:"` shows the full resource limit structure.

### What assumptions changed
- Plan assumed zookeeper service exists — it doesn't. All infra services that do exist (postgres, clickhouse, minio) received the intended treatment.
