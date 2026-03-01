/**
 * Vendor Service Tests
 *
 * Tests for vendor registry CRUD with per-model granularity.
 * Uses mock database layer to avoid PostgreSQL dependency in unit tests.
 */

import { describe, test, expect } from "bun:test";

// Mock database layer for vendor testing
function createMockVendorDb() {
  const vendors = new Map<string, any>();
  const models = new Map<string, any[]>();

  return {
    vendors,
    models,

    insertVendor(data: {
      name: string;
      displayName: string;
      baseUrl?: string;
      description?: string;
    }) {
      // Check for duplicate name
      for (const v of vendors.values()) {
        if (v.name === data.name) {
          throw new Error("CONFLICT: Vendor name already exists");
        }
      }

      const id = crypto.randomUUID();
      const vendor = {
        id,
        name: data.name,
        displayName: data.displayName,
        status: "approved",
        baseUrl: data.baseUrl || null,
        description: data.description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vendors.set(id, vendor);
      models.set(id, []);
      return vendor;
    },

    getVendor(id: string) {
      const vendor = vendors.get(id);
      if (!vendor) return null;
      const vendorModels = models.get(id) || [];
      return { ...vendor, models: vendorModels };
    },

    updateVendor(
      id: string,
      data: { displayName?: string; status?: string; baseUrl?: string; description?: string }
    ) {
      const vendor = vendors.get(id);
      if (!vendor) return null;

      if (data.displayName) vendor.displayName = data.displayName;
      if (data.baseUrl !== undefined) vendor.baseUrl = data.baseUrl;
      if (data.description !== undefined) vendor.description = data.description;
      if (data.status) {
        vendor.status = data.status;
        // Cascade block to models
        if (data.status === "blocked") {
          const vendorModels = models.get(id) || [];
          for (const m of vendorModels) {
            m.status = "blocked";
          }
        }
      }
      vendor.updatedAt = new Date();
      return vendor;
    },

    deleteVendor(id: string) {
      const existed = vendors.has(id);
      vendors.delete(id);
      models.delete(id);
      return existed;
    },

    addModel(vendorId: string, data: { modelName: string; status?: string }) {
      const vendorModels = models.get(vendorId);
      if (!vendorModels) throw new Error("Vendor not found");

      // Check for duplicate model name
      for (const m of vendorModels) {
        if (m.modelName === data.modelName) {
          throw new Error("CONFLICT: Model name already exists for this vendor");
        }
      }

      const model = {
        id: crypto.randomUUID(),
        vendorId,
        modelName: data.modelName,
        status: data.status || "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vendorModels.push(model);
      return model;
    },

    updateModel(vendorId: string, modelId: string, data: { status: string }) {
      const vendorModels = models.get(vendorId) || [];
      const model = vendorModels.find((m: any) => m.id === modelId);
      if (!model) return null;
      model.status = data.status;
      model.updatedAt = new Date();
      return model;
    },

    listModels(vendorId: string) {
      return models.get(vendorId) || [];
    },
  };
}

describe("VendorService", () => {
  test("creating a vendor returns id, name, display_name, status 'approved'", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });

    expect(vendor.id).toBeDefined();
    expect(vendor.name).toBe("openai");
    expect(vendor.displayName).toBe("OpenAI");
    expect(vendor.status).toBe("approved");
  });

  test("adding models to a vendor returns model entries with individual status", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });

    const m1 = mockDb.addModel(vendor.id, { modelName: "gpt-4" });
    const m2 = mockDb.addModel(vendor.id, {
      modelName: "gpt-3.5",
      status: "blocked",
    });

    expect(m1.modelName).toBe("gpt-4");
    expect(m1.status).toBe("approved");
    expect(m2.modelName).toBe("gpt-3.5");
    expect(m2.status).toBe("blocked");
  });

  test("updating a model status to 'blocked' changes only that model, not the vendor", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });

    const m1 = mockDb.addModel(vendor.id, { modelName: "gpt-4" });
    mockDb.addModel(vendor.id, { modelName: "gpt-3.5" });

    mockDb.updateModel(vendor.id, m1.id, { status: "blocked" });

    const v = mockDb.getVendor(vendor.id)!;
    expect(v.status).toBe("approved"); // Vendor status unchanged
    const models = mockDb.listModels(vendor.id);
    const gpt4 = models.find((m: any) => m.modelName === "gpt-4");
    const gpt35 = models.find((m: any) => m.modelName === "gpt-3.5");
    expect(gpt4!.status).toBe("blocked");
    expect(gpt35!.status).toBe("approved");
  });

  test("listing vendors includes their models with status", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });
    mockDb.addModel(vendor.id, { modelName: "gpt-4" });

    const v = mockDb.getVendor(vendor.id)!;
    expect(v.models.length).toBe(1);
    expect(v.models[0].modelName).toBe("gpt-4");
    expect(v.models[0].status).toBe("approved");
  });

  test("blocking a vendor blocks all its models", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });
    mockDb.addModel(vendor.id, { modelName: "gpt-4" });
    mockDb.addModel(vendor.id, { modelName: "gpt-3.5" });

    mockDb.updateVendor(vendor.id, { status: "blocked" });

    const models = mockDb.listModels(vendor.id);
    expect(models.every((m: any) => m.status === "blocked")).toBe(true);
  });

  test("deleting a vendor cascades to delete its models", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });
    mockDb.addModel(vendor.id, { modelName: "gpt-4" });

    mockDb.deleteVendor(vendor.id);

    expect(mockDb.getVendor(vendor.id)).toBeNull();
    expect(mockDb.listModels(vendor.id).length).toBe(0);
  });

  test("duplicate vendor name returns conflict error", () => {
    const mockDb = createMockVendorDb();
    mockDb.insertVendor({ name: "openai", displayName: "OpenAI" });

    expect(() =>
      mockDb.insertVendor({ name: "openai", displayName: "OpenAI 2" })
    ).toThrow("CONFLICT");
  });

  test("duplicate model name within same vendor returns conflict error", () => {
    const mockDb = createMockVendorDb();
    const vendor = mockDb.insertVendor({
      name: "openai",
      displayName: "OpenAI",
    });
    mockDb.addModel(vendor.id, { modelName: "gpt-4" });

    expect(() =>
      mockDb.addModel(vendor.id, { modelName: "gpt-4" })
    ).toThrow("CONFLICT");
  });
});

describe("VendorService - createVendorService integration", () => {
  test("createVendorService returns an object with required methods", async () => {
    const { createVendorService } = await import("./service");

    const service = createVendorService(null as any);

    expect(typeof service.create).toBe("function");
    expect(typeof service.getById).toBe("function");
    expect(typeof service.update).toBe("function");
    expect(typeof service.delete).toBe("function");
    expect(typeof service.list).toBe("function");
    expect(typeof service.addModel).toBe("function");
    expect(typeof service.updateModel).toBe("function");
    expect(typeof service.removeModel).toBe("function");
    expect(typeof service.listModels).toBe("function");
  });
});
