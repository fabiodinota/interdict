/**
 * Vendor Service
 *
 * Business logic for vendor registry CRUD with per-model granularity.
 * Vendors have individual model entries, each with their own status.
 * Blocking a vendor cascades to block all its models.
 * Deleting a vendor hard-deletes (vendor registry is not audit-sensitive).
 */

import { eq, desc, and, lt, or, sql } from "drizzle-orm";
import { vendors, vendorModels } from "../../db/schema/vendors";
import {
  NotFoundError,
  ConflictError,
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
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

function serializeModel(m: any) {
  return {
    id: m.id,
    model_name: m.modelName,
    status: m.status,
    created_at: m.createdAt.toISOString(),
    updated_at: m.updatedAt.toISOString(),
  };
}

function serializeVendor(v: any, models: any[] = []) {
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

// ---------------------------------------------------------------------------
// Service Factory
// ---------------------------------------------------------------------------

export interface VendorService {
  create(body: CreateVendorInput): Promise<any>;
  getById(id: string): Promise<any>;
  update(id: string, body: UpdateVendorInput): Promise<any>;
  delete(id: string): Promise<void>;
  list(cursor?: string, pageSize?: number, statusFilter?: string): Promise<any>;
  addModel(vendorId: string, body: CreateModelInput): Promise<any>;
  updateModel(vendorId: string, modelId: string, body: UpdateModelInput): Promise<any>;
  removeModel(vendorId: string, modelId: string): Promise<void>;
  listModels(vendorId: string): Promise<any[]>;
}

/**
 * Create a VendorService bound to a database instance.
 */
export function createVendorService(db: any): VendorService {
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
      } catch (err: any) {
        // Handle unique constraint violation
        if (
          err.message?.includes("unique") ||
          err.message?.includes("duplicate") ||
          err.code === "23505"
        ) {
          throw new ConflictError(
            `Vendor with name '${body.name}' already exists`
          );
        }
        throw err;
      }
    },

    /**
     * Get vendor by ID with all models.
     */
    async getById(id: string) {
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, id));

      if (!vendor) {
        throw new NotFoundError("Vendor not found");
      }

      const models = await db
        .select()
        .from(vendorModels)
        .where(eq(vendorModels.vendorId, id));

      return serializeVendor(vendor, models);
    },

    /**
     * Update vendor fields.
     * If status changes to 'blocked', cascade to all models.
     */
    async update(id: string, body: UpdateVendorInput) {
      const result = await db.transaction(async (tx: any) => {
        const [vendor] = await tx
          .select()
          .from(vendors)
          .where(eq(vendors.id, id));

        if (!vendor) {
          throw new NotFoundError("Vendor not found");
        }

        const updates: Record<string, any> = { updatedAt: new Date() };
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

        const models = await tx
          .select()
          .from(vendorModels)
          .where(eq(vendorModels.vendorId, id));

        return { vendor: updated, models };
      });

      return serializeVendor(result.vendor, result.models);
    },

    /**
     * Hard delete a vendor (cascades to models via FK).
     */
    async delete(id: string) {
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, id));

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

      const conditions: any[] = [];

      if (statusFilter) {
        conditions.push(eq(vendors.status, statusFilter));
      }

      if (cursor) {
        const { timestamp, id: cursorId } = decodeCursor(cursor);
        const cursorDate = new Date(timestamp);
        conditions.push(
          or(
            lt(vendors.updatedAt, cursorDate),
            and(eq(vendors.updatedAt, cursorDate), lt(vendors.id, cursorId))
          )!
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(vendors)
        .where(whereClause)
        .orderBy(desc(vendors.updatedAt), desc(vendors.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      // Batch-fetch models for all vendors
      const vendorIds = items.map((v: any) => v.id);
      let modelsByVendor = new Map<string, any[]>();

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

      const serialized = items.map((v: any) =>
        serializeVendor(v, modelsByVendor.get(v.id) || [])
      );

      const nextCursor = hasMore
        ? encodeCursor(
            items[items.length - 1].updatedAt.getTime(),
            items[items.length - 1].id
          )
        : null;

      return { items: serialized, nextCursor };
    },

    /**
     * Add a model to a vendor.
     * Throws ConflictError on duplicate model name.
     */
    async addModel(vendorId: string, body: CreateModelInput) {
      // Verify vendor exists
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId));

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
      } catch (err: any) {
        if (
          err.message?.includes("unique") ||
          err.message?.includes("duplicate") ||
          err.code === "23505"
        ) {
          throw new ConflictError(
            `Model '${body.model_name}' already exists for this vendor`
          );
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
        .where(
          and(
            eq(vendorModels.id, modelId),
            eq(vendorModels.vendorId, vendorId)
          )
        );

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
        .where(
          and(
            eq(vendorModels.id, modelId),
            eq(vendorModels.vendorId, vendorId)
          )
        );

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
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId));

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
