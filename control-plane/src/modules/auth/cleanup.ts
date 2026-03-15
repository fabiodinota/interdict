/**
 * Auth Cleanup Service
 *
 * Periodically deletes expired sessions and SAML handoff codes to prevent
 * unbounded database growth. Runs on a configurable interval with batched
 * deletes to avoid long-running transactions.
 *
 * Security: only deletes rows past their expiresAt — active sessions are
 * never touched. Logging uses counts only (no PII, no tokens).
 */

import { lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../../db/schema";
import { samlHandoffCodes, sessions } from "../../db/schema/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CleanupConfig {
  /** Milliseconds between cleanup ticks. Default: 300_000 (5 minutes). */
  intervalMs?: number;
  /** Max rows to delete per table per tick. Default: 1000. */
  batchSize?: number;
}

export interface CleanupHandle {
  /** Stop the cleanup interval. Safe to call multiple times. */
  stop: () => void;
}

export interface CleanupResult {
  deletedSessions: number;
  deletedHandoffCodes: number;
}

// ---------------------------------------------------------------------------
// Core cleanup logic (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Run a single cleanup pass: delete expired sessions and handoff codes.
 * Uses batched deletes via `DELETE WHERE id IN (SELECT id ... LIMIT N)`
 * to avoid long-running transactions on large tables.
 *
 * Returns the count of deleted rows per table.
 */
export async function runCleanup(
  db: PostgresJsDatabase<typeof schema>,
  batchSize: number,
): Promise<CleanupResult> {
  const now = new Date();

  // Delete expired sessions (batched)
  const sessionsResult = await db
    .delete(sessions)
    .where(
      sql`${sessions.id} IN (
        SELECT ${sessions.id} FROM ${sessions}
        WHERE ${sessions.expiresAt} < ${now}
        LIMIT ${batchSize}
      )`,
    )
    .returning({ id: sessions.id });

  // Delete expired handoff codes (batched)
  // Handoff codes use varchar `code` as PK, not uuid `id`
  const handoffResult = await db
    .delete(samlHandoffCodes)
    .where(
      sql`${samlHandoffCodes.code} IN (
        SELECT ${samlHandoffCodes.code} FROM ${samlHandoffCodes}
        WHERE ${samlHandoffCodes.expiresAt} < ${now}
        LIMIT ${batchSize}
      )`,
    )
    .returning({ code: samlHandoffCodes.code });

  return {
    deletedSessions: sessionsResult.length,
    deletedHandoffCodes: handoffResult.length,
  };
}

// ---------------------------------------------------------------------------
// Interval-based cleanup service
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 300_000; // 5 minutes
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Start the periodic auth cleanup service.
 *
 * On each tick:
 * 1. DELETE expired sessions (up to batchSize)
 * 2. DELETE expired SAML handoff codes (up to batchSize)
 * 3. Log the count of deleted rows
 *
 * Returns a handle with `stop()` for graceful shutdown.
 */
export function startAuthCleanup(
  db: PostgresJsDatabase<typeof schema>,
  config: CleanupConfig = {},
): CleanupHandle {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const result = await runCleanup(db, batchSize);
      const total = result.deletedSessions + result.deletedHandoffCodes;
      if (total > 0) {
        console.info(
          `[auth-cleanup] Cleaned ${result.deletedSessions} expired sessions, ` +
            `${result.deletedHandoffCodes} expired handoff codes`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[auth-cleanup] Cleanup failed: ${message}`);
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Unref so the timer doesn't keep the process alive during shutdown
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
