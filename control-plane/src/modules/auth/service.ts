/**
 * Auth Service
 *
 * Business logic for API key authentication, key management, and user lookup.
 * Factory function creates a service instance bound to a database connection,
 * following the same pattern as createPolicyService.
 *
 * Security invariant (CLAUDE.md #6): API key plaintext is NEVER logged,
 * stored, or included in error messages. It is returned exactly once at
 * creation time.
 */

import { randomBytes } from "node:crypto";
import { eq, and, desc, lt, or } from "drizzle-orm";
import { apiKeys, userDepartments } from "../../db/schema/auth";
import { users } from "../../db/schema/organization";
import {
  NotFoundError,
  ForbiddenError,
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../shared/utilities";
import { roleInheritsFrom } from "./permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authenticated user context injected into route handlers by the auth macro */
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isService: boolean;
  departmentIds: string[];
}

// ---------------------------------------------------------------------------
// Key Generation & Hashing Utilities (exported for testing)
// ---------------------------------------------------------------------------

/** API key prefix identifying Interdict live keys */
const KEY_PREFIX_TAG = "ik_live_";

/**
 * Hash an API key using SHA-256.
 * Returns a 64-character hex digest.
 */
export function hashApiKey(key: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(key);
  return hasher.digest("hex") as string;
}

/**
 * Generate a new API key with prefix, hash, and display prefix.
 * Returns the plaintext (shown once), hash (stored), and prefix (for display).
 */
export function generateApiKey(): {
  plaintext: string;
  hash: string;
  prefix: string;
} {
  const random = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX_TAG}${random}`;
  const hash = hashApiKey(plaintext);
  // Store first 16 chars as prefix for identification in UI
  const prefix = plaintext.substring(0, 16);
  return { plaintext, hash, prefix };
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface AuthService {
  authenticateByApiKey(token: string): Promise<AuthenticatedUser | null>;
  createApiKey(
    userId: string,
    label?: string
  ): Promise<{
    plaintext: string;
    keyId: string;
    prefix: string;
    label: string | null;
    createdAt: Date;
  }>;
  revokeApiKey(keyId: string, userId: string, userRole: string): Promise<void>;
  listApiKeys(
    userId: string,
    userRole: string,
    showAll?: boolean,
    cursor?: string,
    pageSize?: number
  ): Promise<{
    items: Array<{
      id: string;
      prefix: string;
      label: string | null;
      is_active: boolean;
      last_used_at: string | null;
      created_at: string;
    }>;
    nextCursor: string | null;
  }>;
  whoAmI(userId: string): Promise<{
    id: string;
    email: string;
    displayName: string;
    role: string;
    departments: string[];
    isService: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Service Factory
// ---------------------------------------------------------------------------

/**
 * Create an AuthService bound to a database instance.
 */
export function createAuthService(db: any): AuthService {
  return {
    /**
     * Authenticate a user by API key token.
     * Hashes the token, looks up the key, fetches user and departments.
     * Updates lastUsedAt fire-and-forget.
     * Returns null if key not found, inactive, or user inactive.
     */
    async authenticateByApiKey(token: string): Promise<AuthenticatedUser | null> {
      const keyHash = hashApiKey(token);

      // Look up active API key by hash
      const [keyRow] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)));

      if (!keyRow) return null;

      // Fetch the user (must be active)
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, keyRow.userId), eq(users.isActive, true)));

      if (!user) return null;

      // Fetch user's department memberships
      const deptRows = await db
        .select({ departmentId: userDepartments.departmentId })
        .from(userDepartments)
        .where(eq(userDepartments.userId, user.id));

      const departmentIds = deptRows.map(
        (r: { departmentId: string }) => r.departmentId
      );

      // Update lastUsedAt fire-and-forget (don't await)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, keyRow.id))
        .then(() => {})
        .catch(() => {});

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isService: user.isService,
        departmentIds,
      };
    },

    /**
     * Create a new API key for a user.
     * Returns the plaintext exactly once -- it is never stored.
     */
    async createApiKey(userId: string, label?: string) {
      const { plaintext, hash, prefix } = generateApiKey();

      const [row] = await db
        .insert(apiKeys)
        .values({
          userId,
          keyHash: hash,
          keyPrefix: prefix,
          label: label || null,
        })
        .returning();

      return {
        plaintext,
        keyId: row.id,
        prefix,
        label: row.label,
        createdAt: row.createdAt,
      };
    },

    /**
     * Revoke an API key (soft delete).
     * Users can revoke their own keys. Super Admins can revoke any key.
     */
    async revokeApiKey(keyId: string, userId: string, userRole: string) {
      // Build conditions: key must exist and be active
      const conditions = [eq(apiKeys.id, keyId), eq(apiKeys.isActive, true)];

      // Non-super-admins can only revoke their own keys
      if (!roleInheritsFrom(userRole, "super_admin")) {
        conditions.push(eq(apiKeys.userId, userId));
      }

      const [key] = await db
        .select()
        .from(apiKeys)
        .where(and(...conditions));

      if (!key) {
        throw new NotFoundError("API key not found");
      }

      await db
        .update(apiKeys)
        .set({ isActive: false, revokedAt: new Date() })
        .where(eq(apiKeys.id, keyId));
    },

    /**
     * List API keys with cursor pagination.
     * Regular users see only their keys. Super Admins can see all keys.
     * NEVER returns keyHash or plaintext.
     */
    async listApiKeys(
      userId: string,
      userRole: string,
      showAll = false,
      cursor?: string,
      pageSize?: number
    ) {
      const limit = Math.min(pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const conditions: any[] = [];

      // Super Admins with ?all=true see all keys; otherwise scoped to own
      if (showAll && roleInheritsFrom(userRole, "super_admin")) {
        // No user filter
      } else {
        conditions.push(eq(apiKeys.userId, userId));
      }

      if (cursor) {
        const { timestamp, id: cursorId } = decodeCursor(cursor);
        const cursorDate = new Date(timestamp);
        conditions.push(
          or(
            lt(apiKeys.createdAt, cursorDate),
            and(eq(apiKeys.createdAt, cursorDate), lt(apiKeys.id, cursorId))
          )!
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          id: apiKeys.id,
          keyPrefix: apiKeys.keyPrefix,
          label: apiKeys.label,
          isActive: apiKeys.isActive,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(whereClause)
        .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      const serialized = items.map((r: any) => ({
        id: r.id,
        prefix: r.keyPrefix,
        label: r.label,
        is_active: r.isActive,
        last_used_at: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
        created_at: r.createdAt.toISOString(),
      }));

      const nextCursor = hasMore
        ? encodeCursor(
            items[items.length - 1].createdAt.getTime(),
            items[items.length - 1].id
          )
        : null;

      return { items: serialized, nextCursor };
    },

    /**
     * Get full user profile with department list.
     * Used by GET /auth/me endpoint.
     */
    async whoAmI(userId: string) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isActive, true)));

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Fetch department memberships
      const deptRows = await db
        .select({ departmentId: userDepartments.departmentId })
        .from(userDepartments)
        .where(eq(userDepartments.userId, userId));

      const departments = deptRows.map(
        (r: { departmentId: string }) => r.departmentId
      );

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        departments,
        isService: user.isService,
      };
    },
  };
}
