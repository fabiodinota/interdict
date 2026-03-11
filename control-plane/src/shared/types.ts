/**
 * Shared type aliases for the control plane.
 *
 * These replace untyped database, store, and route context usage across the
 * control plane (Phase 21 / Phase 26).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ClickHouseClient } from "@clickhouse/client";
import type * as schema from "../db/schema/index";

// ---------------------------------------------------------------------------
// Database Types
// ---------------------------------------------------------------------------

/** Drizzle ORM database instance with all Interdict schemas. */
export type AppDb = PostgresJsDatabase<typeof schema>;

/** Drizzle transaction handle inferred from AppDb.transaction(). */
export type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

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
  displayName: string;
  role: string;
  isService: boolean;
  departmentId?: string;
  departmentIds: string[];
}

// ---------------------------------------------------------------------------
// Route Context Helpers
// ---------------------------------------------------------------------------

/**
 * Typed Elysia route context for authenticated endpoints.
 *
 * Replaces untyped route handler context. The generic parameters
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
