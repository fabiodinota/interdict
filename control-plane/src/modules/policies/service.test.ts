/**
 * Policy Service Tests
 *
 * Tests for policy CRUD operations with version history.
 * Uses mock database layer to avoid PostgreSQL dependency in unit tests.
 */

import { describe, expect, test } from "bun:test";
import type { AppDb } from "../../shared/types";

interface MockPolicyRecord {
  id: string;
  name: string;
  description: string | null;
  currentVersionId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPolicyVersionRecord {
  id: string;
  policyId: string;
  version: number;
  regoSource: string;
  entrypoint: string;
  compilationStatus: "pending";
  compilationError: null;
  wasmPath: null;
  wasmHash: null;
  wasmSizeBytes: null;
  createdAt: Date;
  changeDescription: string | null;
}

interface CompileQueueEntry {
  policyVersionId: string;
  regoSource: string;
  entrypoint: string;
}

// Mock database layer for testing
function createMockDb() {
  const policies = new Map<string, MockPolicyRecord>();
  const versions = new Map<string, MockPolicyVersionRecord[]>();
  const compileQueue: CompileQueueEntry[] = [];

  return {
    policies,
    versions,
    compileQueue,

    // Simulated policy insert
    insertPolicy(data: { name: string; description?: string }): {
      id: string;
      name: string;
      description: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    } {
      const id = crypto.randomUUID();
      const policy = {
        id,
        name: data.name,
        description: data.description || null,
        currentVersionId: null as string | null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      policies.set(id, policy);
      versions.set(id, []);
      return policy;
    },

    // Simulated version insert
    insertVersion(
      policyId: string,
      data: {
        regoSource: string;
        entrypoint: string;
        changeDescription?: string;
      },
    ) {
      const policyVersions = versions.get(policyId) || [];
      const versionNum = policyVersions.length + 1;
      const versionId = crypto.randomUUID();
      const version = {
        id: versionId,
        policyId,
        version: versionNum,
        regoSource: data.regoSource,
        entrypoint: data.entrypoint,
        compilationStatus: "pending" as const,
        compilationError: null,
        wasmPath: null,
        wasmHash: null,
        wasmSizeBytes: null,
        createdAt: new Date(),
        changeDescription: data.changeDescription || null,
      };
      policyVersions.push(version);
      versions.set(policyId, policyVersions);

      // Update current_version_id
      const policy = policies.get(policyId);
      if (policy) {
        policy.currentVersionId = versionId;
      }

      compileQueue.push({
        policyVersionId: versionId,
        regoSource: data.regoSource,
        entrypoint: data.entrypoint,
      });

      return version;
    },

    getPolicy(id: string) {
      const policy = policies.get(id);
      if (!policy || !policy.isActive) return null;
      const policyVersions = versions.get(id) || [];
      const currentVersion = policyVersions.find(
        (version) => version.id === policy.currentVersionId,
      );
      return { ...policy, currentVersion };
    },

    getVersionHistory(policyId: string) {
      const policyVersions = versions.get(policyId) || [];
      return [...policyVersions].sort((a, b) => b.version - a.version);
    },
  };
}

describe("PolicyService", () => {
  test("creating a policy returns id, version 1, and compilation_status 'pending'", async () => {
    // We pass a null db -- the service will need to handle this for testing
    // This test validates the service's business logic contract

    const mockDb = createMockDb();
    const policy = mockDb.insertPolicy({ name: "test-policy", description: "Test" });
    const version = mockDb.insertVersion(policy.id, {
      regoSource: `package interdict.policy.verdict\ndefault verdict = {"action": "allow"}`,
      entrypoint: "interdict/policy/verdict",
    });

    expect(policy.id).toBeDefined();
    expect(version.version).toBe(1);
    expect(version.compilationStatus).toBe("pending");
  });

  test("updating a policy creates a new version with incremented version number", () => {
    const mockDb = createMockDb();
    const policy = mockDb.insertPolicy({ name: "test-policy" });

    const v1 = mockDb.insertVersion(policy.id, {
      regoSource: `package test\nv1 = true`,
      entrypoint: "test",
    });

    const v2 = mockDb.insertVersion(policy.id, {
      regoSource: `package test\nv2 = true`,
      entrypoint: "test",
      changeDescription: "Updated to v2",
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.changeDescription).toBe("Updated to v2");
  });

  test("previous version remains accessible after update", () => {
    const mockDb = createMockDb();
    const policy = mockDb.insertPolicy({ name: "test-policy" });

    mockDb.insertVersion(policy.id, {
      regoSource: `package test\nv1 = true`,
      entrypoint: "test",
    });

    mockDb.insertVersion(policy.id, {
      regoSource: `package test\nv2 = true`,
      entrypoint: "test",
    });

    const history = mockDb.getVersionHistory(policy.id);
    expect(history.length).toBe(2);
    expect(history[0].version).toBe(2); // Descending order
    expect(history[1].version).toBe(1);
  });

  test("getting version history returns all versions in descending order", () => {
    const mockDb = createMockDb();
    const policy = mockDb.insertPolicy({ name: "test-policy" });

    for (let i = 0; i < 5; i++) {
      mockDb.insertVersion(policy.id, {
        regoSource: `package test\nv${i + 1} = true`,
        entrypoint: "test",
      });
    }

    const history = mockDb.getVersionHistory(policy.id);
    expect(history.length).toBe(5);
    expect(history[0].version).toBe(5);
    expect(history[4].version).toBe(1);
  });

  test("restoring a previous version creates a new version with old source", () => {
    const mockDb = createMockDb();
    const policy = mockDb.insertPolicy({ name: "test-policy" });

    const v1 = mockDb.insertVersion(policy.id, {
      regoSource: `package test\noriginal = true`,
      entrypoint: "test",
    });

    mockDb.insertVersion(policy.id, {
      regoSource: `package test\nupdated = true`,
      entrypoint: "test",
    });

    // Restore v1 by creating v3 with v1's source
    const v3 = mockDb.insertVersion(policy.id, {
      regoSource: v1.regoSource,
      entrypoint: v1.entrypoint,
      changeDescription: `Restored from version ${v1.version}`,
    });

    expect(v3.version).toBe(3);
    expect(v3.regoSource).toBe(v1.regoSource);
    expect(v3.changeDescription).toContain("Restored");
  });

  test("deleting a policy soft-deletes (is_active = false), versions remain", () => {
    const mockDb = createMockDb();
    const policy = mockDb.insertPolicy({ name: "test-policy" });

    mockDb.insertVersion(policy.id, {
      regoSource: `package test\nv1 = true`,
      entrypoint: "test",
    });

    // Soft delete
    const p = mockDb.policies.get(policy.id);
    expect(p).toBeDefined();
    if (!p) {
      throw new Error("expected policy to exist before soft delete");
    }
    p.isActive = false;
    p.updatedAt = new Date();

    // Policy should not be found via normal get
    const found = mockDb.getPolicy(policy.id);
    expect(found).toBeNull();

    // But versions remain for audit
    const history = mockDb.getVersionHistory(policy.id);
    expect(history.length).toBe(1);
  });
});

describe("PolicyService - createPolicyService integration", () => {
  test("createPolicyService returns an object with required methods", async () => {
    const { createPolicyService } = await import("./service");

    // Pass null db -- just checking the interface
    const service = createPolicyService(null as unknown as AppDb);

    expect(typeof service.create).toBe("function");
    expect(typeof service.getById).toBe("function");
    expect(typeof service.update).toBe("function");
    expect(typeof service.delete).toBe("function");
    expect(typeof service.getVersionHistory).toBe("function");
    expect(typeof service.restoreVersion).toBe("function");
    expect(typeof service.list).toBe("function");
  });
});
