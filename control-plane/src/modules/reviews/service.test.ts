/**
 * ReviewService Tests (Phase 20)
 *
 * Tests for the consolidated review workflow:
 * - Deterministic review creation via createReviewItem
 * - Idempotent duplicate handling (UNIQUE on bundle_id)
 * - SLA deadline computation
 * - Auto-escalation of expired items
 * - Claim with optimistic locking
 * - Resolve with validation
 * - Queue stats aggregation
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { ReviewService } from "./service";
import type { AppDb } from "../../shared/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Build a mock Postgres `db` that tracks operations. */
function createMockDb() {
  const insertedRows: any[] = [];
  const updatedRows: any[] = [];
  let selectResult: any[] = [];
  let returningResult: any[] = [];
  let conflictBehavior: "insert" | "skip" = "insert";

  const chainable = () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(selectResult),
      set: (data: any) => { updatedRows.push(data); return chain; },
      values: (rows: any) => {
        if (Array.isArray(rows)) insertedRows.push(...rows);
        else insertedRows.push(rows);
        return chain;
      },
      returning: (cols?: any) => {
        if (conflictBehavior === "skip" && returningResult.length === 0) {
          return Promise.resolve([]);
        }
        return Promise.resolve(returningResult);
      },
      onConflictDoNothing: () => {
        conflictBehavior = "skip";
        return chain;
      },
    };
    return chain;
  };

  return {
    select: () => chainable(),
    insert: () => chainable(),
    update: () => chainable(),
    _setSelectResult: (rows: any[]) => { selectResult = rows; },
    _setReturningResult: (rows: any[]) => { returningResult = rows; },
    _setConflictBehavior: (b: "insert" | "skip") => { conflictBehavior = b; },
    _insertedRows: insertedRows,
    _updatedRows: updatedRows,
  };
}

/** Build a mock ClickHouse client. */
function createMockClickhouse() {
  return {
    query: async () => ({
      json: async () => [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReviewService", () => {
  let db: ReturnType<typeof createMockDb>;
  let ch: ReturnType<typeof createMockClickhouse>;
  let service: ReviewService;

  beforeEach(() => {
    db = createMockDb();
    ch = createMockClickhouse();
    service = new ReviewService(ch as any, db as unknown as AppDb);
  });

  // -----------------------------------------------------------------------
  // createReviewItem
  // -----------------------------------------------------------------------

  describe("createReviewItem", () => {
    test("creates a new review item with correct SLA deadline", async () => {
      const escalatedAt = new Date("2026-03-10T10:00:00Z");
      const expectedSla = new Date("2026-03-10T14:00:00Z"); // +4h

      db._setReturningResult([{ id: "review-uuid-1" }]);

      const result = await service.createReviewItem(
        "bundle-001",
        escalatedAt,
        "kernel_l3"
      );

      expect(result.created).toBe(true);
      expect(result.id).toBe("review-uuid-1");

      // Verify the inserted row has the right SLA deadline.
      const inserted = db._insertedRows[0];
      expect(inserted.bundleId).toBe("bundle-001");
      expect(inserted.escalationSource).toBe("kernel_l3");
      expect(inserted.slaDeadline.getTime()).toBe(expectedSla.getTime());
    });

    test("idempotent: returns existing item when bundle_id already exists", async () => {
      // Simulate onConflictDoNothing returning empty (already exists).
      db._setReturningResult([]);
      db._setConflictBehavior("skip");
      db._setSelectResult([{ id: "existing-review-uuid" }]);

      const result = await service.createReviewItem(
        "bundle-duplicate",
        new Date(),
        "kernel_l3"
      );

      expect(result.created).toBe(false);
      expect(result.id).toBe("existing-review-uuid");
    });

    test("session_pattern source is recorded", async () => {
      db._setReturningResult([{ id: "review-session-1" }]);

      const result = await service.createReviewItem(
        "bundle-session-001",
        new Date(),
        "session_pattern"
      );

      expect(result.created).toBe(true);
      const inserted = db._insertedRows[0];
      expect(inserted.escalationSource).toBe("session_pattern");
    });
  });

  // -----------------------------------------------------------------------
  // resolveReview
  // -----------------------------------------------------------------------

  describe("resolveReview", () => {
    test("rejects invalid resolution category", async () => {
      await expect(
        service.resolveReview("review-1", "user-1", "invalid_category", "This is a valid note for the resolution.")
      ).rejects.toThrow("Invalid resolution");
    });

    test("rejects resolution notes shorter than 10 characters", async () => {
      await expect(
        service.resolveReview("review-1", "user-1", "false_positive", "short")
      ).rejects.toThrow("Resolution notes are required");
    });

    test("violation_confirmed maps to rejected status", async () => {
      db._setReturningResult([{
        id: "review-1",
        bundleId: "b-1",
        status: "rejected",
        escalatedAt: new Date(),
        slaDeadline: new Date(),
      }]);

      const result = await service.resolveReview(
        "review-1",
        "user-1",
        "violation_confirmed",
        "The user violated the data policy by exfiltrating PII."
      );

      expect(result).not.toBeNull();
      // Check that the update set status to "rejected"
      const update = db._updatedRows[0];
      expect(update.status).toBe("rejected");
      expect(update.resolution).toBe("violation_confirmed");
    });

    test("false_positive maps to approved status", async () => {
      db._setReturningResult([{
        id: "review-2",
        bundleId: "b-2",
        status: "approved",
        escalatedAt: new Date(),
        slaDeadline: new Date(),
      }]);

      const result = await service.resolveReview(
        "review-2",
        "user-1",
        "false_positive",
        "The content was not actually sensitive, just a test scenario."
      );

      expect(result).not.toBeNull();
      const update = db._updatedRows[0];
      expect(update.status).toBe("approved");
    });
  });

  // -----------------------------------------------------------------------
  // autoEscalateExpired
  // -----------------------------------------------------------------------

  describe("autoEscalateExpired", () => {
    test("counts auto-escalated items", async () => {
      db._setReturningResult([{ id: "expired-1" }, { id: "expired-2" }]);

      const count = await service.autoEscalateExpired();
      expect(count).toBe(2);

      const update = db._updatedRows[0];
      expect(update.status).toBe("auto_escalated");
    });

    test("returns zero when nothing expired", async () => {
      db._setReturningResult([]);

      const count = await service.autoEscalateExpired();
      expect(count).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // claimReview
  // -----------------------------------------------------------------------

  describe("claimReview", () => {
    test("returns null when already claimed (optimistic lock failure)", async () => {
      db._setReturningResult([]);

      const result = await service.claimReview("review-1", "user-1");
      expect(result).toBeNull();
    });

    test("returns enriched item on successful claim", async () => {
      db._setReturningResult([{
        id: "review-1",
        bundleId: "b-1",
        status: "claimed",
        claimedBy: "user-1",
        escalatedAt: new Date(),
        slaDeadline: new Date(),
      }]);

      const result = await service.claimReview("review-1", "user-1");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("claimed");
    });
  });
});
