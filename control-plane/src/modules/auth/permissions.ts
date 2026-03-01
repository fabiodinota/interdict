/**
 * Permission Model
 *
 * Defines the 5-role hierarchy, permission constants, default permission matrix,
 * and helper functions for role-based access control.
 *
 * Roles (ascending): read_only_auditor < department_manager < policy_admin < compliance_officer < super_admin
 *
 * Permissions are looked up directly per role (no automatic inheritance via the map).
 * The hierarchy is used only for role-level comparisons (e.g., "does this user have at least Policy Admin access?").
 */

// ---------------------------------------------------------------------------
// Role Hierarchy
// ---------------------------------------------------------------------------

/** Numeric level for each role. Higher = more access. */
export const ROLE_HIERARCHY: Record<string, number> = {
  read_only_auditor: 1,
  department_manager: 2,
  policy_admin: 3,
  compliance_officer: 4,
  super_admin: 5,
};

// ---------------------------------------------------------------------------
// Permission Constants
// ---------------------------------------------------------------------------

/** All permission strings used across the system. */
export const PERMISSIONS = {
  AUDIT_READ: "audit:read",
  STATS_READ: "stats:read",
  POLICIES_READ: "policies:read",
  POLICIES_WRITE: "policies:write",
  VENDORS_READ: "vendors:read",
  VENDORS_WRITE: "vendors:write",
  REGULATORY_READ: "regulatory:read",
  REGULATORY_WRITE: "regulatory:write",
  REPORTS_GENERATE: "reports:generate",
  REVIEWS_MANAGE: "reviews:manage",
  DEPARTMENT_MANAGE: "department:manage",
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  API_KEYS_MANAGE: "api_keys:manage",
} as const;

// ---------------------------------------------------------------------------
// Default Permission Matrix
// ---------------------------------------------------------------------------

/**
 * Default role-to-permission mapping.
 * Loaded from seed into the role_permissions table.
 * Enterprise customers can customize via API.
 *
 * Super Admin gets wildcard ("*") which grants all permissions.
 * Each lower role gets its appropriate subset -- permissions do NOT
 * inherit automatically via this map.
 */
export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  read_only_auditor: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.STATS_READ,
  ],
  department_manager: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.STATS_READ,
    PERMISSIONS.POLICIES_READ,
    PERMISSIONS.DEPARTMENT_MANAGE,
  ],
  policy_admin: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.STATS_READ,
    PERMISSIONS.POLICIES_READ,
    PERMISSIONS.POLICIES_WRITE,
    PERMISSIONS.VENDORS_READ,
    PERMISSIONS.VENDORS_WRITE,
    PERMISSIONS.REGULATORY_READ,
    PERMISSIONS.REGULATORY_WRITE,
  ],
  compliance_officer: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.STATS_READ,
    PERMISSIONS.POLICIES_READ,
    PERMISSIONS.POLICIES_WRITE,
    PERMISSIONS.VENDORS_READ,
    PERMISSIONS.VENDORS_WRITE,
    PERMISSIONS.REGULATORY_READ,
    PERMISSIONS.REGULATORY_WRITE,
    PERMISSIONS.REPORTS_GENERATE,
    PERMISSIONS.REVIEWS_MANAGE,
  ],
  super_admin: ["*"],
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Returns the numeric hierarchy level for a given role.
 * Unknown roles return 0 (no access).
 */
export function roleHierarchyLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

/**
 * Returns true if the user's role level is >= the required role level.
 * Used for role-level comparisons (e.g., "does this user have at least Policy Admin access?").
 */
export function roleInheritsFrom(userRole: string, requiredRole: string): boolean {
  return roleHierarchyLevel(userRole) >= roleHierarchyLevel(requiredRole);
}

/**
 * Checks whether a role has a specific permission.
 *
 * Lookup order:
 * 1. Check customPermissions map (if provided) for the role
 * 2. Fall back to DEFAULT_PERMISSIONS
 * 3. Wildcard "*" grants any permission
 *
 * Returns false for unknown roles.
 */
export function hasPermission(
  role: string,
  permission: string,
  customPermissions?: Map<string, string[]>,
): boolean {
  const perms = customPermissions?.get(role) ?? DEFAULT_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes("*") || perms.includes(permission);
}
