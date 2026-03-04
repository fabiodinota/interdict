# Phase 8: Container Images & Docker Compose - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-stage Dockerfiles for all Interdict services (kernel, control plane API, evidence collector), a Docker Compose file that brings up the full stack with all dependencies in one command, and an env.example documenting every configuration variable. This is the pilot deployment foundation — the law firm customer deploys via Docker Compose.

</domain>

<decisions>
## Implementation Decisions

### Deployment Topology
- Bundle everything: docker compose up brings up Postgres, ClickHouse, MinIO, and all Interdict services — zero pre-reqs beyond Docker
- MinIO container provides S3-compatible local storage for evidence collector Merkle tree anchors; real S3 overridable via env vars
- TLS CA certificate/key pair auto-generated on first boot via init container or entrypoint script; stored in a named volume; pilot customers can replace with their own CA later
- Only kernel proxy (8443) and control plane API (3000) exposed to host; Postgres, ClickHouse, gRPC, MinIO are internal-only on the Docker network

### Configuration Strategy
- Single .env file at repo root with all vars, namespaced by service prefix (KERNEL_, CP_, COLLECTOR_); shared vars (DATABASE_URL, CLICKHOUSE_URL) defined once
- Auto-generate secrets on first boot: Ed25519 signing key (dev mode), DB migrations, identity seed data; keys written to named volume; idempotent so restarts are safe
- Kernel TOML config handled via template with env substitution — ship a default interdict.toml in the image, entrypoint script substitutes env vars before starting; users can override by mounting their own TOML
- env.example categorized with comments, grouped by service/concern (# Database, # Kernel, # Control Plane, etc.) with inline comments per var explaining default and whether required/optional — becomes the reference for Helm values.yaml in Phase 12

### Image Build Approach
- Rust images (kernel + evidence collector) use cargo-chef for dependency caching: Stage 1 chef prepare, Stage 2 chef cook (caches deps), Stage 3 build binary, Stage 4 minimal runtime
- Runtime base image: debian:bookworm-slim — provides glibc for jemalloc, small enough (~80MB), easy CA cert management
- OPA binary downloaded in build stage from pinned GitHub release, copied to control plane runtime image; version pinned in Dockerfile for reproducibility
- Image tagging: semver + git SHA (e.g., interdict/kernel:v1.1.0 and interdict/kernel:abc1234); Compose defaults to :latest for dev, Helm references semver

### Developer Experience
- Production-only docker-compose.yml — no dev compose file; developers run services locally (bun dev, cargo run) against containerized infra
- Startup order via Docker HEALTHCHECK + depends_on with condition: service_healthy; control plane waits for Postgres/ClickHouse healthy, kernel waits for control plane healthy
- Auto-migrate + seed on startup: control plane entrypoint runs drizzle migrate + seed before starting server; idempotent; true one-command experience
- Named volumes persist data across docker compose down/up cycles for Postgres data, ClickHouse data, MinIO storage, CA certs, signing keys; users run docker compose down -v to wipe

### Claude's Discretion
- Exact entrypoint script implementation details
- .dockerignore file contents
- Docker Compose service naming conventions
- ClickHouse schema initialization approach (evidence collector manages this)
- Bun image choice for control plane (official oven/bun vs custom)
- Container resource limits and restart policies

</decisions>

<specifics>
## Specific Ideas

- env.example is explicitly designed as the "single source of truth" shared between Docker Compose and future Helm values.yaml (Phase 12 success criterion)
- MinIO provides local S3 compatibility but should be swappable for real AWS S3 via env vars without any code changes
- The one-command experience means: cp env.example .env && docker compose up — that's it

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `control-plane/src/config.ts`: Already uses env vars with fallback defaults (PORT, DATABASE_URL, CLICKHOUSE_URL, etc.) — Docker env vars will map directly
- `control-plane/src/seed/run-seed.ts`: Existing seed script with `seedIdentity()` — can be called from entrypoint before server start
- `crates/kernel/src/config.rs`: TOML-based config with `config::load(&config_path)` — entrypoint script writes TOML from env vars then passes path

### Established Patterns
- Kernel uses jemalloc (`tikv_jemallocator`) — requires glibc runtime, rules out musl/Alpine
- Kernel reads config from file path (CLI arg or default `interdict.toml`) — not env vars
- Control plane uses Bun runtime with Elysia — needs `oven/bun` base image
- Evidence collector reads `CollectorConfig::default()` which pulls from env vars — Docker-native already
- Control plane gRPC server on port 50052 — internal-only, not exposed to host

### Integration Points
- Kernel connects to control plane gRPC (port 50052) for policy distribution
- Control plane connects to PostgreSQL and ClickHouse
- Evidence collector connects to ClickHouse and S3 (MinIO)
- Kernel sends evidence to evidence collector via gRPC
- Control plane runs DB migrations via drizzle-kit

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-container-images-docker-compose*
*Context gathered: 2026-03-02*
