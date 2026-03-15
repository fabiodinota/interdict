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

**Data Plane** (Rust): Transparent MITM proxy with <10ms p99 overhead. Inspects requests and streaming responses via Wasm policy modules (Rego compiled to Wasm). Produces Ed25519-signed, SHA-256 hash-chained evidence bundles. Supports fail-closed and fail-open modes per policy.

**Control Plane** (Bun/Elysia + Next.js): Policy CRUD, Rego-to-Wasm compiler, vendor registry, audit trail queries, compliance reports, human review queue. gRPC push-based policy distribution with hot-reload.

**Evidence Pipeline**: Hash chains (SHA-256), Ed25519 signatures, Merkle trees with S3 WORM anchoring. Retry queue with fail-closed enforcement when evidence delivery is degraded.

## Current Status

**v1.5** (current) -- Production readiness milestone. Expanded hot-path and evidence test coverage, CI/CD release pipeline with signed images, CSP nonce hardening, Helm network policies, DevOps maturity (multi-platform builds, monitoring, backup, env validation), operator and API documentation, WCAG AA accessibility.

**v1.2** (shipped 2026-03-12) -- Trustworthiness and hardening milestone. No new features; focused on correctness, security, and honest deployment artifacts.

**v1.1** (shipped 2026-03-04) -- Identity, dashboard, and deployment packaging. SAML SSO, 10+ dashboard views, Docker Compose and Helm chart deployment.

**v1.0** (shipped 2026-03-01) -- Data plane and control plane API. Kernel proxy, policy engine, evidence collector, 8 regulatory framework packs.

## Quick Start (Local Development)

Requires Docker and Docker Compose.

```bash
cp env.example .env
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

**Docker Compose** -- single-host deployment for development and small pilots. See `docker-compose.yml`.

**Kubernetes (Helm)** -- production deployment. See `helm/interdict/`.

```bash
helm install interdict ./helm/interdict -n interdict --create-namespace
```

All runtime containers run as non-root (UID 1000). Helm templates include `securityContext`, `readinessProbe`, and `livenessProbe` for all services.

## Documentation

| Document | Description |
|----------|-------------|
| [Operator Guide](docs/operator/guide.md) | Deployment, configuration, certificates, monitoring, backup, upgrades |
| [Troubleshooting](docs/operator/troubleshooting.md) | Diagnostic procedures for 9 failure categories |
| [Full-Text Storage](docs/operator/full-text-storage.md) | Security and GDPR considerations for full-text evidence |
| [REST API Reference](docs/api/rest.md) | All 53 endpoints across 13 control-plane modules |
| [gRPC API Reference](docs/api/grpc.md) | EvidenceCollectorService and PolicyDistributionService |

## Production Considerations

- **Pre-flight checks**: Run `scripts/validate-env.sh` before first deployment to catch missing or placeholder environment variables, malformed URLs, and configuration errors. See the [Operator Guide](docs/operator/guide.md) for complete deployment instructions.
- **Change all default passwords** in `.env` before deploying. Every value marked `# CHANGE IN PRODUCTION` in `env.example` must be replaced.
- **Signing mode**: The default `COLLECTOR_SIGNING_MODE=dev` generates ephemeral keys. For production, use `file` mode with a pre-provisioned Ed25519 key.
- **mTLS**: Enabled by default between all internal services. The auto-generated CA is suitable for development; production deployments should use organization-managed certificates. See the [Operator Guide](docs/operator/guide.md#certificate-management) for certificate procedures.
- **Air-gapped builds**: The control-plane image downloads OPA from GitHub at build time. For offline environments, pre-download the OPA binary and modify the Dockerfile's `opa-fetch` stage to use a local `COPY` instead.
- **Monitoring**: Use `docker compose --profile monitoring up` to start the Prometheus + Grafana monitoring stack. See the [Operator Guide](docs/operator/guide.md#monitoring) for dashboard and alerting configuration.

## Repository Layout

```
crates/
  kernel/              Rust data-plane proxy
  evidence-collector/  Rust evidence pipeline (gRPC + ClickHouse + S3)
control-plane/         Bun/Elysia API server (TypeScript)
dashboard/             Next.js dashboard (React/TypeScript)
docker/                Dockerfiles and entrypoint scripts
helm/interdict/        Kubernetes Helm chart
proto/                 Protobuf definitions (gRPC)
.planning/             Milestone roadmaps and project state
```

## Local Verification

### Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| Rust (stable) | 1.80+ | Kernel and evidence-collector |
| Bun | 1.1+ | Control plane API |
| Node.js | 20+ | Dashboard build |
| Docker + Compose | 24+ | Full-stack integration |

**Windows note**: Rust compilation requires either MSVC Build Tools (for `windows-msvc` target) or MinGW with `dlltool.exe` (for `windows-gnu` target). If neither is available, Rust checks can be run inside Docker or deferred to CI.

### Running checks

```bash
# Rust data plane (Linux/macOS, or CI)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
cargo test -p kernel --test content_inspection_test

# Control plane (TypeScript)
cd control-plane
bunx tsc --noEmit        # type check
bun test                 # 139+ tests

# Dashboard
cd dashboard
npm test                 # 62+ tests (vitest)
npm run build            # production build (checks types + lint)

# Dependency audits
cd dashboard && npm audit
```

### CI

All checks run automatically on push via `.github/workflows/ci-quality-security.yml`:

- **quality**: `cargo fmt`, `cargo clippy`, `cargo test` (3 deployment modes)
- **security**: `cargo audit`, `cargo deny`, Trivy filesystem scan
- **control-plane**: `tsc --noEmit`, `bun test`
- **dashboard**: ESLint, `vitest`, `next build`

## License

Proprietary. All rights reserved.
