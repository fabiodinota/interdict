/**
 * Regulatory Framework Management Service
 *
 * Business logic for framework listing, activation/deactivation,
 * per-policy toggle, and additive active policy merge.
 *
 * Designed with a data-store interface that accepts either mock data
 * (for unit testing) or real Drizzle DB queries (for production).
 */

import { NotFoundError } from "../../shared/utilities";

// ---------------------------------------------------------------------------
// Data store interface (compatible with both mock arrays and Drizzle queries)
// ---------------------------------------------------------------------------

export interface FrameworkRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  jurisdiction: string | null;
  version: string | null;
  isSeeded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FrameworkPolicyRow {
  id: string;
  frameworkId: string;
  policyId: string;
  requirementRef: string | null;
  requirementDescription: string | null;
  isRequired: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface FrameworkActivationRow {
  id: string;
  frameworkId: string;
  activatedBy: string | null;
  isActive: boolean;
  activatedAt: Date;
  deactivatedAt: Date | null;
}

export interface PolicyRow {
  id: string;
  name: string;
  description: string | null;
  currentVersionId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface PolicyVersionRow {
  id: string;
  policyId: string;
  version: number;
  compilationStatus: string;
}

export interface RegulatoryDataStore {
  frameworks: FrameworkRow[];
  frameworkPolicies: FrameworkPolicyRow[];
  frameworkActivations: FrameworkActivationRow[];
  policies: PolicyRow[];
  policyVersions: PolicyVersionRow[];
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface FrameworkListItem {
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
}

export interface FrameworkDetail {
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
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * RegulatoryService manages regulatory framework operations.
 * Accepts a data store (mock or real) for testability.
 */
export class RegulatoryService {
  private store: RegulatoryDataStore;

  constructor(data: RegulatoryDataStore) {
    this.store = data;
  }

  /**
   * Check whether a framework has an active activation record.
   */
  private isFrameworkActive(frameworkId: string): boolean {
    return this.store.frameworkActivations.some((a) => a.frameworkId === frameworkId && a.isActive);
  }

  /**
   * List all frameworks with activation status and policy counts.
   * Returns sorted by name.
   */
  list(): FrameworkListItem[] {
    return this.store.frameworks
      .map((fw) => {
        const fwPolicies = this.store.frameworkPolicies.filter((fp) => fp.frameworkId === fw.id);
        const activePolicyCount = fwPolicies.filter((fp) => fp.isRequired).length;

        return {
          id: fw.id,
          slug: fw.slug,
          name: fw.name,
          description: fw.description,
          jurisdiction: fw.jurisdiction,
          version: fw.version,
          isSeeded: fw.isSeeded,
          isActive: this.isFrameworkActive(fw.id),
          policyCount: fwPolicies.length,
          activePolicyCount,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get framework by slug with all its policies and requirement details.
   * Throws NotFoundError if slug does not exist.
   */
  getBySlug(slug: string): FrameworkDetail {
    const fw = this.store.frameworks.find((f) => f.slug === slug);
    if (!fw) {
      throw new NotFoundError(`Framework '${slug}' not found`);
    }

    const fwPolicies = this.store.frameworkPolicies
      .filter((fp) => fp.frameworkId === fw.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const policies = fwPolicies.map((fp) => {
      const policy = this.store.policies.find((p) => p.id === fp.policyId);
      const currentVersion = policy?.currentVersionId
        ? this.store.policyVersions.find((pv) => pv.id === policy.currentVersionId)
        : undefined;

      return {
        id: fp.id,
        policyId: fp.policyId,
        policyName: policy?.name ?? "unknown",
        requirementRef: fp.requirementRef,
        requirementDescription: fp.requirementDescription,
        isRequired: fp.isRequired,
        sortOrder: fp.sortOrder,
        compilationStatus: currentVersion?.compilationStatus ?? null,
      };
    });

    return {
      id: fw.id,
      slug: fw.slug,
      name: fw.name,
      description: fw.description,
      jurisdiction: fw.jurisdiction,
      version: fw.version,
      isSeeded: fw.isSeeded,
      isActive: this.isFrameworkActive(fw.id),
      policies,
    };
  }

  /**
   * Activate a framework. Creates an activation record with is_active=true.
   * If already active, no-op. Activation is additive -- does NOT disable
   * other frameworks or custom policies.
   */
  activate(frameworkId: string, activatedBy?: string): void {
    if (this.isFrameworkActive(frameworkId)) {
      return; // Already active, no-op
    }

    this.store.frameworkActivations.push({
      id: crypto.randomUUID(),
      frameworkId,
      activatedBy: activatedBy ?? null,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
    });
  }

  /**
   * Deactivate a framework. Sets the latest active activation record to
   * is_active=false with deactivated_at timestamp. No-op if not active.
   */
  deactivate(frameworkId: string): void {
    const activation = this.store.frameworkActivations.find(
      (a) => a.frameworkId === frameworkId && a.isActive,
    );
    if (!activation) {
      return; // Not active, no-op
    }

    activation.isActive = false;
    activation.deactivatedAt = new Date();
  }

  /**
   * Toggle an individual framework policy's is_required status.
   * Allows disabling specific policies within an active framework.
   */
  togglePolicy(frameworkPolicyId: string, isRequired: boolean): void {
    const fp = this.store.frameworkPolicies.find((p) => p.id === frameworkPolicyId);
    if (!fp) {
      throw new NotFoundError(`Framework policy '${frameworkPolicyId}' not found`);
    }
    fp.isRequired = isRequired;
  }

  /**
   * Get all currently active frameworks with their policies.
   */
  getActiveFrameworks(): Array<{
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  }> {
    return this.store.frameworks
      .filter((fw) => this.isFrameworkActive(fw.id))
      .map((fw) => ({
        id: fw.id,
        slug: fw.slug,
        name: fw.name,
        isActive: true,
      }));
  }

  /**
   * Get all policy IDs that should be active based on:
   * (1) directly active custom policies AND
   * (2) policies from active frameworks where is_required=true
   *
   * This is the additive merge per CONTEXT.md decision.
   */
  getActivePolicies(): string[] {
    const activePolicyIds = new Set<string>();

    // 1. Directly active custom policies
    for (const policy of this.store.policies) {
      if (policy.isActive) {
        // Check if this policy is part of any framework
        const isFrameworkPolicy = this.store.frameworkPolicies.some(
          (fp) => fp.policyId === policy.id,
        );
        if (!isFrameworkPolicy) {
          // Standalone custom policy -- include if active
          activePolicyIds.add(policy.id);
        }
      }
    }

    // 2. Framework policies from active frameworks where is_required=true
    const activeFrameworkIds = new Set(
      this.store.frameworkActivations.filter((a) => a.isActive).map((a) => a.frameworkId),
    );

    for (const fp of this.store.frameworkPolicies) {
      if (activeFrameworkIds.has(fp.frameworkId) && fp.isRequired) {
        activePolicyIds.add(fp.policyId);
      }
    }

    return Array.from(activePolicyIds);
  }
}
