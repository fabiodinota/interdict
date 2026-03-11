/**
 * Compilation Worker
 *
 * Async OPA build compilation worker that transforms Rego source into Wasm modules.
 * Writes compiled Wasm to filesystem and records path + SHA-256 hash in DB.
 *
 * Per CONTEXT.md locked decisions:
 * - Compilation is asynchronous (save returns immediately with 'compiling' status)
 * - Uses OPA CLI (`opa build -t wasm`) for compilation
 * - Wasm stored on filesystem with DB reference (path + SHA-256 hash)
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { eq } from "drizzle-orm";
import { policies, policyScopeAssignments, policyVersions } from "../../db/schema/policies";
import type { AppDb } from "../../shared/types";
import { broadcastUpdate } from "../distribution/tracker";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum Wasm module size (1MB) per kernel Wasmtime pooling allocator constraint */
export const WASM_MAX_SIZE_BYTES = 1_048_576;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompilationJob {
  policyVersionId: string;
  policyId: string;
  version: number;
  regoSource: string;
  entrypoint: string;
  wasmStorageDir: string;
}

export interface CompilationResult {
  success: boolean;
  wasmPath?: string;
  wasmHash?: string;
  wasmSizeBytes?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/**
 * Compile a Rego policy to Wasm using OPA CLI.
 *
 * 1. Write Rego to temp directory
 * 2. Run `opa build -t wasm -e {entrypoint}`
 * 3. Extract policy.wasm from bundle.tar.gz
 * 4. Check size against 1MB limit
 * 5. Compute SHA-256 hash
 * 6. Write to permanent storage at {wasmStorageDir}/{policyId}/{version}.wasm
 */
export async function compilePolicy(job: CompilationJob): Promise<CompilationResult> {
  const tmpDir = join("/tmp", `opa-compile-${crypto.randomUUID()}`);

  try {
    await mkdir(tmpDir, { recursive: true });

    const regoPath = join(tmpDir, "policy.rego");
    await Bun.write(regoPath, job.regoSource);

    // Run OPA build
    const result =
      await $`opa build -t wasm -e ${job.entrypoint} ${regoPath} -o ${tmpDir}/bundle.tar.gz`
        .quiet()
        .nothrow();

    if (result.exitCode !== 0) {
      const errorMsg = result.stderr.toString().trim() || result.stdout.toString().trim();
      return {
        success: false,
        error: errorMsg || `OPA build failed with exit code ${result.exitCode}`,
      };
    }

    // Extract policy.wasm from the tar.gz bundle
    await $`tar -xzf ${tmpDir}/bundle.tar.gz -C ${tmpDir}`.quiet();

    const wasmFile = Bun.file(join(tmpDir, "policy.wasm"));
    if (!(await wasmFile.exists())) {
      return {
        success: false,
        error: "Compiled bundle does not contain policy.wasm",
      };
    }

    const wasmBytes = await wasmFile.arrayBuffer();
    const wasmSize = wasmBytes.byteLength;

    // Check size against 1MB kernel limit
    if (wasmSize > WASM_MAX_SIZE_BYTES) {
      return {
        success: false,
        error: `Compiled Wasm module is ${wasmSize} bytes (${(wasmSize / 1024 / 1024).toFixed(2)}MB), exceeding the 1MB kernel limit (${WASM_MAX_SIZE_BYTES} bytes). Simplify the policy to reduce compiled size.`,
      };
    }

    // Compute SHA-256 hash
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(new Uint8Array(wasmBytes));
    const wasmHash = hasher.digest("hex");

    // Write to permanent storage
    const outputDir = join(job.wasmStorageDir, job.policyId);
    await mkdir(outputDir, { recursive: true });
    const wasmPath = join(outputDir, `${job.version}.wasm`);
    await Bun.write(wasmPath, wasmBytes);

    return {
      success: true,
      wasmPath,
      wasmHash,
      wasmSizeBytes: wasmSize,
    };
  } catch (err: unknown) {
    // Handle OPA binary not found
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("not found") || errMsg.includes("ENOENT")) {
      return {
        success: false,
        error:
          "OPA binary not found. Install from https://www.openpolicyagent.org/docs/latest/#running-opa",
      };
    }
    return {
      success: false,
      error: `Compilation error: ${errMsg}`,
    };
  } finally {
    // Cleanup temp directory
    try {
      await $`rm -rf ${tmpDir}`.quiet().nothrow();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.debug(`[compiler] Temp directory cleanup failed for ${tmpDir}: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Background Worker
// ---------------------------------------------------------------------------

/**
 * Start the background compilation worker.
 *
 * Polls for pending compilation jobs and processes them.
 * On startup, resets any versions stuck in 'compiling' status (stale from crash).
 */
export function startCompilationWorker(
  db: AppDb,
  wasmStorageDir: string,
  pollIntervalMs = 2000,
): { stop: () => void } {
  let running = true;

  // Reset stale 'compiling' statuses on startup
  const resetStale = async () => {
    try {
      await db
        .update(policyVersions)
        .set({ compilationStatus: "pending" })
        .where(eq(policyVersions.compilationStatus, "compiling"));
    } catch (err) {
      console.error("[compiler] Failed to reset stale compilations:", err);
    }
  };

  // Process pending compilation jobs
  const processJobs = async () => {
    try {
      const pending = await db
        .select()
        .from(policyVersions)
        .where(eq(policyVersions.compilationStatus, "pending"))
        .limit(10);

      for (const version of pending) {
        if (!running) break;

        // Mark as compiling
        await db
          .update(policyVersions)
          .set({ compilationStatus: "compiling" })
          .where(eq(policyVersions.id, version.id));

        // Compile
        const result = await compilePolicy({
          policyVersionId: version.id,
          policyId: version.policyId,
          version: version.version,
          regoSource: version.regoSource,
          entrypoint: version.entrypoint,
          wasmStorageDir,
        });

        // Update status
        if (result.success) {
          await db
            .update(policyVersions)
            .set({
              compilationStatus: "compiled",
              wasmPath: result.wasmPath,
              wasmHash: result.wasmHash,
              wasmSizeBytes: result.wasmSizeBytes,
            })
            .where(eq(policyVersions.id, version.id));

          // Broadcast delta update to connected kernels
          try {
            // Look up the policy name for the update message
            const policyRows = await db
              .select({ name: policies.name })
              .from(policies)
              .where(eq(policies.id, version.policyId))
              .limit(1);

            const policyName = policyRows[0]?.name ?? version.policyId;

            // Read compiled wasm bytes from filesystem
            let wasmBytes = Buffer.alloc(0);
            if (result.wasmPath) {
              const wasmFile = Bun.file(result.wasmPath);
              if (await wasmFile.exists()) {
                wasmBytes = Buffer.from(await wasmFile.arrayBuffer());
              }
            }

            // Phase 18: load scope assignments for this policy
            const scopeRows = await db
              .select()
              .from(policyScopeAssignments)
              .where(eq(policyScopeAssignments.policyId, version.policyId));

            // Use first scope assignment or default to org-wide
            const scopeRow = scopeRows[0];
            let vendorIds: string[] = [];
            if (scopeRow?.vendorIds) {
              try {
                vendorIds = JSON.parse(scopeRow.vendorIds);
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(
                  `[compiler] Invalid vendorIds JSON for policy ${version.policyId}: ${message}`,
                );
              }
            }

            broadcastUpdate({
              version: version.version,
              type: 1, // DELTA
              policies: [
                {
                  policy_id: version.policyId,
                  name: policyName,
                  version: version.version,
                  wasm_bytes: wasmBytes,
                  wasm_hash: result.wasmHash ?? "",
                  rego_source: version.regoSource,
                  entrypoint: version.entrypoint,
                  scope: {
                    org_id: scopeRow?.orgId ?? "default",
                    dept_id: scopeRow?.deptId ?? "",
                    team_id: scopeRow?.teamId ?? "",
                    vendor_ids: vendorIds,
                  },
                  fail_mode: 0, // FAIL_CLOSED default
                },
              ],
              removed_policy_ids: [],
            });

            console.log(
              `[compiler] Broadcasting policy update for ${version.policyId} v${version.version} to connected kernels`,
            );
          } catch (broadcastErr: unknown) {
            // Broadcast failure should not fail the compilation
            const bMsg =
              broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr);
            console.error(`[compiler] Failed to broadcast update for ${version.policyId}: ${bMsg}`);
          }
        } else {
          await db
            .update(policyVersions)
            .set({
              compilationStatus: "failed",
              compilationError: result.error,
            })
            .where(eq(policyVersions.id, version.id));
        }
      }
    } catch (err) {
      console.error("[compiler] Error processing jobs:", err);
    }
  };

  // Start the worker loop
  const run = async () => {
    await resetStale();
    while (running) {
      await processJobs();
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  run().catch((err) => console.error("[compiler] Worker crashed:", err));

  return {
    stop: () => {
      running = false;
    },
  };
}
