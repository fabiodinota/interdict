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

import { beforeEach, describe, expect, test } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";
import type { AppDb } from "../../shared/types";
import { ReviewService } from "./service";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Build a mock Postgres `db` that tracks operations. */
type MockRow = Record<string, unknown>;
type InsertedReviewRow = MockRow & {
  bundleId: string;
  escalationSource: string;
  slaDeadline: Date;
};
type ReviewBundleLookupRow = {
  id: string;
  bundleId: string;
  escalatedAt: Date;
  slaDeadline: Date;
  status: string;
  claimedBy: string | null;
  claimedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
  resolutionNotes: string | null;
  escalationSource: string;
};
type MockChain = Promise<MockRow[]> & {
  from: () => MockChain;
  where: () => MockChain;
  orderBy: () => MockChain;
  limit: () => Promise<MockRow[]>;
  set: (data: MockRow) => MockChain;
  values: (rows: MockRow | MockRow[]) => MockChain;
  returning: (_cols?: unknown) => Promise<MockRow[]>;
  onConflictDoNothing: () => MockChain;
};

function createMockDb() {
  const insertedRows: MockRow[] = [];
  const updatedRows: MockRow[] = [];
  let selectResult: MockRow[] = [];
  let returningResult: MockRow[] = [];
  let conflictBehavior: "insert" | "skip" = "insert";

  const chainable = (): MockChain => {
    const chain = Promise.resolve(selectResult) as MockChain;
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(selectResult);
    chain.set = (data) => {
      updatedRows.push(data);
      return chain;
    };
    chain.values = (rows) => {
      if (Array.isArray(rows)) {
        insertedRows.push(...rows);
      } else {
        insertedRows.push(rows);
      }
      return chain;
    };
    chain.returning = () => {
      if (conflictBehavior === "skip" && returningResult.length === 0) {
        return Promise.resolve([]);
      }
      return Promise.resolve(returningResult);
    };
    chain.onConflictDoNothing = () => {
      conflictBehavior = "skip";
      return chain;
    };
    return chain;
  };

  return {
    select: () => chainable(),
    insert: () => chainable(),
    update: () => chainable(),
    _setSelectResult: (rows: MockRow[]) => {
      selectResult = rows;
    },
    _setReturningResult: (rows: MockRow[]) => {
      returningResult = rows;
    },
    _setConflictBehavior: (b: "insert" | "skip") => {
      conflictBehavior = b;
    },
    _insertedRows: insertedRows,
    _updatedRows: updatedRows,
  };
}

/** Build a mock ClickHouse client. */
function createMockClickhouse() {
  const queries: Array<{ query: string; query_params?: Record<string, unknown> }> = [];
  const responses: unknown[] = [];

  return {
    query: async ({
      query,
      query_params,
    }: {
      query: string;
      query_params?: Record<string, unknown>;
    }) => {
      queries.push({ query, query_params });
      const next = responses.shift() ?? [];
      return {
        json: async () => next,
      };
    },
    _pushResponse: (rows: unknown) => {
      responses.push(rows);
    },
    _queries: queries,
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
    service = new ReviewService(ch as unknown as ClickHouseClient, db as unknown as AppDb);
  });

  // -----------------------------------------------------------------------
  // createReviewItem
  // -----------------------------------------------------------------------

  describe("createReviewItem", () => {
    test("creates a new review item with correct SLA deadline", async () => {
      const escalatedAt = new Date("2026-03-10T10:00:00Z");
      const expectedSla = new Date("2026-03-10T14:00:00Z"); // +4h

      db._setReturningResult([{ id: "review-uuid-1" }]);

      const result = await service.createReviewItem("bundle-001", escalatedAt, "kernel_l3");

      expect(result.created).toBe(true);
      expect(result.id).toBe("review-uuid-1");

      // Verify the inserted row has the right SLA deadline.
      const inserted = db._insertedRows[0] as InsertedReviewRow;
      expect(inserted.bundleId).toBe("bundle-001");
      expect(inserted.escalationSource).toBe("kernel_l3");
      expect(inserted.slaDeadline.getTime()).toBe(expectedSla.getTime());
    });

    test("idempotent: returns existing item when bundle_id already exists", async () => {
      // Simulate onConflictDoNothing returning empty (already exists).
      db._setReturningResult([]);
      db._setConflictBehavior("skip");
      db._setSelectResult([{ id: "existing-review-uuid" }]);

      const result = await service.createReviewItem("bundle-duplicate", new Date(), "kernel_l3");

      expect(result.created).toBe(false);
      expect(result.id).toBe("existing-review-uuid");
    });

    test("session_pattern source is recorded", async () => {
      db._setReturningResult([{ id: "review-session-1" }]);

      const result = await service.createReviewItem(
        "bundle-session-001",
        new Date(),
        "session_pattern",
      );

      expect(result.created).toBe(true);
      const inserted = db._insertedRows[0] as InsertedReviewRow;
      expect(inserted.escalationSource).toBe("session_pattern");
    });
  });

  // -----------------------------------------------------------------------
  // resolveReview
  // -----------------------------------------------------------------------

  describe("resolveReview", () => {
    test("rejects invalid resolution category", async () => {
      await expect(
        service.resolveReview(
          "review-1",
          "user-1",
          "invalid_category",
          "This is a valid note for the resolution.",
        ),
      ).rejects.toThrow("Invalid resolution");
    });

    test("rejects resolution notes shorter than 10 characters", async () => {
      await expect(
        service.resolveReview("review-1", "user-1", "false_positive", "short"),
      ).rejects.toThrow("Resolution notes are required");
    });

    test("violation_confirmed maps to rejected status", async () => {
      db._setReturningResult([
        {
          id: "review-1",
          bundleId: "b-1",
          status: "rejected",
          escalatedAt: new Date(),
          slaDeadline: new Date(),
        },
      ]);

      const result = await service.resolveReview(
        "review-1",
        "user-1",
        "violation_confirmed",
        "The user violated the data policy by exfiltrating PII.",
      );

      expect(result).not.toBeNull();
      // Check that the update set status to "rejected"
      const update = db._updatedRows[0];
      expect(update.status).toBe("rejected");
      expect(update.resolution).toBe("violation_confirmed");
    });

    test("false_positive maps to approved status", async () => {
      db._setReturningResult([
        {
          id: "review-2",
          bundleId: "b-2",
          status: "approved",
          escalatedAt: new Date(),
          slaDeadline: new Date(),
        },
      ]);

      const result = await service.resolveReview(
        "review-2",
        "user-1",
        "false_positive",
        "The content was not actually sensitive, just a test scenario.",
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
      db._setReturningResult([
        {
          id: "review-1",
          bundleId: "b-1",
          status: "claimed",
          claimedBy: "user-1",
          escalatedAt: new Date(),
          slaDeadline: new Date(),
        },
      ]);

      const result = await service.claimReview("review-1", "user-1");
      expect(result).not.toBeNull();
      expect(result?.status).toBe("claimed");
    });
  });

  describe("Phase 31 query hardening", () => {
    test("reconcileEscalations includes a partition-friendly from_date bound", async () => {
      ch._pushResponse([{ bundle_id: "bundle-001", timestamp: "2026-03-11T10:00:00.000Z" }]);
      db._setSelectResult([]);
      db._setReturningResult([{ id: "review-uuid-1" }]);

      const created = await service.reconcileEscalations();

      expect(created).toBe(1);
      expect(ch._queries[0]?.query).toContain("event_date >= {from_date:String}");
      expect(typeof ch._queries[0]?.query_params?.from_date).toBe("string");
      expect(typeof ch._queries[0]?.query_params?.since).toBe("string");
    });

    test("enrichWithBundleDetails constrains bundle lookups to derived event dates", async () => {
      ch._pushResponse([
        {
          bundle_id: "bundle-001",
          timestamp: "2026-03-10T23:59:58.000Z",
          actor_identity: "alice",
          vendor: "openai",
          model: "gpt-5",
          policy_action: "escalate",
          policy_rules_json: "[]",
          prompt_hash: "prompt-1",
          response_hash: "response-1",
          token_count: 9,
        },
        {
          bundle_id: "bundle-002",
          timestamp: "2026-03-11T00:00:05.000Z",
          actor_identity: "bob",
          vendor: "anthropic",
          model: "claude",
          policy_action: "escalate",
          policy_rules_json: "[]",
          prompt_hash: "prompt-2",
          response_hash: "response-2",
          token_count: 11,
        },
      ]);

      const rows: ReviewBundleLookupRow[] = [
        {
          id: "review-1",
          bundleId: "bundle-001",
          escalatedAt: new Date("2026-03-10T23:59:58.000Z"),
          slaDeadline: new Date("2026-03-11T03:59:58.000Z"),
          status: "pending",
          claimedBy: null,
          claimedAt: null,
          resolvedBy: null,
          resolvedAt: null,
          resolution: null,
          resolutionNotes: null,
          escalationSource: "kernel_l3",
        },
        {
          id: "review-2",
          bundleId: "bundle-002",
          escalatedAt: new Date("2026-03-11T00:00:05.000Z"),
          slaDeadline: new Date("2026-03-11T04:00:05.000Z"),
          status: "pending",
          claimedBy: null,
          claimedAt: null,
          resolvedBy: null,
          resolvedAt: null,
          resolution: null,
          resolutionNotes: null,
          escalationSource: "kernel_l3",
        },
      ];

      const enrichWithBundleDetails = Reflect.get(service, "enrichWithBundleDetails") as (
        rows: ReviewBundleLookupRow[],
      ) => Promise<Array<{ actorIdentity: string }>>;
      const enriched = await enrichWithBundleDetails.call(service, rows);

      expect(ch._queries[0]?.query).toContain("event_date IN {event_dates:Array(String)}");
      expect(ch._queries[0]?.query).toContain("bundle_id IN {ids:Array(String)}");
      expect(ch._queries[0]?.query_params?.event_dates).toEqual(["2026-03-10", "2026-03-11"]);
      expect(enriched).toHaveLength(2);
      expect(enriched[0]?.actorIdentity).toBe("alice");
      expect(enriched[1]?.actorIdentity).toBe("bob");
    });
  });
});
