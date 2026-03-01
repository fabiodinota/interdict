/**
 * Regulatory Framework Management Service
 *
 * Business logic for framework listing, activation/deactivation,
 * per-policy toggle, and additive active policy merge.
 */

import { NotFoundError } from "../../shared/utilities";

/**
 * RegulatoryService manages regulatory framework operations.
 * Accepts a data store interface (real DB or mock) for testability.
 */
export class RegulatoryService {
  constructor(private data: unknown) {}

  list(): Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    jurisdiction: string | null;
    version: string | null;
    isSeeded: boolean;
    isActive: boolean;
    policyCount: number;
    activePolicyCount: number;
  }> {
    throw new Error("Not implemented");
  }

  getBySlug(_slug: string): {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    jurisdiction: string | null;
    version: string | null;
    isSeeded: boolean;
    isActive: boolean;
    policies: Array<{
      id: string;
      policyId: string;
      policyName: string;
      requirementRef: string | null;
      requirementDescription: string | null;
      isRequired: boolean;
      sortOrder: number;
      compilationStatus: string | null;
    }>;
  } {
    throw new Error("Not implemented");
  }

  activate(_frameworkId: string, _activatedBy?: string): void {
    throw new Error("Not implemented");
  }

  deactivate(_frameworkId: string): void {
    throw new Error("Not implemented");
  }

  togglePolicy(_frameworkPolicyId: string, _isRequired: boolean): void {
    throw new Error("Not implemented");
  }

  getActiveFrameworks(): Array<{
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  }> {
    throw new Error("Not implemented");
  }

  getActivePolicies(): string[] {
    throw new Error("Not implemented");
  }
}
