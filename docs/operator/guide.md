# Interdict — Operator Guide

> **Audience:** Platform engineers and operators deploying, configuring,
> and maintaining Interdict. Assumes familiarity with Docker, Kubernetes,
> and TLS certificate management.

## Overview

Interdict is an AI governance platform that sits between your applications
and LLM providers (OpenAI, Anthropic, etc.), enforcing policy in real time.
The architecture has four components:

| Component | Role | Technology |
|-----------|------|------------|
| **Kernel** | Data-plane proxy — intercepts, inspects, and enforces policy on every LLM request | Rust |
| **Control Plane** | API server — manages policies, distributes Wasm modules to kernels, stores configuration | Bun + Elysia (TypeScript) |
| **Evidence Collector** | Audit pipeline — receives evidence events via gRPC, persists to ClickHouse, anchors Merkle roots to S3 | Rust |
| **Dashboard** | Operator UI — policy management, audit log viewer, analytics | Next.js + React |

Supporting infrastructure: PostgreSQL (configuration store), ClickHouse
(audit event store), MinIO/S3 (evidence anchor storage).

All internal gRPC channels use mTLS. The kernel generates a dynamic CA
for intercepting outbound HTTPS traffic to AI vendors.

---

## Quick Start (Docker Compose)

### Prerequisites

- Docker Engine ≥ 24.0 with Compose V2
- `openssl` for credential generation

### Steps

```bash
# 1. Clone and enter the repo
git clone https://github.com/interdict/interdict.git
cd interdict

# 2. Create .env from the example
cp env.example .env

# 3. Generate unique credentials (required — compose refuses to start without them)
sed -i "s|CHANGE_ME_POSTGRES_PASSWORD|$(openssl rand -base64 32)|" .env
sed -i "s|CHANGE_ME_CLICKHOUSE_PASSWORD|$(openssl rand -base64 32)|" .env
sed -i "s|CHANGE_ME_MINIO_PASSWORD|$(openssl rand -base64 32)|" .env
sed -i "s|CHANGE_ME_GRAFANA_PASSWORD|$(openssl rand -base64 32)|" .env

# 4. Update DATABASE_URL with the generated Postgres password
#    Find the new POSTGRES_PASSWORD value in .env, then replace the
#    placeholder in DATABASE_URL with the same value.

# 5. Validate environment before starting
bash scripts/validate-env.sh

# 6. Start the stack
docker compose up -d

# 7. Verify all services are healthy
docker compose ps
```

> **Tip:** Look for `# CHANGE_ME` markers in `env.example` — every one
> must be replaced with a real credential before starting.

### Exposed Ports (default)

| Service | URL |
|---------|-----|
| Kernel proxy | `https://localhost:8443` |
| Control Plane API | `http://localhost:3001` |
| Dashboard | `http://localhost:8080` |

---

## Kubernetes Deployment (Helm)

### Prerequisites

- Kubernetes ≥ 1.27
- Helm ≥ 3.12
- A CNI that supports NetworkPolicy (Calico, Cilium) if using default settings

### Install

```bash
# Create namespace
kubectl create namespace interdict

# Create secrets (never store credentials in values.yaml)
kubectl create secret generic interdict-db \
  --namespace interdict \
  --from-literal=password="$(openssl rand -base64 32)"

kubectl create secret generic interdict-clickhouse \
  --namespace interdict \
  --from-literal=password="$(openssl rand -base64 32)"

kubectl create secret generic interdict-minio \
  --namespace interdict \
  --from-literal=rootPassword="$(openssl rand -base64 32)"

# Install the chart
helm install interdict helm/interdict \
  --namespace interdict \
  --set postgresql.auth.existingSecret=interdict-db \
  --set clickhouse.auth.existingSecret=interdict-clickhouse \
  --set minio.auth.existingSecret=interdict-minio
```

### Key values.yaml Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `kernel.replicaCount` | `1` | Kernel replicas (scale for throughput) |
| `kernel.networkPolicy.enabled` | `true` | Zero-trust pod-to-pod NetworkPolicy |
| `kernel.autoscaling.enabled` | `false` | HPA for kernel data plane |
| `controlPlane.grpcPort` | `50052` | gRPC distribution port |
| `evidenceCollector.signingMode` | `dev` | Signing mode: `dev`, `file`, or `kms` |
| `evidenceCollector.fullTextStorage` | `false` | Store raw prompt/response text |
| `certInit.enabled` | `true` | Auto-generate internal mTLS certs |
| `sidecar.enabled` | `false` | Enable sidecar injection helpers |
| `dashboard.ingress.enabled` | `false` | Expose dashboard via Ingress |

### NetworkPolicy

NetworkPolicy is **enabled by default** for all four services. This
requires a CNI plugin that implements the NetworkPolicy API (e.g., Calico,
Cilium). If your cluster does not have one:

```yaml
# values-no-netpol.yaml
kernel:
  networkPolicy:
    enabled: false
controlPlane:
  networkPolicy:
    enabled: false
evidenceCollector:
  networkPolicy:
    enabled: false
dashboard:
  networkPolicy:
    enabled: false
```

```bash
helm install interdict helm/interdict -f values-no-netpol.yaml
```

> **Breaking change (v1.5):** NetworkPolicy is now enabled by default.
> Existing deployments on clusters without a NetworkPolicy-capable CNI
> must explicitly set `networkPolicy.enabled: false`.

---

## Configuration Reference

All environment variables are defined in `env.example` (the source of
truth). The table below groups them by component.

### Database (PostgreSQL)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | Yes | Postgres connection URL (used by control plane) |
| `POSTGRES_USER` | `interdict` | No | Postgres superuser name |
| `POSTGRES_PASSWORD` | — | Yes | Postgres superuser password. **Generate with `openssl rand -base64 32`** |
| `POSTGRES_DB` | `interdict` | No | Database name |

### Analytics Database (ClickHouse)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `CLICKHOUSE_URL` | `http://clickhouse:8123` | No | ClickHouse HTTP interface URL |
| `CLICKHOUSE_DATABASE` | `interdict` | No | ClickHouse database name |
| `CLICKHOUSE_USER` | `default` | No | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | — | Yes | ClickHouse password |

### Object Storage (MinIO / S3)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MINIO_ROOT_USER` | `interdict` | No | MinIO root username |
| `MINIO_ROOT_PASSWORD` | — | Yes | MinIO root password |
| `AWS_ENDPOINT_URL` | `http://minio:9000` | No | S3 endpoint (MinIO in Docker, real S3 in production) |
| `AWS_ACCESS_KEY_ID` | `interdict` | Yes | Must match `MINIO_ROOT_USER` |
| `AWS_SECRET_ACCESS_KEY` | — | Yes | Must match `MINIO_ROOT_PASSWORD` |
| `AWS_REGION` | `us-east-1` | No | S3 region |

### Kernel (Data Plane Proxy)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `KERNEL_LISTEN_ADDR` | `0.0.0.0:8443` | No | Proxy listen address |
| `KERNEL_CONNECT_TIMEOUT_MS` | `10000` | No | Upstream connection timeout (ms) |
| `KERNEL_FIRST_BYTE_TIMEOUT_MS` | `30000` | No | First byte timeout (ms) |
| `KERNEL_STREAM_TIMEOUT_MS` | `300000` | No | Overall stream timeout (5 min, for AI streaming) |
| `KERNEL_MAX_REQUEST_QUEUE` | `1024` | No | Max queued requests before 503 |
| `KERNEL_CA_CERT_PATH` | `/data/certs/ca.crt` | No | TLS CA cert path (auto-generated if missing) |
| `KERNEL_CA_KEY_PATH` | `/data/certs/ca.key` | No | TLS CA key path |
| `KERNEL_POOL_MAX_CONNECTIONS` | `4` | No | Max HTTP/2 connections per vendor |
| `KERNEL_POOL_MAX_STREAMS` | `100` | No | Max concurrent streams per connection |
| `KERNEL_POOL_IDLE_TIMEOUT` | `60000` | No | Idle connection timeout (ms) |
| `KERNEL_ALLOWLIST_VENDORS` | `["api.openai.com","api.anthropic.com"]` | No | Allowed AI vendor domains (TOML inline array) |
| `KERNEL_LOG_LEVEL` | `info` | No | Log level: debug, info, warn, error |
| `KERNEL_LOG_FORMAT` | `json` | No | Log format: json (production) or pretty (dev) |
| `KERNEL_REVIEW_DB_PATH` | `/data/review_queue.db` | No | SQLite path for human review queue |
| `KERNEL_POLICIES_DIR` | `/app/policies/` | No | Rego policy source directory |
| `KERNEL_DISTRIBUTION_ADDR` | `https://control-plane:50052` | No | Control plane gRPC address |
| `KERNEL_ORG_ID` | `default` | No | Organization ID for policy hierarchy |
| `KERNEL_FORCE_TEMPLATE` | `false` | No | Force regenerate TOML from template |

### Control Plane

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | HTTP API port |
| `WASM_STORAGE_DIR` | `./data/wasm` | No | Compiled Wasm policy module directory |
| `OPA_BINARY_PATH` | `opa` | No | Path to OPA binary |
| `INTERDICT_GRPC_PORT` | `50052` | No | gRPC distribution server port |
| `INTERDICT_GRPC_MAX_MESSAGE_SIZE` | `16777216` | No | Max gRPC message size (bytes, default 16 MB) |

### Evidence Collector

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `COLLECTOR_GRPC_LISTEN_ADDR` | `[::]:50051` | No | gRPC listen address |
| `COLLECTOR_S3_BUCKET` | `interdict-evidence` | No | S3 bucket for Merkle tree anchors |
| `COLLECTOR_S3_REGION` | `us-east-1` | No | S3 region |
| `COLLECTOR_SIGNING_MODE` | `dev` | No | Signing mode: `dev`, `file`, or `kms` |
| `COLLECTOR_SIGNING_KEY_PATH` | `/data/keys/signing.key` | No | Ed25519 signing key path (when `COLLECTOR_SIGNING_MODE=file`) |
| `COLLECTOR_MERKLE_WINDOW_SECS` | `3600` | No | Merkle tree rotation window (seconds) |
| `COLLECTOR_MERKLE_MAX_LEAVES` | `1000000` | No | Max leaves per Merkle tree before rotation |
| `COLLECTOR_FULL_TEXT_STORAGE` | `false` | No | Store full request/response text (see [Full-Text Storage Guide](full-text-storage.md)) |
| `COLLECTOR_RETENTION_DAYS` | `2555` | No | Evidence retention (days, default ≈ 7 years) |
| `COLLECTOR_REQUIRE_OBJECT_LOCK` | `true` | No | Require S3 Object Lock verification |

### mTLS Configuration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MTLS_ENABLED` | `true` | No | Toggle mTLS for internal gRPC channels |
| `MTLS_CA_CERT_PATH` | `/certs/internal-ca.pem` | No | Shared CA certificate path |
| `KERNEL_MTLS_CA_CERT` | `/certs/internal-ca.pem` | No | Kernel mTLS CA cert |
| `KERNEL_MTLS_CLIENT_CERT` | `/certs/kernel-client.pem` | No | Kernel mTLS client cert |
| `KERNEL_MTLS_CLIENT_KEY` | `/certs/kernel-client-key.pem` | No | Kernel mTLS client key |

### SAML SSO

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SAML_SP_ENTITY_ID` | `http://localhost:3001/api/v1/auth/saml/metadata` | No | SP entity ID (must match IdP config) |
| `SAML_SP_BASE_URL` | `http://localhost:3001` | No | Control plane external URL for ACS callback |
| `NEXT_PUBLIC_SAML_ENABLED` | `false` | No | Show SSO button (requires image rebuild) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | No | Control plane URL for browser redirects (requires image rebuild) |
| `CONTROL_PLANE_URL` | `http://control-plane:3000` | No | Internal control plane URL for dashboard backchannel |

### Monitoring (Grafana)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `GRAFANA_ADMIN_USER` | `admin` | No | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | — | Yes (monitoring profile) | Grafana admin password. **Generate with `openssl rand -base64 32`** |

### Signing Key Rotation

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SIGNING_KEY_OUTPUT_PATH` | `/data/keys/signing.key` | No | Where control plane writes rotated keys |
| `SIGNING_KEY_WATCH_PATH` | `/data/keys/signing.key` | No | Path evidence-collector watches (30s poll) |

---

## Certificate Management

Interdict uses two independent certificate infrastructures:

### 1. Proxy CA (Dynamic TLS Interception)

The kernel generates a self-signed CA on first boot at `KERNEL_CA_CERT_PATH`
(`/data/certs/ca.crt`). This CA dynamically issues certificates to
intercept outbound HTTPS traffic to AI vendor endpoints.

**For development:** Trust the generated CA on workstations:

```bash
# Extract the CA cert from the running container
docker compose cp kernel:/data/certs/ca.crt ./interdict-ca.pem

# Install into system trust store (macOS / Linux)
sudo bash scripts/install-ca-trust.sh ./interdict-ca.pem

# To remove later:
sudo bash scripts/install-ca-trust.sh --remove ./interdict-ca.pem
```

**For production:** Replace the auto-generated CA with your organisation's
CA by providing `KERNEL_CA_CERT_PATH` and `KERNEL_CA_KEY_PATH` pointing
to your own ECDSA/RSA CA certificate and key.

### 2. Internal mTLS (Service-to-Service)

All gRPC channels between services (kernel ↔ control-plane, kernel ↔
evidence-collector) use mutual TLS. The `cert-init` container
auto-generates an internal CA and per-service certificates on first boot.

Certificates are stored in the `certs` Docker volume and mounted read-only
into each service container.

**For production:** Disable auto-generation and provide your own
certificates:

```yaml
# Helm values
certInit:
  enabled: false
existingTlsSecret: "my-interdict-tls"
```

The secret must contain: `internal-ca.pem`, `control-plane.pem`,
`control-plane-key.pem`, `evidence-collector.pem`,
`evidence-collector-key.pem`, `kernel-client.pem`, `kernel-client-key.pem`.

### Certificate Rotation

Internal mTLS certificates and the kernel proxy CA are generated with
**1-year validity**. Rotate them before they expire to avoid mTLS
handshake failures.

#### Checking Certificate Expiry

```bash
# Check internal CA expiry
openssl x509 -enddate -noout -in /certs/internal-ca.pem

# Check kernel proxy CA expiry
openssl x509 -enddate -noout -in /data/certs/ca.crt

# Check a service certificate
openssl x509 -enddate -noout -in /certs/evidence-collector.pem
```

The `cert-init` container automatically logs a warning at startup when
any certificate expires within 30 days:

```
[certs] WARNING: Certificate expires in 12 days (/certs/internal-ca.pem). See docs/operator/guide.md for rotation.
```

Operators can monitor container logs for `[certs] WARNING` to detect
impending expiry.

#### Rotating Certificates (Docker Compose)

```bash
# 1. Stop application services (infrastructure stays up)
docker compose stop kernel control-plane evidence-collector dashboard

# 2. Remove existing certificates to trigger regeneration
docker compose run --rm cert-init sh -c "rm -f /certs/*.pem /certs/*.srl"

# 3. Regenerate certificates
docker compose run --rm cert-init

# 4. Restart application services
docker compose up -d kernel control-plane evidence-collector dashboard
```

#### Rotating Certificates (Kubernetes)

```bash
# 1. Delete the certificate secret (or PVC if using cert-init job)
kubectl delete secret interdict-tls -n interdict

# 2. Re-run the cert-init job
kubectl create job cert-rotate --from=cronjob/cert-init -n interdict

# 3. Restart services to pick up new certificates
kubectl rollout restart deploy/interdict-kernel -n interdict
kubectl rollout restart deploy/interdict-control-plane -n interdict
kubectl rollout restart deploy/interdict-evidence-collector -n interdict
```

Alternatively, provide your own certificates via `existingTlsSecret` and
manage rotation with your organisation's PKI tooling (e.g., cert-manager).

#### Grace Period and Impact

- Services **continue working** with existing certificates until they
  expire. There is no sudden failure — you have the full validity period.
- After expiry, mTLS handshakes between services will fail with TLS
  certificate verification errors. Services will not be able to
  communicate until certificates are rotated.
- The kernel proxy CA expiry affects outbound HTTPS interception — clients
  will see TLS errors for AI vendor requests.

#### Production Monitoring

For production deployments, supplement the built-in startup warning with
continuous certificate monitoring:

- **Prometheus blackbox_exporter:** Probe certificate endpoints and alert
  when expiry is within 30 days.
- **cert-manager (Kubernetes):** Automates certificate rotation with
  configurable renewal windows.
- **Custom CronJob:** Schedule a periodic check using `openssl x509
  -checkend` and send alerts via your notification pipeline.

---

## Signing Key Management

Evidence bundles are signed with Ed25519 keys. Three modes are supported:

### Dev Mode (`COLLECTOR_SIGNING_MODE=dev`)

An ephemeral key is generated at startup. Suitable for development only.
A `WARN`-level log is emitted if `dev` mode is used in production.

### File Mode (`COLLECTOR_SIGNING_MODE=file`)

A pre-provisioned Ed25519 private key at `COLLECTOR_SIGNING_KEY_PATH`.
The key is loaded via `ArcSwap` (see D014) for lock-free hot-reload.

**Key rotation workflow:**

1. Trigger rotation via the control plane API:
   ```bash
   curl -X POST http://localhost:3001/api/v1/admin/signing-keys/rotate \
     -H "Authorization: Bearer <token>"
   ```
2. The control plane generates a new Ed25519 key and writes it to
   `SIGNING_KEY_OUTPUT_PATH` (shared volume with evidence-collector).
3. The evidence-collector detects the file change (30-second poll) and
   hot-reloads via `reload_from_file()` — no restart required.
4. `COLLECTOR_SIGNING_MODE` automatically transitions from `dev` to
   `file` after the first rotation.

### KMS Mode (`COLLECTOR_SIGNING_MODE=kms`)

For production environments requiring HSM-backed keys. Signing operations
are delegated to an external KMS (e.g., AWS KMS, GCP Cloud KMS).
Configure KMS-specific environment variables per your provider's
documentation.

---

## Monitoring

An opt-in monitoring stack (Prometheus + Grafana) is available via the
Docker Compose monitoring profile.

> **Note:** This monitoring stack is for **development and staging only**.
> Production deployments should use dedicated monitoring infrastructure.

### Starting Monitoring

```bash
# Start with monitoring stack
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml \
  --profile monitoring up -d

# Or start monitoring alongside the main stack
docker compose --profile monitoring up -d
```

### Endpoints

| Service | URL | Credentials |
|---------|-----|-------------|
| Prometheus | `http://localhost:9090` | — |
| Grafana | `http://localhost:3002` | Set via `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` in `.env` |

### What's Included

- **Prometheus** (`prom/prometheus:v3.2.1`): Scrapes metrics from all
  Interdict services. Configuration at `monitoring/prometheus/prometheus.yml`.
- **Grafana** (`grafana/grafana:11.5.2`): Pre-provisioned dashboards at
  `monitoring/grafana/dashboards/`. Datasource auto-configured to point
  at the Prometheus instance.

Both services have healthchecks and persistent volumes for data retention
across restarts.

---

## Backup & Restore

### Backup

The `scripts/backup.sh` script dumps both Postgres and ClickHouse data.
**Requires running containers** — the script executes dump commands inside
the containers via `docker compose exec`.

```bash
# Preview what would be backed up (no files written)
scripts/backup.sh --dry-run

# Run backup with default output directory (./backups/YYYYMMDD_HHMMSS/)
scripts/backup.sh

# Custom output directory
scripts/backup.sh --output-dir /mnt/backups/interdict
```

**What's backed up:**

| Data | Format | File |
|------|--------|------|
| PostgreSQL database (config, policies, users) | SQL dump (gzipped) | `postgres.sql.gz` |
| ClickHouse tables (audit events, evidence) | TSV per table (gzipped) | `clickhouse/<table>.tsv.gz` |

### Restore

```bash
# Restore Postgres
gunzip -c backups/20260315_120000/postgres.sql.gz | \
  docker compose exec -T postgres psql -U interdict interdict

# Restore ClickHouse (per table)
gunzip -c backups/20260315_120000/clickhouse/evidence_events.tsv.gz | \
  docker compose exec -T clickhouse \
  clickhouse-client --query "INSERT INTO interdict.evidence_events FORMAT TabSeparatedWithNames"
```

> **Important:** Stop application services before restoring to avoid
> write conflicts. Infrastructure containers (postgres, clickhouse)
> must remain running.

---

## Environment Validation

Run `scripts/validate-env.sh` before starting the stack to catch
configuration errors early:

```bash
# Validate using .env in repo root
bash scripts/validate-env.sh

# Validate an alternate env file
bash scripts/validate-env.sh --env-file /path/to/.env
```

### What It Checks

1. **Required variables** — `DATABASE_URL`, `POSTGRES_PASSWORD`,
   `CLICKHOUSE_PASSWORD`, `MINIO_ROOT_PASSWORD`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY` are set and non-empty.
2. **Placeholder detection** — Credential vars do not contain
   `CHANGE_ME` placeholder values.
3. **URL format** — `DATABASE_URL` starts with `postgres://`,
   `CLICKHOUSE_URL` and `AWS_ENDPOINT_URL` start with `http://` or
   `https://`.
4. **Consistency** — `AWS_ACCESS_KEY_ID` matches `MINIO_ROOT_USER`,
   `AWS_SECRET_ACCESS_KEY` matches `MINIO_ROOT_PASSWORD`.

Exit code equals the number of validation failures (0 = all pass).
Security: the script never prints credential values — only variable names
and pass/fail status.

### Integration with Smoke Tests

`scripts/smoke-test.sh` automatically runs `validate-env.sh` as a
pre-flight check before starting Docker Compose and running Playwright
E2E tests. Skip with `--skip-env-check` in CI environments with
known-good configuration.

```bash
# Full smoke test: validate env → start stack → run Playwright → tear down
bash scripts/smoke-test.sh

# Skip env validation (CI)
bash scripts/smoke-test.sh --skip-env-check
```

---

## Upgrade Procedures

### Docker Compose

```bash
# 1. Pull latest images
docker compose pull

# 2. Restart services (zero-downtime for stateless services)
docker compose up -d

# 3. Verify health
docker compose ps
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:8080/ > /dev/null && echo "Dashboard OK"
```

### Helm

```bash
# 1. Update chart repository
helm repo update

# 2. Review changes
helm diff upgrade interdict helm/interdict --namespace interdict

# 3. Apply upgrade
helm upgrade interdict helm/interdict \
  --namespace interdict \
  --reuse-values

# 4. Verify rollout
kubectl rollout status deploy/interdict-kernel -n interdict
kubectl rollout status deploy/interdict-control-plane -n interdict
kubectl rollout status deploy/interdict-evidence-collector -n interdict
kubectl rollout status deploy/interdict-dashboard -n interdict
```

### Breaking Changes (v1.5)

- **NetworkPolicy enabled by default**: All four services now deploy
  NetworkPolicy resources. Clusters without a NetworkPolicy-capable CNI
  (Calico, Cilium) must set `networkPolicy.enabled: false` for each
  component. See [Kubernetes Deployment](#kubernetes-deployment-helm).

### Upgrading from v1.5 to v1.6

v1.6 introduces Docker Compose network segmentation, parameterized
Grafana credentials, and resource limits on all services. Existing
deployments must apply the following changes.

#### 1. Network Segmentation

Services are now assigned to three isolated Docker networks instead of
sharing the default bridge network:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose Stack                        │
│                                                                 │
│  ┌──────────┐   frontend   ┌──────────┐                        │
│  │Dashboard │◄────────────►│ Grafana  │                        │
│  └────┬─────┘              └────┬─────┘                        │
│       │                         │                               │
│       │ backend                 │ backend                       │
│       ▼                         ▼                               │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐                   │
│  │ Control  │  │ Evidence   │  │Prometheus│                    │
│  │  Plane   │  │ Collector  │  │          │                    │
│  └────┬─────┘  └─────┬──────┘  └──────────┘                   │
│       │               │                                         │
│       │ data          │ data                                    │
│       ▼               ▼                                         │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐                   │
│  │ Postgres │  │ ClickHouse │  │  MinIO   │                   │
│  └──────────┘  └────────────┘  └──────────┘                   │
│                                                                 │
│  Networks:                                                      │
│    frontend — browser-facing (dashboard, grafana)               │
│    backend  — inter-service (app services, prometheus)          │
│    data     — database access (postgres, clickhouse, minio)     │
└─────────────────────────────────────────────────────────────────┘
```

**Service network assignments:**

| Service | frontend | backend | data |
|---------|:--------:|:-------:|:----:|
| Dashboard | ✓ | ✓ | — |
| Control Plane | — | ✓ | ✓ |
| Kernel | — | ✓ | ✓ |
| Evidence Collector | — | ✓ | ✓ |
| Postgres | — | — | ✓ |
| ClickHouse | — | — | ✓ |
| MinIO | — | — | ✓ |
| Grafana | ✓ | ✓ | — |
| Prometheus | — | ✓ | — |

**Migration:** No data migration is needed. Stop and restart the stack to
apply the new network topology:

```bash
docker compose down
docker compose up -d
```

Docker Compose automatically creates the three named networks on startup.
The old default network is no longer used and will be removed by
`docker compose down`.

> **Effect:** The dashboard can no longer reach databases directly. All
> database access flows through the control plane and evidence collector
> on the `backend` + `data` networks. This matches the Kubernetes
> NetworkPolicy isolation already enforced in Helm deployments since v1.5.

#### 2. Grafana Credentials (Monitoring Profile)

Grafana no longer starts with hardcoded `admin/admin` credentials. The
`GRAFANA_ADMIN_PASSWORD` environment variable is **required** when using
the monitoring profile. Without it, `docker compose` will refuse to start
with a clear error message.

Add to your `.env` file:

```bash
# Generate a unique Grafana admin password
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)
```

Or use the `sed` shortcut from `env.example`:

```bash
sed -i "s|CHANGE_ME_GRAFANA_PASSWORD|$(openssl rand -base64 32)|" .env
```

#### 3. Resource Limits

All services now have `deploy.resources.limits` for memory and CPU:

| Service | Memory | CPU |
|---------|--------|-----|
| Postgres | 1 GB | 1.0 |
| ClickHouse | 2 GB | 2.0 |
| MinIO | 512 MB | 0.5 |
| Control Plane | 1 GB | 1.0 |
| Evidence Collector | 512 MB | 0.5 |
| Kernel | 512 MB | 0.5 |
| Dashboard | 512 MB | 0.5 |
| Prometheus | 512 MB | 0.5 |
| Grafana | 256 MB | 0.25 |

These limits prevent any single service from consuming all host resources.
Adjust via the `deploy.resources.limits` keys in `docker-compose.yml` and
`docker-compose.monitoring.yml` if your workload requires higher limits.

---

## Health Checks

All services expose health endpoints and have Docker/Kubernetes
healthchecks configured:

| Service | Docker Compose | Kubernetes |
|---------|---------------|------------|
| Control Plane | `wget http://localhost:3000/health` | startupProbe + livenessProbe (HTTP `/health`) |
| Evidence Collector | `nc -z 127.0.0.1 50051` | startupProbe (TCP 50051) |
| Kernel | `nc -z 127.0.0.1 8443` | startupProbe (TCP 8443) |
| Dashboard | `fetch('http://localhost:3001/')` | startupProbe + livenessProbe (HTTP `/`) |
| Postgres | `pg_isready` | Built-in |
| ClickHouse | `wget http://localhost:8123/ping` | Built-in |
| MinIO | `mc ready local` | Built-in |

---

## Security Hardening

The Docker Compose configuration applies:

- `read_only: true` — read-only root filesystem for all application containers
- `no-new-privileges:true` — prevents privilege escalation
- Resource limits (memory, CPU) on all services
- `tmpfs` mounts for ephemeral writes
- Structured JSON logging with configurable levels
- Log rotation (`max-size: 10m`, `max-file: 3`) on all containers

For additional security considerations when storing full prompt/response
text, see the [Full-Text Storage Guide](full-text-storage.md).

### CSRF Protection

Interdict mitigates Cross-Site Request Forgery through two complementary
mechanisms:

1. **`SameSite=Lax` session cookies.** The dashboard's authentication
   cookie is set with `sameSite: "lax"`, which prevents browsers from
   sending the cookie on cross-origin POST, PUT, and DELETE requests.
   This blocks the most common CSRF vector — a malicious page submitting
   a form to the Interdict dashboard on behalf of a logged-in operator.

2. **BFF (Backend-for-Frontend) proxy pattern.** The dashboard never
   exposes raw API tokens to the browser. All API calls are proxied
   through the Next.js server, which attaches credentials server-side.
   This eliminates the risk of token theft via XSS being leveraged for
   cross-origin requests.

**Multi-tenant deployments:** For environments where multiple tenants
share a single Interdict instance behind different subdomains, consider
adding explicit CSRF tokens (e.g., the Synchronizer Token pattern or
`Double-Submit Cookie` pattern) to mutation endpoints. The `SameSite=Lax`
policy alone does not protect against same-site attacks from sibling
subdomains.

---

## Cross-References

- [Full-Text Storage Guide](full-text-storage.md) — raw prompt/response
  storage configuration, compliance, and security requirements
- [Troubleshooting Guide](troubleshooting.md) — common issues and
  diagnostic commands
- [REST API Reference](../api/rest.md) — control plane HTTP API
  documentation
- [gRPC API Reference](../api/grpc.md) — policy distribution and evidence
  collection protocols
