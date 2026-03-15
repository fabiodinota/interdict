# S07: DevOps & Deployment Maturity — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All deliverables are structural (Dockerfiles, Helm templates, YAML configs, shell scripts) that can be validated via static analysis, linting, and grep checks — no running containers or services needed.

## Preconditions

- Repository cloned with all S07 changes present
- `helm`, `shellcheck`, and `bash` available on PATH
- Helm chart dependencies built (`helm dependency build helm/interdict`)
- kube-score binary available (CI installs it; local is optional with graceful skip)

## Smoke Test

Run `bash scripts/quality/infra-check.sh` — this single command validates all Dockerfiles (hadolint), Helm chart (helm lint + kube-score), shell scripts (shellcheck), and YAML files. If it exits 0, the slice is fundamentally healthy.

## Test Cases

### 1. .dockerignore excludes non-build files

1. Open `.dockerignore` and verify it contains exclusions for: `docs/`, `helm/`, `scripts/`, `.github/`, `.husky/`, `.gsd/`, `*.md`
2. Verify allowlist entries exist: `!proto/`, `!crates/`, `!Cargo.toml`, `!Cargo.lock`, `!control-plane/`, `!dashboard/`, `!docker/`
3. **Expected:** Non-build files excluded, build-essential files preserved via allowlist

### 2. Multi-platform Docker builds configured

1. Run `grep -c "platforms:" .github/workflows/release.yml`
2. Run `grep "linux/amd64,linux/arm64" .github/workflows/release.yml`
3. Run `grep "setup-qemu-action" .github/workflows/release.yml`
4. **Expected:** Count returns 4 (all services). Both amd64 and arm64 listed. QEMU action present.

### 3. TARGETARCH OPA download

1. Run `grep "TARGETARCH" docker/control-plane/Dockerfile`
2. Verify the OPA download URL interpolates `${TARGETARCH}` instead of hardcoding `amd64`
3. **Expected:** `ARG TARGETARCH` declared and used in `opa_linux_${TARGETARCH}_static` URL

### 4. Helm startupProbe on all deployments

1. Run `grep -c "startupProbe" helm/interdict/templates/*/deployment.yaml`
2. Inspect each deployment template for correct probe type:
   - kernel: `tcpSocket` on port `https`
   - control-plane: `httpGet` on `/health`, port `http`
   - evidence-collector: `tcpSocket` on port `grpc`
   - dashboard: `httpGet` on `/`, port `http`
3. **Expected:** Count returns 4. Each probe uses the correct mechanism with `failureThreshold: 30` and `periodSeconds: 5`.

### 5. kube-score passes for Helm chart

1. Build Helm dependencies: `helm dependency build helm/interdict`
2. Run: `helm template interdict helm/interdict | kube-score score --ignore-test container-image-pull-policy --ignore-test pod-topology-spread-constraints --ignore-test container-security-context-user-group-id --ignore-test container-security-context-readonlyrootfilesystem --ignore-test container-ephemeral-storage-request-and-limit --ignore-test pod-networkpolicy --ignore-test deployment-has-poddisruptionbudget --ignore-test statefulset-has-poddisruptionbudget --ignore-test pod-probes --ignore-test deployment-replicas --ignore-test deployment-has-host-podantiaffinity --ignore-test statefulset-has-host-podantiaffinity --ignore-test deployment-strategy -`
3. **Expected:** All objects pass. Exit code 0.

### 6. kube-score in CI workflow

1. Open `.github/workflows/ci-quality-security.yml`
2. Find kube-score install step (curl download, pinned version)
3. Find kube-score run step (helm template piped to kube-score score)
4. **Expected:** Both steps present in infra-quality job

### 7. kube-score in local infra-check.sh

1. Run `grep "kube-score" scripts/quality/infra-check.sh`
2. Verify there's a `command -v kube-score` guard for graceful skip
3. **Expected:** kube-score integrated with fallback WARNING when not installed

### 8. Docker Compose log rotation

1. Run `grep -c "max-size" docker-compose.yml`
2. Spot-check 3 services (postgres, kernel, dashboard) for the logging block: `driver: json-file`, `max-size: "10m"`, `max-file: "3"`
3. **Expected:** Count ≥ 9 (all services). Each has json-file driver with rotation limits.

### 9. Monitoring profile overlay

1. Verify `docker-compose.monitoring.yml` exists
2. Check it defines `prometheus` and `grafana` services with `profiles: [monitoring]`
3. Run `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config` (if Docker available)
4. Verify Grafana is mapped to port 3002 (avoids conflict with control-plane port 3000)
5. **Expected:** Config validates successfully. Both services only start with `--profile monitoring`.

### 10. Prometheus configuration

1. Open `monitoring/prometheus/prometheus.yml`
2. Verify scrape targets include control-plane, kernel, evidence-collector, and prometheus self
3. Check scrape interval is 15s
4. **Expected:** All 4 targets defined with correct ports

### 11. Grafana provisioning

1. Verify `monitoring/grafana/provisioning/datasources/prometheus.yml` exists and points to `http://prometheus:9090`
2. Verify `monitoring/grafana/provisioning/dashboards/dashboard.yml` exists with file provider config
3. Verify `monitoring/grafana/dashboards/interdict.json` exists with stat panels for each service
4. **Expected:** Full Grafana auto-provisioning chain is in place

### 12. Backup script

1. Run `bash -n scripts/backup.sh` (syntax check)
2. Run `shellcheck scripts/backup.sh` (lint check)
3. Verify script supports `--dry-run` and `--output-dir` flags
4. Verify script dumps Postgres via `pg_dump` and ClickHouse via `clickhouse-client`
5. Verify `backups/` is in `.gitignore`
6. **Expected:** Both checks pass. Script handles both databases with configurable output.

### 13. Environment validation script

1. Run `bash -n scripts/validate-env.sh` (syntax check)
2. Run `shellcheck scripts/validate-env.sh` (lint check)
3. Run `bash scripts/validate-env.sh` with no .env file present
4. Verify it checks: DATABASE_URL, POSTGRES_PASSWORD, CLICKHOUSE_PASSWORD, MINIO_ROOT_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
5. Verify it detects CHANGE_ME placeholders (case-insensitive)
6. Verify it validates URL format for DATABASE_URL, CLICKHOUSE_URL, AWS_ENDPOINT_URL
7. Verify it never prints credential values — only variable names and pass/fail
8. **Expected:** Lint passes. Running without .env exits non-zero with clear per-variable errors.

### 14. smoke-test.sh integration

1. Run `grep "validate-env" scripts/smoke-test.sh`
2. Verify `--skip-env-check` flag is supported
3. **Expected:** validate-env.sh called before docker compose up, skippable for CI

## Edge Cases

### .dockerignore allowlist protects build-essential files

1. Verify `!proto/` is in `.dockerignore` (needed for gRPC builds)
2. Verify `!dashboard/` is in `.dockerignore` (needed for dashboard Dockerfile)
3. **Expected:** Build-essential directories are not excluded despite broad exclusion rules

### validate-env.sh with CHANGE_ME credentials

1. Copy `env.example` to `.env.test`
2. Run `bash scripts/validate-env.sh --env-file .env.test`
3. **Expected:** Detects CHANGE_ME placeholders in all credential variables. Exits non-zero.

### validate-env.sh credential masking

1. Set `POSTGRES_PASSWORD=supersecret` in environment
2. Run `bash scripts/validate-env.sh`
3. **Expected:** Output shows "POSTGRES_PASSWORD ... PASS" but never reveals "supersecret"

### Monitoring profile isolation

1. Run `docker compose config` (without --profile monitoring)
2. **Expected:** Prometheus and Grafana services are NOT present in the default config

## Failure Signals

- `bash scripts/quality/infra-check.sh` exits non-zero → infrastructure validation broken
- `shellcheck scripts/backup.sh scripts/validate-env.sh` reports errors → operational scripts have issues
- `grep -c "platforms:" .github/workflows/release.yml` ≠ 4 → multi-platform builds misconfigured
- `grep -c "startupProbe" helm/interdict/templates/*/deployment.yaml` ≠ 4 → Helm probes missing
- `grep -c "max-size" docker-compose.yml` < 4 → log rotation incomplete
- kube-score exits non-zero → Helm chart has new failing checks beyond known ignore list

## Requirements Proved By This UAT

- HR-OPS-01 — Docker, Helm, shell, and YAML artifacts have lint/validation coverage via infra-check.sh, kube-score, shellcheck, and yamllint

## Not Proven By This UAT

- Actual multi-platform image build (requires tag push to trigger release pipeline)
- Actual Prometheus/Grafana functionality (requires docker compose up with --profile monitoring)
- Actual backup/restore cycle (requires running Postgres and ClickHouse containers)
- Production deployment stability under load

## Notes for Tester

- kube-score is optional locally — `infra-check.sh` prints a WARNING and continues if not installed. CI always installs it.
- shellcheck SC2329 info note on `smoke-test.sh` (trap-invoked function) is pre-existing and not a real issue.
- The monitoring stack Grafana is on port 3002 (not 3000) to avoid conflict with control-plane. Default login is admin/admin.
- Backup script creates a timestamped directory under `./backups/` — this path is gitignored.
