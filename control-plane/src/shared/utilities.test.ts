/**
 * Shared Utilities Tests
 *
 * Tests cursor encoding/decoding roundtrip, error class hierarchy,
 * and API response envelope formatting.
 */

import { describe, expect, it } from "bun:test";
import {
  encodeCursor,
  decodeCursor,
  AppError,
  NotFoundError,
  ValidationError,
  CompilationError,
  ConflictError,
  AuthError,
  ForbiddenError,
  apiResponse,
  paginatedResponse,
  apiError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./utilities";

// ---------------------------------------------------------------------------
// Cursor encoding/decoding
// ---------------------------------------------------------------------------

describe("encodeCursor / decodeCursor", () => {
  it("roundtrips timestamp and id correctly", () => {
    const timestamp = 1706745600000;
    const id = "abc-123-def";

    const cursor = encodeCursor(timestamp, id);
    const decoded = decodeCursor(cursor);

    expect(decoded.timestamp).toBe(timestamp);
    expect(decoded.id).toBe(id);
  });

  it("handles IDs containing special characters", () => {
    const timestamp = 1000;
    const id = "id|with|pipes|and=equals";

    const cursor = encodeCursor(timestamp, id);
    const decoded = decodeCursor(cursor);

    expect(decoded.timestamp).toBe(timestamp);
    expect(decoded.id).toBe(id);
  });

  it("handles zero timestamp", () => {
    const cursor = encodeCursor(0, "zero-ts");
    const decoded = decodeCursor(cursor);

    expect(decoded.timestamp).toBe(0);
    expect(decoded.id).toBe("zero-ts");
  });

  it("handles UUID-style IDs", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const cursor = encodeCursor(1706745600000, id);
    const decoded = decodeCursor(cursor);

    expect(decoded.id).toBe(id);
  });

  it("produces base64url-safe output", () => {
    const cursor = encodeCursor(1706745600000, "test-id");

    // Base64url should not contain +, /, or =
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it("throws ValidationError for malformed cursor (no separator)", () => {
    const badCursor = Buffer.from("noseparator").toString("base64url");

    expect(() => decodeCursor(badCursor)).toThrow();
    try {
      decodeCursor(badCursor);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toContain("Invalid cursor format");
    }
  });

  it("throws ValidationError for non-numeric timestamp", () => {
    const badCursor = Buffer.from("notanumber|some-id").toString("base64url");

    expect(() => decodeCursor(badCursor)).toThrow();
    try {
      decodeCursor(badCursor);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
    }
  });

  it("throws ValidationError for completely invalid base64", () => {
    expect(() => decodeCursor("!@#$%^&*")).toThrow();
  });

  it("throws ValidationError for empty id after separator", () => {
    const badCursor = Buffer.from("12345|").toString("base64url");

    expect(() => decodeCursor(badCursor)).toThrow();
    try {
      decodeCursor(badCursor);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
    }
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe("error classes", () => {
  describe("AppError", () => {
    it("sets message, statusCode, and code", () => {
      const err = new AppError("test error", 500, "INTERNAL");

      expect(err.message).toBe("test error");
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe("INTERNAL");
      expect(err.name).toBe("AppError");
    });

    it("is an instance of Error", () => {
      const err = new AppError("test", 400, "BAD");

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
    });
  });

  describe("NotFoundError", () => {
    it("defaults to 404 with NOT_FOUND code", () => {
      const err = new NotFoundError();

      expect(err.statusCode).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toBe("Resource not found");
    });

    it("accepts custom message", () => {
      const err = new NotFoundError("Policy not found");

      expect(err.message).toBe("Policy not found");
      expect(err.statusCode).toBe(404);
    });

    it("is instance of AppError", () => {
      expect(new NotFoundError()).toBeInstanceOf(AppError);
    });
  });

  describe("ValidationError", () => {
    it("defaults to 400 with VALIDATION_ERROR code", () => {
      const err = new ValidationError();

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("stores optional details", () => {
      const details = { field: "name", reason: "too short" };
      const err = new ValidationError("Invalid input", details);

      expect(err.details).toEqual(details);
    });
  });

  describe("CompilationError", () => {
    it("defaults to 422", () => {
      const err = new CompilationError();

      expect(err.statusCode).toBe(422);
      expect(err.code).toBe("COMPILATION_ERROR");
    });
  });

  describe("ConflictError", () => {
    it("defaults to 409", () => {
      const err = new ConflictError();

      expect(err.statusCode).toBe(409);
      expect(err.code).toBe("CONFLICT");
    });
  });

  describe("AuthError", () => {
    it("defaults to 401", () => {
      const err = new AuthError();

      expect(err.statusCode).toBe(401);
      expect(err.code).toBe("UNAUTHORIZED");
    });
  });

  describe("ForbiddenError", () => {
    it("defaults to 403", () => {
      const err = new ForbiddenError();

      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
    });
  });
});

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

describe("apiResponse", () => {
  it("wraps data in success envelope", () => {
    const result = apiResponse({ id: "1", name: "test" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "1", name: "test" });
  });

  it("includes meta when provided", () => {
    const result = apiResponse("data", { version: "1.0" });

    expect(result.success).toBe(true);
    expect(result.data).toBe("data");
    expect(result.meta).toEqual({ version: "1.0" });
  });

  it("omits meta when not provided", () => {
    const result = apiResponse("data");

    expect(result).not.toHaveProperty("meta");
  });
});

describe("paginatedResponse", () => {
  it("wraps items with cursor in success envelope", () => {
    const items = [{ id: "1" }, { id: "2" }];
    const cursor = "abc123";

    const result = paginatedResponse(items, cursor);

    expect(result.success).toBe(true);
    expect(result.data.items).toEqual(items);
    expect(result.data.nextCursor).toBe(cursor);
  });

  it("sets nextCursor to null when no more pages", () => {
    const result = paginatedResponse([], null);

    expect(result.data.nextCursor).toBeNull();
  });

  it("includes total when provided", () => {
    const result = paginatedResponse(["a", "b"], null, 100);

    expect(result.data.total).toBe(100);
  });

  it("omits total when not provided", () => {
    const result = paginatedResponse(["a"], null);

    expect(result.data).not.toHaveProperty("total");
  });
});

describe("apiError", () => {
  it("creates error response with code and message", () => {
    const result = apiError("NOT_FOUND", "Resource not found");

    expect(result.success).toBe(false);
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toBe("Resource not found");
  });

  it("includes details when provided", () => {
    const result = apiError("VALIDATION", "Invalid", { fields: ["name"] });

    expect(result.error.details).toEqual({ fields: ["name"] });
  });

  it("omits details when not provided", () => {
    const result = apiError("ERROR", "msg");

    expect(result.error).not.toHaveProperty("details");
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("DEFAULT_PAGE_SIZE is 50", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
  });

  it("MAX_PAGE_SIZE is 200", () => {
    expect(MAX_PAGE_SIZE).toBe(200);
  });
});
