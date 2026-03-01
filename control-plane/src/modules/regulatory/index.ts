/**
 * Regulatory Framework Module - Elysia Plugin
 *
 * REST endpoints for regulatory framework management.
 * Prefix: /api/v1/regulatory
 *
 * NOTE: This module is exported as an Elysia plugin but NOT wired
 * into src/index.ts. Module wiring is handled by Plan 05-05 (Wave 3 integration).
 */

import { Elysia, t } from "elysia";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import {
  frameworks,
  frameworkPolicies,
  frameworkActivations,
  policies,
  policyVersions,
} from "../../db/schema/index";
import {
  apiResponse,
  NotFoundError,
} from "../../shared/utilities";
import {
  ActivateFrameworkBody,
  TogglePolicyBody,
} from "./model";
import { authPlugin } from "../auth/middleware";

/**
 * Create a Drizzle-backed regulatory service.
 * Unlike the unit-testable RegulatoryService class (which uses plain arrays),
 * these functions use Drizzle ORM directly for production database access.
 */
export const regulatoryModule = new Elysia({ prefix: "/api/v1/regulatory" })
  .use(authPlugin)

  /**
   * GET /frameworks - List all frameworks with activation status (Read-Only Auditor+)
   */
  .get("/frameworks", async (ctx: any) => {
    const db = (ctx.store as Record<string, unknown>).db as any;

    // Query all frameworks
    const allFrameworks = await db.select().from(frameworks).orderBy(frameworks.name);

    const result = await Promise.all(
      allFrameworks.map(async (fw: any) => {
        // Count policies
        const policyRows = await db
          .select()
          .from(frameworkPolicies)
          .where(eq(frameworkPolicies.frameworkId, fw.id));

        const policyCount = policyRows.length;
        const activePolicyCount = policyRows.filter(
          (fp: any) => fp.isRequired
        ).length;

        // Check activation status
        const activation = await db
          .select()
          .from(frameworkActivations)
          .where(
            and(
              eq(frameworkActivations.frameworkId, fw.id),
              eq(frameworkActivations.isActive, true)
            )
          )
          .limit(1);

        return {
          id: fw.id,
          slug: fw.slug,
          name: fw.name,
          description: fw.description,
          jurisdiction: fw.jurisdiction,
          version: fw.version,
          isSeeded: fw.isSeeded,
          isActive: activation.length > 0,
          policyCount,
          activePolicyCount,
        };
      })
    );

    return apiResponse(result);
  }, { auth: ["read_only_auditor"] })

  /**
   * GET /frameworks/:slug - Get framework details with policies (Read-Only Auditor+)
   */
  .get(
    "/frameworks/:slug",
    async (ctx: any) => {
      const db = (ctx.store as Record<string, unknown>).db as any;
      const params = ctx.params;

      const fwRows = await db
        .select()
        .from(frameworks)
        .where(eq(frameworks.slug, params.slug))
        .limit(1);

      if (fwRows.length === 0) {
        throw new NotFoundError(`Framework '${params.slug}' not found`);
      }
      const fw = fwRows[0];

      // Get activation status
      const activation = await db
        .select()
        .from(frameworkActivations)
        .where(
          and(
            eq(frameworkActivations.frameworkId, fw.id),
            eq(frameworkActivations.isActive, true)
          )
        )
        .limit(1);

      // Get framework policies with joined policy data
      const fpRows = await db
        .select({
          id: frameworkPolicies.id,
          policyId: frameworkPolicies.policyId,
          requirementRef: frameworkPolicies.requirementRef,
          requirementDescription: frameworkPolicies.requirementDescription,
          isRequired: frameworkPolicies.isRequired,
          sortOrder: frameworkPolicies.sortOrder,
          policyName: policies.name,
          currentVersionId: policies.currentVersionId,
        })
        .from(frameworkPolicies)
        .leftJoin(policies, eq(frameworkPolicies.policyId, policies.id))
        .where(eq(frameworkPolicies.frameworkId, fw.id))
        .orderBy(frameworkPolicies.sortOrder);

      // Enrich with compilation status
      const enrichedPolicies = await Promise.all(
        fpRows.map(async (fp: any) => {
          let compilationStatus: string | null = null;
          if (fp.currentVersionId) {
            const versionRows = await db
              .select({ compilationStatus: policyVersions.compilationStatus })
              .from(policyVersions)
              .where(eq(policyVersions.id, fp.currentVersionId))
              .limit(1);
            if (versionRows.length > 0) {
              compilationStatus = versionRows[0].compilationStatus;
            }
          }
          return {
            id: fp.id,
            policyId: fp.policyId,
            policyName: fp.policyName ?? "unknown",
            requirementRef: fp.requirementRef,
            requirementDescription: fp.requirementDescription,
            isRequired: fp.isRequired,
            sortOrder: fp.sortOrder,
            compilationStatus,
          };
        })
      );

      return apiResponse({
        id: fw.id,
        slug: fw.slug,
        name: fw.name,
        description: fw.description,
        jurisdiction: fw.jurisdiction,
        version: fw.version,
        isSeeded: fw.isSeeded,
        isActive: activation.length > 0,
        policies: enrichedPolicies,
      });
    },
    {
      auth: ["read_only_auditor"],
      params: t.Object({
        slug: t.String(),
      }),
    }
  )

  /**
   * POST /frameworks/:slug/activate - Activate a framework (Policy Admin+)
   */
  .post(
    "/frameworks/:slug/activate",
    async (ctx: any) => {
      const db = (ctx.store as Record<string, unknown>).db as any;
      const params = ctx.params;
      const body = ctx.body;

      const fwRows = await db
        .select()
        .from(frameworks)
        .where(eq(frameworks.slug, params.slug))
        .limit(1);

      if (fwRows.length === 0) {
        throw new NotFoundError(`Framework '${params.slug}' not found`);
      }
      const fw = fwRows[0];

      // Check if already active
      const existing = await db
        .select()
        .from(frameworkActivations)
        .where(
          and(
            eq(frameworkActivations.frameworkId, fw.id),
            eq(frameworkActivations.isActive, true)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return apiResponse({ status: "already_active", frameworkId: fw.id });
      }

      // Create activation record
      await db.insert(frameworkActivations).values({
        frameworkId: fw.id,
        isActive: true,
      });

      return apiResponse({ status: "activated", frameworkId: fw.id });
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ slug: t.String() }),
      body: t.Optional(ActivateFrameworkBody),
    }
  )

  /**
   * POST /frameworks/:slug/deactivate - Deactivate a framework
   */
  .post(
    "/frameworks/:slug/deactivate",
    async (ctx: any) => {
      const db = (ctx.store as Record<string, unknown>).db as any;
      const params = ctx.params;

      const fwRows = await db
        .select()
        .from(frameworks)
        .where(eq(frameworks.slug, params.slug))
        .limit(1);

      if (fwRows.length === 0) {
        throw new NotFoundError(`Framework '${params.slug}' not found`);
      }
      const fw = fwRows[0];

      // Find active activation
      const existing = await db
        .select()
        .from(frameworkActivations)
        .where(
          and(
            eq(frameworkActivations.frameworkId, fw.id),
            eq(frameworkActivations.isActive, true)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        return apiResponse({
          status: "already_inactive",
          frameworkId: fw.id,
        });
      }

      // Deactivate
      await db
        .update(frameworkActivations)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(eq(frameworkActivations.id, existing[0].id));

      return apiResponse({ status: "deactivated", frameworkId: fw.id });
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ slug: t.String() }),
    }
  )

  /**
   * PUT /frameworks/:slug/policies/:policyId/toggle - Toggle individual policy
   */
  .put(
    "/frameworks/:slug/policies/:policyId/toggle",
    async (ctx: any) => {
      const db = (ctx.store as Record<string, unknown>).db as any;
      const params = ctx.params;
      const body = ctx.body;

      // Verify framework exists
      const fwRows = await db
        .select()
        .from(frameworks)
        .where(eq(frameworks.slug, params.slug))
        .limit(1);

      if (fwRows.length === 0) {
        throw new NotFoundError(`Framework '${params.slug}' not found`);
      }

      // Find the framework policy
      const fpRows = await db
        .select()
        .from(frameworkPolicies)
        .where(
          and(
            eq(frameworkPolicies.frameworkId, fwRows[0].id),
            eq(frameworkPolicies.policyId, params.policyId)
          )
        )
        .limit(1);

      if (fpRows.length === 0) {
        throw new NotFoundError(
          `Policy '${params.policyId}' not found in framework '${params.slug}'`
        );
      }

      await db
        .update(frameworkPolicies)
        .set({ isRequired: body.isRequired })
        .where(eq(frameworkPolicies.id, fpRows[0].id));

      return apiResponse({
        id: fpRows[0].id,
        isRequired: body.isRequired,
      });
    },
    {
      auth: ["policy_admin"],
      params: t.Object({
        slug: t.String(),
        policyId: t.String(),
      }),
      body: TogglePolicyBody,
    }
  )

  /**
   * GET /active-policies - Get all currently active policy IDs (additive merge)
   */
  .get("/active-policies", async (ctx: any) => {
    const db = (ctx.store as Record<string, unknown>).db as any;

    // 1. Get all directly active custom policies (not in any framework)
    const allActivePolicies = await db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.isActive, true));

    const allFrameworkPolicyIds = await db
      .select({ policyId: frameworkPolicies.policyId })
      .from(frameworkPolicies);

    const frameworkPolicyIdSet = new Set(
      allFrameworkPolicyIds.map((fp: any) => fp.policyId)
    );

    // Custom policies = active policies NOT in any framework
    const customActivePolicyIds = allActivePolicies
      .filter((p: any) => !frameworkPolicyIdSet.has(p.id))
      .map((p: any) => p.id);

    // 2. Get active framework policies
    const activeActivations = await db
      .select({ frameworkId: frameworkActivations.frameworkId })
      .from(frameworkActivations)
      .where(eq(frameworkActivations.isActive, true));

    const activeFrameworkIds = new Set(
      activeActivations.map((a: any) => a.frameworkId)
    );

    const allFp = await db
      .select({
        policyId: frameworkPolicies.policyId,
        frameworkId: frameworkPolicies.frameworkId,
        isRequired: frameworkPolicies.isRequired,
      })
      .from(frameworkPolicies);

    const frameworkActivePolicyIds = allFp
      .filter(
        (fp: any) =>
          activeFrameworkIds.has(fp.frameworkId) && fp.isRequired
      )
      .map((fp: any) => fp.policyId);

    // Merge (deduplicate)
    const mergedIds = [
      ...new Set([...customActivePolicyIds, ...frameworkActivePolicyIds]),
    ];

    return apiResponse({ policyIds: mergedIds, count: mergedIds.length });
  }, { auth: ["read_only_auditor"] });
