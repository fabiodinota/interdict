/**
 * Shared type aliases for the control plane.
 *
 * These replace `db: any`, `store as { db: any; clickhouse: any }`,
 * and `ctx: any` throughout the codebase (Phase 21).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ClickHouseClient } from "@clickhouse/client";
import type * as schema from "../db/schema/index";

// ---------------------------------------------------------------------------
// Database Types
// ---------------------------------------------------------------------------

/** Drizzle ORM database instance with all Interdict schemas. */
export type AppDb = PostgresJsDatabase<typeof schema>;

/** ClickHouse client for evidence/analytics queries. */
export type AppClickHouse = ClickHouseClient;

/** Elysia store shape — shared by all modules via `.state()`. */
export interface AppStore {
  db: AppDb;
  clickhouse: AppClickHouse;
}

// ---------------------------------------------------------------------------
// Auth Types
// ---------------------------------------------------------------------------

/** Authenticated user injected by the auth middleware. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  departmentId?: string;
}

// ---------------------------------------------------------------------------
// Route Context Helpers
// ---------------------------------------------------------------------------

/**
 * Typed Elysia route context for authenticated endpoints.
 *
 * Replaces `ctx: any` in route handlers. The generic parameters
 * allow each handler to specify its body, query, and params shapes.
 */
export interface RouteContext<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
  TParams = Record<string, string>,
> {
  body: TBody;
  query: TQuery;
  params: TParams;
  headers: Record<string, string | undefined>;
  set: { status: number; headers: Record<string, string> };
  store: AppStore;
  user: AuthenticatedUser;
}
