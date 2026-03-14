/**
 * Department Override Service Tests
 *
 * Unit tests for department policy override operations:
 * - Effective policy resolution (global + department overrides)
 * - Override creation with mandatory policy enforcement
 * - Override removal
 * - Membership verification
 */

import { describe, expect, test } from "bun:test";
import { DepartmentOverrideService } from "./service";

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
    return this;
  }

  onConflictDoNothing() {
    return this;
  }

  onConflictDoUpdate(_config: unknown) {
    return this;
  }

  returning(_fields?: unknown) {
    const result = this.db.nextReturning();
    return Promise.resolve(result);
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
  constructor(
    private readonly selectResponses: unknown[][],
    private readonly returningResponses: unknown[][] = [],
  ) {}

  inserts: Array<{ table: unknown; value: unknown }> = [];
  updates: unknown[] = [];
  deletes: unknown[] = [];

  nextSelect(): unknown[] {
    return this.selectResponses.shift() ?? [];
  }

  nextReturning(): unknown[] {
    return this.returningResponses.shift() ?? [];
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
// Tests
// ---------------------------------------------------------------------------

describe("DepartmentOverrideService", () => {
  describe("getEffectivePolicies", () => {
    test("returns effective policies for a department (super_admin bypasses membership)", async () => {
      // No membership check for super_admin, just the LEFT JOIN query
      const fakeDb = new FakeDb([
        [
          {
            policyId: "pol-1",
            name: "content-filter",
            description: "Filters content",
            globalEnabled: true,
            isMandatory: false,
            overrideId: null,
            overrideEnabled: null,
          },
          {
            policyId: "pol-2",
            name: "pii-detector",
            description: "Detects PII",
            globalEnabled: true,
            isMandatory: true,
            overrideId: "ovr-1",
            overrideEnabled: false,
          },
        ],
      ]);

      const service = new DepartmentOverrideService(fakeDb as never);
      const result = await service.getEffectivePolicies("dept-1", "user-1", "super_admin");

      expect(result).toHaveLength(2);

      // First policy: no override, effective = global
      expect(result[0].policyId).toBe("pol-1");
      expect(result[0].effectiveEnabled).toBe(true);
      expect(result[0].source).toBe("Global");
      expect(result[0].overrideId).toBeNull();

      // Second policy: has override, effective = override value
      expect(result[1].policyId).toBe("pol-2");
      expect(result[1].effectiveEnabled).toBe(false);
      expect(result[1].source).toBe("Department override");
      expect(result[1].overrideId).toBe("ovr-1");
    });

    test("verifies membership for non-bypass roles", async () => {
      // First select: membership check (empty = not a member)
      const fakeDb = new FakeDb([[]]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(service.getEffectivePolicies("dept-1", "user-1", "viewer")).rejects.toThrow(
        "You do not belong to this department",
      );
    });

    test("compliance_officer bypasses membership check", async () => {
      const fakeDb = new FakeDb([
        [
          {
            policyId: "pol-1",
            name: "test-policy",
            description: null,
            globalEnabled: true,
            isMandatory: false,
            overrideId: null,
            overrideEnabled: null,
          },
        ],
      ]);

      const service = new DepartmentOverrideService(fakeDb as never);
      const result = await service.getEffectivePolicies("dept-1", "user-1", "compliance_officer");

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("");
    });

    test("returns empty array when no policies exist", async () => {
      const fakeDb = new FakeDb([[]]);

      const service = new DepartmentOverrideService(fakeDb as never);
      const result = await service.getEffectivePolicies("dept-1", "user-1", "super_admin");

      expect(result).toHaveLength(0);
    });
  });

  describe("setOverride", () => {
    test("creates override for an existing non-mandatory policy", async () => {
      // First select: membership check not needed (super_admin)
      // Second select (via limit): policy lookup
      const fakeDb = new FakeDb(
        [
          [{ id: "pol-1", isMandatory: false }], // policy exists, not mandatory
        ],
        [
          [{ id: "ovr-new" }], // returning from upsert
        ],
      );

      const service = new DepartmentOverrideService(fakeDb as never);
      const result = await service.setOverride("dept-1", "pol-1", false, "user-1", "super_admin");

      expect(result.id).toBe("ovr-new");
      expect(fakeDb.inserts).toHaveLength(1);
    });

    test("rejects disabling a mandatory policy", async () => {
      const fakeDb = new FakeDb([[{ id: "pol-mandatory", isMandatory: true }]]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(
        service.setOverride("dept-1", "pol-mandatory", false, "user-1", "super_admin"),
      ).rejects.toThrow("Cannot disable mandatory policy");
    });

    test("allows enabling a mandatory policy (override enabled=true)", async () => {
      const fakeDb = new FakeDb(
        [[{ id: "pol-mandatory", isMandatory: true }]],
        [[{ id: "ovr-1" }]],
      );

      const service = new DepartmentOverrideService(fakeDb as never);
      const result = await service.setOverride(
        "dept-1",
        "pol-mandatory",
        true,
        "user-1",
        "super_admin",
      );

      expect(result.id).toBe("ovr-1");
    });

    test("throws NotFoundError when policy does not exist", async () => {
      const fakeDb = new FakeDb([
        [], // policy lookup returns empty
      ]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(
        service.setOverride("dept-1", "nonexistent", true, "user-1", "super_admin"),
      ).rejects.toThrow("Policy not found");
    });

    test("verifies membership for non-bypass roles before setting override", async () => {
      // First select: membership check (empty = not a member)
      const fakeDb = new FakeDb([[]]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(
        service.setOverride("dept-1", "pol-1", true, "user-1", "dept_admin"),
      ).rejects.toThrow("You do not belong to this department");
    });
  });

  describe("removeOverride", () => {
    test("removes an existing override (super_admin)", async () => {
      // First select: override lookup
      const fakeDb = new FakeDb([[{ id: "ovr-1", departmentId: "dept-1" }]]);

      const service = new DepartmentOverrideService(fakeDb as never);
      await service.removeOverride("ovr-1", "user-1", "super_admin");

      expect(fakeDb.deletes).toHaveLength(1);
    });

    test("throws NotFoundError when override does not exist", async () => {
      const fakeDb = new FakeDb([
        [], // override lookup returns empty
      ]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(service.removeOverride("nonexistent", "user-1", "super_admin")).rejects.toThrow(
        "Override not found",
      );
    });

    test("verifies membership for non-bypass roles before removing", async () => {
      // First select: override lookup succeeds
      // Second select: membership check fails (empty)
      const fakeDb = new FakeDb([
        [{ id: "ovr-1", departmentId: "dept-1" }],
        [], // not a member
      ]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(service.removeOverride("ovr-1", "user-1", "viewer")).rejects.toThrow(
        "You do not belong to this department",
      );
    });
  });

  describe("setMandatory", () => {
    test("sets mandatory flag and removes conflicting overrides", async () => {
      // First select: policy exists
      const fakeDb = new FakeDb([[{ id: "pol-1" }]]);

      const service = new DepartmentOverrideService(fakeDb as never);
      await service.setMandatory("pol-1", true);

      // Should update the policy's isMandatory flag
      expect(fakeDb.updates).toHaveLength(1);
      const updatePayload = fakeDb.updates[0] as { isMandatory: boolean };
      expect(updatePayload.isMandatory).toBe(true);

      // Should delete overrides that disable the now-mandatory policy
      expect(fakeDb.deletes).toHaveLength(1);
    });

    test("unsetting mandatory does not delete overrides", async () => {
      const fakeDb = new FakeDb([[{ id: "pol-1" }]]);

      const service = new DepartmentOverrideService(fakeDb as never);
      await service.setMandatory("pol-1", false);

      expect(fakeDb.updates).toHaveLength(1);
      const updatePayload = fakeDb.updates[0] as { isMandatory: boolean };
      expect(updatePayload.isMandatory).toBe(false);

      // Should NOT delete any overrides when unsetting mandatory
      expect(fakeDb.deletes).toHaveLength(0);
    });

    test("throws NotFoundError when policy does not exist", async () => {
      const fakeDb = new FakeDb([
        [], // policy not found
      ]);

      const service = new DepartmentOverrideService(fakeDb as never);

      await expect(service.setMandatory("nonexistent", true)).rejects.toThrow("Policy not found");
    });
  });
});
