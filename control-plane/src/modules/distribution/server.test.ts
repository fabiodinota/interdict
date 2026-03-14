/**
 * Distribution Server Tests
 *
 * Unit tests for the gRPC distribution server handlers:
 * - buildFullSnapshot scope matching and filtering
 * - ACK/NACK acknowledgement recording via kernelTracker
 *
 * These tests focus on the exported buildFullSnapshot function and
 * the kernelTracker acknowledge logic without starting a real gRPC server.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { buildFullSnapshot } from "./server";
import { KernelTracker } from "./tracker";

// ---------------------------------------------------------------------------
// FakeDb infrastructure (matches auth/service.test.ts pattern)
// ---------------------------------------------------------------------------

function createSelectBuilder(db: FakeDb) {
  const result = db.nextSelect();
  const builder = Promise.resolve(result) as Promise<unknown[]> & {
    from: (_table: unknown) => typeof builder;
    where: (_condition: unknown) => typeof builder;
    orderBy: (..._values: unknown[]) => typeof builder;
    innerJoin: (_table: unknown, _condition: unknown) => typeof builder;
    leftJoin: (_table: unknown, _condition: unknown) => typeof builder;
    limit: (_value: number) => Promise<unknown[]>;
  };

  builder.from = (_table: unknown) => builder;
  builder.where = (_condition: unknown) => builder;
  builder.orderBy = (..._values: unknown[]) => builder;
  builder.innerJoin = (_table: unknown, _condition: unknown) => builder;
  builder.leftJoin = (_table: unknown, _condition: unknown) => builder;
  builder.limit = (_value: number) => Promise.resolve(result);

  return builder;
}

class InsertBuilder {
  constructor(
    private readonly db: FakeDb,
    private readonly table: unknown,
  ) {}

  values(value: unknown) {
    this.db.inserts.push({ table: this.table, value });
    return Promise.resolve();
  }
}

class UpdateBuilder {
  constructor(private readonly db: FakeDb) {}

  set(value: unknown) {
    this.db.updates.push(value);
    return {
      where: (_condition: unknown) => Promise.resolve([]),
    };
  }
}

class DeleteBuilder {
  constructor(private readonly db: FakeDb) {}

  where(condition: unknown) {
    this.db.deletes.push(condition);
    return Promise.resolve();
  }
}

class FakeDb {
  constructor(private readonly selectResponses: unknown[][]) {}

  inserts: Array<{ table: unknown; value: unknown }> = [];
  updates: unknown[] = [];
  deletes: unknown[] = [];

  nextSelect(): unknown[] {
    return this.selectResponses.shift() ?? [];
  }

  select(..._fields: unknown[]) {
    return createSelectBuilder(this);
  }

  insert(table: unknown) {
    return new InsertBuilder(this, table);
  }

  update(_table: unknown) {
    return new UpdateBuilder(this);
  }

  delete(_table: unknown) {
    return new DeleteBuilder(this);
  }
}

// ---------------------------------------------------------------------------
// buildFullSnapshot tests
// ---------------------------------------------------------------------------

describe("buildFullSnapshot", () => {
  test("throws when orgId is empty", async () => {
    const fakeDb = new FakeDb([]);

    await expect(buildFullSnapshot(fakeDb as never, "", "", "")).rejects.toThrow("orgId required");
  });

  test("returns empty policies when no active policies exist", async () => {
    // First select: max version query
    // Second select: active policies query (empty)
    const fakeDb = new FakeDb([[{ maxVersion: 0 }], []]);

    const snapshot = await buildFullSnapshot(fakeDb as never, "acme", "", "");

    expect(snapshot.version).toBe(0);
    expect(snapshot.type).toBe(1); // UPDATE_TYPE_FULL_SNAPSHOT
    expect(snapshot.policies).toHaveLength(0);
    expect(snapshot.removed_policy_ids).toHaveLength(0);
  });

  test("returns policies with org-wide scope when no scope assignments exist", async () => {
    // First select: max version
    // Second select: active policies with compiled versions
    // Third select: scope assignments (empty — defaults to org-wide)
    const fakeDb = new FakeDb([
      [{ maxVersion: 5 }],
      [
        {
          policyId: "policy-1",
          policyName: "content-filter",
          versionId: "ver-1",
          version: 5,
          wasmPath: null,
          wasmHash: null,
          regoSource: "package policy\ndefault allow = false",
          entrypoint: "policy/allow",
        },
      ],
      [], // no scope assignments
    ]);

    const snapshot = await buildFullSnapshot(fakeDb as never, "acme", "", "");

    expect(snapshot.version).toBe(5);
    expect(snapshot.policies).toHaveLength(1);
    expect(snapshot.policies[0].policy_id).toBe("policy-1");
    expect(snapshot.policies[0].name).toBe("content-filter");
    expect(snapshot.policies[0].scope.org_id).toBe("acme");
    expect(snapshot.policies[0].scope.dept_id).toBe("");
    expect(snapshot.policies[0].scope.team_id).toBe("");
    expect(snapshot.policies[0].fail_mode).toBe(1); // FAIL_MODE_FAIL_CLOSED
  });

  test("filters policies by department scope", async () => {
    const fakeDb = new FakeDb([
      [{ maxVersion: 3 }],
      [
        {
          policyId: "policy-eng",
          policyName: "eng-policy",
          versionId: "ver-1",
          version: 3,
          wasmPath: null,
          wasmHash: null,
          regoSource: "package eng",
          entrypoint: "eng/allow",
        },
        {
          policyId: "policy-legal",
          policyName: "legal-policy",
          versionId: "ver-2",
          version: 3,
          wasmPath: null,
          wasmHash: null,
          regoSource: "package legal",
          entrypoint: "legal/allow",
        },
      ],
      [
        {
          policyId: "policy-eng",
          orgId: "acme",
          deptId: "engineering",
          teamId: "",
          vendorIds: null,
        },
        {
          policyId: "policy-legal",
          orgId: "acme",
          deptId: "legal",
          teamId: "",
          vendorIds: null,
        },
      ],
    ]);

    // Subscribe as engineering department kernel
    const snapshot = await buildFullSnapshot(fakeDb as never, "acme", "engineering", "");

    // Should include eng policy (same dept) but not legal policy (different dept)
    expect(snapshot.policies).toHaveLength(1);
    expect(snapshot.policies[0].policy_id).toBe("policy-eng");
    expect(snapshot.policies[0].scope.dept_id).toBe("engineering");
  });

  test("org-level kernel receives all org policies regardless of dept/team scope", async () => {
    const fakeDb = new FakeDb([
      [{ maxVersion: 2 }],
      [
        {
          policyId: "policy-a",
          policyName: "org-wide",
          versionId: "ver-1",
          version: 2,
          wasmPath: null,
          wasmHash: null,
          regoSource: "package a",
          entrypoint: "a/allow",
        },
        {
          policyId: "policy-b",
          policyName: "dept-scoped",
          versionId: "ver-2",
          version: 2,
          wasmPath: null,
          wasmHash: null,
          regoSource: "package b",
          entrypoint: "b/allow",
        },
      ],
      [
        {
          policyId: "policy-a",
          orgId: "acme",
          deptId: "",
          teamId: "",
          vendorIds: null,
        },
        {
          policyId: "policy-b",
          orgId: "acme",
          deptId: "engineering",
          teamId: "backend",
          vendorIds: null,
        },
      ],
    ]);

    // Org-level kernel (no dept/team) should see everything
    const snapshot = await buildFullSnapshot(fakeDb as never, "acme", "", "");

    expect(snapshot.policies).toHaveLength(2);
  });

  test("policy from a different org is excluded", async () => {
    const fakeDb = new FakeDb([
      [{ maxVersion: 1 }],
      [
        {
          policyId: "policy-other",
          policyName: "other-org-policy",
          versionId: "ver-1",
          version: 1,
          wasmPath: null,
          wasmHash: null,
          regoSource: "package other",
          entrypoint: "other/allow",
        },
      ],
      [
        {
          policyId: "policy-other",
          orgId: "other-org",
          deptId: "",
          teamId: "",
          vendorIds: null,
        },
      ],
    ]);

    const snapshot = await buildFullSnapshot(fakeDb as never, "acme", "", "");

    expect(snapshot.policies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// KernelTracker ACK/NACK tests
// ---------------------------------------------------------------------------

describe("KernelTracker acknowledgement", () => {
  let tracker: KernelTracker;

  beforeEach(() => {
    tracker = new KernelTracker();
  });

  test("ACK updates kernel currentVersion and lastAckAt", () => {
    // Register a kernel with a fake stream
    const fakeStream = {} as never;
    tracker.register("kernel-1", "acme", "eng", "backend", fakeStream);

    tracker.acknowledge("kernel-1", 5, true, "");

    const conn = tracker.getConnection("kernel-1");
    expect(conn).toBeDefined();
    expect(conn?.currentVersion).toBe(5);
    expect(conn?.lastAckAt).not.toBeNull();
  });

  test("NACK does not update currentVersion", () => {
    const fakeStream = {} as never;
    tracker.register("kernel-2", "acme", "eng", "", fakeStream);

    tracker.acknowledge("kernel-2", 3, false, "wasm validation failed");

    const conn = tracker.getConnection("kernel-2");
    expect(conn).toBeDefined();
    expect(conn?.currentVersion).toBe(0); // unchanged from initial
    expect(conn?.lastAckAt).toBeNull(); // not updated on NACK
  });

  test("ACK for unknown kernel does not throw", () => {
    // Should silently warn, not crash
    expect(() => {
      tracker.acknowledge("nonexistent-kernel", 1, true, "");
    }).not.toThrow();
  });

  test("multiple ACKs update version progressively", () => {
    const fakeStream = {} as never;
    tracker.register("kernel-3", "acme", "", "", fakeStream);

    tracker.acknowledge("kernel-3", 1, true, "");
    tracker.acknowledge("kernel-3", 2, true, "");
    tracker.acknowledge("kernel-3", 5, true, "");

    const conn = tracker.getConnection("kernel-3");
    expect(conn?.currentVersion).toBe(5);
  });

  test("register replaces existing connection for same kernel", () => {
    const fakeStream1 = {} as never;
    const fakeStream2 = { marker: "new" } as never;

    tracker.register("kernel-1", "acme", "eng", "", fakeStream1);
    tracker.acknowledge("kernel-1", 3, true, "");

    // Reconnect
    tracker.register("kernel-1", "acme", "eng", "backend", fakeStream2);

    const conn = tracker.getConnection("kernel-1");
    expect(conn?.currentVersion).toBe(0); // reset on reconnect
    expect(conn?.teamId).toBe("backend"); // updated scope
    expect(tracker.connectedCount()).toBe(1); // no duplicate
  });

  test("unregister removes the kernel connection", () => {
    const fakeStream = {} as never;
    tracker.register("kernel-1", "acme", "", "", fakeStream);

    expect(tracker.connectedCount()).toBe(1);

    tracker.unregister("kernel-1");

    expect(tracker.connectedCount()).toBe(0);
    expect(tracker.getConnection("kernel-1")).toBeUndefined();
  });
});
