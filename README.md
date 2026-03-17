# Interdict

AI governance kernel for regulated enterprises. Sits between internal users and AI providers (OpenAI, Anthropic, etc.), enforcing configurable policies inline, producing cryptographically signed audit trails, and mapping actions to regulatory frameworks.

## Architecture

```
                  ┌─────────────────────────────────────────────┐
                  │           Customer VPC / Cluster             │
                  │                                             │
  Users ──────── │ ── Kernel Proxy ── AI Vendors (OpenAI, etc) │
                  │       │                                     │
                  │       ├── Evidence Collector (gRPC)         │
                  │       │       ├── ClickHouse (audit logs)   │
                  │       │       └── S3 / MinIO (Merkle trees) │
                  │       │                                     │
                  │       └── Control Plane API (gRPC)          │
                  │               ├── PostgreSQL (config)       │
                  │               └── Dashboard (Next.js)       │
                  └─────────────────────────────────────────────┘
```

**Data Plane** (Rust, 3 crates, ~30K LOC): Transparent MITM proxy with <10ms p99 overhead. Inspects requests and streaming responses via Wasm policy modules (Rego compiled to Wasm). Produces Ed25519-signed, SHA-256 hash-chained evidence bundles with Merkle tree anchoring. Supports fail-closed and fail-open modes per policy.

**Control Plane** (Bun/Elysia, ~100 TypeScript modules): Policy CRUD, Rego-to-Wasm compiler, vendor registry, audit trail queries, compliance reports, human review queue. gRPC push-based policy distribution with hot-reload. Prometheus metrics endpoint.

**Dashboard** (Next.js, ~190 components): Policy wizard, audit trail explorer, compliance reports, vendor management, key rotation, review queue with SLA timers. WCAG AA accessible. Nonce-based CSP.

**Evidence Pipeline**: Hash chains (SHA-256), Ed25519 signatures, Merkle trees with S3 WORM anchoring. Retry queue with dead-lettering and fail-closed enforcement when evidence delivery is degraded. Independent `interdict-verify` binary for offline chain validation.

## Current Status

**v1.7** (current) — Foundation hardening. ClickHouse commit retry with dead-lettering, Merkle proof generation from persisted anchors, evidence deduplication tracker, Prometheus metrics for both Rust and TypeScript services, SAML SLO session revocation, department-scoped RBAC, module-level tick manager for SLA timers. 77 architectural decisions recorded (D001–D077). All 9 milestones complete.

**v1.6** — Assessment remediation. All 28 findings from v1.5 assessment addressed: CI supply chain hardening (SHA-pinned Actions, OPA checksums, digest-pinned base images), auth hardening (rate limiting, SAML tests, session cleanup), input validation (CSV formula defense, TypeBox maxLength, body size limits), Docker Compose network segmentation and resource limits, Helm security contexts and RBAC, cross-service integration tests, proto validation annotations, certificate hygiene (1-year CA, expiry monitoring, rotation docs).

**v1.5** — Production readiness. Expanded hot-path and evidence test coverage, CI/CD release pipeline with signed images, CSP nonce hardening, Helm network policies, DevOps maturity (multi-platform builds, monitoring, backup, env validation), operator and API documentation, WCAG AA accessibility.

**v1.2** — Trustworthiness and hardening. No new features; focused on correctness, security, and honest deployment artifacts.

**v1.1** — Identity, dashboard, and deployment packaging. SAML SSO, 10+ dashboard views, Docker Compose and Helm chart deployment.

**v1.0** — Data plane and control plane API. Kernel proxy, policy engine, evidence collector, 8 regulatory framework packs.

## Quick Start (Local Development)

Requires Docker and Docker Compose.

```bash
cp env.example .env
# Generate unique credentials (required — compose refuses to start without them):
sed -i "s|CHANGE_ME_POSTGRES_PASSWORD|$(openssl rand -base64 32)|" .env
sed -i "s|CHANGE_ME_CLICKHOUSE_PASSWORD|$(openssl rand -base64 32)|" .env
sed -i "s|CHANGE_ME_MINIO_PASSWORD|$(openssl rand -base64 32)|" .env
sed -i "s|CHANGE_ME_GRAFANA_PASSWORD|$(openssl rand -base64 32)|" .env
# Then update DATABASE_URL with the Postgres password you just generated.
docker compose up
```

Services:

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:8080 |
| Control Plane API | http://localhost:3001 |
| Kernel Proxy | https://localhost:8443 |

The first boot generates internal mTLS certificates automatically.

## Deployment Options

**Docker Compose** — single-host deployment for development and small pilots. See `docker-compose.yml`.

**Kubernetes (Helm)** — production deployment. See `helm/interdict/`.

```bash
helm install interdict ./helm/interdict -n interdict --create-namespace
```

All runtime containers run as non-root (UID 1000). Helm templates include `securityContext`, `readinessProbe`, `livenessProbe`, RBAC, and network policies for all services.

## Documentation

| Document | Description |
|----------|-------------|
| [Operator Guide](docs/operator/guide.md) | Deployment, configuration, certificates, monitoring, backup, upgrades |
| [Troubleshooting](docs/operator/troubleshooting.md) | Diagnostic procedures for 9 failure categories |
| [Full-Text Storage](docs/operator/full-text-storage.md) | Security and GDPR considerations for full-text evidence |
| [REST API Reference](docs/api/rest.md) | All 53 endpoints across 13 control-plane modules |
| [gRPC API Reference](docs/api/grpc.md) | EvidenceCollectorService and PolicyDistributionService |
| [Market Intelligence](docs/business/market-intelligence-2026-03-16.md) | Competitive landscape and positioning |
| [Assessments](docs/assessments/) | Point-in-time audit reports and remediation plans |

## Production Considerations

- **Pre-flight checks**: Run `scripts/validate-env.sh` before first deployment to catch missing or placeholder environment variables, malformed URLs, and configuration errors. See the [Operator Guide](docs/operator/guide.md) for complete deployment instructions.
- **Change all default passwords** in `.env` before deploying. Every `CHANGE_ME` placeholder in `env.example` must be replaced with a strong credential.
- **Signing mode**: The default `COLLECTOR_SIGNING_MODE=dev` generates ephemeral keys. For production, use `file` mode with a pre-provisioned Ed25519 key.
- **mTLS**: Enabled by default between all internal services. The auto-generated CA (1-year validity) is suitable for development; production deployments should use organization-managed certificates. Cert-init warns at 30 days before expiry. See the [Operator Guide](docs/operator/guide.md#certificate-management) for certificate procedures.
- **Air-gapped builds**: The control-plane image downloads OPA from GitHub at build time. For offline environments, pre-download the OPA binary and modify the Dockerfile's `opa-fetch` stage to use a local `COPY` instead.
- **Monitoring**: Use `docker compose --profile monitoring up` to start the Prometheus + Grafana monitoring stack. Both Rust and TypeScript services expose `/metrics` endpoints. See the [Operator Guide](docs/operator/guide.md#monitoring) for dashboard and alerting configuration.

## Repository Layout

```
crates/
  kernel/              Rust data-plane proxy
  evidence-collector/  Rust evidence pipeline (gRPC + ClickHouse + S3)
  interdict-verify/    Offline evidence chain verification binary
control-plane/         Bun/Elysia API server (TypeScript)
dashboard/             Next.js dashboard (React/TypeScript)
docker/                Dockerfiles and entrypoint scripts
helm/interdict/        Kubernetes Helm chart
proto/                 Protobuf definitions (gRPC)
monitoring/            Prometheus + Grafana configuration
scripts/               Deployment, testing, and quality scripts
tests/integration/     Cross-service integration test scripts
docs/                  Operator guides, API references, assessments
```

## Local Verification

### Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| Rust (stable) | 1.85+ | Kernel and evidence-collector (edition 2024) |
| Bun | 1.1+ | Control plane API |
| Node.js | 22+ | Dashboard build |
| Docker + Compose | 24+ | Full-stack integration |

**Windows note**: Rust compilation requires either MSVC Build Tools (for `windows-msvc` target) or MinGW with `dlltool.exe` (for `windows-gnu` target). If neither is available, Rust checks can be run inside Docker or deferred to CI. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup.

### Running checks

```bash
# Rust data plane (Linux/macOS, or CI)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cargo test -p kernel --test content_inspection_test

# Control plane (TypeScript)
cd control-plane
bunx tsc --noEmit
bun test                 # 411+ tests

# Dashboard
cd dashboard
npm test                 # 415+ tests (vitest)
npm run build            # production build

# Infrastructure quality
npm run lint:infra       # hadolint, shellcheck, helm lint, buf lint
```

### CI

All checks run automatically on push via `.github/workflows/ci-quality-security.yml` (10 jobs):

- **quality**: `cargo fmt`, `cargo clippy`, `cargo test` (3 deployment modes)
- **security**: `cargo audit`, `cargo deny`, Trivy filesystem scan
- **control-plane**: Biome lint, `tsc --noEmit`, `bun test`
- **dashboard**: Prettier, ESLint, Vitest, `next build`
- **infra**: hadolint, shellcheck, helm lint, buf lint, Docker Compose config validation

Release pipeline (`.github/workflows/release.yml`): multi-platform Docker builds, SBOM generation, cosign image signing via GitHub Actions OIDC.

## License

Proprietary. All rights reserved.
