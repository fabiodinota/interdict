---
id: S02
parent: M002
milestone: M002
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S02: Container Images Docker Compose

**# Phase 8 Plan 01: Container Images Summary**

## What Happened

# Phase 8 Plan 01: Container Images Summary

**Multi-stage Dockerfiles for all four Interdict services with cargo-chef caching, envsubst TOML templating, auto-CA-cert generation, and comprehensive env.example**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T00:58:49Z
- **Completed:** 2026-03-02T01:01:46Z
- **Tasks:** 2
- **Files created:** 11

## Accomplishments
- All four services (kernel, evidence collector, control plane, dashboard) packaged as buildable container images
- Kernel entrypoint handles first-boot setup: env var defaults, TOML config generation via envsubst, self-signed CA cert auto-generation
- env.example documents 45 configuration variables grouped by service with inline comments, serving as single source of truth for Docker Compose and future Helm values
- .dockerignore prevents secrets, build artifacts, and dev files from entering Docker build context

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Rust service Dockerfiles and entrypoint scripts** - `7e08d99` (feat)
2. **Task 2: Create control plane Dockerfile, dashboard placeholder, env.example, and .dockerignore** - `0a43721` (feat)

## Files Created/Modified
- `docker/kernel/Dockerfile` - 4-stage cargo-chef build for kernel binary with cmake for aws-lc-rs
- `docker/kernel/entrypoint.sh` - Env var defaults, envsubst TOML generation, CA cert auto-gen, exec binary
- `docker/kernel/interdict.toml.template` - 18 ${VAR} placeholders matching interdict.toml structure
- `docker/evidence-collector/Dockerfile` - 4-stage cargo-chef build for interdict-collector binary
- `docker/evidence-collector/entrypoint.sh` - Simple exec (env vars handled in Rust code)
- `docker/control-plane/Dockerfile` - oven/bun:1-slim with OPA v1.4.2, proto files, bun install
- `docker/control-plane/entrypoint.sh` - drizzle migrate, seed, exec bun start
- `docker/dashboard/Dockerfile` - nginx:1-bookworm placeholder with HEALTHCHECK
- `docker/dashboard/index.html` - Static placeholder page
- `env.example` - 121-line config reference (45 vars) covering all services
- `.dockerignore` - Excludes target/, .env, secrets, .git/, .planning/

## Decisions Made
- Used bare `${VAR}` placeholders in TOML template with shell defaults (`: "${VAR:=default}"`) set in entrypoint before envsubst call, because envsubst does not evaluate `:-default` syntax
- Control plane runs as default image user (not non-root) to avoid permission complexity with volume mounts for migrations; Helm chart (Phase 12) will enforce security contexts
- Proto files placed at `/proto/` in control plane image to match the `../../../../proto/` relative path resolution from the gRPC distribution module's `__dirname`
- OPA version pinned to v1.4.2 via Dockerfile ARG for reproducible builds
- Omitted HEALTHCHECK from Rust service Dockerfiles since kernel (TLS proxy) and collector (gRPC) cannot serve HTTP health endpoints; health checks defined at docker-compose level instead
- Added cmake to kernel builder stage since aws-lc-rs (via rustls) requires it for C compilation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four service Dockerfiles ready for docker-compose.yml (Plan 02) to reference
- env.example provides complete configuration template for `cp env.example .env && docker compose up`
- Entrypoint scripts handle all first-boot automation (CA certs, migrations, seeds)

## Self-Check: PASSED

All 11 created files verified on disk. Both task commits (7e08d99, 0a43721) verified in git log.

---
*Phase: 08-container-images-docker-compose*
*Completed: 2026-03-02*

# Phase 8 Plan 02: Docker Compose Summary

**Environment variable config for evidence collector and docker-compose.yml orchestrating 8 services with health-based startup ordering, MinIO bucket init, and 5 named volumes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T01:04:27Z
- **Completed:** 2026-03-02T01:07:58Z
- **Tasks:** 2
- **Files created/modified:** 3

## Accomplishments
- CollectorConfig::from_env() reads 12 environment variables with sensible defaults, enabling Docker-based configuration without code changes
- docker-compose.yml defines the complete Interdict stack: 3 infrastructure services, 4 application services, 1 init container
- Health-based startup ordering prevents race conditions: infra must be healthy before app services start, control-plane must be healthy before kernel starts
- MinIO bucket auto-created by minio-init container before evidence collector starts (service_completed_successfully condition)
- Only 3 ports exposed to host network: kernel proxy (8443), control plane API (3000), dashboard (8080)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add from_env() constructor to evidence collector CollectorConfig** - `8b2c6ed` (test, RED), `27a4e69` (feat, GREEN)
2. **Task 2: Create docker-compose.yml with full stack orchestration** - `3ea24f1` (feat)

_Note: Task 1 used TDD with separate RED (test) and GREEN (feat) commits_

## Files Created/Modified
- `crates/evidence-collector/src/config.rs` - Added from_env() method reading 12 COLLECTOR_*/CLICKHOUSE_* env vars; 5 unit tests for defaults, overrides, signing modes, and boolean parsing
- `crates/evidence-collector/src/main.rs` - Changed CollectorConfig::default() to CollectorConfig::from_env()
- `docker-compose.yml` - Full stack orchestration: postgres, clickhouse, minio, minio-init, control-plane, evidence-collector, kernel, dashboard with health checks, volumes, and startup ordering

## Decisions Made
- Removed `env_file: .env` from kernel service to prevent unexpected variable leaking; all services use explicit `environment:` blocks with `${VAR:-default}` syntax
- Used `unsafe` blocks for `set_var`/`remove_var` in tests due to Rust 2024 edition safety requirements; tests run with `--test-threads=1` to prevent data races
- Exposed dashboard on port 8080:80 for development convenience (in addition to the mandated kernel 8443 and control-plane 3000)
- Used `$$` shell escaping in minio-init entrypoint to prevent Docker Compose from interpolating shell variables meant for runtime

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrapped env var mutations in unsafe blocks for Rust 2024 edition**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Rust 2024 edition marks `std::env::set_var` and `std::env::remove_var` as unsafe functions; tests failed to compile
- **Fix:** Wrapped all `set_var`/`remove_var` calls in `unsafe` blocks with SAFETY comments; added `clear_collector_env()` helper function
- **Files modified:** crates/evidence-collector/src/config.rs
- **Verification:** All 5 tests pass with --test-threads=1; clippy clean
- **Committed in:** 27a4e69 (part of Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary adaptation for Rust 2024 edition. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete Docker deployment stack ready: `cp env.example .env && docker compose up`
- All four service Dockerfiles (from Plan 01) wired into compose with proper health ordering
- Phase 8 complete -- ready for Phase 9 (Dashboard) or Phase 10 (Advanced Auth)
- Evidence collector now configurable via environment variables for any deployment context

## Self-Check: PASSED

All 3 created/modified files verified on disk. All 3 task commits (8b2c6ed, 27a4e69, 3ea24f1) verified in git log.

---
*Phase: 08-container-images-docker-compose*
*Completed: 2026-03-02*
