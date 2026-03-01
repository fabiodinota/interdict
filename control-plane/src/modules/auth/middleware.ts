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
 * Security: API key token values are NEVER included in error responses or logs
 * (CLAUDE.md Invariant 6).
 */

import { Elysia } from "elysia";
import { createAuthService, type AuthenticatedUser } from "./service";
import { roleHierarchyLevel } from "./permissions";

/**
 * Auth plugin providing the `auth` macro.
 *
 * The auth service is created inside resolve using store.db to ensure
 * it uses the decorated DB instance (same pattern as policiesModule
 * and auditModule derive blocks).
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

      // 2. Validate API key via auth service
      const authService = createAuthService(store.db);
      const user = await authService.authenticateByApiKey(token);

      if (!user) {
        return status(401, {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
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
