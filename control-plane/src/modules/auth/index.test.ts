import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { authModule } from "./index";

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
  constructor(private readonly db: FakeDb) {}

  values(_value: unknown) {
    this.db.insertCount += 1;
    return Promise.resolve();
  }
}

class UpdateBuilder {
  set(_value: unknown) {
    return {
      where: (_condition: unknown) => Promise.resolve([]),
    };
  }
}

class DeleteBuilder {
  where(_condition: unknown) {
    return Promise.resolve();
  }
}

class FakeDb {
  constructor(private readonly selectResponses: unknown[][]) {}

  insertCount = 0;

  nextSelect(): unknown[] {
    return this.selectResponses.shift() ?? [];
  }

  select(..._fields: unknown[]) {
    return createSelectBuilder(this);
  }

  insert(_table: unknown) {
    return new InsertBuilder(this);
  }

  update(_table: unknown) {
    return new UpdateBuilder();
  }

  delete(_table: unknown) {
    return new DeleteBuilder();
  }
}

describe("POST /api/v1/auth/session/exchange-api-key", () => {
  test("returns an opaque session token and user payload on success", async () => {
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
    ]);
    const app = new Elysia().state("db", fakeDb as never).use(authModule);

    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/session/exchange-api-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "ik_live_valid_seed_key" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBeString();
    expect(body.data.token.startsWith("ik_live_")).toBe(false);
    expect(body.data.user.email).toBe("admin@interdict.io");
  });

  test("returns 401 for invalid credentials", async () => {
    const fakeDb = new FakeDb([[]]);
    const app = new Elysia().state("db", fakeDb as never).use(authModule);

    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/session/exchange-api-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "ik_live_invalid" }),
      }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid API key" },
    });
  });
});
