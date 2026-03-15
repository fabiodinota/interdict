/**
 * Interdict Control Plane - Entry Point
 *
 * Bun + Elysia server providing policy management, vendor registry,
 * regulatory framework mapping, and audit trail query APIs.
 */

import { Elysia } from "elysia";
import { getConfig } from "./config";
import { clickhouse } from "./db/clickhouse";
import { db } from "./db/postgres";
import { anomaliesModule } from "./modules/anomalies";
import { auditModule } from "./modules/audit";
import { authModule } from "./modules/auth";
import { authPlugin } from "./modules/auth/middleware";
import { compilerModule } from "./modules/compiler";
import { startAuthCleanup } from "./modules/auth/cleanup";
import { startCompilationWorker } from "./modules/compiler/worker";
import { departmentOverridesModule } from "./modules/department-overrides";
import { startDistributionServer, stopDistributionServer } from "./modules/distribution";
import { evidenceModule } from "./modules/evidence";
import { policiesModule } from "./modules/policies";
import { regulatoryModule } from "./modules/regulatory";
import { reportsModule } from "./modules/reports";
import { reviewsModule } from "./modules/reviews";
import { signingKeysModule } from "./modules/signing-keys";
import { vendorsModule } from "./modules/vendors";

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
    // Safely extract message — ElysiaCustomStatusResponse may lack .message
    const errMessage =
      error instanceof Error
        ? error.message
        : "message" in error
          ? String((error as { message: unknown }).message)
          : "Unknown error";

    // Map custom error classes to HTTP status codes
    if ("statusCode" in error && typeof error.statusCode === "number") {
      const status = error.statusCode as number;
      set.status = status;
      const errCode = "code" in error ? String(error.code) : "INTERNAL_ERROR";
      console.error("[error]", { code: errCode, status, message: errMessage });
      return {
        success: false,
        error: {
          code: errCode,
          // LOW-010: never leak internal details for 5xx responses
          message: status >= 500 ? "Internal server error" : errMessage,
          details: status < 500 && "details" in error ? error.details : undefined,
        },
      };
    }

    // Elysia validation errors
    if (errMessage.includes("VALIDATION")) {
      set.status = 400;
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: errMessage,
        },
      };
    }

    // Unhandled errors — log internally, return opaque message
    const errCode = "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
    console.error("[error]", { code: errCode, status: 500, message: errMessage });
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
const grpcServer = startDistributionServer(db, config.grpcPort, config.grpcMaxMessageSize);
console.log(`[control-plane] gRPC distribution server running on port ${config.grpcPort}`);

// Start the background compilation worker
startCompilationWorker(db, config.wasmStorageDir);

// Start the auth cleanup service (expired sessions & handoff codes)
const authCleanup = startAuthCleanup(db as never, {
  intervalMs: 300_000, // 5 minutes
  batchSize: 1000,
});
console.log("[control-plane] Auth cleanup service started (interval: 5m, batch: 1000)");

console.log(`[control-plane] Interdict Control Plane running on port ${config.port}`);
console.log(`[control-plane] Modules loaded: ${MODULES.join(", ")}`);

// Graceful shutdown: stop gRPC server on process exit
const shutdown = async (signal: string) => {
  console.log(`[control-plane] Received ${signal}, shutting down...`);
  authCleanup.stop();
  try {
    await stopDistributionServer(grpcServer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[control-plane] Error stopping gRPC server: ${msg}`);
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { app };
