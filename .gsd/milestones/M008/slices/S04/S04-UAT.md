# S04: Docker Compose & Monitoring Hardening — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are to Docker Compose configuration files, env templates, and documentation. Validation is structural — `docker compose config` parses and validates the topology. No runtime behavior changes to application code.

## Preconditions

- Docker Compose v2+ installed (for `docker compose config`)
- Repository checked out with all S04 changes applied
- No `.env` file required for base config validation (only for monitoring profile)

## Smoke Test

Run `docker compose config > /dev/null && echo "PASS"` — exits 0 confirming the base Docker Compose configuration is valid with 3-network segmentation and resource limits.

## Test Cases

### 1. Three networks defined at top level

1. Run `docker compose config`
2. Inspect the `networks:` section at the top level of the output
3. **Expected:** Three networks are defined: `frontend`, `backend`, `data` — all with `driver: bridge`

### 2. Dashboard isolated from data tier

1. Run `docker compose config` and inspect the `dashboard` service
2. Check its `networks:` list
3. **Expected:** Dashboard is assigned to `frontend` and `backend` only. It must NOT have `data` in its networks list.

### 3. Application services bridge backend and data

1. Run `docker compose config` and inspect `control-plane`, `kernel`, and `evidence-collector` services
2. Check each service's `networks:` list
3. **Expected:** Each is assigned to both `backend` and `data`

### 4. Infrastructure services on data network only

1. Run `docker compose config` and inspect `postgres`, `clickhouse`, and `minio` services
2. Check each service's `networks:` list
3. **Expected:** Each is assigned to `data` only — no `frontend` or `backend` access

### 5. Init containers on data network

1. Run `docker compose config` and inspect `minio-init` and `cert-init` services
2. Check each service's `networks:` list
3. **Expected:** Each is assigned to `data` only

### 6. Grafana credentials are parameterized (fail-closed)

1. Run `grep "GF_SECURITY_ADMIN_PASSWORD" docker-compose.monitoring.yml`
2. **Expected:** Shows `${GRAFANA_ADMIN_PASSWORD:?Set GRAFANA_ADMIN_PASSWORD in .env ...}` — the `:?` syntax means compose refuses to start without the variable set

### 7. Grafana username has safe default

1. Run `grep "GF_SECURITY_ADMIN_USER" docker-compose.monitoring.yml`
2. **Expected:** Shows `${GRAFANA_ADMIN_USER:-admin}` — defaults to `admin` if not set

### 8. Monitoring compose fails without GRAFANA_ADMIN_PASSWORD

1. Unset GRAFANA_ADMIN_PASSWORD (ensure it is not in environment or `.env`)
2. Run `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config 2>&1`
3. **Expected:** Command fails with error message containing "GRAFANA_ADMIN_PASSWORD"

### 9. Monitoring compose succeeds with GRAFANA_ADMIN_PASSWORD set

1. Run `GRAFANA_ADMIN_PASSWORD=test123 docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config > /dev/null`
2. **Expected:** Exits 0

### 10. Infrastructure services have resource limits

1. Run `grep -c "limits:" docker-compose.yml`
2. **Expected:** Returns 7 (4 application + 3 infrastructure services)

### 11. Monitoring services have resource limits

1. Run `grep -c "limits:" docker-compose.monitoring.yml`
2. **Expected:** Returns 2 (prometheus + grafana)

### 12. Specific resource limit values

1. Run `docker compose config` and inspect resource limits for each infrastructure service
2. **Expected:**
   - postgres: memory 1GB, cpus 1
   - clickhouse: memory 2GB, cpus 2
   - minio: memory 512MB, cpus 0.5
   - prometheus: memory 512MB, cpus 0.5
   - grafana: memory 256MB, cpus 0.25

### 13. env.example contains Grafana credentials

1. Run `grep "GRAFANA" env.example`
2. **Expected:** Shows `GRAFANA_ADMIN_USER=admin` and `GRAFANA_ADMIN_PASSWORD=CHANGE_ME_GRAFANA_PASSWORD`

### 14. Monitoring services on correct networks

1. Run `GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config` and inspect prometheus and grafana services
2. **Expected:** prometheus → `backend` only; grafana → `frontend` + `backend`

### 15. Operator guide documents network migration

1. Run `grep -c "network" docs/operator/guide.md`
2. **Expected:** Returns ≥10 (v1.6 upgrade section with topology diagram and migration notes)

### 16. Operator guide has Grafana credential documentation

1. Run `grep "GRAFANA_ADMIN_PASSWORD" docs/operator/guide.md`
2. **Expected:** Shows at least one reference documenting the new required environment variable

## Edge Cases

### No .env file exists

1. Remove or rename `.env` if it exists
2. Run `docker compose config`
3. **Expected:** Base config (without monitoring profile) validates successfully — GRAFANA_ADMIN_PASSWORD is only referenced in the monitoring compose file

### GRAFANA_ADMIN_PASSWORD set to empty string

1. Run `GRAFANA_ADMIN_PASSWORD="" docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config 2>&1`
2. **Expected:** Should fail with the `:?` error message — empty string triggers the required-variable check

### All 9 services have limits in merged config

1. Run `GRAFANA_ADMIN_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config | grep -c "limits:"`
2. **Expected:** Returns 9 (4 app + 3 infra + 2 monitoring)

## Failure Signals

- `docker compose config` exits non-zero — YAML syntax error or invalid network reference
- Any service has `data` network that shouldn't (dashboard) — network isolation broken
- `grep "admin"` in Grafana password field shows literal value — credential not parameterized
- `grep -c "limits:"` returns less than 7 for base compose — missing resource limits
- Operator guide has no mention of "network" — migration documentation missing

## Requirements Proved By This UAT

- AR-INFRA-01 — Docker Compose uses 3 isolated networks (tests 1-5, 14), Grafana credentials parameterized (tests 6-9), resource limits on all services (tests 10-12), operator guide updated (tests 15-16)

## Not Proven By This UAT

- Runtime network isolation — would require spinning up actual containers and testing cross-network connectivity
- Resource limit enforcement at runtime — Docker/containerd enforces limits, not testable with `config` alone
- Grafana actually uses the parameterized credentials at startup — requires running the monitoring stack

## Notes for Tester

- The `zookeeper` service referenced in the original slice plan does not exist in the codebase. This is expected — the plan inherited it from an earlier design. All existing services have been correctly handled.
- Tests 8-9 and 14 require the monitoring compose file and the `--profile monitoring` flag. Base compose operations (tests 1-5, 10) work without any extra env vars.
- The `:?` syntax for GRAFANA_ADMIN_PASSWORD is intentionally strict — this is a security measure to prevent accidental deployment with default credentials.
