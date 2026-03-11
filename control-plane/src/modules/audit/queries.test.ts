/**
 * Audit Queries - Tests
 *
 * Tests for ClickHouse query builders with parameterized queries,
 * cursor-based pagination, and materialized view aggregate queries.
 *
 * Uses a mock ClickHouse client to verify query construction
 * and result handling without requiring a running ClickHouse instance.
 */

import { describe, expect, mock, test } from "bun:test";
import { encodeCursor } from "../../shared/utilities";
import type { ClickHouseAuditRow } from "./model";
import {
  queryAuditTrail,
  queryDepartmentSummary,
  queryHourlyViolations,
  queryVendorUsage,
} from "./queries";

// ---------------------------------------------------------------------------
// Mock ClickHouse client
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ClickHouseAuditRow> = {}): ClickHouseAuditRow {
  return {
    timestamp: "2026-02-28T12:00:00.000Z",
    bundle_id: "bundle-001",
    kernel_id: "kernel-01",
    actor_identity: "alice@example.com",
    department: "engineering",
    vendor: "openai",
    model: "gpt-4",
    prompt_hash: "abc123",
    response_hash: "def456",
    policy_action: "allow",
    policy_rules_json: "[]",
    token_count: 100,
    enforcement_latency_us: 500,
    chain_hash: "chain001",
    previous_hash: "prev000",
    sequence_number: 1,
    signature: "sig001",
    signing_key_id: "key-01",
    dev_signed: 0,
    schema_version: 1,
    event_date: "2026-02-28",
    ...overrides,
  };
}

function createMockClient(rows: ClickHouseAuditRow[] = []) {
  const queryCalls: Array<{ query: string; query_params: Record<string, unknown> }> = [];

  const client = {
    query: mock(
      async (opts: { query: string; format: string; query_params: Record<string, unknown> }) => {
        queryCalls.push({ query: opts.query, query_params: opts.query_params });
        return {
          json: async () => rows,
        };
      },
    ),
  };

  return { client: client as any, queryCalls };
}

// ---------------------------------------------------------------------------
// queryAuditTrail
// ---------------------------------------------------------------------------

describe("queryAuditTrail", () => {
  test("with no filters returns paginated results with cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      makeRow({
        bundle_id: `bundle-${String(i).padStart(3, "0")}`,
        timestamp: new Date(2026, 1, 28, 12, 0, i).toISOString(),
      }),
    );
    const { client, queryCalls } = createMockClient(rows);

    const result = await queryAuditTrail(client, {});

    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    // Should use parameterized query syntax
    expect(queryCalls[0].query).toContain("evidence_bundles");
    // CRITICAL: Must NOT contain prompt_text or response_text (Invariant 6)
    expect(queryCalls[0].query).not.toContain("prompt_text");
    expect(queryCalls[0].query).not.toContain("response_text");
    expect(queryCalls[0].query).not.toContain("SELECT *");
    // Must always include date range filter for partition pruning
    expect(queryCalls[0].query).toContain("event_date");
  });

  test("with vendor filter includes only matching vendor", async () => {
    const rows = [makeRow({ vendor: "openai" })];
    const { client, queryCalls } = createMockClient(rows);

    const result = await queryAuditTrail(client, { vendor: "openai" });

    expect(queryCalls[0].query).toContain("{vendor:String}");
    expect(queryCalls[0].query_params.vendor).toBe("openai");
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  test("with date range filter prunes to date range", async () => {
    const { client, queryCalls } = createMockClient([]);

    await queryAuditTrail(client, {
      from_date: "2026-02-01T00:00:00Z",
      to_date: "2026-02-28T23:59:59Z",
    });

    expect(queryCalls[0].query).toContain("event_date >=");
    expect(queryCalls[0].query).toContain("event_date <=");
    expect(queryCalls[0].query_params.from_date).toBeTruthy();
    expect(queryCalls[0].query_params.to_date).toBeTruthy();
  });

  test("with cursor paginates correctly (next page, no overlap)", async () => {
    const cursorTs = new Date("2026-02-28T12:00:25.000Z").getTime();
    const cursor = encodeCursor(cursorTs, "bundle-025");
    const rows = [makeRow({ bundle_id: "bundle-026", timestamp: "2026-02-28T12:00:24.000Z" })];
    const { client, queryCalls } = createMockClient(rows);

    const result = await queryAuditTrail(client, {}, cursor);

    // Must use cursor-based comparison for stable ordering
    expect(queryCalls[0].query).toContain("cursor_ts");
    expect(queryCalls[0].query).toContain("cursor_id");
    expect(queryCalls[0].query_params.cursor_ts).toBeTruthy();
    expect(queryCalls[0].query_params.cursor_id).toBe("bundle-025");
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  test("with multiple filters combines them with AND", async () => {
    const { client, queryCalls } = createMockClient([]);

    await queryAuditTrail(client, {
      vendor: "openai",
      department: "engineering",
      policy_action: "block",
    });

    const query = queryCalls[0].query;
    expect(query).toContain("{vendor:String}");
    expect(query).toContain("{department:String}");
    expect(query).toContain("{policy_action:String}");
    expect(queryCalls[0].query_params.vendor).toBe("openai");
    expect(queryCalls[0].query_params.department).toBe("engineering");
    expect(queryCalls[0].query_params.policy_action).toBe("block");
  });

  test("defaults to last 7 days when no date range provided", async () => {
    const { client, queryCalls } = createMockClient([]);

    await queryAuditTrail(client, {});

    // Should always include date range even when not explicitly provided
    expect(queryCalls[0].query).toContain("event_date >=");
    expect(queryCalls[0].query_params.from_date).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Materialized view queries
// ---------------------------------------------------------------------------

describe("queryHourlyViolations", () => {
  test("returns aggregated hourly data from materialized view", async () => {
    const mockRows = [
      {
        hour: "2026-02-28T12:00:00Z",
        policy_action: "block",
        violation_count: 5,
        unique_actors: 3,
        unique_vendors: 2,
      },
      {
        hour: "2026-02-28T13:00:00Z",
        policy_action: "block",
        violation_count: 2,
        unique_actors: 1,
        unique_vendors: 1,
      },
    ];
    const { client, queryCalls } = createMockClient(mockRows as any);

    const result = await queryHourlyViolations(
      client,
      "2026-02-28T00:00:00Z",
      "2026-02-28T23:59:59Z",
    );

    expect(result).toHaveLength(2);
    expect(queryCalls[0].query).toContain("mv_hourly_violations");
    expect(queryCalls[0].query).toContain("ORDER BY hour ASC");
    expect(queryCalls[0].query_params.from).toBeTruthy();
    expect(queryCalls[0].query_params.to).toBeTruthy();
  });
});

describe("queryVendorUsage", () => {
  test("returns per-vendor per-model usage stats", async () => {
    const mockRows = [
      {
        hour: "2026-02-28T12:00:00Z",
        vendor: "openai",
        model: "gpt-4",
        request_count: 100,
        total_tokens: 50000,
        avg_latency_us: 450,
      },
    ];
    const { client, queryCalls } = createMockClient(mockRows as any);

    const result = await queryVendorUsage(client, "2026-02-28T00:00:00Z", "2026-02-28T23:59:59Z");

    expect(result).toHaveLength(1);
    expect(queryCalls[0].query).toContain("mv_vendor_usage");
    expect(queryCalls[0].query).toContain("ORDER BY hour ASC");
  });

  test("with vendor filter includes vendor param", async () => {
    const { client, queryCalls } = createMockClient([]);

    await queryVendorUsage(client, "2026-02-28T00:00:00Z", "2026-02-28T23:59:59Z", "openai");

    expect(queryCalls[0].query).toContain("{vendor:String}");
    expect(queryCalls[0].query_params.vendor).toBe("openai");
  });
});

describe("queryDepartmentSummary", () => {
  test("returns per-department per-action counts", async () => {
    const mockRows = [
      {
        hour: "2026-02-28T12:00:00Z",
        department: "engineering",
        policy_action: "allow",
        action_count: 50,
        unique_actors: 10,
      },
    ];
    const { client, queryCalls } = createMockClient(mockRows as any);

    const result = await queryDepartmentSummary(
      client,
      "2026-02-28T00:00:00Z",
      "2026-02-28T23:59:59Z",
    );

    expect(result).toHaveLength(1);
    expect(queryCalls[0].query).toContain("mv_department_summary");
    expect(queryCalls[0].query).toContain("ORDER BY hour ASC");
  });

  test("with department filter includes department param", async () => {
    const { client, queryCalls } = createMockClient([]);

    await queryDepartmentSummary(
      client,
      "2026-02-28T00:00:00Z",
      "2026-02-28T23:59:59Z",
      "engineering",
    );

    expect(queryCalls[0].query).toContain("{department:String}");
    expect(queryCalls[0].query_params.department).toBe("engineering");
  });
});
