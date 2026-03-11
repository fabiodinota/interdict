/**
 * Vendor Service
 *
 * Business logic for vendor registry CRUD with per-model granularity.
 * Vendors have individual model entries, each with their own status.
 * Blocking a vendor cascades to block all its models.
 * Deleting a vendor hard-deletes (vendor registry is not audit-sensitive).
 */

import { and, desc, eq, lt, or, type SQL, sql } from "drizzle-orm";
import { vendorModels, vendors } from "../../db/schema/vendors";
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

export interface CreateVendorInput {
  name: string;
  display_name: string;
  base_url?: string;
  description?: string;
}

export interface UpdateVendorInput {
  display_name?: string;
  status?: "approved" | "blocked";
  base_url?: string;
  description?: string;
}

export interface CreateModelInput {
  model_name: string;
  status?: "approved" | "blocked";
}

export interface UpdateModelInput {
  status: "approved" | "blocked";
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

type VendorRow = typeof vendors.$inferSelect;
type VendorModelRow = typeof vendorModels.$inferSelect;
type SerializedModel = ReturnType<typeof serializeModel>;
type SerializedVendor = ReturnType<typeof serializeVendor>;
type VendorListResult = { items: SerializedVendor[]; nextCursor: string | null };

function serializeModel(m: VendorModelRow) {
  return {
    id: m.id,
    model_name: m.modelName,
    status: m.status,
    created_at: m.createdAt.toISOString(),
    updated_at: m.updatedAt.toISOString(),
  };
}

function serializeVendor(v: VendorRow, models: VendorModelRow[] = []) {
  return {
    id: v.id,
    name: v.name,
    display_name: v.displayName,
    status: v.status,
    base_url: v.baseUrl,
    description: v.description,
    models: models.map(serializeModel),
    created_at: v.createdAt.toISOString(),
    updated_at: v.updatedAt.toISOString(),
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

export interface VendorService {
  create(body: CreateVendorInput): Promise<SerializedVendor>;
  getById(id: string): Promise<SerializedVendor>;
  update(id: string, body: UpdateVendorInput): Promise<SerializedVendor>;
  delete(id: string): Promise<void>;
  list(cursor?: string, pageSize?: number, statusFilter?: string): Promise<VendorListResult>;
  addModel(vendorId: string, body: CreateModelInput): Promise<SerializedModel>;
  updateModel(vendorId: string, modelId: string, body: UpdateModelInput): Promise<SerializedModel>;
  removeModel(vendorId: string, modelId: string): Promise<void>;
  listModels(vendorId: string): Promise<SerializedModel[]>;
}

/**
 * Create a VendorService bound to a database instance.
 */
export function createVendorService(db: AppDb): VendorService {
  return {
    /**
     * Create a new vendor.
     * Throws ConflictError on duplicate name.
     */
    async create(body: CreateVendorInput) {
      try {
        const [vendor] = await db
          .insert(vendors)
          .values({
            name: body.name,
            displayName: body.display_name,
            baseUrl: body.base_url || null,
            description: body.description || null,
          })
          .returning();

        return serializeVendor(vendor);
      } catch (err: unknown) {
        // Handle unique constraint violation (DrizzleQueryError wraps PG error in .cause)
        const { code: pgCode, message: msg } = getConstraintErrorDetails(err);
        if (pgCode === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
          throw new ConflictError(`Vendor with name '${body.name}' already exists`);
        }
        throw err;
      }
    },

    /**
     * Get vendor by ID with all models.
     */
    async getById(id: string) {
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));

      if (!vendor) {
        throw new NotFoundError("Vendor not found");
      }

      const models = await db.select().from(vendorModels).where(eq(vendorModels.vendorId, id));

      return serializeVendor(vendor, models);
    },

    /**
     * Update vendor fields.
     * If status changes to 'blocked', cascade to all models.
     */
    async update(id: string, body: UpdateVendorInput) {
      const result = await db.transaction(async (tx: AppTx) => {
        const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, id));

        if (!vendor) {
          throw new NotFoundError("Vendor not found");
        }

        const updates: Partial<typeof vendors.$inferInsert> & { updatedAt: Date } = {
          updatedAt: new Date(),
        };
        if (body.display_name !== undefined) updates.displayName = body.display_name;
        if (body.status !== undefined) updates.status = body.status;
        if (body.base_url !== undefined) updates.baseUrl = body.base_url;
        if (body.description !== undefined) updates.description = body.description;

        const [updated] = await tx
          .update(vendors)
          .set(updates)
          .where(eq(vendors.id, id))
          .returning();

        // Cascade block to all models
        if (body.status === "blocked") {
          await tx
            .update(vendorModels)
            .set({ status: "blocked", updatedAt: new Date() })
            .where(eq(vendorModels.vendorId, id));
        }

        const models = await tx.select().from(vendorModels).where(eq(vendorModels.vendorId, id));

        return { vendor: updated, models };
      });

      return serializeVendor(result.vendor, result.models);
    },

    /**
     * Hard delete a vendor (cascades to models via FK).
     */
    async delete(id: string) {
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));

      if (!vendor) {
        throw new NotFoundError("Vendor not found");
      }

      await db.delete(vendors).where(eq(vendors.id, id));
    },

    /**
     * List vendors with optional status filter and cursor pagination.
     */
    async list(cursor?: string, pageSize?: number, statusFilter?: string) {
      const limit = Math.min(pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const conditions: SQL<unknown>[] = [];

      if (statusFilter) {
        conditions.push(eq(vendors.status, statusFilter));
      }

      if (cursor) {
        const { timestamp, id: cursorId } = decodeCursor(cursor);
        const cursorDate = new Date(timestamp);
        const cursorCondition = or(
          lt(vendors.updatedAt, cursorDate),
          and(eq(vendors.updatedAt, cursorDate), lt(vendors.id, cursorId)),
        );

        if (cursorCondition) {
          conditions.push(cursorCondition);
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(vendors)
        .where(whereClause)
        .orderBy(desc(vendors.updatedAt), desc(vendors.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      // Batch-fetch models for all vendors
      const vendorIds = items.map((vendor) => vendor.id);
      const modelsByVendor = new Map<string, VendorModelRow[]>();

      if (vendorIds.length > 0) {
        const allModels = await db
          .select()
          .from(vendorModels)
          .where(sql`${vendorModels.vendorId} IN ${vendorIds}`);

        for (const m of allModels) {
          const existing = modelsByVendor.get(m.vendorId) || [];
          existing.push(m);
          modelsByVendor.set(m.vendorId, existing);
        }
      }

      const serialized = items.map((vendor) =>
        serializeVendor(vendor, modelsByVendor.get(vendor.id) ?? []),
      );

      const nextCursor = hasMore
        ? encodeCursor(items[items.length - 1].updatedAt.getTime(), items[items.length - 1].id)
        : null;

      return { items: serialized, nextCursor };
    },

    /**
     * Add a model to a vendor.
     * Throws ConflictError on duplicate model name.
     */
    async addModel(vendorId: string, body: CreateModelInput) {
      // Verify vendor exists
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));

      if (!vendor) {
        throw new NotFoundError("Vendor not found");
      }

      try {
        const [model] = await db
          .insert(vendorModels)
          .values({
            vendorId,
            modelName: body.model_name,
            status: body.status || "approved",
          })
          .returning();

        return serializeModel(model);
      } catch (err: unknown) {
        const { code: pgCode, message: msg } = getConstraintErrorDetails(err);
        if (pgCode === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
          throw new ConflictError(`Model '${body.model_name}' already exists for this vendor`);
        }
        throw err;
      }
    },

    /**
     * Update a model's status.
     */
    async updateModel(vendorId: string, modelId: string, body: UpdateModelInput) {
      const [model] = await db
        .select()
        .from(vendorModels)
        .where(and(eq(vendorModels.id, modelId), eq(vendorModels.vendorId, vendorId)));

      if (!model) {
        throw new NotFoundError("Model not found");
      }

      const [updated] = await db
        .update(vendorModels)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(vendorModels.id, modelId))
        .returning();

      return serializeModel(updated);
    },

    /**
     * Remove a model from a vendor.
     */
    async removeModel(vendorId: string, modelId: string) {
      const [model] = await db
        .select()
        .from(vendorModels)
        .where(and(eq(vendorModels.id, modelId), eq(vendorModels.vendorId, vendorId)));

      if (!model) {
        throw new NotFoundError("Model not found");
      }

      await db.delete(vendorModels).where(eq(vendorModels.id, modelId));
    },

    /**
     * List all models for a vendor.
     */
    async listModels(vendorId: string) {
      // Verify vendor exists
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));

      if (!vendor) {
        throw new NotFoundError("Vendor not found");
      }

      const models = await db
        .select()
        .from(vendorModels)
        .where(eq(vendorModels.vendorId, vendorId));

      return models.map(serializeModel);
    },
  };
}
