---
phase: 05-control-plane-api-core
plan: 01
subsystem: api
tags: [bun, elysia, drizzle, postgres, clickhouse, typebox, typescript]

# Dependency graph
requires:
  - phase: 04-evidence-collector
    provides: ClickHouse evidence_bundles table schema and materialized views
provides:
  - Bun + Elysia server with health check endpoint
  - PostgreSQL schema (10 tables) via Drizzle ORM with migration
  - ClickHouse client singleton for audit trail queries
  - Shared utilities (error classes, API response envelope, cursor pagination)
  - Environment config with OPA binary detection
affects: [05-02, 05-03, 05-04, 06-policy-distribution, 07-identity-access]

# Tech tracking
tech-stack:
  added: [bun, elysia, drizzle-orm, drizzle-kit, drizzle-typebox, postgres.js, "@clickhouse/client", "@sinclair/typebox"]
  patterns: [elysia-decorator-injection, drizzle-schema-as-code, global-onError-handler, structured-api-envelope, cursor-pagination]

key-files:
  created:
    - control-plane/package.json
    - control-plane/tsconfig.json
    - control-plane/bunfig.toml
    - control-plane/drizzle.config.ts
    - control-plane/.env.example
    - control-plane/src/index.ts
    - control-plane/src/config.ts
    - control-plane/src/db/postgres.ts
    - control-plane/src/db/clickhouse.ts
    - control-plane/src/db/schema/policies.ts
    - control-plane/src/db/schema/vendors.ts
    - control-plane/src/db/schema/regulatory.ts
    - control-plane/src/db/schema/organization.ts
    - control-plane/src/db/schema/index.ts
    - control-plane/src/shared/utilities.ts
    - control-plane/src/db/migrations/0000_curvy_chronomancer.sql
  modified: []

key-decisions:
  - "TypeBox pinned to 0.34.x (not 0.32.x from research) to match Elysia 1.4.26 t.Module requirement"
  - "Wasm stored on filesystem with DB reference (path + SHA-256 hash) per discretion recommendation"
  - "Consolidated shared utilities into single file (errors + envelope + pagination) for simpler imports"
  - "postgres.js pool max: 20 with explicit idle and connect timeouts"

patterns-established:
  - "Elysia decorator injection: db and clickhouse injected via .decorate()"
  - "Global onError handler maps AppError subclasses to HTTP status codes + structured JSON"
  - "API response envelope: { success, data, meta? } for success, { success, error: { code, message, details? } } for errors"
  - "Cursor pagination: Base64url-encoded timestamp|id with DEFAULT_PAGE_SIZE=50, MAX_PAGE_SIZE=200"
  - "Schema-as-code: Drizzle table definitions in src/db/schema/ with index.ts barrel export"

requirements-completed: [CTRL-10, CTRL-11]

# Metrics
duration: 4m29s
completed: 2026-03-01
---

# Phase 5 Plan 01: Project Scaffold Summary

**Bun + Elysia control plane scaffold with PostgreSQL schemas (10 tables), ClickHouse client, and shared API utilities**

## Performance

- **Duration:** 4m 29s
- **Started:** 2026-03-01T04:08:56Z
- **Completed:** 2026-03-01T04:13:25Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Elysia server starts and responds to health check with structured JSON on configured port
- PostgreSQL schema covers all 4 domains: policies (with full version history), vendors (per-model control), regulatory frameworks (additive activation), organization (departments/teams/users)
- ClickHouse client configured for read-only access to evidence_bundles and materialized views
- Shared utilities provide type-safe error hierarchy, consistent API envelope, and cursor pagination
- Drizzle migration SQL generated with 10 tables, foreign keys, and unique indexes
- OPA binary presence check runs at startup with clear warning if missing

## Task Commits

Each task was committed atomically:

1. **Task 1: Project scaffold with Bun + Elysia and database connections** - `83bdf48` (feat)
2. **Task 2: Database schemas and shared utilities** - `8131bd4` (feat)

## Files Created/Modified
- `control-plane/package.json` - Dependencies, scripts, TypeBox version override
- `control-plane/tsconfig.json` - Strict TypeScript with path aliases
- `control-plane/bunfig.toml` - Bun configuration
- `control-plane/drizzle.config.ts` - Drizzle-kit migration configuration
- `control-plane/.env.example` - Environment variable documentation
- `control-plane/src/index.ts` - Elysia app entry point with health check and global error handler
- `control-plane/src/config.ts` - Environment config loading with OPA binary detection
- `control-plane/src/db/postgres.ts` - Drizzle ORM + postgres.js connection with pooling
- `control-plane/src/db/clickhouse.ts` - ClickHouse client singleton
- `control-plane/src/db/schema/policies.ts` - policies + policy_versions tables with compilation_status enum
- `control-plane/src/db/schema/vendors.ts` - vendors + vendor_models tables
- `control-plane/src/db/schema/regulatory.ts` - frameworks + framework_policies + framework_activations tables
- `control-plane/src/db/schema/organization.ts` - departments + teams + users tables
- `control-plane/src/db/schema/index.ts` - Barrel export of all schemas
- `control-plane/src/shared/utilities.ts` - Error classes, API envelope, cursor pagination
- `control-plane/src/db/migrations/0000_curvy_chronomancer.sql` - Initial migration SQL

## Decisions Made
- **TypeBox 0.34.x instead of 0.32.x:** Elysia 1.4.26 requires `@sinclair/typebox >= 0.34.0` for `t.Module` support. The research doc recommended 0.32.4 based on an older Elysia version; updated to match actual peer dependency.
- **Filesystem + DB reference for Wasm storage:** Following the discretion recommendation, compiled Wasm bytes stored at `data/wasm/{policy_id}/{version}.wasm` with path + SHA-256 hash in `policy_versions` table. Avoids MVCC overhead on binary blobs.
- **Single utilities file:** Consolidated error classes, response envelope, and pagination into `shared/utilities.ts` instead of 3 separate files, as the plan specified a single file approach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated TypeBox from 0.32.4 to 0.34.x**
- **Found during:** Task 1 (Project scaffold)
- **Issue:** Elysia 1.4.26 requires `@sinclair/typebox >= 0.34.0` for `t.Module`. The research recommended 0.32.4 which is incompatible, causing `TypeError: t.Module is not a function` at startup.
- **Fix:** Updated package.json dependency and overrides from `0.32.4` to `^0.34.0`. Resolved to 0.34.48.
- **Files modified:** control-plane/package.json
- **Verification:** Server starts successfully, health check returns 200
- **Committed in:** 83bdf48 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** TypeBox version update was essential for Elysia compatibility. No scope creep.

## Issues Encountered
None beyond the TypeBox version mismatch documented above.

## User Setup Required
None - no external service configuration required. PostgreSQL and ClickHouse connections use sensible defaults from .env.example.

## Next Phase Readiness
- Server scaffold ready for module plugins (policies, vendors, regulatory, audit)
- All database schemas defined and migration generated
- Shared utilities available for all API modules
- Plan 05-02 can build policy CRUD and vendor registry on this foundation

## Self-Check: PASSED

All 17 created files verified present on disk. Both task commits (83bdf48, 8131bd4) verified in git log.

---
*Phase: 05-control-plane-api-core*
*Completed: 2026-03-01*
