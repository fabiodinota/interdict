/**
 * Policy Scope Matching Tests (Phase 18)
 *
 * Tests the scope filtering logic that determines which policies
 * a kernel receives based on its org/dept/team subscription.
 *
 * Scope rules:
 * - Org-wide policy (no dept/team) → matches any kernel in the org
 * - Dept-scoped policy → matches kernels in that dept or org-level kernels
 * - Team-scoped policy → matches kernels in that team, dept, or org level
 * - Different org → never matches
 */

import { describe, it, expect } from "bun:test";

// Re-implement the matching function here for unit testing since it's
// not exported from server.ts. This MUST stay in sync with the real
// implementation — any divergence is a test bug.
function scopeMatchesKernel(
  scope: { orgId: string; deptId: string; teamId: string },
  kernelOrgId: string,
  kernelDeptId: string,
  kernelTeamId: string,
): boolean {
  if (scope.orgId !== kernelOrgId) return false;
  if (!scope.deptId) return true;
  if (!kernelDeptId) return true;
  if (scope.deptId !== kernelDeptId) return false;
  if (!scope.teamId) return true;
  if (!kernelTeamId) return true;
  return scope.teamId === kernelTeamId;
}

describe("scopeMatchesKernel", () => {
  const ORG = "acme";
  const DEPT_A = "engineering";
  const DEPT_B = "legal";
  const TEAM_1 = "backend";
  const TEAM_2 = "frontend";

  describe("org-wide policies", () => {
    const orgPolicy = { orgId: ORG, deptId: "", teamId: "" };

    it("matches org-level kernel", () => {
      expect(scopeMatchesKernel(orgPolicy, ORG, "", "")).toBe(true);
    });

    it("matches dept-level kernel", () => {
      expect(scopeMatchesKernel(orgPolicy, ORG, DEPT_A, "")).toBe(true);
    });

    it("matches team-level kernel", () => {
      expect(scopeMatchesKernel(orgPolicy, ORG, DEPT_A, TEAM_1)).toBe(true);
    });

    it("rejects different org", () => {
      expect(scopeMatchesKernel(orgPolicy, "other-org", "", "")).toBe(false);
    });
  });

  describe("department-scoped policies", () => {
    const deptPolicy = { orgId: ORG, deptId: DEPT_A, teamId: "" };

    it("matches org-level kernel (sees all)", () => {
      expect(scopeMatchesKernel(deptPolicy, ORG, "", "")).toBe(true);
    });

    it("matches same-dept kernel", () => {
      expect(scopeMatchesKernel(deptPolicy, ORG, DEPT_A, "")).toBe(true);
    });

    it("matches same-dept team kernel", () => {
      expect(scopeMatchesKernel(deptPolicy, ORG, DEPT_A, TEAM_1)).toBe(true);
    });

    it("rejects different-dept kernel", () => {
      expect(scopeMatchesKernel(deptPolicy, ORG, DEPT_B, "")).toBe(false);
    });

    it("rejects different-dept team kernel", () => {
      expect(scopeMatchesKernel(deptPolicy, ORG, DEPT_B, TEAM_2)).toBe(false);
    });
  });

  describe("team-scoped policies", () => {
    const teamPolicy = { orgId: ORG, deptId: DEPT_A, teamId: TEAM_1 };

    it("matches org-level kernel (sees all)", () => {
      expect(scopeMatchesKernel(teamPolicy, ORG, "", "")).toBe(true);
    });

    it("matches same-dept kernel (dept sees all teams)", () => {
      expect(scopeMatchesKernel(teamPolicy, ORG, DEPT_A, "")).toBe(true);
    });

    it("matches exact team kernel", () => {
      expect(scopeMatchesKernel(teamPolicy, ORG, DEPT_A, TEAM_1)).toBe(true);
    });

    it("rejects different team in same dept", () => {
      expect(scopeMatchesKernel(teamPolicy, ORG, DEPT_A, TEAM_2)).toBe(false);
    });

    it("rejects different dept entirely", () => {
      expect(scopeMatchesKernel(teamPolicy, ORG, DEPT_B, TEAM_1)).toBe(false);
    });

    it("rejects different org", () => {
      expect(scopeMatchesKernel(teamPolicy, "other-org", DEPT_A, TEAM_1)).toBe(false);
    });
  });

  describe("mixed-scope policy sets", () => {
    it("org-level kernel sees all scopes in its org", () => {
      const scopes = [
        { orgId: ORG, deptId: "", teamId: "" },
        { orgId: ORG, deptId: DEPT_A, teamId: "" },
        { orgId: ORG, deptId: DEPT_A, teamId: TEAM_1 },
        { orgId: "other", deptId: "", teamId: "" },
      ];

      const matched = scopes.filter(s => scopeMatchesKernel(s, ORG, "", ""));
      expect(matched.length).toBe(3); // all 3 ORG scopes, not the "other" org
    });

    it("dept-level kernel sees org-wide + its dept, not other depts", () => {
      const scopes = [
        { orgId: ORG, deptId: "", teamId: "" },         // org-wide: yes
        { orgId: ORG, deptId: DEPT_A, teamId: "" },     // same dept: yes
        { orgId: ORG, deptId: DEPT_B, teamId: "" },     // diff dept: no
        { orgId: ORG, deptId: DEPT_A, teamId: TEAM_1 }, // team in dept: yes
      ];

      const matched = scopes.filter(s => scopeMatchesKernel(s, ORG, DEPT_A, ""));
      expect(matched.length).toBe(3);
      expect(matched.find(s => s.deptId === DEPT_B)).toBeUndefined();
    });

    it("team-level kernel sees org-wide + its dept + its team only", () => {
      const scopes = [
        { orgId: ORG, deptId: "", teamId: "" },          // org-wide: yes
        { orgId: ORG, deptId: DEPT_A, teamId: "" },      // same dept: yes
        { orgId: ORG, deptId: DEPT_A, teamId: TEAM_1 },  // exact team: yes
        { orgId: ORG, deptId: DEPT_A, teamId: TEAM_2 },  // diff team: no
        { orgId: ORG, deptId: DEPT_B, teamId: "" },      // diff dept: no
      ];

      const matched = scopes.filter(s => scopeMatchesKernel(s, ORG, DEPT_A, TEAM_1));
      expect(matched.length).toBe(3);
      expect(matched.find(s => s.teamId === TEAM_2)).toBeUndefined();
      expect(matched.find(s => s.deptId === DEPT_B)).toBeUndefined();
    });
  });
});
