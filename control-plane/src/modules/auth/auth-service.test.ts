/**
 * Auth Service Tests
 *
 * Unit tests for auth hashing utilities and API-key-to-session exchange.
 */

import { describe, expect, test } from "bun:test";
import { sessions } from "../../db/schema/auth";

// Dynamic import to bypass mock.module pollution from middleware.test.ts
const { createAuthService, generateApiKey, hashApiKey, hashSessionToken } = await import(
  "./service"
);

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
    return Promise.resolve();
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
  constructor(private readonly selectResponses: unknown[][]) {}

  inserts: Array<{ table: unknown; value: unknown }> = [];
  updates: unknown[] = [];
  deletes: unknown[] = [];

  nextSelect(): unknown[] {
    return this.selectResponses.shift() ?? [];
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
}

describe("hashApiKey", () => {
  test("produces a 64-character hex string", () => {
    const hash = hashApiKey("test-key");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("produces consistent hashes for the same input", () => {
    const hash1 = hashApiKey("my-secret-key");
    const hash2 = hashApiKey("my-secret-key");
    expect(hash1).toBe(hash2);
  });

  test("produces different hashes for different inputs", () => {
    const hash1 = hashApiKey("key-alpha");
    const hash2 = hashApiKey("key-beta");
    expect(hash1).not.toBe(hash2);
  });

  test("handles empty string", () => {
    const hash = hashApiKey("");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("handles long input", () => {
    const longKey = "x".repeat(10000);
    const hash = hashApiKey(longKey);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateApiKey", () => {
  test("plaintext starts with ik_live_ prefix", () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.startsWith("ik_live_")).toBe(true);
  });

  test("hash is a 64-character hex string", () => {
    const { hash } = generateApiKey();
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("prefix is the first 16 characters of plaintext", () => {
    const { plaintext, prefix } = generateApiKey();
    expect(prefix).toBe(plaintext.substring(0, 16));
    expect(prefix).toHaveLength(16);
  });

  test("hash matches hashing the plaintext", () => {
    const { plaintext, hash } = generateApiKey();
    const recomputed = hashApiKey(plaintext);
    expect(hash).toBe(recomputed);
  });

  test("generates unique keys on each call", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { plaintext } = generateApiKey();
      keys.add(plaintext);
    }
    expect(keys.size).toBe(50);
  });

  test("plaintext has sufficient entropy", () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.length).toBeGreaterThanOrEqual(50);
  });

  test("prefix starts with ik_live_", () => {
    const { prefix } = generateApiKey();
    expect(prefix.startsWith("ik_live_")).toBe(true);
  });
});

describe("exchangeApiKeyForSession", () => {
  test("returns an opaque token that authenticates through the session path", async () => {
    const fakeDb = new FakeDb([
      [{ id: "key-1", userId: "user-1", isActive: true }],
      [
        {
          id: "user-1",
          email: "admin@interdict.io",
          displayName: "Admin",
          role: "super_admin",
          isService: false,
          isActive: true,
        },
      ],
      [{ departmentId: "dept-a" }],
      [
        {
          id: "user-1",
          email: "admin@interdict.io",
          displayName: "Admin",
          role: "super_admin",
          isService: false,
          isActive: true,
        },
      ],
      [{ departmentId: "dept-a" }],
      [
        {
          userId: "user-1",
          tokenHash: "placeholder",
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
      [
        {
          id: "user-1",
          email: "admin@interdict.io",
          displayName: "Admin",
          role: "super_admin",
          isService: false,
          isActive: true,
        },
      ],
      [{ departmentId: "dept-a" }],
    ]);
    const authService = createAuthService(fakeDb as never);

    const exchanged = await authService.exchangeApiKeyForSession("ik_live_valid_key");

    expect(exchanged).not.toBeNull();
    if (!exchanged) {
      throw new Error("expected session exchange to succeed");
    }
    expect(exchanged?.token.startsWith("ik_live_")).toBe(false);
    expect(exchanged?.user.email).toBe("admin@interdict.io");

    const insertedSession = fakeDb.inserts.find((entry) => entry.table === sessions);
    expect(insertedSession).toBeDefined();
    expect((insertedSession?.value as { tokenHash: string }).tokenHash).toBe(
      hashSessionToken(exchanged.token),
    );

    const authenticated = await authService.authenticateBySessionToken(exchanged.token);
    expect(authenticated?.id).toBe("user-1");

    await authService.revokeSession(exchanged.token);
    expect(fakeDb.deletes).toHaveLength(1);
  });

  test("returns null for invalid api keys without creating a session", async () => {
    const fakeDb = new FakeDb([[]]);
    const authService = createAuthService(fakeDb as never);

    const exchanged = await authService.exchangeApiKeyForSession("ik_live_bad_key_material");

    expect(exchanged).toBeNull();
    expect(fakeDb.inserts).toHaveLength(0);
  });
});
