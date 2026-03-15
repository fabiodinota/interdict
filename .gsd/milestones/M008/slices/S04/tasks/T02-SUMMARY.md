---
id: T02
parent: S04
milestone: M008
provides:
  - Parameterized Grafana credentials (fail-closed without .env)
  - Resource limits on all 9 services (4 app + 3 infra + 2 monitoring)
  - Grafana credential vars in env.example
key_files:
  - docker-compose.monitoring.yml
  - docker-compose.yml
  - env.example
key_decisions:
  - No zookeeper service exists in compose — skipped (plan referenced it but it's not present)
  - Used :? (required) syntax for GRAFANA_ADMIN_PASSWORD to fail-closed; :-admin default for username
patterns_established:
  - All services now have deploy.resources.limits (memory + CPU) — pattern consistent across both compose files
  - Monitoring credentials follow same CHANGE_ME_ placeholder pattern as other secrets in env.example
observability_surfaces:
  - "docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config | grep GF_SECURITY_ADMIN_PASSWORD — verify no literal password"
  - "docker compose config | grep -B1 limits: — inspect per-service resource caps"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Parameterize Grafana credentials and add infrastructure resource limits

**Replaced hardcoded Grafana admin/admin with fail-closed env var substitution and added memory/CPU limits to all 9 services.**

## What Happened

1. Replaced `GF_SECURITY_ADMIN_USER: admin` with `${GRAFANA_ADMIN_USER:-admin}` (defaults to admin, overridable).
2. Replaced `GF_SECURITY_ADMIN_PASSWORD: admin` with `"${GRAFANA_ADMIN_PASSWORD:?Set GRAFANA_ADMIN_PASSWORD in .env ...}"` — compose refuses to start without this var set.
3. Added `deploy.resources.limits` to 3 infrastructure services in docker-compose.yml: postgres (1GB/1CPU), clickhouse (2GB/2CPU), minio (512MB/0.5CPU).
4. Added `deploy.resources.limits` to 2 monitoring services in docker-compose.monitoring.yml: prometheus (512MB/0.5CPU), grafana (256MB/0.25CPU).
5. Added `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` to `env.example` with `CHANGE_ME_GRAFANA_PASSWORD` placeholder and sed generation instruction in header.
6. Updated the Grafana comment header from `(admin/admin)` to `(credentials from .env)`.

## Verification

- `grep "GRAFANA_ADMIN_PASSWORD" docker-compose.monitoring.yml` → shows `${GRAFANA_ADMIN_PASSWORD:?...}` ✅
- `grep -c "limits:" docker-compose.yml` → 7 (4 app + 3 infra) ✅
- `grep -c "limits:" docker-compose.monitoring.yml` → 2 (prometheus + grafana) ✅
- `docker compose config` → exits 0 ✅
- `GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config` → exits 0 ✅
- Merged config with `--profile monitoring` shows 9 total `limits:` blocks ✅
- `grep GF_SECURITY_ADMIN_PASSWORD` on merged config → shows variable substitution, not literal password ✅
- `grep "GRAFANA" env.example` → shows both vars with CHANGE_ME placeholder ✅

### Slice-level checks (T02 scope):
- ✅ V1: `docker compose config | grep -c "networks:"` → 10 (shows network definitions)
- ✅ V2: `docker compose config | grep -c "frontend\|backend\|data"` → ≥3
- ✅ V3: `grep "GRAFANA_ADMIN_PASSWORD" docker-compose.monitoring.yml` → parameterized
- ✅ V4: `grep -c "limits:" docker-compose.yml` → 7 (≥7)
- ⏳ V5: operator guide — deferred to T03
- ✅ V6: `docker compose config` exits 0

## Diagnostics

- `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config | grep GF_SECURITY_ADMIN_PASSWORD` — must show variable substitution, not a literal password
- `docker compose config | grep -B1 "limits:"` — shows per-service memory/CPU caps
- Without `GRAFANA_ADMIN_PASSWORD` set, `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config` fails with clear error message

## Deviations

- Plan referenced `zookeeper` service for resource limits — no zookeeper service exists in docker-compose.yml, so this was skipped. The 3 infrastructure services that exist (postgres, clickhouse, minio) all received limits.

## Known Issues

None.

## Files Created/Modified

- `docker-compose.monitoring.yml` — Parameterized Grafana credentials, added resource limits to prometheus and grafana, updated header comment
- `docker-compose.yml` — Added resource limits to postgres, clickhouse, and minio
- `env.example` — Added GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD with CHANGE_ME placeholder, updated header sed instructions
