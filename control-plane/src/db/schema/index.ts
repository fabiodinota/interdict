/**
 * Database Schema Index
 *
 * Re-exports all table definitions and enums from domain schema files.
 * This is the single import point for Drizzle ORM schema access.
 */

// Policies
export {
  compilationStatusEnum,
  policies,
  policyVersions,
} from "./policies";

// Vendors
export { vendors, vendorModels } from "./vendors";

// Regulatory frameworks
export {
  frameworks,
  frameworkPolicies,
  frameworkActivations,
} from "./regulatory";

// Organization
export { departments, teams, users } from "./organization";

// Auth (API keys, sessions, user-department membership, role permissions, SAML handoff codes)
export { apiKeys, userDepartments, rolePermissions, sessions, signingKeys, samlHandoffCodes } from "./auth";

// Reviews (human review queue for Layer 3 escalations)
export { reviewItems } from "./reviews";

// Department policy overrides
export { departmentPolicyOverrides } from "./department-overrides";
