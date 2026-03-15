---
estimated_steps: 5
estimated_files: 7
---

# T03: Docker Compose logging rotation, monitoring profile, and backup scripts

**Slice:** S07 — DevOps & Deployment Maturity
**Milestone:** M007

## Description

Docker Compose services currently have no log rotation (unbounded disk growth), no built-in monitoring, and no backup tooling. This task adds JSON-file logging with rotation to all services, creates an optional monitoring profile (Prometheus + Grafana) that operators activate with `--profile monitoring`, and creates a backup script for Postgres and ClickHouse data.

## Steps

1. **Add logging configuration to all services in docker-compose.yml** — Add `logging:` block with `driver: json-file` and `options: { max-size: "10m", max-file: "3" }` to every service definition (postgres, clickhouse, minio, minio-init, cert-init, control-plane, evidence-collector, kernel, dashboard). This caps per-container log usage at 30MB.

2. **Create `docker-compose.monitoring.yml`** — Create an override file with Prometheus and Grafana services using `profiles: [monitoring]`. Prometheus uses `prom/prometheus:v3.2.1` with bind-mounted config. Grafana uses `grafana/grafana:11.5.2` with provisioned datasource and dashboard. Both services join the default network to reach Interdict services by name. Add appropriate ports (9090 for Prometheus, 3000→3002 mapped to avoid conflict with control-plane).

3. **Create Prometheus scrape config** — Create `monitoring/prometheus/prometheus.yml` with scrape targets: control-plane (`control-plane:3000/health`), and static targets for kernel and evidence-collector gRPC ports (basic up/down monitoring). Set scrape interval to 15s.

4. **Create Grafana provisioning** — Create `monitoring/grafana/provisioning/datasources/prometheus.yml` pointing to `http://prometheus:9090`. Create `monitoring/grafana/provisioning/dashboards/dashboard.yml` provider config. Create `monitoring/grafana/dashboards/interdict.json` with a basic dashboard showing service health status panels (up/down for each service).

5. **Create `scripts/backup.sh`** — Script that: (1) accepts `--output-dir` flag (default: `./backups/$(date +%Y%m%d_%H%M%S)`), (2) runs `docker compose exec -T postgres pg_dump -U interdict interdict` and writes to `postgres.sql.gz`, (3) runs `docker compose exec -T clickhouse clickhouse-client --query "SELECT * FROM system.tables WHERE database = 'interdict' FORMAT TabSeparated"` to list tables, then backs up each table, (4) supports `--dry-run` flag, (5) prints summary with file sizes. Add `backups/` to `.gitignore`.

## Must-Haves

- [ ] All Docker Compose services have json-file logging with max-size and max-file
- [ ] Monitoring profile overlay file exists and validates
- [ ] Prometheus config scrapes Interdict services
- [ ] Grafana provisioning auto-configures Prometheus datasource
- [ ] Backup script dumps both Postgres and ClickHouse
- [ ] Backup script supports --dry-run and --output-dir flags

## Verification

- `grep -c "max-size" docker-compose.yml` returns ≥ 4 (one per major service)
- `yamllint -d relaxed docker-compose.monitoring.yml` passes
- `yamllint -d relaxed monitoring/prometheus/prometheus.yml` passes
- `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config` validates (requires Docker Compose v2.20+)
- `bash -n scripts/backup.sh && shellcheck scripts/backup.sh` passes

## Observability Impact

- Signals added: log rotation caps disk usage at 30MB per container; Prometheus scrape provides service health metrics
- How a future agent inspects this: `docker compose --profile monitoring ps` shows Prometheus/Grafana status; `curl localhost:9090/targets` shows scrape target health
- Failure state exposed: Prometheus target down alerts; backup script prints error and exits non-zero if container not running

## Inputs

- `docker-compose.yml` — current service definitions without logging config
- S07 Research: JSON-file driver, Prometheus/Grafana images, pg_dump pattern

## Expected Output

- `docker-compose.yml` — logging blocks on all services
- `docker-compose.monitoring.yml` — Prometheus + Grafana with monitoring profile
- `monitoring/prometheus/prometheus.yml` — scrape configuration
- `monitoring/grafana/provisioning/datasources/prometheus.yml` — Prometheus datasource
- `monitoring/grafana/provisioning/dashboards/dashboard.yml` — dashboard provider
- `monitoring/grafana/dashboards/interdict.json` — basic health dashboard
- `scripts/backup.sh` — Postgres + ClickHouse backup script
