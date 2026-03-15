---
id: T01
parent: S04
milestone: M008
provides:
  - 3-tier network segmentation (frontend/backend/data) for all Docker Compose services
key_files:
  - docker-compose.yml
  - docker-compose.monitoring.yml
key_decisions:
  - cert-init assigned to data network despite no network dependency (consistency with init container pattern)
  - minio-init assigned to data network (needs to reach minio on port 9000)
patterns_established:
  - All services explicitly declare network membership; no service uses the default network
  - Init containers (minio-init, cert-init) assigned to the data tier
observability_surfaces:
  - docker compose config | grep -A3 "networks:" shows per-service network assignments
  - docker network inspect interdict_frontend / interdict_backend / interdict_data lists connected containers
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Add 3-network segmentation to Docker Compose

**Defined 3 named networks (frontend, backend, data) and assigned all 11 services to correct tiers, isolating dashboard from direct database access.**

## What Happened

Added top-level `networks` section to `docker-compose.yml` with three bridge networks: `frontend` (browser-facing), `backend` (inter-service), `data` (database access). Assigned every service:

- **frontend + backend:** dashboard (no DB access)
- **backend + data:** control-plane, kernel, evidence-collector (bridge app↔DB)
- **data only:** postgres, clickhouse, minio, minio-init, cert-init (DB tier)

In `docker-compose.monitoring.yml`:
- **backend only:** prometheus (scrapes app services)
- **frontend + backend:** grafana (browser-accessible, queries prometheus)

Added comment documenting network topology in the monitoring file.

## Verification

- `docker compose config` exits 0 ✓
- `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config` exits 0 ✓
- `COMPOSE_PROFILES=monitoring docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config` exits 0 ✓
- Rendered config shows 3 top-level networks: `interdict_frontend`, `interdict_backend`, `interdict_data` ✓
- Per-service network assignments verified via `docker compose config` output ✓
- Dashboard has NO `data` network → cannot reach databases directly ✓

### Slice verification (partial — T01 is task 1 of 3):
- ✅ Check 1: network definitions present in config
- ✅ Check 2: frontend/backend/data names appear ≥3 times
- ⏳ Check 3: GRAFANA_ADMIN_PASSWORD (T02)
- ⏳ Check 4: limits count ≥7 (T02)
- ⏳ Check 5: network migration in operator guide (T03)
- ✅ Check 6: docker compose config exits 0

## Diagnostics

- `docker compose config | grep -B1 -A3 "networks:"` — inspect per-service network membership
- `docker network inspect interdict_frontend` — list containers on each network at runtime
- A service on the wrong network will fail its healthcheck (connectivity-dependent)

## Deviations

- Slice plan references `zookeeper` service — this service does not exist in the codebase. Skipped without impact; the plan likely inherited it from an earlier design. No blocker.

## Known Issues

None.

## Files Created/Modified

- `docker-compose.yml` — Added 3 top-level networks (frontend/backend/data) and per-service network assignments for all 9 services
- `docker-compose.monitoring.yml` — Added network assignments for prometheus (backend) and grafana (frontend+backend), plus topology comment
- `.gsd/milestones/M008/slices/S04/S04-PLAN.md` — Added Observability / Diagnostics section
