---
id: S07
milestone: M007
status: ready
---

# S07: DevOps & Deployment Maturity — Context

## Goal

Harden Docker, Helm, and Docker Compose configurations for production-grade operation with monitoring, backups, multi-platform builds, and environment validation.

## Why this Slice

The assessment graded DevOps at B with specific gaps: missing .dockerignore files, no monitoring stack, no backup automation, no multi-platform builds, no environment validation. Depends on S05 for the release pipeline that image registry work integrates with.

## Scope

### In Scope

- **T01: Docker improvements** — create `.dockerignore` files for all 4 service contexts (exclude .git, target/, node_modules/, .env, *.pem, *.key), add multi-platform build support (linux/amd64, linux/arm64) via buildx in release workflow, validate image sizes (<200MB Rust, <300MB TS)
- **T02: Helm/Kubernetes improvements** — cert-manager integration (optional, alongside cert-init job), backup CronJob templates for PostgreSQL and ClickHouse, PVC retention policies, kube-score validation in CI
- **T03: Docker Compose improvements** — logging drivers (json-file with max-size/max-file rotation), optional monitoring stack profile (Prometheus+Grafana as docker-compose override), document secret rotation procedures, backup script for PostgreSQL and ClickHouse volumes
- **T04: Environment validation** — startup validation script checking all required environment variables before `docker compose up`, validate .env against .env.example schema, fail fast with clear error messages

### Out of Scope

- Kubernetes Operator (out of scope for v1.5)
- Production monitoring dashboards (just the infrastructure, not custom dashboards)
- Automated failover/HA configuration

## Constraints

- Multi-platform builds require buildx and may increase CI build time
- Monitoring stack must be optional (docker-compose profile, not default)
- Backup scripts must work with existing volume mount patterns
- Environment validation must not add runtime dependencies

## Integration Points

### Consumes

- `docker/` — existing Dockerfiles for all services
- `helm/interdict/` — existing Helm chart
- `docker-compose.yml` — existing Compose configuration
- `.env.example` — existing environment variable template
- S05 release workflow — for multi-platform build integration

### Produces

- `.dockerignore` files for all services
- Multi-platform Docker images (amd64 + arm64)
- `helm/interdict/templates/backup-cronjob.yaml` — backup CronJob templates
- `docker-compose.monitoring.yml` or monitoring profile in main compose file
- `scripts/validate-env.sh` — environment validation script
- `scripts/backup.sh` — PostgreSQL and ClickHouse backup script
- Updated Helm chart passing kube-score validation

## Open Questions

- cert-manager integration — how to make it optional alongside the existing cert-init job without breaking either path
- Prometheus scrape targets — which services expose metrics endpoints and in what format
- Backup retention — what rotation policy for database backups (keep last N, time-based, etc.)
- kube-score strictness — which kube-score checks to enforce vs warn (some may not apply to all templates)
