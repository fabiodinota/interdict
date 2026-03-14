/**
 * Signing Keys Service Tests
 *
 * Unit tests for Ed25519 signing key management: listing, rotation,
 * active key retrieval, and external key registration.
 */

import { describe, expect, test } from "bun:test";
import { signingKeys } from "../../db/schema/auth";
import { createSigningKeysService } from "./service";

// ---------------------------------------------------------------------------
// FakeDb infrastructure (matches auth/service.test.ts pattern)
// ---------------------------------------------------------------------------

function createSelectBuilder(db: FakeDb) {
  const result = db.nextSelect();
  const builder = Promise.resolve(result) as Promise<unknown[]> & {
    from: (_table: unknown) => typeof builder;
    where: (_condition: unknown) => typeof builder;
    orderBy: (..._values: unknown[]) => typeof builder;
    limit: (_value: number) => Promise<unknown[]>;
  };

  builder.from = (_table: unknown) => builder;
  builder.where = (_condition: unknown) => builder;
  builder.orderBy = (..._values: unknown[]) => builder;
  builder.limit = (_value: number) => Promise.resolve(result);

  return builder;
}

class InsertBuilder {
  constructor(
    private readonly db: FakeDb,
    private readonly table: unknown,
  ) {}

  values(value: unknown) {
    this.db.inserts.push({ table: this.table, value });
    return this;
  }

  onConflictDoNothing() {
    return this;
  }

  onConflictDoUpdate(_config: unknown) {
    return this;
  }

  returning(_fields?: unknown) {
    const result = this.db.nextReturning();
    return Promise.resolve(result);
  }
}

class UpdateBuilder {
  constructor(private readonly db: FakeDb) {}

  set(value: unknown) {
    this.db.updates.push(value);
    return {
      where: (_condition: unknown) => Promise.resolve([]),
    };
  }
}

class DeleteBuilder {
  constructor(private readonly db: FakeDb) {}

  where(condition: unknown) {
    this.db.deletes.push(condition);
    return Promise.resolve();
  }
}

class FakeDb {
  constructor(
    private readonly selectResponses: unknown[][],
    private readonly returningResponses: unknown[][] = [],
  ) {}

  inserts: Array<{ table: unknown; value: unknown }> = [];
  updates: unknown[] = [];
  deletes: unknown[] = [];
  transactionCallbacks: Array<(tx: unknown) => Promise<void>> = [];

  nextSelect(): unknown[] {
    return this.selectResponses.shift() ?? [];
  }

  nextReturning(): unknown[] {
    return this.returningResponses.shift() ?? [];
  }

  select(..._fields: unknown[]) {
    return createSelectBuilder(this);
  }

  insert(table: unknown) {
    return new InsertBuilder(this, table);
  }

  update(_table: unknown) {
    return new UpdateBuilder(this);
  }

  delete(_table: unknown) {
    return new DeleteBuilder(this);
  }

  async transaction(fn: (tx: unknown) => Promise<void>) {
    // Execute the transaction callback with a fake tx that behaves like the db
    const txDb = new FakeDb(this.selectResponses, this.returningResponses);
    txDb.inserts = this.inserts;
    txDb.updates = this.updates;
    txDb.deletes = this.deletes;
    await fn(txDb);
  }
}

// ---------------------------------------------------------------------------
// Helper: create a realistic signing key row
// ---------------------------------------------------------------------------

function makeKeyRow(
  overrides: Partial<{
    id: string;
    keyId: string;
    publicKeyHex: string;
    isActive: boolean;
    activatedAt: Date | null;
    retiredAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? "uuid-1",
    keyId: overrides.keyId ?? "abcdef0123456789abcdef0123456789",
    publicKeyHex: overrides.publicKeyHex ?? "aa".repeat(32),
    isActive: overrides.isActive ?? true,
    activatedAt: overrides.activatedAt ?? new Date("2026-01-01T00:00:00Z"),
    retiredAt: overrides.retiredAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SigningKeysService", () => {
  describe("listKeys", () => {
    test("returns all keys ordered by creation date", async () => {
      const key1 = makeKeyRow({
        id: "uuid-1",
        keyId: "key-older",
        createdAt: new Date("2026-01-01"),
      });
      const key2 = makeKeyRow({
        id: "uuid-2",
        keyId: "key-newer",
        createdAt: new Date("2026-02-01"),
      });
      const fakeDb = new FakeDb([[key2, key1]]);
      const service = createSigningKeysService(fakeDb as never);

      const keys = await service.listKeys();

      expect(keys).toHaveLength(2);
      expect(keys[0].key_id).toBe("key-newer");
      expect(keys[1].key_id).toBe("key-older");
    });

    test("returns empty array when no keys exist", async () => {
      const fakeDb = new FakeDb([[]]);
      const service = createSigningKeysService(fakeDb as never);

      const keys = await service.listKeys();

      expect(keys).toHaveLength(0);
      expect(keys).toEqual([]);
    });

    test("serializes key fields correctly", async () => {
      const now = new Date("2026-03-01T12:00:00Z");
      const key = makeKeyRow({
        id: "uuid-abc",
        keyId: "key-abc",
        publicKeyHex: "bb".repeat(32),
        isActive: true,
        activatedAt: now,
        retiredAt: null,
        createdAt: now,
      });
      const fakeDb = new FakeDb([[key]]);
      const service = createSigningKeysService(fakeDb as never);

      const [result] = await service.listKeys();

      expect(result.id).toBe("uuid-abc");
      expect(result.key_id).toBe("key-abc");
      expect(result.public_key_hex).toBe("bb".repeat(32));
      expect(result.is_active).toBe(true);
      expect(result.activated_at).toBe(now.toISOString());
      expect(result.retired_at).toBeNull();
      expect(result.created_at).toBe(now.toISOString());
    });
  });

  describe("getActiveKey", () => {
    test("returns the currently active key", async () => {
      const activeKey = makeKeyRow({ keyId: "active-key", isActive: true });
      const fakeDb = new FakeDb([[activeKey]]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.getActiveKey();

      expect(result).not.toBeNull();
      expect(result!.key_id).toBe("active-key");
      expect(result!.is_active).toBe(true);
    });

    test("returns null when no active key exists", async () => {
      const fakeDb = new FakeDb([[]]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.getActiveKey();

      expect(result).toBeNull();
    });
  });

  describe("getAllPublicKeys", () => {
    test("returns a map of key_id to public_key_hex", async () => {
      const key1 = makeKeyRow({ keyId: "key-1", publicKeyHex: "aa".repeat(32) });
      const key2 = makeKeyRow({ keyId: "key-2", publicKeyHex: "bb".repeat(32) });
      const fakeDb = new FakeDb([[key1, key2]]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.getAllPublicKeys();

      expect(result["key-1"]).toBe("aa".repeat(32));
      expect(result["key-2"]).toBe("bb".repeat(32));
      expect(Object.keys(result)).toHaveLength(2);
    });

    test("returns empty object when no keys exist", async () => {
      const fakeDb = new FakeDb([[]]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.getAllPublicKeys();

      expect(result).toEqual({});
    });
  });

  describe("rotateKey", () => {
    test("generates a new key and retires old active keys", async () => {
      // The transaction callback receives a tx, so we need the FakeDb to handle
      // the update (retire old) and insert (new key) within the transaction.
      const fakeDb = new FakeDb([]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.rotateKey();

      expect(result.key_id).toBeDefined();
      expect(result.key_id.length).toBe(32); // SHA-256[:16] = 16 bytes = 32 hex chars
      expect(result.public_key_hex).toBeDefined();
      expect(result.public_key_hex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(result.private_key_written_to).toBeNull(); // No output path provided
    });

    test("returns valid hex for key_id and public_key_hex", async () => {
      const fakeDb = new FakeDb([]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.rotateKey();

      expect(result.key_id).toMatch(/^[0-9a-f]{32}$/);
      expect(result.public_key_hex).toMatch(/^[0-9a-f]{64}$/);
    });

    test("generates unique keys on each rotation", async () => {
      const keyIds = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const fakeDb = new FakeDb([]);
        const service = createSigningKeysService(fakeDb as never);
        const result = await service.rotateKey();
        keyIds.add(result.key_id);
      }
      expect(keyIds.size).toBe(5);
    });

    test("records update and insert within transaction", async () => {
      const fakeDb = new FakeDb([]);
      const service = createSigningKeysService(fakeDb as never);

      await service.rotateKey();

      // Transaction should have retired old keys (update) and inserted new key
      expect(fakeDb.updates.length).toBeGreaterThanOrEqual(1);
      expect(fakeDb.inserts.length).toBeGreaterThanOrEqual(1);

      // The insert should target the signingKeys table
      const keyInsert = fakeDb.inserts.find((entry) => entry.table === signingKeys);
      expect(keyInsert).toBeDefined();

      const insertedValue = keyInsert?.value as {
        keyId: string;
        publicKeyHex: string;
        isActive: boolean;
      };
      expect(insertedValue.isActive).toBe(true);
      expect(insertedValue.keyId).toMatch(/^[0-9a-f]{32}$/);
      expect(insertedValue.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("registerExistingKey", () => {
    test("inserts and returns the new key when no conflict", async () => {
      const now = new Date("2026-03-01T00:00:00Z");
      const returnedRow = makeKeyRow({
        keyId: "ext-key-1",
        publicKeyHex: "cc".repeat(32),
        isActive: true,
        activatedAt: now,
        createdAt: now,
      });
      const fakeDb = new FakeDb([], [[returnedRow]]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.registerExistingKey("ext-key-1", "cc".repeat(32));

      expect(result.key_id).toBe("ext-key-1");
      expect(result.public_key_hex).toBe("cc".repeat(32));
      expect(result.is_active).toBe(true);
    });

    test("fetches existing key on conflict (no row returned from insert)", async () => {
      const existingRow = makeKeyRow({
        keyId: "existing-key",
        publicKeyHex: "dd".repeat(32),
        isActive: true,
      });
      // returning() returns empty (conflict), then select finds the existing row
      const fakeDb = new FakeDb([[existingRow]], [[]]);
      const service = createSigningKeysService(fakeDb as never);

      const result = await service.registerExistingKey("existing-key", "dd".repeat(32));

      expect(result.key_id).toBe("existing-key");
      expect(result.public_key_hex).toBe("dd".repeat(32));
    });
  });
});
