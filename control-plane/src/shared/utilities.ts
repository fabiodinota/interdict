/**
 * Shared Utilities
 *
 * Error classes, API response envelope, and cursor pagination helpers.
 * Used by all API modules for consistent error handling and response formatting.
 */

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/** Base application error with HTTP status code and machine-readable code */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** 404 Not Found */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

/** 400 Validation Error with optional structured details */
export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message = "Validation failed", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

/** 422 Compilation Error with optional structured details */
export class CompilationError extends AppError {
  public readonly details?: unknown;

  constructor(message = "Compilation failed", details?: unknown) {
    super(message, 422, "COMPILATION_ERROR");
    this.details = details;
  }
}

/** 409 Conflict (duplicate names, concurrent modifications, etc.) */
export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, "CONFLICT");
  }
}

/** 401 Unauthorized */
export class AuthError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/** 403 Forbidden */
export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "FORBIDDEN");
  }
}

// ---------------------------------------------------------------------------
// Response Envelope
// ---------------------------------------------------------------------------

/** Standard success response */
export function apiResponse<T>(data: T, meta?: Record<string, unknown>) {
  return {
    success: true as const,
    data,
    ...(meta ? { meta } : {}),
  };
}

/** Paginated success response with cursor */
export function paginatedResponse<T>(
  items: T[],
  nextCursor: string | null,
  total?: number
) {
  return {
    success: true as const,
    data: items,
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      ...(total !== undefined ? { total } : {}),
    },
  };
}

/** Standard error response */
export function apiError(
  code: string,
  message: string,
  details?: unknown
) {
  return {
    success: false as const,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Cursor Pagination
// ---------------------------------------------------------------------------

/** Default page size for list endpoints */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum allowed page size */
export const MAX_PAGE_SIZE = 200;

/**
 * Encode a cursor from a timestamp and ID.
 * Uses Base64url encoding of `${timestamp}|${id}`.
 */
export function encodeCursor(timestamp: number, id: string): string {
  return Buffer.from(`${timestamp}|${id}`).toString("base64url");
}

/**
 * Decode a cursor string back to timestamp and ID.
 * Throws ValidationError if the cursor format is invalid.
 */
export function decodeCursor(cursor: string): {
  timestamp: number;
  id: string;
} {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString();
    const separatorIndex = decoded.indexOf("|");
    if (separatorIndex === -1) {
      throw new Error("Missing separator");
    }
    const timestamp = parseInt(decoded.substring(0, separatorIndex), 10);
    const id = decoded.substring(separatorIndex + 1);
    if (isNaN(timestamp) || !id) {
      throw new Error("Invalid cursor components");
    }
    return { timestamp, id };
  } catch {
    throw new ValidationError("Invalid cursor format");
  }
}
