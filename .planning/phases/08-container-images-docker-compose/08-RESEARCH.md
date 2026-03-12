# Phase 8: Container Images & Docker Compose - Research

**Researched:** 2026-03-02
**Domain:** Container orchestration, multi-stage Docker builds, Docker Compose service topology
**Confidence:** HIGH

## Summary

Phase 8 packages the four Interdict services (kernel, control plane API, evidence collector, and -- per success criteria -- a dashboard placeholder) as container images and wires them together with infrastructure dependencies (Postgres, ClickHouse, MinIO) via Docker Compose. The user has made comprehensive decisions covering deployment topology, configuration strategy, image build approach, and developer experience. The key technical challenges are: (1) optimizing Rust multi-stage builds with cargo-chef for the two Rust binaries which have heavy dependencies (wasmtime, tract-onnx, aws-lc-rs), (2) adding environment variable support to the evidence collector which currently only supports hardcoded defaults, (3) creating an entrypoint script that templates the kernel's TOML config from env vars, and (4) wiring health checks and startup ordering so `docker compose up` reaches full health without manual intervention.

The project's existing code is well-suited for containerization: the control plane already reads all config from env vars, the evidence collector manages its own ClickHouse schema (DDL on startup), and the kernel accepts a config file path as its first CLI argument. The primary gap is the evidence collector's `CollectorConfig::default()` which has zero env var support -- this must be added before Docker env vars can drive its configuration.

**Primary recommendation:** Use cargo-chef with bookworm-based images for Rust builds, oven/bun:1-slim for the control plane, and a single docker-compose.yml with depends_on + service_healthy conditions to enforce startup ordering. Add env var reading to the evidence collector config. Ship an entrypoint.sh for the kernel that generates interdict.toml from env vars.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Bundle everything: docker compose up brings up Postgres, ClickHouse, MinIO, and all Interdict services -- zero pre-reqs beyond Docker
- MinIO container provides S3-compatible local storage for evidence collector Merkle tree anchors; real S3 overridable via env vars
- TLS CA certificate/key pair auto-generated on first boot via init container or entrypoint script; stored in a named volume; pilot customers can replace with their own CA later
- Only kernel proxy (8443) and control plane API (3000) exposed to host; Postgres, ClickHouse, gRPC, MinIO are internal-only on the Docker network
- Single .env file at repo root with all vars, namespaced by service prefix (KERNEL_, CP_, COLLECTOR_); shared vars (DATABASE_URL, CLICKHOUSE_URL) defined once
- Auto-generate secrets on first boot: Ed25519 signing key (dev mode), DB migrations, identity seed data; keys written to named volume; idempotent so restarts are safe
- Kernel TOML config handled via template with env substitution -- ship a default interdict.toml in the image, entrypoint script substitutes env vars before starting; users can override by mounting their own TOML
- env.example categorized with comments, grouped by service/concern (# Database, # Kernel, # Control Plane, etc.) with inline comments per var explaining default and whether required/optional -- becomes the reference for Helm values.yaml in Phase 12
- Rust images (kernel + evidence collector) use cargo-chef for dependency caching: Stage 1 chef prepare, Stage 2 chef cook (caches deps), Stage 3 build binary, Stage 4 minimal runtime
- Runtime base image: debian:bookworm-slim -- provides glibc for jemalloc, small enough (~80MB), easy CA cert management
- OPA binary downloaded in build stage from pinned GitHub release, copied to control plane runtime image; version pinned in Dockerfile for reproducibility
- Image tagging: semver + git SHA (e.g., interdict/kernel:v1.1.0 and interdict/kernel:abc1234); Compose defaults to :latest for dev, Helm references semver
- Production-only docker-compose.yml -- no dev compose file; developers run services locally (bun dev, cargo run) against containerized infra
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | All services (kernel, control plane API, dashboard, evidence collector) are packaged as container images published to a registry | Multi-stage Dockerfiles with cargo-chef for Rust services, oven/bun for control plane, nginx for dashboard placeholder; image tagging pattern with semver + git SHA |
| DEPLOY-02 | Operator can deploy the full Interdict stack on a single server using Docker Compose with one command | docker-compose.yml with all services + infra (Postgres, ClickHouse, MinIO), depends_on + service_healthy ordering, env.example as config reference, entrypoint scripts for auto-migration/seeding/TLS generation |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| cargo-chef | 0.1.75 | Rust dependency caching in Docker builds | De facto standard for fast Rust Docker builds; up to 5x speedup; handles workspaces natively |
| lukemathwalker/cargo-chef | latest-rust-1-bookworm | Build stage base image | Includes Rust toolchain + cargo-chef pre-installed on Debian Bookworm; consistent with runtime glibc |
| debian:bookworm-slim | bookworm | Runtime base image for Rust binaries | ~80MB, glibc for jemalloc, easy ca-certificates installation; user decision |
| oven/bun:1-slim | 1.x-slim | Control plane build + runtime image | Official Bun Docker image, slim variant reduces image size, Debian-based |
| nginx:1-bookworm | 1.x-bookworm | Dashboard placeholder (static file server) | Standard web server for serving built frontend assets; matches bookworm ecosystem |
| postgres:17-bookworm | 17 | PostgreSQL database | Current stable Postgres, bookworm-based for consistency |
| clickhouse/clickhouse-server | 25.1 | ClickHouse analytics database | Official ClickHouse image; supports /docker-entrypoint-initdb.d for schema init |
| minio/minio | latest | S3-compatible local object storage | De facto standard for local S3; environment-driven configuration |
| OPA binary | v1.14.0 (pinned) | Policy compilation for control plane | Downloaded from GitHub releases in build stage; pinned for reproducibility |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| envsubst (gettext-base) | TOML template variable substitution | Kernel entrypoint: generate interdict.toml from env vars |
| wget/curl | Health check commands in Dockerfiles | HEALTHCHECK instructions for control plane and ClickHouse |
| openssl | CA certificate generation | Kernel entrypoint: auto-generate TLS CA on first boot |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| debian:bookworm-slim | alpine:3.20 | Alpine uses musl; jemalloc requires glibc -- ruled out by dependency |
| envsubst for TOML | sed/awk templating | envsubst is cleaner, handles ${VAR} patterns natively, installed via gettext-base |
| oven/bun:1-slim | node:22-slim | Project uses Bun runtime throughout; switching to Node would break Bun-specific APIs |
| nginx placeholder | No dashboard image | DEPLOY-01 requires all four service images; placeholder needed until Phase 9 |

## Architecture Patterns

### Recommended Project Structure
```
docker/
    kernel/
        Dockerfile
        entrypoint.sh
        interdict.toml.template
    control-plane/
        Dockerfile
        entrypoint.sh
    evidence-collector/
        Dockerfile
        entrypoint.sh
    dashboard/
        Dockerfile
docker-compose.yml
env.example
.dockerignore
```

### Pattern 1: cargo-chef Multi-Stage Build (Rust Services)
**What:** Four-stage Dockerfile: planner (recipe.json), cook (cached deps), build (binary), runtime (minimal image)
**When to use:** Both Rust services (kernel, evidence-collector)
**Example:**
```dockerfile
# Source: https://github.com/LukeMathWalker/cargo-chef (verified 2026-03-02)
FROM lukemathwalker/cargo-chef:latest-rust-1-bookworm AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies - this is the caching Docker layer!
RUN cargo chef cook --release --recipe-path recipe.json
# Build application
COPY . .
RUN cargo build --release --bin kernel

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates gettext-base openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/kernel /usr/local/bin/interdict-kernel
COPY docker/kernel/entrypoint.sh /entrypoint.sh
COPY docker/kernel/interdict.toml.template /app/interdict.toml.template
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

**Critical workspace consideration:** cargo-chef operates at workspace level. Both kernel and evidence-collector share a workspace, so the Dockerfile copies the entire workspace. Each service's Dockerfile uses `cargo build --release --bin <binary_name>` to select the specific binary. The `cargo chef cook` step caches ALL workspace dependencies (shared across both binaries), and the `cargo build` step only recompiles changed source code.

### Pattern 2: TOML Template with envsubst (Kernel Config)
**What:** Ship a TOML template in the image; entrypoint uses envsubst to substitute env vars, then exec the binary
**When to use:** Kernel service, which reads config from a TOML file rather than env vars
**Example:**
```bash
#!/bin/sh
set -e

# Generate interdict.toml from template if not mounted
if [ ! -f /app/interdict.toml ] || [ "${KERNEL_FORCE_TEMPLATE:-false}" = "true" ]; then
    envsubst < /app/interdict.toml.template > /app/interdict.toml
fi

# Auto-generate CA cert/key if not present
if [ ! -f /data/certs/ca.crt ]; then
    mkdir -p /data/certs
    openssl req -x509 -newkey ed25519 -keyout /data/certs/ca.key \
        -out /data/certs/ca.crt -days 3650 -nodes \
        -subj "/CN=Interdict CA/O=Interdict"
fi

exec /usr/local/bin/interdict-kernel /app/interdict.toml
```

### Pattern 3: Bun Entrypoint with Auto-Migrate + Seed
**What:** Control plane entrypoint runs drizzle migrate then seed before starting the server
**When to use:** Control plane service
**Example:**
```bash
#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
bun run db:migrate

echo "[entrypoint] Running seed (idempotent)..."
bun run seed

echo "[entrypoint] Starting control plane server..."
exec bun run start
```

### Pattern 4: Docker Compose depends_on with service_healthy
**What:** Startup ordering enforced via health checks -- services only start when their dependencies are healthy
**When to use:** docker-compose.yml service dependency declarations
**Example:**
```yaml
# Source: https://docs.docker.com/compose/how-tos/startup-order/
services:
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U interdict"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  control-plane:
    depends_on:
      postgres:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  kernel:
    depends_on:
      control-plane:
        condition: service_healthy
```

### Anti-Patterns to Avoid
- **Full workspace copy before chef prepare:** The planner stage should copy the full workspace; do NOT try to copy only Cargo.toml files manually. cargo-chef handles workspace detection automatically.
- **Using Alpine for Rust services:** The kernel depends on jemalloc (tikv-jemallocator) which requires glibc. Alpine uses musl and will fail at link time.
- **Running as root in production containers:** Create a non-root user in the runtime stage and use `USER` directive. This is especially important for the kernel which listens on a network port.
- **Hardcoding image tags in docker-compose.yml:** Use variable substitution or `latest` for local dev; pin semver tags in production/Helm deployment.
- **Buffering health check output:** Use `--spider` with wget or `-f` with curl to avoid downloading response bodies in health checks.
- **Forgetting `--no-install-recommends`:** Debian apt-get installs recommended packages by default, bloating the image. Always use `--no-install-recommends`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rust dependency caching | Manual Cargo.toml copy tricks | cargo-chef | Handles workspaces, feature flags, build scripts; manual approaches break constantly |
| TOML variable substitution | Custom sed/awk scripts | envsubst (gettext-base) | Handles ${VAR} and ${VAR:-default} natively; well-tested, POSIX-standard |
| CA certificate generation | Custom Rust binary | openssl CLI in entrypoint | One-liner, well-understood, no additional binary needed |
| Database readiness waiting | Custom wait-for-it scripts | Docker Compose depends_on + healthcheck | Native Docker Compose feature; no third-party scripts needed |
| S3-compatible local storage | Custom file server | MinIO | De facto standard, API-compatible with AWS S3, zero code changes needed |

**Key insight:** Docker Compose's native `depends_on` with `condition: service_healthy` eliminates the need for wait-for-it scripts or custom retry logic in entrypoints. The infrastructure handles service readiness.

## Common Pitfalls

### Pitfall 1: Evidence Collector Has No Env Var Support
**What goes wrong:** The `CollectorConfig::default()` in `crates/evidence-collector/src/config.rs` returns hardcoded values (grpc_listen_addr = "[::1]:50051", clickhouse_url = "http://localhost:8123", etc.) with zero env var reading. Docker Compose relies on env vars for configuration.
**Why it happens:** The evidence collector was developed for local development where defaults suffice.
**How to avoid:** Add env var reading to `CollectorConfig::default()` or add a `CollectorConfig::from_env()` constructor. Read `COLLECTOR_GRPC_LISTEN_ADDR`, `CLICKHOUSE_URL`, `CLICKHOUSE_DATABASE`, `COLLECTOR_S3_BUCKET`, `COLLECTOR_S3_REGION`, `COLLECTOR_SIGNING_MODE`, `COLLECTOR_SIGNING_KEY_PATH` from environment with fallbacks to current defaults.
**Warning signs:** Evidence collector container starts but can't connect to ClickHouse or MinIO because it's using localhost addresses.

### Pitfall 2: gRPC Listen Address Binding in Docker
**What goes wrong:** The evidence collector defaults to `[::1]:50051` (IPv6 loopback). Inside a Docker container, this means only connections from within the same container work -- the kernel container can't reach it.
**Why it happens:** `[::1]` is loopback; Docker networking requires binding to `0.0.0.0` or `[::]` for inter-container communication.
**How to avoid:** Set the default Docker listen address to `[::]:50051` or `0.0.0.0:50051` via env var. Similarly, the kernel's evidence collector addr env var (`INTERDICT_EVIDENCE_COLLECTOR_ADDR`) must point to the Docker service name (e.g., `http://evidence-collector:50051`).
**Warning signs:** "connection refused" errors in kernel logs when trying to send evidence bundles.

### Pitfall 3: Cargo Workspace Build Context
**What goes wrong:** Building kernel or evidence-collector Dockerfile with wrong build context. The Rust workspace root is `/` (repo root) with `Cargo.toml` workspace members in `crates/`. The Dockerfiles need the full workspace context including `proto/` directory for protobuf compilation.
**Why it happens:** Each service is in `crates/<service>/` but needs the workspace-level Cargo.toml, Cargo.lock, other crate directories, and proto/ files.
**How to avoid:** Set Docker build context to repo root (`.`) in docker-compose.yml and use `dockerfile: docker/kernel/Dockerfile` to specify the Dockerfile location. The Dockerfile operates from the workspace root.
**Warning signs:** Build failures about missing Cargo.toml, missing proto files, or "package not found in workspace".

### Pitfall 4: aws-lc-rs Build Dependencies
**What goes wrong:** The kernel depends on `rustls` with `aws_lc_rs` feature, which requires cmake and a C compiler for building the AWS-LC cryptographic library.
**Why it happens:** `aws-lc-rs` compiles C/assembly code during `cargo build`. The cargo-chef base image (based on `rust:1-bookworm` which is based on `buildpack-deps:bookworm`) should include cmake, but if not, the build will fail.
**How to avoid:** Verify the build stage has cmake installed. If the cargo-chef image lacks it, add `RUN apt-get update && apt-get install -y cmake` before the cook/build stages.
**Warning signs:** Compilation errors mentioning "cmake" or "aws-lc-sys" during Docker build.

### Pitfall 5: ClickHouse Schema Race Condition
**What goes wrong:** The control plane tries to query ClickHouse before the evidence collector has created the schema (tables + materialized views).
**Why it happens:** The evidence collector runs DDL in `initialize_schema()` during its startup. If the control plane queries ClickHouse before the collector starts, tables won't exist.
**How to avoid:** This is actually not a problem for Docker Compose because: (a) ClickHouse is a direct dependency of both services, (b) the control plane only reads from ClickHouse when API requests come in, not at startup, and (c) the evidence collector creates schema on startup before accepting gRPC connections. However, if needed, make the evidence collector a dependency of the control plane.
**Warning signs:** "Table interdict.evidence_bundles doesn't exist" errors in control plane logs during API queries.

### Pitfall 6: Named Volume Permissions
**What goes wrong:** Named volumes are created with root ownership but the container process runs as a non-root user, causing permission denied errors.
**Why it happens:** Docker creates named volumes owned by root. If the container runs as a non-root user, it can't write to the volume.
**How to avoid:** Either (a) chown the volume mount point in the entrypoint before dropping privileges, or (b) create the directories and set ownership in the Dockerfile before the USER directive, or (c) run the entrypoint as root, do file operations, then exec as non-root.
**Warning signs:** "Permission denied" when writing to /data/certs, /data/keys, or similar volume mount points.

### Pitfall 7: MinIO Bucket Auto-Creation
**What goes wrong:** The evidence collector tries to write Merkle anchors to an S3 bucket that doesn't exist yet.
**Why it happens:** MinIO starts with no buckets; they must be created explicitly.
**How to avoid:** Use MinIO's `MINIO_DEFAULT_BUCKETS` environment variable (if supported by the version) or add an init command using `mc` (MinIO client) in a one-shot init container or entrypoint script that creates the bucket idempotently.
**Warning signs:** S3 "NoSuchBucket" errors in evidence collector logs.

## Code Examples

### Kernel TOML Template
```toml
# interdict.toml.template -- generated by entrypoint from env vars
[proxy]
listen_addr = "${KERNEL_LISTEN_ADDR:-0.0.0.0:8443}"
connect_timeout_ms = ${KERNEL_CONNECT_TIMEOUT_MS:-10000}
first_byte_timeout_ms = ${KERNEL_FIRST_BYTE_TIMEOUT_MS:-30000}
stream_timeout_ms = ${KERNEL_STREAM_TIMEOUT_MS:-300000}
max_request_queue = ${KERNEL_MAX_REQUEST_QUEUE:-1024}

[tls]
ca_cert_path = "${KERNEL_CA_CERT_PATH:-/data/certs/ca.crt}"
ca_key_path = "${KERNEL_CA_KEY_PATH:-/data/certs/ca.key}"

[pool]
max_connections_per_vendor = ${KERNEL_POOL_MAX_CONNECTIONS:-4}
max_streams_per_connection = ${KERNEL_POOL_MAX_STREAMS:-100}
idle_timeout_ms = ${KERNEL_POOL_IDLE_TIMEOUT:-60000}

[allowlist]
vendors = ${KERNEL_ALLOWLIST_VENDORS:-["api.openai.com","api.anthropic.com"]}

[logging]
level = "${KERNEL_LOG_LEVEL:-info}"
format = "${KERNEL_LOG_FORMAT:-json}"

[policy.distribution]
distribution_addr = "${KERNEL_DISTRIBUTION_ADDR:-http://control-plane:50052}"
org_id = "${KERNEL_ORG_ID:-default}"
```

### Docker Compose Health Checks
```yaml
# Source: https://docs.docker.com/compose/how-tos/startup-order/ (verified 2026-03-02)
services:
  postgres:
    image: postgres:17-bookworm
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U interdict -d interdict"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  clickhouse:
    image: clickhouse/clickhouse-server:25.1
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8123/ping"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  minio:
    image: minio/minio
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
```

### .dockerignore
```
# Build artifacts
target/
node_modules/
dist/
.bun/

# IDE / OS
.idea/
.vscode/
.DS_Store
*.swp

# Development files
.claude/
.planning/
.git/
*.md
!README.md

# Environment / secrets
.env
.env.*
!env.example
*.key
*.pem
*.crt
*.p12
credentials.json

# Runtime data
data/
logs/
coverage/
```

### Evidence Collector Env Var Config (Required Addition)
```rust
// Proposed change to crates/evidence-collector/src/config.rs
impl CollectorConfig {
    pub fn from_env() -> Self {
        let signing_mode = match std::env::var("COLLECTOR_SIGNING_MODE")
            .unwrap_or_else(|_| "dev".to_string())
            .as_str()
        {
            "file" => SigningMode::File(
                std::env::var("COLLECTOR_SIGNING_KEY_PATH")
                    .unwrap_or_else(|_| "/data/keys/signing.key".to_string())
                    .into(),
            ),
            "kms" => SigningMode::Kms(
                std::env::var("COLLECTOR_KMS_KEY_ID")
                    .expect("COLLECTOR_KMS_KEY_ID required when signing_mode=kms"),
            ),
            _ => SigningMode::Dev,
        };

        Self {
            grpc_listen_addr: std::env::var("COLLECTOR_GRPC_LISTEN_ADDR")
                .unwrap_or_else(|_| "[::]:50051".to_string()),
            clickhouse_url: std::env::var("CLICKHOUSE_URL")
                .unwrap_or_else(|_| "http://localhost:8123".to_string()),
            clickhouse_database: std::env::var("CLICKHOUSE_DATABASE")
                .unwrap_or_else(|_| "interdict".to_string()),
            s3_bucket: std::env::var("COLLECTOR_S3_BUCKET")
                .unwrap_or_default(),
            s3_region: std::env::var("COLLECTOR_S3_REGION")
                .unwrap_or_default(),
            signing_mode,
            merkle_window_secs: std::env::var("COLLECTOR_MERKLE_WINDOW_SECS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(3600),
            merkle_max_leaves: std::env::var("COLLECTOR_MERKLE_MAX_LEAVES")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(1_000_000),
            full_text_storage: std::env::var("COLLECTOR_FULL_TEXT_STORAGE")
                .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false),
            retention_days: std::env::var("COLLECTOR_RETENTION_DAYS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(2555),
        }
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Cargo.toml copy | cargo-chef prepare/cook | 2020+ | 5x faster Rust Docker builds; handles workspaces natively |
| docker-compose v2 format | Compose Specification (services top-level) | 2023 | `version:` key deprecated; services at top level is standard |
| wait-for-it.sh scripts | depends_on + condition: service_healthy | Docker Compose v2.1+ | Native health-based startup ordering; no third-party scripts |
| MINIO_ACCESS_KEY/SECRET_KEY | MINIO_ROOT_USER/ROOT_PASSWORD | MinIO 2021+ | Old env vars deprecated; new names required |

**Deprecated/outdated:**
- `version: "3.x"` in docker-compose.yml: The `version` key is deprecated in the Compose Specification. Omit it entirely.
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`: Replaced by `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`.
- `links:` in docker-compose.yml: Replaced by Docker network DNS-based service discovery (services can reference each other by name).

## Open Questions

1. **Dashboard Image Content**
   - What we know: DEPLOY-01 requires all four service images, but the dashboard (Phase 9) doesn't exist yet
   - What's unclear: Whether to build a real placeholder or a minimal nginx "coming soon" page
   - Recommendation: Create a minimal nginx-based image that serves a static HTML page saying "Interdict Dashboard - Coming in Phase 9". This satisfies DEPLOY-01 and provides a health-checkable endpoint. Phase 9 replaces this with the real build.

2. **MinIO Bucket Creation Strategy**
   - What we know: MinIO starts without buckets; evidence collector needs a bucket for Merkle anchors
   - What's unclear: Whether `MINIO_DEFAULT_BUCKETS` env var is supported in current MinIO or if mc CLI is needed
   - Recommendation: Use a lightweight init container (`minio/mc`) that runs `mc mb --ignore-existing local/interdict-evidence` after MinIO is healthy. This is the most reliable cross-version approach.

3. **TOML Array Substitution via envsubst**
   - What we know: envsubst handles simple ${VAR} substitution well, but the kernel's `allowlist.vendors` is a TOML array
   - What's unclear: Whether envsubst can reliably handle JSON-like array values inside TOML
   - Recommendation: Set the env var as a JSON array string (e.g., `KERNEL_ALLOWLIST_VENDORS='["api.openai.com","api.anthropic.com"]'`). TOML supports inline arrays which look identical to JSON arrays. Test this pattern during implementation.

4. **aws-lc-rs Build Dependencies in cargo-chef Image**
   - What we know: The kernel uses rustls with aws_lc_rs which needs cmake; the cargo-chef image is based on rust:1-bookworm (buildpack-deps:bookworm) which typically includes cmake
   - What's unclear: Whether cmake is definitely included in the cargo-chef image or needs explicit installation
   - Recommendation: Test the build first; if cmake is missing, add `RUN apt-get update && apt-get install -y cmake` before the cook stage. The protobuf compilation also uses `protoc-bin-vendored` which vendors protoc, so no system protobuf is needed.

## Sources

### Primary (HIGH confidence)
- [cargo-chef GitHub](https://github.com/LukeMathWalker/cargo-chef) - Multi-stage build pattern, workspace support, version 0.1.75
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) - depends_on + service_healthy pattern
- [Docker Compose services reference](https://docs.docker.com/reference/compose-file/services/) - HEALTHCHECK, volumes, networks
- [Bun Docker guide](https://bun.com/docs/guides/ecosystem/docker) - Official oven/bun image, multi-stage patterns
- [OPA releases](https://github.com/open-policy-agent/opa/releases) - v1.14.0 latest, binary download URL pattern
- [ClickHouse Docker Hub](https://hub.docker.com/r/clickhouse/clickhouse-server/) - /docker-entrypoint-initdb.d, healthcheck with /ping

### Secondary (MEDIUM confidence)
- [Depot.dev Rust Dockerfile](https://depot.dev/docs/container-builds/how-to-guides/optimal-dockerfiles/rust-dockerfile) - cargo-chef + sccache patterns
- [MinIO Docker configuration](https://github.com/minio/minio/blob/master/docs/docker/README.md) - Environment variables, bucket creation
- [aws-lc-rs build requirements](https://github.com/aws/aws-lc-rs) - cmake, C compiler dependencies

### Tertiary (LOW confidence)
- MinIO `MINIO_DEFAULT_BUCKETS` support - varies by version; mc CLI is more reliable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - cargo-chef, Docker Compose, and base images are well-documented and widely used
- Architecture: HIGH - Multi-stage builds and healthcheck patterns are established Docker best practices
- Pitfalls: HIGH - Identified from direct codebase analysis (evidence collector env vars, gRPC binding, workspace context)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable domain, tools don't change frequently)
