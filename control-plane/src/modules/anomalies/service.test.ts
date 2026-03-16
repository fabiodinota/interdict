/**
 * Anomaly Service Tests
 *
 * Tests severity computation at boundary values and summary aggregation.
 * Mocks the four query functions to isolate service logic from ClickHouse.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";
import type { OffHoursRow, TopicDriftRow, VendorSwitchRow, VolumeAnomalyRow } from "./queries";

// ---------------------------------------------------------------------------
// We need to test private functions computeSeverity/computeOffHoursSeverity
// indirectly through AnomalyService.detectAnomalies() by injecting mock
// query results with specific ratio values.
// ---------------------------------------------------------------------------

// Mock the queries module before importing service
const mockQueryVolumeAnomalies = mock(() => Promise.resolve([] as VolumeAnomalyRow[]));
const mockQueryOffHoursUsage = mock(() => Promise.resolve([] as OffHoursRow[]));
const mockQueryVendorSwitching = mock(() => Promise.resolve([] as VendorSwitchRow[]));
const mockQueryTopicDrift = mock(() => Promise.resolve([] as TopicDriftRow[]));

// Use Bun's module mocking
mock.module("./queries", () => ({
  queryVolumeAnomalies: mockQueryVolumeAnomalies,
  queryOffHoursUsage: mockQueryOffHoursUsage,
  queryVendorSwitching: mockQueryVendorSwitching,
  queryTopicDrift: mockQueryTopicDrift,
}));

// Import after mocking
const { AnomalyService } = await import("./service");

const fakeClickhouse = {} as ClickHouseClient;

describe("AnomalyService", () => {
  beforeEach(() => {
    mockQueryVolumeAnomalies.mockReset();
    mockQueryOffHoursUsage.mockReset();
    mockQueryVendorSwitching.mockReset();
    mockQueryTopicDrift.mockReset();

    // Default: return empty arrays
    mockQueryVolumeAnomalies.mockImplementation(() => Promise.resolve([]));
    mockQueryOffHoursUsage.mockImplementation(() => Promise.resolve([]));
    mockQueryVendorSwitching.mockImplementation(() => Promise.resolve([]));
    mockQueryTopicDrift.mockImplementation(() => Promise.resolve([]));
  });

  // -----------------------------------------------------------------------
  // computeSeverity — tested indirectly via volume spike alerts
  // -----------------------------------------------------------------------
  describe("computeSeverity (via volume spikes)", () => {
    it("returns info for ratio 1.19 (below warning threshold)", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-a",
            current_count: 119,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 1.19,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("info");
      expect(alerts[0].type).toBe("volume_spike");
    });

    it("returns warning for ratio exactly 2.0", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-b",
            current_count: 200,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 2.0,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("warning");
    });

    it("returns critical for ratio 5.0", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-c",
            current_count: 500,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 5.0,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("critical");
    });

    it("returns critical for ratio above 5.0", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-d",
            current_count: 1000,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 10.0,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("critical");
    });
  });

  // -----------------------------------------------------------------------
  // computeOffHoursSeverity — tested via off-hours alerts
  // -----------------------------------------------------------------------
  describe("computeOffHoursSeverity (via off-hours alerts)", () => {
    it("returns info when diff < 20 and currentPct < 50", async () => {
      mockQueryOffHoursUsage.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-e",
            off_hours_count: 10,
            total_count: 50,
            historical_off_hours_pct: 15,
            current_off_hours_pct: 20,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("info");
      expect(alerts[0].type).toBe("off_hours");
    });

    it("returns warning when diff >= 20", async () => {
      mockQueryOffHoursUsage.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-f",
            off_hours_count: 30,
            total_count: 60,
            historical_off_hours_pct: 10,
            current_off_hours_pct: 50,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("warning");
    });

    it("returns critical when currentPct >= 80", async () => {
      mockQueryOffHoursUsage.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-g",
            off_hours_count: 80,
            total_count: 100,
            historical_off_hours_pct: 10,
            current_off_hours_pct: 80,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("critical");
    });

    it("returns critical when diff >= 50", async () => {
      mockQueryOffHoursUsage.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-h",
            off_hours_count: 60,
            total_count: 100,
            historical_off_hours_pct: 5,
            current_off_hours_pct: 60,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("critical");
    });
  });

  // -----------------------------------------------------------------------
  // Alert sorting
  // -----------------------------------------------------------------------
  describe("alert sorting", () => {
    it("sorts critical before warning before info", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-info",
            current_count: 119,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 1.19,
          },
          {
            actor_identity: "user-crit",
            current_count: 500,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 5.0,
          },
          {
            actor_identity: "user-warn",
            current_count: 200,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 2.0,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(3);
      expect(alerts[0].severity).toBe("critical");
      expect(alerts[1].severity).toBe("warning");
      expect(alerts[2].severity).toBe("info");
    });
  });

  // -----------------------------------------------------------------------
  // Vendor switching severity
  // -----------------------------------------------------------------------
  describe("vendor switching", () => {
    it("returns warning when switch_count >= 10", async () => {
      mockQueryVendorSwitching.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-v",
            dominant_vendor: "openai",
            current_vendor: "anthropic",
            dominant_pct: 90,
            switch_count: 10,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("warning");
      expect(alerts[0].type).toBe("vendor_switch");
    });

    it("returns info when switch_count < 10", async () => {
      mockQueryVendorSwitching.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-w",
            dominant_vendor: "openai",
            current_vendor: "anthropic",
            dominant_pct: 90,
            switch_count: 5,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("info");
    });
  });

  // -----------------------------------------------------------------------
  // Topic drift — same severity computation as volume
  // -----------------------------------------------------------------------
  describe("topic drift", () => {
    it("computes severity from ratio using same thresholds as volume", async () => {
      mockQueryTopicDrift.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-t1",
            current_unique_hashes: 50,
            baseline_avg_unique: 10,
            ratio: 5.0,
          },
          {
            actor_identity: "user-t2",
            current_unique_hashes: 20,
            baseline_avg_unique: 10,
            ratio: 2.0,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts } = await service.detectAnomalies();

      expect(alerts).toHaveLength(2);
      expect(alerts[0].severity).toBe("critical");
      expect(alerts[1].severity).toBe("warning");
    });
  });

  // -----------------------------------------------------------------------
  // Query failure handling
  // -----------------------------------------------------------------------
  describe("query failure handling", () => {
    it("collects warnings when queries fail and still returns results from others", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.reject(new Error("ClickHouse timeout")),
      );
      mockQueryVendorSwitching.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "user-ok",
            dominant_vendor: "openai",
            current_vendor: "anthropic",
            dominant_pct: 90,
            switch_count: 1,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const { alerts, warnings } = await service.detectAnomalies();

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("volume");
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("vendor_switch");
    });
  });

  // -----------------------------------------------------------------------
  // getSummary — aggregation
  // -----------------------------------------------------------------------
  describe("getSummary", () => {
    it("aggregates alerts by severity and type", async () => {
      mockQueryVolumeAnomalies.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "a",
            current_count: 500,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 5.0,
          },
          {
            actor_identity: "b",
            current_count: 200,
            baseline_avg: 100,
            baseline_std: 10,
            ratio: 2.0,
          },
        ]),
      );
      mockQueryOffHoursUsage.mockImplementation(() =>
        Promise.resolve([
          {
            actor_identity: "c",
            off_hours_count: 10,
            total_count: 50,
            historical_off_hours_pct: 15,
            current_off_hours_pct: 20,
          },
        ]),
      );

      const service = new AnomalyService(fakeClickhouse);
      const summary = await service.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.critical).toBe(1);
      expect(summary.warning).toBe(1);
      expect(summary.info).toBe(1);
      expect(summary.byType.volume_spike).toBe(2);
      expect(summary.byType.off_hours).toBe(1);
    });

    it("returns zero counts when no anomalies detected", async () => {
      const service = new AnomalyService(fakeClickhouse);
      const summary = await service.getSummary();

      expect(summary.total).toBe(0);
      expect(summary.critical).toBe(0);
      expect(summary.warning).toBe(0);
      expect(summary.info).toBe(0);
    });
  });
});
