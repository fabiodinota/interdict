---
id: T03
parent: S07
milestone: M007
provides:
  - JSON-file logging with 10m/3-file rotation on all 9 Docker Compose services (30MB cap per container)
  - Optional monitoring profile (Prometheus v3.2.1 + Grafana 11.5.2) activated via --profile monitoring
  - Prometheus scrape config targeting control-plane, kernel, evidence-collector, and self
  - Grafana auto-provisioned Prometheus datasource and Interdict Service Health dashboard
  - Postgres + ClickHouse backup script with --dry-run and --output-dir flags
key_files:
  - docker-compose.yml
  - docker-compose.monitoring.yml
  - monitoring/prometheus/prometheus.yml
  - monitoring/grafana/provisioning/datasources/prometheus.yml
  - monitoring/grafana/provisioning/dashboards/dashboard.yml
  - monitoring/grafana/dashboards/interdict.json
  - scripts/backup.sh
key_decisions:
  - D038 (pre-existing) — monitoring profile is opt-in via --profile monitoring
patterns_established:
  - json-file logging block pattern for all Docker Compose services (driver + max-size + max-file)
  - Docker Compose monitoring profile overlay (separate file, profiles key, shared default network)
  - Grafana file-based provisioning (datasources + dashboard provider + JSON dashboard)
  - Backup script pattern (pg_dump + clickhouse-client table iteration, gzip, summary with sizes)
observability_surfaces:
  - "docker compose --profile monitoring ps — shows Prometheus/Grafana status"
  - "curl localhost:9090/targets — shows scrape target health"
  - "scripts/backup.sh --dry-run — previews backup actions without writing files"
  - "Grafana at localhost:3002 — Interdict Service Health dashboard with up/down panels"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Docker Compose logging rotation, monitoring profile, and backup scripts

**Added json-file log rotation (10m×3) to all 9 Compose services, created Prometheus+Grafana monitoring overlay with auto-provisioned dashboard, and built Postgres/ClickHouse backup script with --dry-run support**

## What Happened

1. Added `logging:` block with `driver: json-file`, `max-size: "10m"`, `max-file: "3"` to all 9 services in `docker-compose.yml` (postgres, clickhouse, minio, minio-init, cert-init, control-plane, evidence-collector, kernel, dashboard). Caps per-container disk usage at 30MB.

2. Created `docker-compose.monitoring.yml` as a Compose override file with Prometheus (`prom/prometheus:v3.2.1`) and Grafana (`grafana/grafana:11.5.2`). Both services use `profiles: [monitoring]` so they only start when explicitly requested. Grafana mapped to port 3002 to avoid conflict with control-plane's port 3000. Both have healthchecks, log rotation, and data volumes.

3. Created `monitoring/prometheus/prometheus.yml` with 15s scrape interval targeting control-plane (HTTP /health), kernel (port 8443), evidence-collector (port 50051), and Prometheus self-monitoring.

4. Created Grafana provisioning: datasource config pointing to `http://prometheus:9090`, dashboard provider config for file-based loading, and `interdict.json` dashboard with stat panels (up/down with green/red mapping) for each service plus a scrape duration timeseries panel.

5. Created `scripts/backup.sh` — full-featured backup script that: dumps Postgres via `pg_dump | gzip`, discovers and dumps ClickHouse tables from `interdict` database via `clickhouse-client`, supports `--output-dir` (default: `./backups/YYYYMMDD_HHMMSS`), supports `--dry-run`, validates containers are running before dump, prints summary with file sizes. Passes both `bash -n` and `shellcheck`. Added `backups/` to `.gitignore`.

## Verification

- `grep -c "max-size" docker-compose.yml` → **9** (≥4 required) ✅
- `yamllint -d relaxed docker-compose.monitoring.yml` → passes (warnings only, no errors) ✅
- `yamllint -d relaxed monitoring/prometheus/prometheus.yml` → passes ✅
- `yamllint -d relaxed monitoring/grafana/provisioning/datasources/prometheus.yml` → passes ✅
- `yamllint -d relaxed monitoring/grafana/provisioning/dashboards/dashboard.yml` → passes ✅
- `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config` → validates ✅
- `bash -n scripts/backup.sh` → passes ✅
- `shellcheck scripts/backup.sh` → passes (zero warnings) ✅
- `test -f docker-compose.monitoring.yml` → exists ✅
- `test -f monitoring/prometheus/prometheus.yml` → exists ✅

### Slice-level checks status (after T03)

| Check | Status |
|-------|--------|
| `yamllint -d relaxed .github/workflows/release.yml` | ✅ (T01) |
| `grep -c "platforms:" .github/workflows/release.yml` returns 4 | ✅ (T01) |
| `grep "TARGETARCH" docker/control-plane/Dockerfile` | ✅ (T01) |
| `helm template \| kube-score score` passes | ✅ (T02) |
| `grep -c "startupProbe"` returns 4 | ✅ (T02) |
| `grep -c "max-size" docker-compose.yml` ≥ 4 | ✅ (T03) |
| `test -f docker-compose.monitoring.yml` | ✅ (T03) |
| `test -f monitoring/prometheus/prometheus.yml` | ✅ (T03) |
| `test -f scripts/backup.sh && bash -n scripts/backup.sh` | ✅ (T03) |
| `test -f scripts/validate-env.sh && bash -n scripts/validate-env.sh` | ⏳ (T04) |
| `shellcheck scripts/backup.sh scripts/validate-env.sh` | ⏳ (T04 for validate-env) |
| `bash scripts/quality/infra-check.sh` passes | ✅ (T02) |

## Diagnostics

- **Monitoring stack status:** `docker compose --profile monitoring ps` shows Prometheus/Grafana
- **Scrape target health:** `curl localhost:9090/targets` after monitoring stack is up
- **Grafana dashboard:** `http://localhost:3002` → admin/admin → Interdict folder → Service Health
- **Backup preview:** `scripts/backup.sh --dry-run` lists planned dumps without executing
- **Log rotation verification:** `docker inspect --format='{{.HostConfig.LogConfig}}' <container>` shows json-file driver and options

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `docker-compose.yml` — added logging block to all 9 services
- `docker-compose.monitoring.yml` — new: Prometheus + Grafana monitoring profile overlay
- `monitoring/prometheus/prometheus.yml` — new: Prometheus scrape configuration
- `monitoring/grafana/provisioning/datasources/prometheus.yml` — new: Grafana Prometheus datasource
- `monitoring/grafana/provisioning/dashboards/dashboard.yml` — new: Grafana dashboard provider config
- `monitoring/grafana/dashboards/interdict.json` — new: Interdict Service Health dashboard
- `scripts/backup.sh` — new: Postgres + ClickHouse backup script
- `.gitignore` — added `backups/` exclusion
- `.gsd/milestones/M007/slices/S07/S07-PLAN.md` — marked T03 as [x]
