/**
 * Compiler Module - Elysia Plugin
 *
 * Provides compilation status endpoint for policies.
 * Exports compilerModule as an Elysia plugin.
 */

import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db as pgDb } from "../../db/postgres";
import { policyVersions } from "../../db/schema/policies";
import type { AppStore, RouteContext } from "../../shared/types";
import { apiResponse, NotFoundError } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";

export const compilerModule = new Elysia({ prefix: "/api/v1/policies" }).use(authPlugin).get(
  "/:id/compilation-status",
  async (ctx) => {
    const { params, store } = ctx as unknown as RouteContext<
      unknown,
      Record<string, string | undefined>,
      { id: string }
    >;
    const appStore = store as unknown as Partial<AppStore>;
    const db = appStore.db ?? pgDb;

    // Get the latest version for this policy
    const versions = await db
      .select({
        id: policyVersions.id,
        version: policyVersions.version,
        compilationStatus: policyVersions.compilationStatus,
        compilationError: policyVersions.compilationError,
        wasmHash: policyVersions.wasmHash,
        wasmSizeBytes: policyVersions.wasmSizeBytes,
      })
      .from(policyVersions)
      .where(eq(policyVersions.policyId, params.id))
      .orderBy(policyVersions.version)
      .limit(1);

    if (versions.length === 0) {
      throw new NotFoundError("Policy not found or has no versions");
    }

    const latest = versions[0];
    return apiResponse({
      version_id: latest.id,
      version: latest.version,
      compilation_status: latest.compilationStatus,
      compilation_error: latest.compilationError,
      wasm_hash: latest.wasmHash,
      wasm_size_bytes: latest.wasmSizeBytes,
    });
  },
  {
    auth: ["read_only_auditor"],
    params: t.Object({
      id: t.String(),
    }),
  },
);
