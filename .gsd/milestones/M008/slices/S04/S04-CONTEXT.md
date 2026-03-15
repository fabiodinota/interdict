---
id: S04
milestone: M008
status: ready
---

# S04: Docker Compose & Monitoring Hardening — Context

## Goal

Add network segmentation to Docker Compose, parameterize Grafana credentials, add resource limits to infrastructure services, and update operator documentation — closing M-04, M-06, and M-07.

## Why this Slice

A compromised dashboard container can currently reach PostgreSQL, ClickHouse, and MinIO directly (M-06). Grafana's hardcoded `admin/admin` credentials are a known entry point (M-04). Infrastructure services without resource limits can OOM the host (M-07). These are defense-in-depth improvements for production deployments.

## Scope

### In Scope

- 3-network topology: `frontend` (dashboard), `backend` (application services), `data` (databases)
- Grafana credentials parameterized via `${GRAFANA_ADMIN_PASSWORD:?...}`
- Resource limits on postgres, clickhouse, minio services
- Operator guide migration notes for network change
- Update env.example with Grafana credential variables

### Out of Scope

- Changing service port mappings
- Adding new Docker Compose services
- Kubernetes network policy changes (already handled in M007)

## Constraints

- Existing `docker compose up` deployments must have a clear upgrade path
- Network names must be stable and documented
- Infrastructure resource limits must be generous enough for pilot workloads

## Integration Points

### Consumes

- `docker-compose.yml` — Current single-network topology
- `docker-compose.monitoring.yml` — Grafana with hardcoded credentials
- `env.example` — Environment template
- `docs/operator/guide.md` — Operator documentation

### Produces

- 3-network Docker Compose topology
- Parameterized Grafana credentials
- Infrastructure resource limits
- Updated operator guide with migration notes
