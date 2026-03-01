/**
 * Compiler Module - Elysia Plugin
 *
 * Provides compilation status endpoint for policies.
 * Exports compilerModule as an Elysia plugin.
 */

import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { policyVersions } from "../../db/schema/policies";
import { apiResponse } from "../../shared/utilities";
import { NotFoundError } from "../../shared/utilities";

export const compilerModule = new Elysia({ prefix: "/api/v1/policies" }).get(
  "/:id/compilation-status",
  async ({ params, store }) => {
    const db = (store as any).db;

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
    params: t.Object({
      id: t.String(),
    }),
  }
);
