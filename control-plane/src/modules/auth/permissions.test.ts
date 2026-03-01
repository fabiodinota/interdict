/**
 * Permission Model Tests
 *
 * Tests for role hierarchy, permission checks, and wildcard behavior.
 * TDD RED phase: these tests define the expected behavior of the permissions module.
 */

import { describe, expect, it } from "bun:test";
import {
  ROLE_HIERARCHY,
  DEFAULT_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
  roleHierarchyLevel,
  roleInheritsFrom,
} from "./permissions";

describe("roleHierarchyLevel", () => {
  it("returns 5 for super_admin", () => {
    expect(roleHierarchyLevel("super_admin")).toBe(5);
  });

  it("returns 4 for compliance_officer", () => {
    expect(roleHierarchyLevel("compliance_officer")).toBe(4);
  });

  it("returns 3 for policy_admin", () => {
    expect(roleHierarchyLevel("policy_admin")).toBe(3);
  });

  it("returns 2 for department_manager", () => {
    expect(roleHierarchyLevel("department_manager")).toBe(2);
  });

  it("returns 1 for read_only_auditor", () => {
    expect(roleHierarchyLevel("read_only_auditor")).toBe(1);
  });

  it("returns 0 for unknown/invalid roles", () => {
    expect(roleHierarchyLevel("invalid_role")).toBe(0);
    expect(roleHierarchyLevel("")).toBe(0);
    expect(roleHierarchyLevel("admin")).toBe(0);
  });
});

describe("roleInheritsFrom", () => {
  it("returns true when user role is higher than required role", () => {
    expect(roleInheritsFrom("compliance_officer", "policy_admin")).toBe(true);
    expect(roleInheritsFrom("super_admin", "read_only_auditor")).toBe(true);
    expect(roleInheritsFrom("policy_admin", "department_manager")).toBe(true);
  });

  it("returns true when user role equals required role", () => {
    expect(roleInheritsFrom("policy_admin", "policy_admin")).toBe(true);
    expect(roleInheritsFrom("super_admin", "super_admin")).toBe(true);
    expect(roleInheritsFrom("read_only_auditor", "read_only_auditor")).toBe(true);
  });

  it("returns false when user role is lower than required role", () => {
    expect(roleInheritsFrom("department_manager", "policy_admin")).toBe(false);
    expect(roleInheritsFrom("read_only_auditor", "department_manager")).toBe(false);
    expect(roleInheritsFrom("policy_admin", "compliance_officer")).toBe(false);
  });

  it("returns false for unknown user roles", () => {
    expect(roleInheritsFrom("unknown", "read_only_auditor")).toBe(false);
  });

  it("returns true for any valid role when required role is unknown", () => {
    // Unknown required role has level 0, so any valid role (level >= 1) inherits from it
    expect(roleInheritsFrom("read_only_auditor", "unknown")).toBe(true);
  });
});

describe("hasPermission", () => {
  it("returns true for super_admin with any permission (wildcard)", () => {
    expect(hasPermission("super_admin", "anything")).toBe(true);
    expect(hasPermission("super_admin", "policies:write")).toBe(true);
    expect(hasPermission("super_admin", "users:write")).toBe(true);
    expect(hasPermission("super_admin", "nonexistent:permission")).toBe(true);
  });

  it("returns false for read_only_auditor on write permissions", () => {
    expect(hasPermission("read_only_auditor", "policies:write")).toBe(false);
    expect(hasPermission("read_only_auditor", "users:write")).toBe(false);
    expect(hasPermission("read_only_auditor", "vendors:write")).toBe(false);
  });

  it("returns true for read_only_auditor on read permissions", () => {
    expect(hasPermission("read_only_auditor", "audit:read")).toBe(true);
    expect(hasPermission("read_only_auditor", "stats:read")).toBe(true);
  });

  it("returns true for policy_admin on policy write permissions", () => {
    expect(hasPermission("policy_admin", "policies:write")).toBe(true);
    expect(hasPermission("policy_admin", "policies:read")).toBe(true);
    expect(hasPermission("policy_admin", "vendors:write")).toBe(true);
    expect(hasPermission("policy_admin", "regulatory:write")).toBe(true);
  });

  it("returns true for department_manager on department:manage", () => {
    expect(hasPermission("department_manager", "department:manage")).toBe(true);
  });

  it("returns false for department_manager on policies:write", () => {
    expect(hasPermission("department_manager", "policies:write")).toBe(false);
  });

  it("returns true for compliance_officer on reports:generate", () => {
    expect(hasPermission("compliance_officer", "reports:generate")).toBe(true);
    expect(hasPermission("compliance_officer", "reviews:manage")).toBe(true);
  });

  it("returns false for unknown roles", () => {
    expect(hasPermission("unknown_role", "audit:read")).toBe(false);
  });

  it("uses custom permissions when provided", () => {
    const customPermissions = new Map<string, string[]>();
    customPermissions.set("read_only_auditor", ["audit:read", "stats:read", "policies:read"]);

    // Custom permissions grant policies:read to read_only_auditor
    expect(hasPermission("read_only_auditor", "policies:read", customPermissions)).toBe(true);

    // But not policies:write (not in custom permissions)
    expect(hasPermission("read_only_auditor", "policies:write", customPermissions)).toBe(false);
  });

  it("falls back to default permissions when custom permissions do not include the role", () => {
    const customPermissions = new Map<string, string[]>();
    customPermissions.set("department_manager", ["audit:read"]);

    // policy_admin is not in custom permissions, so falls back to default
    expect(hasPermission("policy_admin", "policies:write", customPermissions)).toBe(true);
  });
});

describe("ROLE_HIERARCHY", () => {
  it("contains all five roles", () => {
    expect(ROLE_HIERARCHY).toHaveProperty("super_admin");
    expect(ROLE_HIERARCHY).toHaveProperty("compliance_officer");
    expect(ROLE_HIERARCHY).toHaveProperty("policy_admin");
    expect(ROLE_HIERARCHY).toHaveProperty("department_manager");
    expect(ROLE_HIERARCHY).toHaveProperty("read_only_auditor");
  });

  it("has strictly increasing levels from auditor to admin", () => {
    expect(ROLE_HIERARCHY.read_only_auditor).toBeLessThan(ROLE_HIERARCHY.department_manager);
    expect(ROLE_HIERARCHY.department_manager).toBeLessThan(ROLE_HIERARCHY.policy_admin);
    expect(ROLE_HIERARCHY.policy_admin).toBeLessThan(ROLE_HIERARCHY.compliance_officer);
    expect(ROLE_HIERARCHY.compliance_officer).toBeLessThan(ROLE_HIERARCHY.super_admin);
  });
});

describe("DEFAULT_PERMISSIONS", () => {
  it("gives super_admin wildcard access", () => {
    expect(DEFAULT_PERMISSIONS.super_admin).toContain("*");
  });

  it("gives read_only_auditor only read permissions", () => {
    const perms = DEFAULT_PERMISSIONS.read_only_auditor;
    expect(perms).toContain("audit:read");
    expect(perms).toContain("stats:read");
    expect(perms).not.toContain("policies:write");
  });

  it("gives compliance_officer report and review permissions", () => {
    const perms = DEFAULT_PERMISSIONS.compliance_officer;
    expect(perms).toContain("reports:generate");
    expect(perms).toContain("reviews:manage");
  });
});

describe("PERMISSIONS", () => {
  it("exports all expected permission strings", () => {
    expect(PERMISSIONS.AUDIT_READ).toBe("audit:read");
    expect(PERMISSIONS.STATS_READ).toBe("stats:read");
    expect(PERMISSIONS.POLICIES_READ).toBe("policies:read");
    expect(PERMISSIONS.POLICIES_WRITE).toBe("policies:write");
    expect(PERMISSIONS.VENDORS_READ).toBe("vendors:read");
    expect(PERMISSIONS.VENDORS_WRITE).toBe("vendors:write");
    expect(PERMISSIONS.REGULATORY_READ).toBe("regulatory:read");
    expect(PERMISSIONS.REGULATORY_WRITE).toBe("regulatory:write");
    expect(PERMISSIONS.REPORTS_GENERATE).toBe("reports:generate");
    expect(PERMISSIONS.REVIEWS_MANAGE).toBe("reviews:manage");
    expect(PERMISSIONS.DEPARTMENT_MANAGE).toBe("department:manage");
    expect(PERMISSIONS.USERS_READ).toBe("users:read");
    expect(PERMISSIONS.USERS_WRITE).toBe("users:write");
    expect(PERMISSIONS.API_KEYS_MANAGE).toBe("api_keys:manage");
  });
});
