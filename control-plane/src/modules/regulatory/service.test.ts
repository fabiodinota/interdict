/**
 * RegulatoryService Tests
 *
 * Tests for framework management: list, get by slug, activate, deactivate,
 * per-policy toggle, and additive active policy merge.
 *
 * Uses mock database layer to test business logic in isolation.
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { RegulatoryService } from "./service";
import { NotFoundError } from "../../shared/utilities";

/**
 * In-memory mock database for regulatory service testing.
 * Simulates Drizzle ORM query results without requiring PostgreSQL.
 */
function createMockDb() {
  const frameworksData: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    jurisdiction: string | null;
    version: string | null;
    isSeeded: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const frameworkPoliciesData: Array<{
    id: string;
    frameworkId: string;
    policyId: string;
    requirementRef: string | null;
    requirementDescription: string | null;
    isRequired: boolean;
    sortOrder: number;
    createdAt: Date;
  }> = [];

  const frameworkActivationsData: Array<{
    id: string;
    frameworkId: string;
    activatedBy: string | null;
    isActive: boolean;
    activatedAt: Date;
    deactivatedAt: Date | null;
  }> = [];

  const policiesData: Array<{
    id: string;
    name: string;
    description: string | null;
    currentVersionId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
  }> = [];

  const policyVersionsData: Array<{
    id: string;
    policyId: string;
    version: number;
    compilationStatus: string;
  }> = [];

  let idCounter = 0;
  const nextId = () => `00000000-0000-0000-0000-${String(++idCounter).padStart(12, "0")}`;

  return {
    data: {
      frameworks: frameworksData,
      frameworkPolicies: frameworkPoliciesData,
      frameworkActivations: frameworkActivationsData,
      policies: policiesData,
      policyVersions: policyVersionsData,
    },
    nextId,
    addFramework(slug: string, name: string, opts?: { jurisdiction?: string; isSeeded?: boolean }) {
      const id = nextId();
      frameworksData.push({
        id,
        slug,
        name,
        description: `${name} framework`,
        jurisdiction: opts?.jurisdiction ?? "EU",
        version: "2024",
        isSeeded: opts?.isSeeded ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return id;
    },
    addPolicy(name: string) {
      const policyId = nextId();
      const versionId = nextId();
      policiesData.push({
        id: policyId,
        name,
        description: null,
        currentVersionId: versionId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
      });
      policyVersionsData.push({
        id: versionId,
        policyId,
        version: 1,
        compilationStatus: "pending",
      });
      return policyId;
    },
    addFrameworkPolicy(
      frameworkId: string,
      policyId: string,
      opts?: {
        requirementRef?: string;
        requirementDescription?: string;
        isRequired?: boolean;
        sortOrder?: number;
      }
    ) {
      const id = nextId();
      frameworkPoliciesData.push({
        id,
        frameworkId,
        policyId,
        requirementRef: opts?.requirementRef ?? null,
        requirementDescription: opts?.requirementDescription ?? null,
        isRequired: opts?.isRequired ?? true,
        sortOrder: opts?.sortOrder ?? 0,
        createdAt: new Date(),
      });
      return id;
    },
    addActivation(frameworkId: string, isActive: boolean) {
      const id = nextId();
      frameworkActivationsData.push({
        id,
        frameworkId,
        activatedBy: null,
        isActive,
        activatedAt: new Date(),
        deactivatedAt: isActive ? null : new Date(),
      });
      return id;
    },
  };
}

describe("RegulatoryService", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: RegulatoryService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new RegulatoryService(mockDb.data);
  });

  describe("list()", () => {
    it("returns all available frameworks with activation status", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const policyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      mockDb.addFrameworkPolicy(fwId, policyId, { isRequired: true });
      mockDb.addActivation(fwId, true);

      const result = service.list();

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("eu-ai-act");
      expect(result[0].name).toBe("EU AI Act");
      expect(result[0].isActive).toBe(true);
      expect(result[0].policyCount).toBe(1);
      expect(result[0].activePolicyCount).toBe(1);
    });

    it("returns frameworks sorted by name", () => {
      mockDb.addFramework("gdpr", "GDPR");
      mockDb.addFramework("eu-ai-act", "EU AI Act");

      const result = service.list();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("EU AI Act");
      expect(result[1].name).toBe("GDPR");
    });

    it("shows inactive when no activation exists", () => {
      mockDb.addFramework("eu-ai-act", "EU AI Act");

      const result = service.list();

      expect(result[0].isActive).toBe(false);
    });
  });

  describe("getBySlug()", () => {
    it("returns framework with policies and requirement references", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const policyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      mockDb.addFrameworkPolicy(fwId, policyId, {
        requirementRef: "Article 13 - Transparency",
        requirementDescription: "AI systems must provide transparency",
        isRequired: true,
        sortOrder: 1,
      });

      const result = service.getBySlug("eu-ai-act");

      expect(result.slug).toBe("eu-ai-act");
      expect(result.policies).toHaveLength(1);
      expect(result.policies[0].requirementRef).toBe("Article 13 - Transparency");
      expect(result.policies[0].policyName).toBe("eu-ai-act/transparency-notice");
    });

    it("throws NotFoundError for non-existent slug", () => {
      expect(() => service.getBySlug("nonexistent")).toThrow(NotFoundError);
    });
  });

  describe("activate()", () => {
    it("creates activation record and marks framework active", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");

      service.activate(fwId);

      const activations = mockDb.data.frameworkActivations.filter(
        (a) => a.frameworkId === fwId
      );
      expect(activations).toHaveLength(1);
      expect(activations[0].isActive).toBe(true);
    });

    it("is a no-op when framework already active", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      mockDb.addActivation(fwId, true);

      service.activate(fwId);

      // Should not add another activation record
      const activations = mockDb.data.frameworkActivations.filter(
        (a) => a.frameworkId === fwId
      );
      expect(activations).toHaveLength(1);
    });

    it("does NOT affect existing custom policies (additive behavior)", () => {
      // Custom policy exists independently
      const customPolicyId = mockDb.addPolicy("custom/my-policy");

      // Framework with its own policy
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const fwPolicyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      mockDb.addFrameworkPolicy(fwId, fwPolicyId);

      // Activate framework
      service.activate(fwId);

      // Custom policy should still be active (untouched)
      const customPolicy = mockDb.data.policies.find((p) => p.id === customPolicyId);
      expect(customPolicy?.isActive).toBe(true);
    });
  });

  describe("deactivate()", () => {
    it("sets is_active=false and records deactivated_at timestamp", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      mockDb.addActivation(fwId, true);

      service.deactivate(fwId);

      const activation = mockDb.data.frameworkActivations.find(
        (a) => a.frameworkId === fwId
      );
      expect(activation?.isActive).toBe(false);
      expect(activation?.deactivatedAt).not.toBeNull();
    });

    it("is a no-op when framework not active", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");

      // Should not throw
      service.deactivate(fwId);
      expect(mockDb.data.frameworkActivations).toHaveLength(0);
    });
  });

  describe("togglePolicy()", () => {
    it("sets is_required=false for individual framework policy", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const policyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      const fpId = mockDb.addFrameworkPolicy(fwId, policyId, { isRequired: true });

      service.togglePolicy(fpId, false);

      const fp = mockDb.data.frameworkPolicies.find((p) => p.id === fpId);
      expect(fp?.isRequired).toBe(false);
    });

    it("can re-enable a previously disabled policy", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const policyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      const fpId = mockDb.addFrameworkPolicy(fwId, policyId, { isRequired: false });

      service.togglePolicy(fpId, true);

      const fp = mockDb.data.frameworkPolicies.find((p) => p.id === fpId);
      expect(fp?.isRequired).toBe(true);
    });
  });

  describe("re-activation", () => {
    it("re-activating a deactivated framework works correctly", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      mockDb.addActivation(fwId, false); // was deactivated

      service.activate(fwId);

      const activeActivations = mockDb.data.frameworkActivations.filter(
        (a) => a.frameworkId === fwId && a.isActive
      );
      expect(activeActivations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getActiveFrameworks()", () => {
    it("returns only currently active frameworks", () => {
      const fwId1 = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const fwId2 = mockDb.addFramework("gdpr", "GDPR");
      mockDb.addActivation(fwId1, true);
      // fwId2 not activated

      const result = service.getActiveFrameworks();

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("eu-ai-act");
    });
  });

  describe("getActivePolicies()", () => {
    it("returns merged set of custom active policies and framework active policies", () => {
      // Custom active policy
      const customPolicyId = mockDb.addPolicy("custom/my-policy");

      // Framework policy
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const fwPolicyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      mockDb.addFrameworkPolicy(fwId, fwPolicyId, { isRequired: true });
      mockDb.addActivation(fwId, true);

      const result = service.getActivePolicies();

      // Should include both custom and framework policies
      expect(result).toContain(customPolicyId);
      expect(result).toContain(fwPolicyId);
    });

    it("excludes framework policies where is_required=false", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const policyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      mockDb.addFrameworkPolicy(fwId, policyId, { isRequired: false });
      mockDb.addActivation(fwId, true);

      const result = service.getActivePolicies();

      expect(result).not.toContain(policyId);
    });

    it("excludes policies from inactive frameworks", () => {
      const fwId = mockDb.addFramework("eu-ai-act", "EU AI Act");
      const policyId = mockDb.addPolicy("eu-ai-act/transparency-notice");
      mockDb.addFrameworkPolicy(fwId, policyId, { isRequired: true });
      // Framework NOT activated

      const result = service.getActivePolicies();

      expect(result).not.toContain(policyId);
    });
  });
});
