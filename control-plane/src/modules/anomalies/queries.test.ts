/**
 * Anomaly Query Builder Tests
 *
 * Tests ClickHouse query builder functions using a mock ClickHouse client.
 * Verifies correct SQL structure, parameter binding, and result transformation.
 */

import { describe, expect, it, mock } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  queryVolumeAnomalies,
  queryOffHoursUsage,
  queryVendorSwitching,
  queryTopicDrift,
} from "./queries";

// ---------------------------------------------------------------------------
// Mock ClickHouse client
// ---------------------------------------------------------------------------

function createMockClickhouse(rows: unknown[] = []) {
  const queryFn = mock(async (opts: { query: string; format?: string; query_params?: Record<string, unknown> }) => ({
    json: async () => rows,
  }));

  return {
    client: { query: queryFn } as unknown as ClickHouseClient,
    queryFn,
  };
}

describe("queryVolumeAnomalies", () => {
  it("passes threshold parameter to query", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryVolumeAnomalies(client, 3.0);

    expect(queryFn).toHaveBeenCalledTimes(1);
    const call = queryFn.mock.calls[0][0];
    expect(call.query_params).toEqual({ threshold: 3.0 });
    expect(call.format).toBe("JSONEachRow");
  });

  it("uses default threshold of 1.2 when not specified", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryVolumeAnomalies(client);

    const call = queryFn.mock.calls[0][0];
    expect(call.query_params).toEqual({ threshold: 1.2 });
  });

  it("returns rows from ClickHouse response", async () => {
    const rows = [
      { actor_identity: "alice", current_count: 500, baseline_avg: 100, baseline_std: 20, ratio: 5.0 },
    ];
    const { client } = createMockClickhouse(rows);

    const result = await queryVolumeAnomalies(client);

    expect(result).toHaveLength(1);
    expect(result[0].actor_identity).toBe("alice");
    expect(result[0].ratio).toBe(5.0);
  });

  it("query includes partition filter on event_date", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryVolumeAnomalies(client);

    const sql = queryFn.mock.calls[0][0].query;
    expect(sql).toContain("event_date");
  });
});

describe("queryOffHoursUsage", () => {
  it("passes business hours parameters", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryOffHoursUsage(client, 9, 18);

    const call = queryFn.mock.calls[0][0];
    expect(call.query_params).toEqual({ biz_start: 9, biz_end: 18 });
    expect(call.format).toBe("JSONEachRow");
  });

  it("uses default business hours 6-22 when not specified", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryOffHoursUsage(client);

    const call = queryFn.mock.calls[0][0];
    expect(call.query_params).toEqual({ biz_start: 6, biz_end: 22 });
  });

  it("returns off-hours rows", async () => {
    const rows = [
      {
        actor_identity: "bob",
        off_hours_count: 45,
        total_count: 100,
        historical_off_hours_pct: 10,
        current_off_hours_pct: 45,
      },
    ];
    const { client } = createMockClickhouse(rows);

    const result = await queryOffHoursUsage(client);

    expect(result).toHaveLength(1);
    expect(result[0].current_off_hours_pct).toBe(45);
  });
});

describe("queryVendorSwitching", () => {
  it("queries with empty params and JSONEachRow format", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryVendorSwitching(client);

    const call = queryFn.mock.calls[0][0];
    expect(call.format).toBe("JSONEachRow");
    expect(call.query_params).toEqual({});
  });

  it("returns vendor switch rows", async () => {
    const rows = [
      {
        actor_identity: "charlie",
        dominant_vendor: "openai",
        current_vendor: "anthropic",
        dominant_pct: 95,
        switch_count: 15,
      },
    ];
    const { client } = createMockClickhouse(rows);

    const result = await queryVendorSwitching(client);

    expect(result).toHaveLength(1);
    expect(result[0].dominant_vendor).toBe("openai");
    expect(result[0].current_vendor).toBe("anthropic");
  });

  it("query includes partition filter", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryVendorSwitching(client);

    const sql = queryFn.mock.calls[0][0].query;
    expect(sql).toContain("event_date");
  });
});

describe("queryTopicDrift", () => {
  it("queries with empty params and JSONEachRow format", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryTopicDrift(client);

    const call = queryFn.mock.calls[0][0];
    expect(call.format).toBe("JSONEachRow");
    expect(call.query_params).toEqual({});
  });

  it("returns topic drift rows", async () => {
    const rows = [
      { actor_identity: "dave", current_unique_hashes: 50, baseline_avg_unique: 10, ratio: 5.0 },
    ];
    const { client } = createMockClickhouse(rows);

    const result = await queryTopicDrift(client);

    expect(result).toHaveLength(1);
    expect(result[0].ratio).toBe(5.0);
  });

  it("query does not return raw prompt_hash values (invariant #6)", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryTopicDrift(client);

    const sql = queryFn.mock.calls[0][0].query;
    // The SELECT should use uniqExact(prompt_hash), not select prompt_hash directly
    expect(sql).toContain("uniqExact(prompt_hash)");
    // The final SELECT (after FROM current_hour) should not expose prompt_hash as a column
    const finalSelect = sql.split("FROM current_hour")[1] ?? "";
    expect(finalSelect).not.toContain("prompt_hash");
  });

  it("query includes partition filter on event_date", async () => {
    const { client, queryFn } = createMockClickhouse([]);

    await queryTopicDrift(client);

    const sql = queryFn.mock.calls[0][0].query;
    expect(sql).toContain("event_date");
  });
});
