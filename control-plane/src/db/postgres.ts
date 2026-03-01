/**
 * PostgreSQL Connection (Drizzle ORM + postgres.js)
 *
 * Provides typed database access with connection pooling.
 * All schema tables are imported and available on the db instance.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig } from "../config";
import * as schema from "./schema/index";

const config = getConfig();

/** Raw postgres.js client for migrations and direct queries */
export const queryClient = postgres(config.databaseUrl, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Drizzle ORM instance with all schemas */
export const db = drizzle(queryClient, { schema });
