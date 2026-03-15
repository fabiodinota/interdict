---
id: T02
parent: S02
milestone: M008
provides:
  - Interval-based cleanup service deleting expired sessions and SAML handoff codes
  - Batched DELETE with LIMIT to avoid long-running transactions
  - Graceful shutdown handle wired into control-plane SIGINT/SIGTERM handler
key_files:
  - control-plane/src/modules/auth/cleanup.ts
  - control-plane/src/modules/auth/cleanup.test.ts
  - control-plane/src/index.ts
key_decisions:
  - Used raw SQL subquery for batched deletes (DELETE WHERE id IN SELECT id LIMIT N) because Drizzle ORM 0.45 PgDelete has no .limit() method
  - Separate runCleanup() function exported for testability; startAuthCleanup() wraps it with setInterval
  - Timer unref'd so cleanup interval does not keep process alive during shutdown
patterns_established:
  - CleanupFakeDb test double pattern capturing delete().where().returning() chains with pre-configured responses
  - runCleanup(db, batchSize) as pure single-pass function; startAuthCleanup(db, config) as interval wrapper returning { stop }
observability_surfaces:
  - console.info on cleanup when rows deleted — "[auth-cleanup] Cleaned N expired sessions, M expired handoff codes"
  - console.error on cleanup failure — "[auth-cleanup] Cleanup failed: <message>"
  - Silent when nothing expired (no log noise)
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Implement session and handoff cleanup service

**Added interval-based cleanup service that deletes expired sessions and SAML handoff codes with batched SQL deletes and graceful shutdown**

## What Happened

Created `cleanup.ts` with two exports:
- `runCleanup(db, batchSize)` — single-pass function that issues two batched DELETEs: expired sessions and expired handoff codes. Uses `DELETE WHERE id IN (SELECT id WHERE expiresAt < NOW() LIMIT batchSize)` because Drizzle ORM 0.45's PgDelete lacks `.limit()`. Returns `{ deletedSessions, deletedHandoffCodes }`.
- `startAuthCleanup(db, config)` — wraps `runCleanup` in a `setInterval` (default 5 minutes, batch size 1000). Returns `{ stop() }` handle. Timer is `unref()`'d so it doesn't block process exit.

Wired into `control-plane/src/index.ts`:
- Starts after compilation worker with default 5-minute interval and 1000 batch size
- `authCleanup.stop()` called in the existing `shutdown()` handler before gRPC server stop

## Verification

- `bun test src/modules/auth/cleanup.test.ts` — **11 tests pass** (≥6 required)
  - runCleanup: expired sessions deleted, expired handoff codes deleted, both deleted, zero counts when nothing expired, batch size respected, active sessions never touched
  - startAuthCleanup: stop() clears interval, stop() idempotent, logs info on deletion, logs error on failure and continues, default config works
- `cd control-plane && bun test` — **331 pass, 2 fail** (2 pre-existing failures in service.test.ts, same as T01)

### Slice verification status (T02 of 3):
- ✅ `bun test src/modules/auth/rate-limiter.test.ts` — 12 tests pass (≥8 required)
- ✅ `bun test src/modules/auth/cleanup.test.ts` — 11 tests pass (≥6 required)
- ⬜ `bun test src/modules/auth/saml/handlers.test.ts` — not yet created (T03)
- ⬜ `bun test src/modules/auth/saml/config.test.ts` — not yet created (T03)
- ✅ `cd control-plane && bun test` — 331 pass (2 pre-existing failures)

## Diagnostics

- Cleanup info log: `[auth-cleanup] Cleaned N expired sessions, M expired handoff codes` (only when rows deleted)
- Cleanup error log: `[auth-cleanup] Cleanup failed: <message>` (on DB errors; service continues running)
- No log output when nothing expired (avoids noise)
- Graceful stop: `authCleanup.stop()` called on SIGINT/SIGTERM

## Deviations

- Used raw SQL subquery `DELETE WHERE id IN (SELECT id ... LIMIT N)` instead of Drizzle's `db.delete().where(lt(...)).limit(batchSize)` as specified in the plan. Drizzle ORM 0.45's PgDelete does not expose `.limit()`. The SQL subquery achieves the same batching behavior.

## Known Issues

- 2 pre-existing test failures in `service.test.ts` (`exchangeApiKeyForSession` tests fail when running full suite — test ordering/timing issue, not caused by this change)

## Files Created/Modified

- `control-plane/src/modules/auth/cleanup.ts` — Cleanup service with `runCleanup()` and `startAuthCleanup()` functions
- `control-plane/src/modules/auth/cleanup.test.ts` — 11 tests covering cleanup logic, interval behavior, logging, and error handling
- `control-plane/src/index.ts` — Wired cleanup service startup and graceful shutdown
