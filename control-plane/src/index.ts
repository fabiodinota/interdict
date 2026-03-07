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
import { authPlugin } from "./modules/auth/middleware";
import { authModule } from "./modules/auth";
import { policiesModule } from "./modules/policies";
import { compilerModule } from "./modules/compiler";
import { startCompilationWorker } from "./modules/compiler/worker";
import { vendorsModule } from "./modules/vendors";
import { regulatoryModule } from "./modules/regulatory";
import { auditModule } from "./modules/audit";
import { reportsModule } from "./modules/reports";
import { signingKeysModule } from "./modules/signing-keys";
import { evidenceModule } from "./modules/evidence";
import { reviewsModule } from "./modules/reviews";
import { departmentOverridesModule } from "./modules/department-overrides";
import { anomaliesModule } from "./modules/anomalies";
import {
  startDistributionServer,
  stopDistributionServer,
} from "./modules/distribution";

const config = getConfig();

const MODULES = [
  "auth",
  "policies",
  "compiler",
  "vendors",
  "regulatory",
  "audit",
  "reports",
  "distribution",
  "signing-keys",
  "evidence",
  "reviews",
  "department-overrides",
  "anomalies",
] as const;

const app = new Elysia()
  .decorate("db", db)
  .decorate("clickhouse", clickhouse)
  .onError(({ error, set }) => {
    // Map custom error classes to HTTP status codes
    if ("statusCode" in error && typeof error.statusCode === "number") {
      const status = error.statusCode as number;
      set.status = status;
      const errCode = "code" in error ? String(error.code) : "INTERNAL_ERROR";
      console.error("[error]", { code: errCode, status, message: error.message });
      return {
        success: false,
        error: {
          code: errCode,
          // LOW-010: never leak internal details for 5xx responses
          message: status >= 500 ? "Internal server error" : error.message,
          details: status < 500 && "details" in error ? error.details : undefined,
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

    // Unhandled errors — log internally, return opaque message
    const errCode = "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
    console.error("[error]", { code: errCode, status: 500, message: error.message });
    set.status = 500;
    return {
      success: false,
      error: {
        code: errCode,
        message: "Internal server error",
      },
    };
  })
  .get("/health", () => ({
    status: "ok",
    timestamp: Date.now(),
  }))
  .use(authPlugin)
  .use(authModule)
  .use(policiesModule)
  .use(compilerModule)
  .use(vendorsModule)
  .use(regulatoryModule)
  .use(auditModule)
  .use(reportsModule)
  .use(signingKeysModule)
  .use(evidenceModule)
  // Phase 11: Wire reviewsModule, departmentOverridesModule, anomaliesModule here
  // Plans 11-02, 11-03, and 11-04 will add their modules below this comment.
  .use(reviewsModule)
  .use(departmentOverridesModule)
  .use(anomaliesModule)
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
