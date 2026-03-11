/**
 * Regulatory Framework Module - Elysia Plugin
 *
 * REST endpoints for regulatory framework management.
 * Prefix: /api/v1/regulatory
 */

import { Elysia, t } from "elysia";
import { eq, and, desc, sql, isNull, count } from "drizzle-orm";
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
import type { AppDb, RouteContext } from "../../shared/types";
import {
  ActivateFrameworkBody,
  TogglePolicyBody,
} from "./model";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";

type RegulatoryRouteContext<
  TBody = unknown,
  TParams = Record<string, string>,
> = RouteContext<TBody, Record<string, string | undefined>, TParams>;

/** Extract the Drizzle db from the Elysia store, falling back to the global singleton. */
function resolveDb(store: unknown): AppDb {
  const s = store as Record<string, unknown>;
  return (s.db as AppDb) ?? pgDb;
}

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
  .get("/frameworks", async (ctx) => {
    const routeCtx = ctx as unknown as RegulatoryRouteContext;
    const db = resolveDb(routeCtx.store);

    // Bulk queries — exactly 3 DB round-trips regardless of framework count (HIGH-S1)
    const [allFrameworks, allPolicyCounts, allActivations] = await Promise.all([
      db.select().from(frameworks).orderBy(frameworks.name),
      db
        .select({
          frameworkId: frameworkPolicies.frameworkId,
          policyCount: count(),
          activePolicyCount: sql<number>`count(*) filter (where ${frameworkPolicies.isRequired})`,
        })
        .from(frameworkPolicies)
        .groupBy(frameworkPolicies.frameworkId),
      db
        .select({ frameworkId: frameworkActivations.frameworkId })
        .from(frameworkActivations)
        .where(eq(frameworkActivations.isActive, true)),
    ]);

    const policyCountMap = new Map<string, { policyCount: number; activePolicyCount: number }>(
      allPolicyCounts.map((r) => [
        r.frameworkId,
        { policyCount: Number(r.policyCount), activePolicyCount: Number(r.activePolicyCount) },
      ])
    );
    const activeSet = new Set(allActivations.map((r) => r.frameworkId));

    const result = allFrameworks.map((fw) => {
      const counts = policyCountMap.get(fw.id) ?? { policyCount: 0, activePolicyCount: 0 };
      return {
        id: fw.id,
        slug: fw.slug,
        name: fw.name,
        description: fw.description,
        jurisdiction: fw.jurisdiction,
        version: fw.version,
        isSeeded: fw.isSeeded,
        isActive: activeSet.has(fw.id),
        policyCount: counts.policyCount,
        activePolicyCount: counts.activePolicyCount,
      };
    });

    return apiResponse(result);
  }, { auth: ["read_only_auditor"] })

  /**
   * GET /frameworks/:slug - Get framework details with policies (Read-Only Auditor+)
   */
  .get(
    "/frameworks/:slug",
    async (ctx) => {
      const routeCtx = ctx as unknown as RegulatoryRouteContext<unknown, { slug: string }>;
      const db = resolveDb(routeCtx.store);
      const params = routeCtx.params;

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
        fpRows.map(async (fp) => {
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
    async (ctx) => {
      const routeCtx = ctx as unknown as RegulatoryRouteContext<{ is_active?: boolean }, { slug: string }>;
      const db = resolveDb(routeCtx.store);
      const params = routeCtx.params;
      const body = routeCtx.body;

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
    async (ctx) => {
      const routeCtx = ctx as unknown as RegulatoryRouteContext<unknown, { slug: string }>;
      const db = resolveDb(routeCtx.store);
      const params = routeCtx.params;

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
    async (ctx) => {
      const routeCtx = ctx as unknown as RegulatoryRouteContext<
        { isRequired: boolean },
        { slug: string; policyId: string }
      >;
      const db = resolveDb(routeCtx.store);
      const params = routeCtx.params;
      const body = routeCtx.body;

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
  .get("/active-policies", async (ctx) => {
    const routeCtx = ctx as unknown as RegulatoryRouteContext;
    const db = resolveDb(routeCtx.store);

    // 1. Get all directly active custom policies (not in any framework)
    const allActivePolicies = await db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.isActive, true));

    const allFrameworkPolicyIds = await db
      .select({ policyId: frameworkPolicies.policyId })
      .from(frameworkPolicies);

    const frameworkPolicyIdSet = new Set(
      allFrameworkPolicyIds.map((fp) => fp.policyId)
    );

    // Custom policies = active policies NOT in any framework
    const customActivePolicyIds = allActivePolicies
      .filter((p) => !frameworkPolicyIdSet.has(p.id))
      .map((p) => p.id);

    // 2. Get active framework policies
    const activeActivations = await db
      .select({ frameworkId: frameworkActivations.frameworkId })
      .from(frameworkActivations)
      .where(eq(frameworkActivations.isActive, true));

    const activeFrameworkIds = new Set(
      activeActivations.map((a) => a.frameworkId)
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
        (fp) =>
          activeFrameworkIds.has(fp.frameworkId) && fp.isRequired
      )
      .map((fp) => fp.policyId);

    // Merge (deduplicate)
    const mergedIds = [
      ...new Set([...customActivePolicyIds, ...frameworkActivePolicyIds]),
    ];

    return apiResponse({ policyIds: mergedIds, count: mergedIds.length });
  }, { auth: ["read_only_auditor"] });
