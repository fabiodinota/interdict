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
import { policiesModule } from "./modules/policies";
import { compilerModule } from "./modules/compiler";
import { startCompilationWorker } from "./modules/compiler/worker";
import { vendorsModule } from "./modules/vendors";
import { regulatoryModule } from "./modules/regulatory";
import { auditModule } from "./modules/audit";
import {
  startDistributionServer,
  stopDistributionServer,
} from "./modules/distribution";

const config = getConfig();

const MODULES = [
  "policies",
  "compiler",
  "vendors",
  "regulatory",
  "audit",
  "distribution",
] as const;

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
  .use(policiesModule)
  .use(compilerModule)
  .use(vendorsModule)
  .use(regulatoryModule)
  .use(auditModule)
  .listen(config.port);

// Start gRPC distribution server for pushing policy updates to kernels
const grpcServer = startDistributionServer(
  db,
  config.grpcPort,
  config.grpcMaxMessageSize
);
console.log(
  `[control-plane] gRPC distribution server running on port ${config.grpcPort}`
);

// Start the background compilation worker
startCompilationWorker(db, config.wasmStorageDir);

console.log(
  `[control-plane] Interdict Control Plane running on port ${config.port}`
);
console.log(`[control-plane] Modules loaded: ${MODULES.join(", ")}`);

// Graceful shutdown: stop gRPC server on process exit
const shutdown = async (signal: string) => {
  console.log(`[control-plane] Received ${signal}, shutting down...`);
  try {
    await stopDistributionServer(grpcServer);
  } catch (err: any) {
    console.error(
      `[control-plane] Error stopping gRPC server: ${err.message}`
    );
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { app };
