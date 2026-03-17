---
phase: 06-policy-distribution-kernel-integration
plan: 03
subsystem: api
tags: [grpc, grpc-js, proto-loader, policy-distribution, server-streaming, kernel-tracker, broadcast]

# Dependency graph
requires:
  - phase: 05-control-plane-api-core
    provides: "Elysia HTTP server, compiler worker, policies/policyVersions schema, config"
  - phase: 06-policy-distribution-kernel-integration
    plan: 01
    provides: "PolicyDistribution proto schema (Subscribe/Acknowledge RPCs)"
provides:
  - "gRPC PolicyDistribution server with Subscribe (server-streaming) and Acknowledge (unary) RPCs"
  - "KernelTracker for managing connected kernel connections with register/unregister/acknowledge"
  - "broadcastUpdate for pushing policy updates to all connected kernel streams"
  - "Full snapshot builder querying compiled policies from DB + filesystem wasm files"
  - "Compiler worker delta broadcast hook after successful compilation"
  - "Graceful gRPC server shutdown on SIGINT/SIGTERM"
affects: [06-04-integration-tests, 07-auth-rbac]

# Tech tracking
tech-stack:
  added: ["@grpc/grpc-js 1.14", "@grpc/proto-loader 0.7"]
  patterns: [gRPC server-streaming for real-time policy push, singleton KernelTracker with Map-based connection registry, proto-loader dynamic proto loading]

key-files:
  created:
    - control-plane/src/modules/distribution/server.ts
    - control-plane/src/modules/distribution/tracker.ts
    - control-plane/src/modules/distribution/index.ts
  modified:
    - control-plane/package.json
    - control-plane/bun.lock
    - control-plane/src/config.ts
    - control-plane/src/modules/compiler/worker.ts
    - control-plane/src/index.ts

key-decisions:
  - "v1 scope limitation: all policies sent with org-level scope; per-department/team scope deferred to Phase 7 (requires policy_scope_assignments join table)"
  - "Global version counter uses MAX(policyVersions.version) WHERE compilationStatus='compiled' instead of Date.now() for monotonic ordering"
  - "Full snapshot always sent on Subscribe (even if kernel reports current_version > 0) for v1 simplicity; delta optimization deferred"
  - "Broadcast failure in compiler worker is non-fatal: logged but does not fail the compilation"
  - "Insecure gRPC credentials for v1; mTLS deferred to Phase 7"

patterns-established:
  - "gRPC distribution server pattern: proto-loader dynamic loading + server-streaming for real-time push"
  - "Broadcast-on-compile pattern: compiler worker triggers broadcastUpdate after successful compilation"
  - "Kernel lifecycle pattern: register on Subscribe, unregister on disconnect/error, acknowledge on ACK/NACK"

requirements-completed: [CTRL-03]

# Metrics
duration: 4m11s
completed: 2026-03-01
---

# Phase 6 Plan 03: Control Plane Distribution Server Summary

**gRPC server-streaming distribution server with KernelTracker, full snapshot builder, and compiler-triggered delta broadcast to connected kernels**

## Performance

- **Duration:** 4m 11s
- **Started:** 2026-03-01T05:14:47Z
- **Completed:** 2026-03-01T05:18:58Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- gRPC PolicyDistribution server binds to configurable port (default 50052) with Subscribe and Acknowledge RPCs
- KernelTracker manages connected kernel lifecycle: register, unregister, acknowledge, broadcast
- Full snapshot builder queries all active compiled policies from DB and reads wasm bytes from filesystem
- Compiler worker automatically broadcasts delta updates to all connected kernels after successful compilation
- Control plane starts gRPC server alongside Elysia HTTP server with graceful shutdown on SIGINT/SIGTERM

## Task Commits

Each task was committed atomically:

1. **Task 1: Build gRPC distribution server and kernel tracker** - `82f084c` (feat)
2. **Task 2: Wire distribution into compiler worker and app startup** - `2d3c194` (feat)

## Files Created/Modified
- `control-plane/src/modules/distribution/server.ts` - gRPC server with Subscribe (server-streaming) and Acknowledge (unary) handlers, full snapshot builder
- `control-plane/src/modules/distribution/tracker.ts` - KernelTracker class managing connections Map, broadcastUpdate function
- `control-plane/src/modules/distribution/index.ts` - Module re-exports for server and tracker APIs
- `control-plane/package.json` - Added @grpc/grpc-js and @grpc/proto-loader dependencies
- `control-plane/bun.lock` - Updated lockfile with gRPC dependencies
- `control-plane/src/config.ts` - Added grpcPort (default 50052) and grpcMaxMessageSize (default 16MB) config fields
- `control-plane/src/modules/compiler/worker.ts` - Added broadcastUpdate call after successful compilation with policy name lookup
- `control-plane/src/index.ts` - Start gRPC distribution server, add to MODULES, graceful shutdown handlers

## Decisions Made
- v1 scope limitation: all policies sent with org-level scope (dept_id="" and team_id="" means org-wide). Per-department/team scope population from the database is deferred to Phase 7 (requires a policy_scope_assignments join table).
- Global version counter uses MAX(policyVersions.version) WHERE compilationStatus='compiled' as the monotonic counter, not Date.now(), to avoid collisions on rapid compilations.
- Full snapshot always sent on initial Subscribe (even if kernel reports current_version > 0) for v1 simplicity.
- Broadcast failure in compiler worker is non-fatal: logged as error but does not fail the compilation itself.
- Insecure gRPC credentials used for v1; mTLS authentication deferred to Phase 7.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- gRPC distribution server ready for kernel client connections (Plan 02 distribution client)
- broadcastUpdate hook in compiler ensures real-time push on policy changes
- KernelTracker API available for monitoring and management
- Proto schema (from Plan 01) matched by server implementation
- Integration tests (Plan 04) can verify Subscribe/Acknowledge round-trip

## Self-Check: PASSED

All 8 created/modified files verified present. Both task commits (82f084c, 2d3c194) verified in git log.

---
*Phase: 06-policy-distribution-kernel-integration*
*Completed: 2026-03-01*
