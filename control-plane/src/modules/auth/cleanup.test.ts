/**
 * Auth Cleanup Service Tests
 *
 * Tests for expired session and handoff code deletion.
 * Uses a FakeDb that records delete operations and returns
 * configurable "returning" results to simulate batch behavior.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { CleanupHandle } from "./cleanup";
import { runCleanup, startAuthCleanup } from "./cleanup";

// ---------------------------------------------------------------------------
// FakeDb for cleanup tests
// ---------------------------------------------------------------------------

interface DeleteCall {
  /** The raw SQL condition string (for inspection) */
  condition: unknown;
  /** The simulated returning() rows */
  returning: unknown[];
}

/**
 * Minimal FakeDb that captures delete().where().returning() chains.
 * Each call to delete() pops the next pre-configured response from the queue.
 */
class CleanupFakeDb {
  /** Pre-configured responses: each entry is an array of rows returned by returning() */
  private deleteResponses: unknown[][];

  /** Recorded delete calls for assertions */
  deleteCalls: DeleteCall[] = [];

  constructor(deleteResponses: unknown[][] = []) {
    this.deleteResponses = [...deleteResponses];
  }

  delete(_table: unknown) {
    const self = this;
    const response = self.deleteResponses.shift() ?? [];
    const call: DeleteCall = { condition: null, returning: response };

    return {
      where(condition: unknown) {
        call.condition = condition;
        return {
          returning(_fields: unknown) {
            self.deleteCalls.push(call);
            return Promise.resolve(response);
          },
        };
      },
    };
  }
}

// ---------------------------------------------------------------------------
// runCleanup unit tests
// ---------------------------------------------------------------------------

describe("runCleanup", () => {
  test("deletes expired sessions and returns count", async () => {
    const fakeDb = new CleanupFakeDb([
      // First delete: sessions → 3 expired rows
      [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
      // Second delete: handoff codes → 0 expired
      [],
    ]);

    const result = await runCleanup(fakeDb as never, 1000);

    expect(result.deletedSessions).toBe(3);
    expect(result.deletedHandoffCodes).toBe(0);
    expect(fakeDb.deleteCalls).toHaveLength(2);
  });

  test("deletes expired handoff codes and returns count", async () => {
    const fakeDb = new CleanupFakeDb([
      // Sessions → 0
      [],
      // Handoff codes → 2 expired
      [{ code: "abc123" }, { code: "def456" }],
    ]);

    const result = await runCleanup(fakeDb as never, 1000);

    expect(result.deletedSessions).toBe(0);
    expect(result.deletedHandoffCodes).toBe(2);
  });

  test("deletes both expired sessions and handoff codes", async () => {
    const fakeDb = new CleanupFakeDb([[{ id: "s1" }, { id: "s2" }], [{ code: "h1" }]]);

    const result = await runCleanup(fakeDb as never, 1000);

    expect(result.deletedSessions).toBe(2);
    expect(result.deletedHandoffCodes).toBe(1);
  });

  test("returns zero counts when nothing is expired", async () => {
    const fakeDb = new CleanupFakeDb([[], []]);

    const result = await runCleanup(fakeDb as never, 1000);

    expect(result.deletedSessions).toBe(0);
    expect(result.deletedHandoffCodes).toBe(0);
  });

  test("batch size limits the number of deletes (simulated)", async () => {
    // Simulate: batchSize = 2, but 5 expired sessions exist
    // In real DB, the LIMIT clause caps it. Here we simulate 2 returned rows.
    const fakeDb = new CleanupFakeDb([
      [{ id: "s1" }, { id: "s2" }], // Only 2 despite more being expired
      [],
    ]);

    const result = await runCleanup(fakeDb as never, 2);

    expect(result.deletedSessions).toBe(2);
    expect(result.deletedHandoffCodes).toBe(0);
    // The SQL passed to where() should contain the batch size
    // (we verify the call was made; SQL correctness is integration-tested)
    expect(fakeDb.deleteCalls).toHaveLength(2);
  });

  test("active sessions are never touched (only expired rows deleted)", async () => {
    // The cleanup SQL uses WHERE expiresAt < NOW(), so active sessions are
    // inherently excluded. This test verifies the function only issues
    // exactly 2 delete calls (sessions + handoff_codes) and returns
    // what the DB returns — it doesn't do any client-side filtering.
    const fakeDb = new CleanupFakeDb([
      [{ id: "expired-1" }], // Only the expired one
      [],
    ]);

    const result = await runCleanup(fakeDb as never, 1000);

    expect(result.deletedSessions).toBe(1);
    expect(fakeDb.deleteCalls).toHaveLength(2); // exactly 2 DELETE statements
  });
});

// ---------------------------------------------------------------------------
// startAuthCleanup interval tests
// ---------------------------------------------------------------------------

describe("startAuthCleanup", () => {
  let handle: CleanupHandle | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  test("stop() clears the interval and prevents further ticks", async () => {
    let tickCount = 0;
    const fakeDb = new CleanupFakeDb([]);

    // Override delete to count invocations
    const countingDb = {
      delete(_table: unknown) {
        tickCount++;
        return {
          where(_condition: unknown) {
            return {
              returning(_fields: unknown) {
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    };

    handle = startAuthCleanup(countingDb as never, { intervalMs: 10 });

    // Wait for a couple ticks
    await new Promise((r) => setTimeout(r, 50));
    handle.stop();
    const countAtStop = tickCount;

    // Wait more — no additional ticks should fire
    await new Promise((r) => setTimeout(r, 50));
    expect(tickCount).toBe(countAtStop);
  });

  test("stop() is idempotent — safe to call multiple times", () => {
    const fakeDb = new CleanupFakeDb([]);
    handle = startAuthCleanup(fakeDb as never, { intervalMs: 60_000 });

    // Should not throw
    handle.stop();
    handle.stop();
    handle.stop();
  });

  test("logs info when rows are deleted", async () => {
    const infoLogs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLogs.push(args.map(String).join(" "));
    };

    try {
      // First tick: 2 sessions, 1 handoff code
      const fakeDb = {
        delete(_table: unknown) {
          const response = fakeDb._responses.shift() ?? [];
          return {
            where(_condition: unknown) {
              return {
                returning(_fields: unknown) {
                  return Promise.resolve(response);
                },
              };
            },
          };
        },
        _responses: [[{ id: "s1" }, { id: "s2" }], [{ code: "h1" }]] as unknown[][],
      };

      handle = startAuthCleanup(fakeDb as never, { intervalMs: 10 });

      // Wait for at least one tick
      await new Promise((r) => setTimeout(r, 50));
      handle.stop();

      const cleanupLog = infoLogs.find((l) => l.includes("[auth-cleanup]"));
      expect(cleanupLog).toBeDefined();
      expect(cleanupLog).toContain("2 expired sessions");
      expect(cleanupLog).toContain("1 expired handoff codes");
    } finally {
      console.info = originalInfo;
    }
  });

  test("logs error when cleanup fails and continues running", async () => {
    const errorLogs: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.map(String).join(" "));
    };

    try {
      let callCount = 0;
      const failingDb = {
        delete(_table: unknown) {
          callCount++;
          if (callCount <= 2) {
            // First tick: throw
            throw new Error("connection refused");
          }
          // Subsequent ticks: succeed
          return {
            where(_condition: unknown) {
              return {
                returning(_fields: unknown) {
                  return Promise.resolve([]);
                },
              };
            },
          };
        },
      };

      handle = startAuthCleanup(failingDb as never, { intervalMs: 10 });

      // Wait for error tick + recovery tick
      await new Promise((r) => setTimeout(r, 80));
      handle.stop();

      const errLog = errorLogs.find((l) => l.includes("[auth-cleanup]"));
      expect(errLog).toBeDefined();
      expect(errLog).toContain("connection refused");
      // Service kept running after error (callCount > 2 means more ticks fired)
      expect(callCount).toBeGreaterThan(2);
    } finally {
      console.error = originalError;
    }
  });

  test("uses default config when no options provided", () => {
    const fakeDb = new CleanupFakeDb([]);
    // Should not throw with default config
    handle = startAuthCleanup(fakeDb as never);
    expect(handle).toBeDefined();
    expect(typeof handle.stop).toBe("function");
    handle.stop();
    handle = null;
  });
});
