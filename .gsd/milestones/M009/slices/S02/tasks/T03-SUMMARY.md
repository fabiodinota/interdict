---
id: T03
parent: S02
milestone: M009
provides:
  - ALLOW_DEV_DEFAULTS env var gating for all control-plane dev fallbacks
  - signing_keys volume read-only in Docker Compose (both control-plane and evidence-collector)
  - All test compose ports bound to 127.0.0.1
key_files:
  - control-plane/src/config.ts
  - control-plane/src/config.test.ts
  - docker-compose.yml
  - docker-compose.test.yml
key_decisions:
  - Moved isProduction inside loadConfig() so tests can exercise both dev and production paths by setting NODE_ENV before each call
  - devFallback helper is a closure inside loadConfig(), evaluated per-call — matches the pattern where allowDevDefaults is computed from env vars at call time
patterns_established:
  - devFallback(value) pattern for gating dev-only defaults behind ALLOW_DEV_DEFAULTS=true
observability_surfaces:
  - "Missing required env vars produce 'Required environment variable <NAME> is not set' on stderr at startup"
  - "Read-only volume violations produce EROFS errors in container logs"
duration: 20m
verification_result: passed
blocker_discovered: false
completed_at: 2025-03-16
---

# T03: Gate dev DB fallback behind ALLOW_DEV_DEFAULTS and harden Docker Compose

**Dev fallbacks in config.ts now require `ALLOW_DEV_DEFAULTS=true`, signing_keys volumes are read-only, and test compose ports bind to localhost only.**

## What Happened

Gated all five dev fallback values in `loadConfig()` (DATABASE_URL, CLICKHOUSE_URL, CLICKHOUSE_DATABASE, WASM_STORAGE_DIR, OPA_BINARY_PATH) behind `ALLOW_DEV_DEFAULTS=true`. Moved `isProduction` from module scope into `loadConfig()` so tests can exercise both dev and production code paths by manipulating `NODE_ENV` before each call. Added a `devFallback()` closure that returns the fallback value only when `!isProduction && ALLOW_DEV_DEFAULTS === "true"`, otherwise `undefined` — causing `requireEnv` to throw.

Updated all existing tests that relied on unconditional fallbacks to set `ALLOW_DEV_DEFAULTS=true`. Added 5 new tests in an `ALLOW_DEV_DEFAULTS gating` describe block covering: dev throw without flag, dev fallback with flag, production ignoring flag, all fallback values applied, and cascading throw for CLICKHOUSE_URL.

Made `signing_keys:/data/keys:ro` in both control-plane and evidence-collector volumes in `docker-compose.yml`. Prefixed all 6 port mappings in `docker-compose.test.yml` with `127.0.0.1:`.

## Verification

- `bun test src/config.test.ts` — 16/16 pass (0 fail), including 5 new ALLOW_DEV_DEFAULTS tests
- `bun test` (full suite) — 227 pass, 28 fail (all pre-existing: missing drizzle-orm, elysia, @grpc/grpc-js, samlify deps)
- `docker compose config` — exits 0 (with env.example as .env)
- `docker compose -f docker-compose.yml -f docker-compose.test.yml config` — exits 0
- `grep "signing_keys:/data/keys:ro" docker-compose.yml` — matches lines 194, 260 (control-plane and evidence-collector)
- `grep "127.0.0.1:" docker-compose.test.yml` — matches all 6 port mappings (15432, 18123, 19000, 19001, 13001, 18443)

Slice-level verification (final task — all checks):
- ✅ `npx vitest run` — 400/400 dashboard tests pass (T01 proxy tests included)
- ✅ `bun test` — config tests pass (T03); pre-existing failures unrelated
- ✅ `helm lint helm/interdict` — 0 charts failed (T02)
- ⚠️ `helm template` — cannot run due to missing subchart deps in `charts/` (pre-existing)
- ✅ `docker compose config` — validates
- ✅ `docker compose -f ... -f ... config` — validates
- ✅ `readOnly: true` in evidence-collector Helm deployment — 2 matches (T02)
- ✅ `signing_keys:/data/keys:ro` in docker-compose.yml — 2 matches
- ✅ `127.0.0.1:` in docker-compose.test.yml — all 6 port lines

## Diagnostics

- **Config startup failure:** Run the control-plane without `DATABASE_URL` or `ALLOW_DEV_DEFAULTS` — stderr shows `Required environment variable DATABASE_URL is not set`.
- **Dev fallback active:** Set `ALLOW_DEV_DEFAULTS=true` with `NODE_ENV` unset/not `production` — `loadConfig()` returns fallback values silently.
- **Volume write rejection:** If a container writes to `signing_keys` mount, container logs show `EROFS` errors.
- **Port binding:** `docker compose config` output shows `127.0.0.1:` prefix on all test ports.

## Deviations

- Moved `isProduction` from module scope to inside `loadConfig()`. The plan suggested keeping it at module scope, but that makes it impossible to test production mode since the const is frozen at import time. Moving it inside the function preserves the same security property (evaluated once per config load) while enabling full test coverage of both paths.
- Added `ALLOW_DEV_DEFAULTS` to the `keysToRestore` array in existing tests and set it in tests that need fallbacks. The plan mentioned updating existing tests but didn't specify the scope — all tests calling `loadConfig()` without explicit env vars needed the flag.

## Known Issues

- `helm template` cannot be verified locally due to missing subchart dependencies (postgresql, clickhouse, minio) in `charts/` directory. `helm lint` passes, which validates template syntax. This is pre-existing and not caused by this task.
- 28 pre-existing test failures in `bun test` from missing npm packages (drizzle-orm, elysia, @grpc/grpc-js, samlify). Not related to this task.

## Files Created/Modified

- `control-plane/src/config.ts` — Gated dev fallbacks behind ALLOW_DEV_DEFAULTS=true with devFallback() helper
- `control-plane/src/config.test.ts` — Added 5 ALLOW_DEV_DEFAULTS gating tests, updated existing tests to set the flag
- `docker-compose.yml` — Added :ro to both signing_keys volume mounts
- `docker-compose.test.yml` — Prefixed all 6 port mappings with 127.0.0.1:
- `.gsd/milestones/M009/slices/S02/tasks/T03-PLAN.md` — Added Observability Impact section (pre-flight fix)
