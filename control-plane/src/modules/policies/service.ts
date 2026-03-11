/**
 * Policy Service
 *
 * Business logic for policy CRUD operations with full version history.
 * Every edit creates a new version; previous versions are queryable and
 * restorable for compliance auditing.
 *
 * Per CONTEXT.md:
 * - Compilation is asynchronous (save returns immediately)
 * - Full version history for audit compliance
 * - Soft delete preserves versions
 */

import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { policies, policyVersions } from "../../db/schema/policies";
import type { AppDb, AppTx } from "../../shared/types";
import {
  ConflictError,
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
  NotFoundError,
} from "../../shared/utilities";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreatePolicyInput {
  name: string;
  description?: string;
  rego_source: string;
  entrypoint?: string;
}

export interface UpdatePolicyInput {
  rego_source: string;
  entrypoint?: string;
  change_description?: string;
}

interface VersionRow {
  id: string;
  policyId: string;
  version: number;
  regoSource: string;
  entrypoint: string;
  compilationStatus: string;
  compilationError: string | null;
  wasmPath: string | null;
  wasmHash: string | null;
  wasmSizeBytes: number | null;
  createdAt: Date;
  createdBy: string | null;
  changeDescription: string | null;
}

type PolicyRow = typeof policies.$inferSelect;
type SerializedVersion = ReturnType<typeof serializeVersion>;
type SerializedPolicy = ReturnType<typeof serializePolicy>;
type PolicyListResult = { items: SerializedPolicy[]; nextCursor: string | null };

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeVersion(v: VersionRow) {
  return {
    id: v.id,
    version: v.version,
    rego_source: v.regoSource,
    entrypoint: v.entrypoint,
    compilation_status: v.compilationStatus,
    compilation_error: v.compilationError,
    wasm_hash: v.wasmHash,
    wasm_size_bytes: v.wasmSizeBytes,
    created_at: v.createdAt.toISOString(),
    change_description: v.changeDescription,
  };
}

function serializePolicy(p: PolicyRow, currentVersion?: VersionRow | null) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    current_version: currentVersion ? serializeVersion(currentVersion) : undefined,
    is_active: p.isActive,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

function getConstraintErrorDetails(err: unknown): { code?: string; message: string } {
  const record = err as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };

  return {
    code:
      typeof record?.code === "string"
        ? record.code
        : typeof record?.cause?.code === "string"
          ? record.cause.code
          : undefined,
    message:
      `${typeof record?.message === "string" ? record.message : ""}` +
      `${typeof record?.cause?.message === "string" ? record.cause.message : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Service Factory
// ---------------------------------------------------------------------------

export interface PolicyService {
  create(body: CreatePolicyInput): Promise<SerializedPolicy>;
  getById(id: string): Promise<SerializedPolicy>;
  update(id: string, body: UpdatePolicyInput): Promise<SerializedPolicy>;
  delete(id: string): Promise<void>;
  getVersionHistory(policyId: string): Promise<SerializedVersion[]>;
  restoreVersion(policyId: string, versionId: string): Promise<SerializedPolicy>;
  list(cursor?: string, pageSize?: number): Promise<PolicyListResult>;
}

/**
 * Create a PolicyService bound to a database instance.
 *
 * The service uses transactions for create/update to ensure consistency
 * between the policies and policy_versions tables.
 */
export function createPolicyService(db: AppDb): PolicyService {
  return {
    /**
     * Create a new policy with version 1.
     * Returns immediately with compilation_status 'pending'.
     */
    async create(body: CreatePolicyInput) {
      const entrypoint = body.entrypoint || "data.interdict.policy.verdict";

      try {
        const result = await db.transaction(async (tx: AppTx) => {
          // Insert policy
          const [policy] = await tx
            .insert(policies)
            .values({
              name: body.name,
              description: body.description || null,
            })
            .returning();

          // Insert first version
          const [version] = await tx
            .insert(policyVersions)
            .values({
              policyId: policy.id,
              version: 1,
              regoSource: body.rego_source,
              entrypoint,
              compilationStatus: "pending",
            })
            .returning();

          // Set current_version_id
          await tx
            .update(policies)
            .set({ currentVersionId: version.id })
            .where(eq(policies.id, policy.id));

          return { policy: { ...policy, currentVersionId: version.id }, version };
        });

        return serializePolicy(result.policy, result.version);
      } catch (err: unknown) {
        // Handle unique constraint violation (DrizzleQueryError wraps PG error in .cause)
        const { code: pgCode, message: msg } = getConstraintErrorDetails(err);
        if (pgCode === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
          throw new ConflictError(`Policy with name '${body.name}' already exists`);
        }
        throw err;
      }
    },

    /**
     * Get a policy by ID with its current version.
     * Throws NotFoundError if not found or soft-deleted.
     */
    async getById(id: string) {
      const [policy] = await db
        .select()
        .from(policies)
        .where(and(eq(policies.id, id), eq(policies.isActive, true)));

      if (!policy) {
        throw new NotFoundError("Policy not found");
      }

      let currentVersion = null;
      if (policy.currentVersionId) {
        const [version] = await db
          .select()
          .from(policyVersions)
          .where(eq(policyVersions.id, policy.currentVersionId));
        currentVersion = version || null;
      }

      return serializePolicy(policy, currentVersion);
    },

    /**
     * Update a policy by creating a new version.
     * Increments version number, dispatches async compilation.
     */
    async update(id: string, body: UpdatePolicyInput) {
      const result = await db.transaction(async (tx: AppTx) => {
        // Check policy exists and is active
        const [policy] = await tx
          .select()
          .from(policies)
          .where(and(eq(policies.id, id), eq(policies.isActive, true)));

        if (!policy) {
          throw new NotFoundError("Policy not found");
        }

        // Get current max version
        const [maxVersion] = await tx
          .select({ maxVer: sql<number>`COALESCE(MAX(${policyVersions.version}), 0)` })
          .from(policyVersions)
          .where(eq(policyVersions.policyId, id));

        const newVersionNum = (maxVersion?.maxVer ?? 0) + 1;

        // Determine entrypoint (use existing if not provided)
        let entrypoint = body.entrypoint;
        if (!entrypoint && policy.currentVersionId) {
          const [currentVer] = await tx
            .select({ entrypoint: policyVersions.entrypoint })
            .from(policyVersions)
            .where(eq(policyVersions.id, policy.currentVersionId));
          entrypoint = currentVer?.entrypoint || "interdict/policy/verdict";
        }
        entrypoint = entrypoint || "interdict/policy/verdict";

        // Insert new version
        const [version] = await tx
          .insert(policyVersions)
          .values({
            policyId: id,
            version: newVersionNum,
            regoSource: body.rego_source,
            entrypoint,
            compilationStatus: "pending",
            changeDescription: body.change_description || null,
          })
          .returning();

        // Update current_version_id and updated_at
        await tx
          .update(policies)
          .set({
            currentVersionId: version.id,
            updatedAt: new Date(),
          })
          .where(eq(policies.id, id));

        return {
          policy: { ...policy, currentVersionId: version.id, updatedAt: new Date() },
          version,
        };
      });

      return serializePolicy(result.policy, result.version);
    },

    /**
     * Soft-delete a policy (set is_active = false).
     * Versions remain for audit compliance.
     */
    async delete(id: string) {
      const [policy] = await db
        .select()
        .from(policies)
        .where(and(eq(policies.id, id), eq(policies.isActive, true)));

      if (!policy) {
        throw new NotFoundError("Policy not found");
      }

      await db
        .update(policies)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(policies.id, id));
    },

    /**
     * Get version history for a policy, ordered by version DESC.
     */
    async getVersionHistory(policyId: string) {
      // Verify policy exists
      const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));

      if (!policy) {
        throw new NotFoundError("Policy not found");
      }

      const versions = await db
        .select()
        .from(policyVersions)
        .where(eq(policyVersions.policyId, policyId))
        .orderBy(desc(policyVersions.version));

      return versions.map(serializeVersion);
    },

    /**
     * Restore a previous version by creating a new version with its content.
     */
    async restoreVersion(policyId: string, versionId: string) {
      const result = await db.transaction(async (tx: AppTx) => {
        // Verify policy exists and is active
        const [policy] = await tx
          .select()
          .from(policies)
          .where(and(eq(policies.id, policyId), eq(policies.isActive, true)));

        if (!policy) {
          throw new NotFoundError("Policy not found");
        }

        // Find the version to restore
        const [oldVersion] = await tx
          .select()
          .from(policyVersions)
          .where(and(eq(policyVersions.id, versionId), eq(policyVersions.policyId, policyId)));

        if (!oldVersion) {
          throw new NotFoundError("Version not found");
        }

        // Get current max version
        const [maxVersion] = await tx
          .select({ maxVer: sql<number>`COALESCE(MAX(${policyVersions.version}), 0)` })
          .from(policyVersions)
          .where(eq(policyVersions.policyId, policyId));

        const newVersionNum = (maxVersion?.maxVer ?? 0) + 1;

        // Create new version with old content
        const [version] = await tx
          .insert(policyVersions)
          .values({
            policyId,
            version: newVersionNum,
            regoSource: oldVersion.regoSource,
            entrypoint: oldVersion.entrypoint,
            compilationStatus: "pending",
            changeDescription: `Restored from version ${oldVersion.version}`,
          })
          .returning();

        // Update current_version_id
        await tx
          .update(policies)
          .set({
            currentVersionId: version.id,
            updatedAt: new Date(),
          })
          .where(eq(policies.id, policyId));

        return {
          policy: { ...policy, currentVersionId: version.id, updatedAt: new Date() },
          version,
        };
      });

      return serializePolicy(result.policy, result.version);
    },

    /**
     * List active policies with cursor-based pagination on (updated_at, id).
     */
    async list(cursor?: string, pageSize?: number) {
      const limit = Math.min(pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const conditions = [eq(policies.isActive, true)];

      if (cursor) {
        const { timestamp, id: cursorId } = decodeCursor(cursor);
        const cursorDate = new Date(timestamp);
        const cursorCondition = or(
          lt(policies.updatedAt, cursorDate),
          and(eq(policies.updatedAt, cursorDate), lt(policies.id, cursorId)),
        );

        if (cursorCondition) {
          conditions.push(cursorCondition);
        }
      }

      const rows = await db
        .select()
        .from(policies)
        .where(and(...conditions))
        .orderBy(desc(policies.updatedAt), desc(policies.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      // Fetch current versions for all policies in batch
      const versionIds = items
        .map((p) => p.currentVersionId)
        .filter((versionId): versionId is string => Boolean(versionId));

      const versionMap = new Map<string, VersionRow>();
      if (versionIds.length > 0) {
        const versions = await db
          .select()
          .from(policyVersions)
          .where(sql`${policyVersions.id} IN ${versionIds}`);
        for (const v of versions) {
          versionMap.set(v.id, v);
        }
      }

      const serialized = items.map((policy) =>
        serializePolicy(
          policy,
          policy.currentVersionId ? (versionMap.get(policy.currentVersionId) ?? null) : null,
        ),
      );

      const nextCursor = hasMore
        ? encodeCursor(items[items.length - 1].updatedAt.getTime(), items[items.length - 1].id)
        : null;

      return { items: serialized, nextCursor };
    },
  };
}
