/**
 * Database Schema Index
 *
 * Re-exports all table definitions and enums from domain schema files.
 * This is the single import point for Drizzle ORM schema access.
 */

// Auth (API keys, sessions, user-department membership, role permissions, SAML handoff codes)
export {
  apiKeys,
  rolePermissions,
  samlHandoffCodes,
  sessions,
  signingKeys,
  userDepartments,
} from "./auth";
// Department policy overrides
export { departmentPolicyOverrides } from "./department-overrides";
// Organization
export { departments, teams, users } from "./organization";
// Policies
export {
  compilationStatusEnum,
  policies,
  policyScopeAssignments,
  policyVersions,
} from "./policies";
// Regulatory frameworks
export {
  frameworkActivations,
  frameworkPolicies,
  frameworks,
} from "./regulatory";

// Reviews (human review queue for Layer 3 escalations)
export { reviewItems } from "./reviews";
// Vendors
export { vendorModels, vendors } from "./vendors";
