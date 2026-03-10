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
import { eq, and, desc, lt, or, gt, type SQL } from "drizzle-orm";
import { apiKeys, userDepartments, sessions, samlHandoffCodes } from "../../db/schema/auth";
import { users } from "../../db/schema/organization";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import {
  NotFoundError,
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
 * Hash a session token using SHA-256.
 * Returns a 64-character hex digest.
 * Raw tokens are never stored — only this digest is persisted (MED-006).
 */
export function hashSessionToken(rawToken: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(rawToken);
  return hasher.digest("hex") as string;
}

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
  authenticateBySessionToken(token: string): Promise<AuthenticatedUser | null>;
  createSession(userId: string): Promise<string>;
  revokeSession(rawToken: string): Promise<void>;
  createSamlHandoffCode(userId: string): Promise<string>;
  exchangeSamlHandoffCode(code: string): Promise<string | null>;
  findOrCreateSamlUser(
    email: string,
    displayName: string,
    externalId: string,
    roleHint?: string
  ): Promise<AuthenticatedUser>;
}

// ---------------------------------------------------------------------------
// Service Factory
// ---------------------------------------------------------------------------

/**
 * Create an AuthService bound to a database instance.
 */
export function createAuthService(db: PostgresJsDatabase<typeof schema>): AuthService {
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

      const conditions: SQL<unknown>[] = [];

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

      const serialized = items.map((r) => ({
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

    /**
     * Authenticate a user by opaque session token.
     * Looks up session in sessions table, checks expiry, joins with users.
     * Returns null if session not found, expired, or user inactive.
     */
    async authenticateBySessionToken(
      token: string
    ): Promise<AuthenticatedUser | null> {
      const tokenHash = hashSessionToken(token);
      const [session] = await db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            gt(sessions.expiresAt, new Date())
          )
        );

      if (!session) return null;

      // Fetch the user (must be active)
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, session.userId), eq(users.isActive, true)));

      if (!user) return null;

      // Fetch user's department memberships
      const deptRows = await db
        .select({ departmentId: userDepartments.departmentId })
        .from(userDepartments)
        .where(eq(userDepartments.userId, user.id));

      const departmentIds = deptRows.map(
        (r: { departmentId: string }) => r.departmentId
      );

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
     * Create a new session for a user.
     * Generates a cryptographically random 128-char hex token with 8h expiry.
     * Returns the token string.
     */
    async createSession(userId: string): Promise<string> {
      const rawToken = randomBytes(64).toString("hex"); // 128 hex chars
      const tokenHash = hashSessionToken(rawToken); // stored; raw never persisted
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

      await db.insert(sessions).values({
        tokenHash,
        userId,
        expiresAt,
      });

      return rawToken; // returned to caller once; never stored
    },

    async revokeSession(rawToken: string): Promise<void> {
      const tokenHash = hashSessionToken(rawToken);
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    /**
     * Create a short-lived one-time handoff code for SAML callback.
     * SECURITY (Phase 17): No raw session token is stored. Only the userId
     * is persisted; the session is minted on-the-fly during exchange.
     */
    async createSamlHandoffCode(userId: string): Promise<string> {
      const code = randomBytes(32).toString("hex"); // 64 hex chars, 256 bits
      const expiresAt = new Date(Date.now() + 60_000); // 60s TTL
      await db.insert(samlHandoffCodes).values({
        code,
        userId,
        expiresAt,
      });
      return code;
    },

    /**
     * Exchange a one-time handoff code for a fresh session token.
     * SECURITY (Phase 17): The session is created on-the-fly here so the
     * raw token never sits in Postgres between ACS and exchange.
     * Atomic UPDATE...RETURNING prevents TOCTOU race (NEW-TOCTOU).
     */
    async exchangeSamlHandoffCode(code: string): Promise<string | null> {
      const [row] = await db
        .update(samlHandoffCodes)
        .set({ used: true })
        .where(
          and(
            eq(samlHandoffCodes.code, code),
            eq(samlHandoffCodes.used, false),
            gt(samlHandoffCodes.expiresAt, new Date())
          )
        )
        .returning({ userId: samlHandoffCodes.userId });

      if (!row) return null;

      // Mint a fresh session — raw token only exists in memory and is
      // returned to the caller. Only the SHA-256 hash is persisted.
      const rawToken = randomBytes(64).toString("hex");
      const tokenHash = hashSessionToken(rawToken);
      const sessionExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h

      await db.insert(sessions).values({
        tokenHash,
        userId: row.userId,
        expiresAt: sessionExpiresAt,
      });

      return rawToken;
    },

    /**
     * Find or create a user from SAML assertion (JIT provisioning).
     * If user exists by email, updates externalId if not set.
     * If user does not exist, creates with default role (or roleHint if valid).
     */
    async findOrCreateSamlUser(
      email: string,
      displayName: string,
      externalId: string,
      roleHint?: string
    ): Promise<AuthenticatedUser> {
      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()));

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;

        // Update externalId if not yet set
        if (!existingUser.externalId && externalId) {
          await db
            .update(users)
            .set({ externalId, updatedAt: new Date() })
            .where(eq(users.id, existingUser.id));
        }
      } else {
        // CRIT-001: Never trust role claims from IdP assertions.
        // All JIT-provisioned users start as read_only_auditor; admins
        // must explicitly elevate roles via the admin API.
        const role = "read_only_auditor";
        // NEW-PII: log without email (PII) — use opaque message only
        console.info(
          `[auth] SAML JIT provisioning new user as read_only_auditor` +
            (roleHint ? ` (IdP roleHint ignored)` : "")
        );

        // JIT provision: create new user
        const [newUser] = await db
          .insert(users)
          .values({
            email: email.toLowerCase(),
            displayName,
            externalId,
            role,
            isActive: true,
            isService: false,
          })
          .returning();

        userId = newUser.id;
        console.info(`[auth] JIT provisioned user ${newUser.id}`);
      }

      // Fetch user with departments for AuthenticatedUser
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      const deptRows = await db
        .select({ departmentId: userDepartments.departmentId })
        .from(userDepartments)
        .where(eq(userDepartments.userId, userId));

      const departmentIds = deptRows.map(
        (r: { departmentId: string }) => r.departmentId
      );

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isService: user.isService,
        departmentIds,
      };
    },
  };
}
