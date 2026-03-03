/**
 * Department Override Service
 *
 * Business logic for department policy overrides:
 * - Effective policy resolution (global + department overrides)
 * - Override creation/update with mandatory policy enforcement
 * - Override removal (revert to global default)
 * - Mandatory flag management (compliance_officer+)
 *
 * All department-scoped operations verify user membership server-side.
 */

import { eq, and, sql } from "drizzle-orm";
import {
  policies,
  departmentPolicyOverrides,
  userDepartments,
} from "../../db/schema";
import type { EffectivePolicyRow } from "./model";
import { ForbiddenError, ValidationError, NotFoundError } from "../../shared/utilities";

export class DepartmentOverrideService {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  // -------------------------------------------------------------------------
  // Department membership check (server-side enforcement)
  // -------------------------------------------------------------------------

  private async verifyMembership(
    userId: string,
    departmentId: string
  ): Promise<void> {
    const rows = await this.db
      .select({ userId: userDepartments.userId })
      .from(userDepartments)
      .where(
        and(
          eq(userDepartments.userId, userId),
          eq(userDepartments.departmentId, departmentId)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      throw new ForbiddenError(
        "You do not belong to this department"
      );
    }
  }

  // -------------------------------------------------------------------------
  // 1. Get effective policies for a department
  // -------------------------------------------------------------------------

  async getEffectivePolicies(
    departmentId: string,
    userId: string,
    userRole: string
  ): Promise<EffectivePolicyRow[]> {
    // Super admins and compliance officers bypass department membership check
    const bypassRoles = ["super_admin", "compliance_officer"];
    if (!bypassRoles.includes(userRole)) {
      await this.verifyMembership(userId, departmentId);
    }

    // LEFT JOIN policies with department overrides for this department
    const rows = await this.db
      .select({
        policyId: policies.id,
        name: policies.name,
        description: policies.description,
        globalEnabled: policies.isActive,
        isMandatory: policies.isMandatory,
        overrideId: departmentPolicyOverrides.id,
        overrideEnabled: departmentPolicyOverrides.enabled,
      })
      .from(policies)
      .leftJoin(
        departmentPolicyOverrides,
        and(
          eq(departmentPolicyOverrides.policyId, policies.id),
          eq(departmentPolicyOverrides.departmentId, sql`${departmentId}::uuid`)
        )
      )
      .orderBy(policies.name);

    return rows.map((row: any) => ({
      policyId: row.policyId,
      name: row.name,
      description: row.description ?? "",
      globalEnabled: row.globalEnabled,
      effectiveEnabled:
        row.overrideEnabled !== null ? row.overrideEnabled : row.globalEnabled,
      isMandatory: row.isMandatory,
      source:
        row.overrideId !== null
          ? ("Department override" as const)
          : ("Global" as const),
      overrideId: row.overrideId,
    }));
  }

  // -------------------------------------------------------------------------
  // 2. Set (create or update) an override
  // -------------------------------------------------------------------------

  async setOverride(
    departmentId: string,
    policyId: string,
    enabled: boolean,
    userId: string,
    userRole: string
  ): Promise<{ id: string }> {
    const bypassRoles = ["super_admin", "compliance_officer"];
    if (!bypassRoles.includes(userRole)) {
      await this.verifyMembership(userId, departmentId);
    }

    // Check if policy exists and if it's mandatory
    const [policy] = await this.db
      .select({
        id: policies.id,
        isMandatory: policies.isMandatory,
      })
      .from(policies)
      .where(eq(policies.id, policyId))
      .limit(1);

    if (!policy) {
      throw new NotFoundError("Policy not found");
    }

    if (policy.isMandatory && !enabled) {
      throw new ValidationError(
        "Cannot disable mandatory policy"
      );
    }

    // Upsert: INSERT ON CONFLICT UPDATE
    const result = await this.db
      .insert(departmentPolicyOverrides)
      .values({
        departmentId,
        policyId,
        enabled,
        createdBy: userId,
      })
      .onConflictDoUpdate({
        target: [
          departmentPolicyOverrides.departmentId,
          departmentPolicyOverrides.policyId,
        ],
        set: {
          enabled,
          updatedAt: new Date(),
        },
      })
      .returning({ id: departmentPolicyOverrides.id });

    return { id: result[0].id };
  }

  // -------------------------------------------------------------------------
  // 3. Remove an override (revert to global default)
  // -------------------------------------------------------------------------

  async removeOverride(
    overrideId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    // Fetch the override to verify department ownership
    const [override] = await this.db
      .select({
        id: departmentPolicyOverrides.id,
        departmentId: departmentPolicyOverrides.departmentId,
      })
      .from(departmentPolicyOverrides)
      .where(eq(departmentPolicyOverrides.id, overrideId))
      .limit(1);

    if (!override) {
      throw new NotFoundError("Override not found");
    }

    const bypassRoles = ["super_admin", "compliance_officer"];
    if (!bypassRoles.includes(userRole)) {
      await this.verifyMembership(userId, override.departmentId);
    }

    await this.db
      .delete(departmentPolicyOverrides)
      .where(eq(departmentPolicyOverrides.id, overrideId));
  }

  // -------------------------------------------------------------------------
  // 4. Set mandatory flag (compliance_officer+ only)
  // -------------------------------------------------------------------------

  async setMandatory(
    policyId: string,
    isMandatory: boolean
  ): Promise<void> {
    // Verify policy exists
    const [policy] = await this.db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.id, policyId))
      .limit(1);

    if (!policy) {
      throw new NotFoundError("Policy not found");
    }

    // Update the mandatory flag
    await this.db
      .update(policies)
      .set({
        isMandatory,
        updatedAt: new Date(),
      })
      .where(eq(policies.id, policyId));

    // When setting mandatory=true, delete overrides that disable this policy
    if (isMandatory) {
      await this.db
        .delete(departmentPolicyOverrides)
        .where(
          and(
            eq(departmentPolicyOverrides.policyId, policyId),
            eq(departmentPolicyOverrides.enabled, false)
          )
        );
    }
  }
}
