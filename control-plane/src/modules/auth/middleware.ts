/**
 * Auth Middleware - Elysia Macro Plugin
 *
 * Provides a named macro `auth` that can be applied per-route to require
 * authentication and optionally check role hierarchy.
 *
 * Usage in route definitions:
 *   { auth: true }              -- any authenticated user
 *   { auth: ["policy_admin"] }  -- requires Policy Admin or higher role
 *   { auth: ["super_admin"] }   -- requires Super Admin only
 *
 * Per CONTEXT.md locked decision: uses Elysia `macro` with `resolve` pattern.
 * The resolve handler injects an `AuthenticatedUser` object into the route context.
 *
 * Security: API key token values and session tokens are NEVER included in
 * error responses or logs (CLAUDE.md Invariant 6).
 *
 * Dual-mode authentication:
 * - Tokens starting with "ik_live_" are treated as API keys (SHA-256 hashed lookup)
 * - All other tokens are treated as opaque session tokens (direct lookup in sessions table)
 */

import { Elysia } from "elysia";
import { createAuthService, type AuthenticatedUser } from "./service";
import { roleHierarchyLevel } from "./permissions";

/** API key prefix used to distinguish API keys from session tokens */
const API_KEY_PREFIX = "ik_live_";

/**
 * Auth plugin providing the `auth` macro.
 *
 * The auth service is created inside resolve using store.db to ensure
 * it uses the decorated DB instance (same pattern as policiesModule
 * and auditModule derive blocks).
 *
 * Supports dual-mode authentication:
 * 1. API key tokens (prefixed with ik_live_) -- existing flow
 * 2. Session tokens (opaque hex strings) -- SAML SSO flow
 */
export const authPlugin = new Elysia({ name: "auth" })
  .macro("auth", (options?: string[] | boolean) => ({
    async resolve({ headers, store, status }: {
      headers: Record<string, string | undefined>;
      store: any;
      status: any;
    }) {
      // 1. Extract Bearer token from Authorization header
      const authHeader = headers["authorization"];
      if (!authHeader?.startsWith("Bearer ")) {
        return status(401, {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid Authorization header",
          },
        });
      }

      const token = authHeader.slice(7);

      // 2. Dual-mode authentication: API key vs session token
      const authService = createAuthService(store.db);
      let user: AuthenticatedUser | null = null;

      if (token.startsWith(API_KEY_PREFIX)) {
        // API key flow (existing)
        user = await authService.authenticateByApiKey(token);
      } else {
        // Session token flow (SAML SSO)
        user = await authService.authenticateBySessionToken(token);
      }

      if (!user) {
        return status(401, {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or expired credentials",
          },
        });
      }

      // 3. Role check if required roles specified
      if (Array.isArray(options) && options.length > 0) {
        const minRequiredLevel = Math.min(
          ...options.map(roleHierarchyLevel)
        );
        if (roleHierarchyLevel(user.role) < minRequiredLevel) {
          return status(403, {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Insufficient role permissions",
            },
          });
        }
      }

      // 4. Return user to context -- available as `user` in route handlers
      return { user };
    },
  }));
