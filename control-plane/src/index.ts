/**
 * Interdict Control Plane - Entry Point
 *
 * Bun + Elysia server providing policy management, vendor registry,
 * regulatory framework mapping, and audit trail query APIs.
 */

import { Elysia } from "elysia";
import { getConfig } from "./config";
import { db } from "./db/postgres";
import { clickhouse } from "./db/clickhouse";

const config = getConfig();

const app = new Elysia()
  .decorate("db", db)
  .decorate("clickhouse", clickhouse)
  .onError(({ error, set }) => {
    // Map custom error classes to HTTP status codes
    if ("statusCode" in error && typeof error.statusCode === "number") {
      set.status = error.statusCode as number;
      return {
        success: false,
        error: {
          code: "code" in error ? error.code : "INTERNAL_ERROR",
          message: error.message,
          details: "details" in error ? error.details : undefined,
        },
      };
    }

    // Elysia validation errors
    if (error.message?.includes("VALIDATION")) {
      set.status = 400;
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
        },
      };
    }

    // Unhandled errors
    console.error("[error] Unhandled error:", error);
    set.status = 500;
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    };
  })
  .get("/health", () => ({
    status: "ok",
    timestamp: Date.now(),
  }))
  .listen(config.port);

console.log(
  `[control-plane] Interdict Control Plane running on port ${config.port}`
);

export { app };
