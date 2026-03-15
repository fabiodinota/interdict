# S07: DevOps & Deployment Maturity

**Goal:** All Docker images build for amd64+arm64 with proper .dockerignore. Helm chart passes kube-score. Docker Compose has logging rotation, optional monitoring profile (Prometheus+Grafana), backup scripts, and environment validation prevents misconfiguration at startup.

**Demo:** `docker buildx build --platform linux/amd64,linux/arm64` succeeds for all 4 services. `helm template | kube-score score -` passes. `docker compose --profile monitoring up` starts Prometheus+Grafana alongside the stack. `scripts/validate-env.sh` catches placeholder passwords and missing vars. `scripts/backup.sh` produces Postgres and ClickHouse backups.

## Must-Haves

- Root `.dockerignore` excludes docs/, helm/, scripts/, .github/, .husky/, *.md, and CI config files without breaking any service build
- `release.yml` uses `docker/setup-qemu-action@v3` and `platforms: linux/amd64,linux/arm64` for all 4 images
- Control-plane Dockerfile uses `TARGETARCH` to download correct OPA binary (amd64 or arm64)
- All 4 Helm deployment templates include `startupProbe`
- kube-score runs in CI (`infra-quality` job) and locally (`infra-check.sh`)
- All Docker Compose services have JSON-file logging with rotation (`max-size`, `max-file`)
- Optional monitoring profile with Prometheus + Grafana starts only with `--profile monitoring`
- `scripts/backup.sh` dumps Postgres and ClickHouse data from running containers
- `scripts/validate-env.sh` checks required vars, detects CHANGE_ME placeholders, validates URL formats

## Proof Level

- This slice proves: integration
- Real runtime required: no (structural validation via helm template, kube-score, yamllint, shellcheck)
- Human/UAT required: no

## Verification

- `yamllint -d relaxed .github/workflows/release.yml` passes
- `grep -c "platforms:" .github/workflows/release.yml` returns 4
- `grep "TARGETARCH" docker/control-plane/Dockerfile` finds OPA architecture selection
- `helm template interdict helm/interdict | kube-score score --ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints -` passes (or only has annotated known-issues)
- `grep -c "startupProbe" helm/interdict/templates/*/deployment.yaml` returns 4
- `grep -c "max-size" docker-compose.yml` returns count ≥4 (one per service with logging)
- `test -f docker-compose.monitoring.yml` — monitoring profile overlay exists
- `test -f monitoring/prometheus/prometheus.yml` — Prometheus config exists
- `test -f scripts/backup.sh && bash -n scripts/backup.sh` — backup script exists and parses
- `test -f scripts/validate-env.sh && bash -n scripts/validate-env.sh` — validation script exists and parses
- `shellcheck scripts/backup.sh scripts/validate-env.sh` passes
- `bash scripts/quality/infra-check.sh` passes (includes kube-score)

## Observability / Diagnostics

- Runtime signals: `scripts/validate-env.sh` prints pass/fail per variable with clear error messages for placeholders, missing vars, invalid URLs
- Inspection surfaces: `scripts/backup.sh --dry-run` shows what would be backed up; `docker compose --profile monitoring ps` shows monitoring stack status
- Failure visibility: kube-score CI failure shows specific check name and remediation; validate-env.sh exits non-zero with list of failing variables
- Redaction constraints: validate-env.sh must never print credential values — only variable names and pass/fail status

## Integration Closure

- Upstream surfaces consumed: `.github/workflows/release.yml` (S05), `scripts/quality/infra-check.sh` (M005), `docker-compose.yml`, all 4 Dockerfiles, all 4 Helm deployment templates
- New wiring introduced: kube-score in CI pipeline, monitoring profile in Docker Compose, env validation in smoke-test.sh pre-step
- What remains before milestone is truly usable: S08 (documentation, accessibility, polish)

## Tasks

- [x] **T01: Harden .dockerignore and enable multi-platform Docker builds** `est:45m`
  - Why: Docker context currently sends ~500KB of unnecessary files (docs, helm, scripts, CI config). Release pipeline only builds linux/amd64 but arm64 support is needed for Apple Silicon and ARM cloud. Control-plane Dockerfile hardcodes amd64 OPA binary.
  - Files: `.dockerignore`, `docker/control-plane/Dockerfile`, `.github/workflows/release.yml`
  - Do: Add ~20 exclusions to root `.dockerignore` (docs/, helm/, scripts/, .github/, .husky/, *.md, config files) with allowlist `!proto/` to protect gRPC build. Fix control-plane Dockerfile to use `TARGETARCH` for OPA download. Add `docker/setup-qemu-action@v3` step to release.yml after Buildx setup. Add `platforms: linux/amd64,linux/arm64` to all 4 `docker/build-push-action` steps. Update GHA cache keys to include platform scope.
  - Verify: `grep -c "platforms:" .github/workflows/release.yml` returns 4; `grep "TARGETARCH" docker/control-plane/Dockerfile` finds arch selection; `yamllint -d relaxed .github/workflows/release.yml` passes
  - Done when: release.yml builds all 4 images for both platforms, OPA downloads correct arch binary, .dockerignore excludes non-build files without breaking any service

- [x] **T02: Add Helm startupProbe and kube-score CI integration** `est:30m`
  - Why: All 4 Helm deployments lack startupProbe (kube-score flags this). kube-score is not in CI or local infra checks. Adding both together ensures kube-score passes immediately.
  - Files: `helm/interdict/templates/kernel/deployment.yaml`, `helm/interdict/templates/control-plane/deployment.yaml`, `helm/interdict/templates/evidence-collector/deployment.yaml`, `helm/interdict/templates/dashboard/deployment.yaml`, `helm/interdict/values.yaml`, `scripts/quality/infra-check.sh`, `.github/workflows/ci-quality-security.yml`
  - Do: Add `startupProbe` to each deployment template matching the existing probe pattern (tcpSocket for kernel/evidence-collector, httpGet for control-plane/dashboard). Add kube-score install (pinned version) to CI `infra-quality` job after Helm setup. Add kube-score to `infra-check.sh` `render_helm_chart()` function. Use `--ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints` for known acceptable patterns.
  - Verify: `helm template interdict helm/interdict | kube-score score --ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints -` passes; `grep -c "startupProbe" helm/interdict/templates/*/deployment.yaml` returns 4; `bash scripts/quality/infra-check.sh` passes
  - Done when: kube-score runs in CI and locally, all 4 deployments have startupProbe, helm template passes kube-score

- [x] **T03: Docker Compose logging rotation, monitoring profile, and backup scripts** `est:45m`
  - Why: Docker Compose services have no log rotation (unbounded disk usage), no monitoring stack, and no backup tooling. Operators need all three for production-grade local deployments.
  - Files: `docker-compose.yml`, `docker-compose.monitoring.yml`, `monitoring/prometheus/prometheus.yml`, `monitoring/grafana/provisioning/datasources/prometheus.yml`, `monitoring/grafana/provisioning/dashboards/dashboard.yml`, `monitoring/grafana/dashboards/interdict.json`, `scripts/backup.sh`
  - Do: Add `logging: driver: json-file` with `max-size: 10m` and `max-file: "3"` to all services in docker-compose.yml. Create `docker-compose.monitoring.yml` with Prometheus and Grafana services using `profiles: [monitoring]`. Create Prometheus scrape config targeting control-plane `/health` and kernel/evidence-collector ports. Create Grafana datasource provisioning for Prometheus and a basic dashboard. Create `scripts/backup.sh` that pg_dumps Postgres and uses clickhouse-client for ClickHouse backup, with timestamp-named output files.
  - Verify: `grep -c "max-size" docker-compose.yml` ≥ 4; `yamllint -d relaxed docker-compose.monitoring.yml` passes; `bash -n scripts/backup.sh` passes; `shellcheck scripts/backup.sh` passes
  - Done when: all Compose services have log rotation, `docker compose --profile monitoring config` validates, backup script exists and passes linting

- [x] **T04: Environment validation script** `est:20m`
  - Why: `.env` uses CHANGE_ME placeholders that pass simple `${VAR:?msg}` checks but indicate unconfigured credentials. Operators need pre-flight validation before `docker compose up` to catch misconfigurations early.
  - Files: `scripts/validate-env.sh`, `scripts/smoke-test.sh`
  - Do: Create `scripts/validate-env.sh` that: (1) sources .env if present, (2) checks required vars exist (DATABASE_URL, POSTGRES_PASSWORD, CLICKHOUSE_PASSWORD, MINIO_ROOT_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY), (3) detects CHANGE_ME placeholder patterns, (4) validates URL format for DATABASE_URL, CLICKHOUSE_URL, AWS_ENDPOINT_URL, (5) prints pass/fail per check without revealing values, (6) exits non-zero on any failure. Add `scripts/validate-env.sh` call as pre-step in smoke-test.sh before docker compose up. Make it skippable with `--skip-env-check` flag.
  - Verify: `bash -n scripts/validate-env.sh` passes; `shellcheck scripts/validate-env.sh` passes; running with no .env prints clear errors and exits 1
  - Done when: validate-env.sh catches placeholder passwords, missing vars, malformed URLs; smoke-test.sh calls it before stack startup

## Files Likely Touched

- `.dockerignore`
- `docker/control-plane/Dockerfile`
- `.github/workflows/release.yml`
- `.github/workflows/ci-quality-security.yml`
- `helm/interdict/templates/kernel/deployment.yaml`
- `helm/interdict/templates/control-plane/deployment.yaml`
- `helm/interdict/templates/evidence-collector/deployment.yaml`
- `helm/interdict/templates/dashboard/deployment.yaml`
- `helm/interdict/values.yaml`
- `scripts/quality/infra-check.sh`
- `docker-compose.yml`
- `docker-compose.monitoring.yml`
- `monitoring/prometheus/prometheus.yml`
- `monitoring/grafana/provisioning/datasources/prometheus.yml`
- `monitoring/grafana/provisioning/dashboards/dashboard.yml`
- `monitoring/grafana/dashboards/interdict.json`
- `scripts/backup.sh`
- `scripts/validate-env.sh`
- `scripts/smoke-test.sh`
