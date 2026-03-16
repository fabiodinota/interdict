/**
 * Kernel Tracker Tests
 *
 * Tests KernelTracker lifecycle: register, unregister, acknowledge,
 * and broadcastUpdate with mock gRPC streams.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type * as grpc from "@grpc/grpc-js";
import {
  broadcastUpdate,
  KernelTracker,
  kernelTracker,
  type PolicyUpdateMessage,
  type SubscribeRequestMessage,
} from "./tracker";

// ---------------------------------------------------------------------------
// Mock gRPC stream
// ---------------------------------------------------------------------------

function createMockStream() {
  const writeFn = mock(() => true);
  return {
    stream: { write: writeFn } as unknown as grpc.ServerWritableStream<
      SubscribeRequestMessage,
      PolicyUpdateMessage
    >,
    writeFn,
  };
}

describe("KernelTracker", () => {
  let tracker: KernelTracker;

  beforeEach(() => {
    tracker = new KernelTracker();
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------
  describe("register", () => {
    it("adds a connection and increments count", () => {
      const { stream } = createMockStream();

      tracker.register("k1", "org1", "dept1", "team1", stream);

      expect(tracker.connectedCount()).toBe(1);
      const conn = tracker.getConnection("k1");
      expect(conn).toBeDefined();
      expect(conn!.kernelId).toBe("k1");
      expect(conn!.orgId).toBe("org1");
      expect(conn!.deptId).toBe("dept1");
      expect(conn!.teamId).toBe("team1");
      expect(conn!.currentVersion).toBe(0);
      expect(conn!.lastAckAt).toBeNull();
    });

    it("replaces existing connection on reconnect", () => {
      const { stream: stream1 } = createMockStream();
      const { stream: stream2 } = createMockStream();

      tracker.register("k1", "org1", "dept1", "team1", stream1);
      tracker.register("k1", "org1", "dept1", "team1", stream2);

      expect(tracker.connectedCount()).toBe(1);
      const conn = tracker.getConnection("k1");
      expect(conn!.stream).toBe(stream2);
    });

    it("supports multiple concurrent kernels", () => {
      const { stream: s1 } = createMockStream();
      const { stream: s2 } = createMockStream();
      const { stream: s3 } = createMockStream();

      tracker.register("k1", "org1", "d1", "t1", s1);
      tracker.register("k2", "org1", "d1", "t1", s2);
      tracker.register("k3", "org2", "d2", "t2", s3);

      expect(tracker.connectedCount()).toBe(3);
      expect(tracker.getConnected()).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // unregister
  // -----------------------------------------------------------------------
  describe("unregister", () => {
    it("removes a connection and decrements count", () => {
      const { stream } = createMockStream();
      tracker.register("k1", "org1", "dept1", "team1", stream);

      tracker.unregister("k1");

      expect(tracker.connectedCount()).toBe(0);
      expect(tracker.getConnection("k1")).toBeUndefined();
    });

    it("is a no-op for unknown kernelId", () => {
      tracker.unregister("nonexistent");
      expect(tracker.connectedCount()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // acknowledge
  // -----------------------------------------------------------------------
  describe("acknowledge", () => {
    it("updates currentVersion and lastAckAt on ACK", () => {
      const { stream } = createMockStream();
      tracker.register("k1", "org1", "d1", "t1", stream);

      tracker.acknowledge("k1", 42, true, "");

      const conn = tracker.getConnection("k1");
      expect(conn!.currentVersion).toBe(42);
      expect(conn!.lastAckAt).toBeDefined();
      expect(conn!.lastAckAt).toBeInstanceOf(Date);
    });

    it("does not update version on NACK", () => {
      const { stream } = createMockStream();
      tracker.register("k1", "org1", "d1", "t1", stream);

      tracker.acknowledge("k1", 42, false, "compilation error");

      const conn = tracker.getConnection("k1");
      expect(conn!.currentVersion).toBe(0);
      expect(conn!.lastAckAt).toBeNull();
    });

    it("handles ACK from unknown kernel gracefully", () => {
      // Should not throw
      tracker.acknowledge("unknown", 1, true, "");
      expect(tracker.connectedCount()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getConnected / getConnection
  // -----------------------------------------------------------------------
  describe("getConnected", () => {
    it("returns all active connections as an array", () => {
      const { stream: s1 } = createMockStream();
      const { stream: s2 } = createMockStream();

      tracker.register("k1", "org1", "d1", "t1", s1);
      tracker.register("k2", "org2", "d2", "t2", s2);

      const connected = tracker.getConnected();
      expect(connected).toHaveLength(2);
      expect(connected.map((c) => c.kernelId).sort()).toEqual(["k1", "k2"]);
    });

    it("returns empty array when no connections", () => {
      expect(tracker.getConnected()).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// broadcastUpdate — uses the singleton kernelTracker
// ---------------------------------------------------------------------------
describe("broadcastUpdate", () => {
  beforeEach(() => {
    // Clear all connections from the singleton
    for (const conn of kernelTracker.getConnected()) {
      kernelTracker.unregister(conn.kernelId);
    }
  });

  const sampleUpdate: PolicyUpdateMessage = {
    version: 1,
    type: 1,
    policies: [],
    removed_policy_ids: [],
  };

  it("writes update to all connected kernel streams", () => {
    const { stream: s1, writeFn: w1 } = createMockStream();
    const { stream: s2, writeFn: w2 } = createMockStream();

    kernelTracker.register("b1", "org", "d", "t", s1);
    kernelTracker.register("b2", "org", "d", "t", s2);

    broadcastUpdate(sampleUpdate);

    expect(w1).toHaveBeenCalledTimes(1);
    expect(w1).toHaveBeenCalledWith(sampleUpdate);
    expect(w2).toHaveBeenCalledTimes(1);
    expect(w2).toHaveBeenCalledWith(sampleUpdate);
  });

  it("unregisters kernels that fail on write", () => {
    const { stream: sGood, writeFn: wGood } = createMockStream();
    const failWriteFn = mock(() => {
      throw new Error("stream closed");
    });
    const sFail = { write: failWriteFn } as unknown as grpc.ServerWritableStream<
      SubscribeRequestMessage,
      PolicyUpdateMessage
    >;

    kernelTracker.register("good", "org", "d", "t", sGood);
    kernelTracker.register("bad", "org", "d", "t", sFail);

    broadcastUpdate(sampleUpdate);

    expect(wGood).toHaveBeenCalledTimes(1);
    // Failed kernel should be unregistered
    expect(kernelTracker.getConnection("bad")).toBeUndefined();
    expect(kernelTracker.getConnection("good")).toBeDefined();
  });

  it("handles broadcast with no connected kernels", () => {
    // Should not throw
    broadcastUpdate(sampleUpdate);
  });
});
