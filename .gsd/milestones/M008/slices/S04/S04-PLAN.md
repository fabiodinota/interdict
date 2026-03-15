# S04: Docker Compose & Monitoring Hardening

**Goal:** Network segmentation, parameterized Grafana credentials, infrastructure resource limits.
**Demo:** `docker compose config` shows 3 networks. Grafana credentials require env vars. Infrastructure services have memory/CPU limits. Operator guide documents migration.

## Must-Haves

- 3 Docker Compose networks: `frontend`, `backend`, `data`
- Dashboard connects to `frontend` + `backend` only (no direct database access)
- Infrastructure services (postgres, clickhouse, minio) connect to `data` only
- Application services bridge `backend` + `data`
- Grafana credentials parameterized: `${GRAFANA_ADMIN_PASSWORD:?...}`
- Resource limits on postgres, clickhouse, minio (memory + CPU)
- Operator guide migration section for network changes

## Verification

- `docker compose config 2>&1 | grep -c "networks:"` shows network definitions
- `docker compose config 2>&1 | grep -c "frontend\|backend\|data"` shows ≥3
- `grep "GRAFANA_ADMIN_PASSWORD" docker-compose.monitoring.yml` shows parameterized variable
- `grep -c "limits:" docker-compose.yml` ≥ 7 (4 app + 3 infra services)
- `grep "network" docs/operator/guide.md` mentions network migration
- `docker compose config` exits 0 (valid configuration)

## Tasks

- [ ] **T01: Add 3-network segmentation to Docker Compose** `est:45m`
  - Why: M-06 — All 9 services share the default network. A compromised dashboard can query databases directly.
  - Files: `docker-compose.yml`, `docker-compose.monitoring.yml`
  - Do: Define 3 named networks at top level: `frontend` (dashboard-facing), `backend` (inter-service communication), `data` (database access). Assign networks per service: `dashboard` → [frontend, backend]; `control-plane` → [backend, data]; `kernel` → [backend, data]; `evidence-collector` → [backend, data]; `postgres` → [data]; `clickhouse` → [data]; `minio` → [data]; `zookeeper` → [data]; `cert-init` → [data]. In `docker-compose.monitoring.yml`: `prometheus` → [backend] (needs to scrape app services); `grafana` → [frontend, backend] (needs to query Prometheus, accessible from browser). Verify `docker compose config` validates the full merged config.
  - Verify: `docker compose config` exits 0. `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config` exits 0.
  - Done when: Services are isolated by network tier.

- [ ] **T02: Parameterize Grafana credentials and add infrastructure resource limits** `est:30m`
  - Why: M-04 — Hardcoded `admin/admin`. M-07 — No resource limits on infrastructure services.
  - Files: `docker-compose.monitoring.yml`, `docker-compose.yml`, `env.example`
  - Do: Replace hardcoded Grafana credentials with `GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}` and `GF_SECURITY_ADMIN_PASSWORD: "${GRAFANA_ADMIN_PASSWORD:?Set GRAFANA_ADMIN_PASSWORD in .env}"`. Add resource limits to infrastructure services: `postgres` → 1GB memory, 1 CPU; `clickhouse` → 2GB memory, 2 CPUs; `minio` → 512MB memory, 0.5 CPU; `zookeeper` → 256MB memory, 0.25 CPU. Also add limits to monitoring services: `prometheus` → 512MB memory, 0.5 CPU; `grafana` → 256MB memory, 0.25 CPU. Add `GRAFANA_ADMIN_PASSWORD` and `GRAFANA_ADMIN_USER` to `env.example` with `CHANGE_ME_` placeholder pattern.
  - Verify: `grep "GRAFANA_ADMIN_PASSWORD" docker-compose.monitoring.yml` shows parameterized variable. `grep -c "limits:" docker-compose.yml` ≥ 7.
  - Done when: Grafana credentials require explicit configuration and all services have resource limits.

- [ ] **T03: Update operator guide with network migration notes** `est:20m`
  - Why: Existing deployments upgrading from single-network to 3-network need clear guidance.
  - Files: `docs/operator/guide.md`
  - Do: Add a "Upgrading from v1.5 to v1.6" section covering: (1) Network segmentation — explain the 3 networks, what connects to what, and that `docker compose down && docker compose up -d` is sufficient to apply. (2) Grafana credentials — explain that `GRAFANA_ADMIN_PASSWORD` is now required for monitoring profile and must be set in `.env`. (3) Document the network topology diagram in ASCII. Add `GRAFANA_ADMIN_PASSWORD` and `GRAFANA_ADMIN_USER` to the environment variable reference table.
  - Verify: `grep "network" docs/operator/guide.md` shows new content.
  - Done when: Operator guide documents the network migration and new Grafana credential requirement.

## Files Likely Touched

- `docker-compose.yml`
- `docker-compose.monitoring.yml`
- `env.example`
- `docs/operator/guide.md`
