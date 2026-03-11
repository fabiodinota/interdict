/**
 * gRPC Distribution Server
 *
 * Implements the PolicyDistribution gRPC service for pushing compiled
 * policy modules to connected kernel instances via server-streaming.
 *
 * - Subscribe: Server-streaming RPC. Sends full snapshot on connect,
 *   keeps stream open for future delta pushes.
 * - Acknowledge: Unary RPC. Records ACK/NACK from kernels.
 *
 * Known v1 limitation: All policies are sent with org-level scope.
 * Per-department/team scope population from the database is deferred
 * to Phase 7 (requires a policy_scope_assignments join table).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { and, eq, inArray, max } from "drizzle-orm";
import { policies, policyScopeAssignments, policyVersions } from "../../db/schema/policies";
import type { AppDb } from "../../shared/types";
import {
  type AckRequestMessage,
  type AckResponseMessage,
  kernelTracker,
  type PolicyEntryMessage,
  type PolicyUpdateMessage,
  type SubscribeRequestMessage,
} from "./tracker";

// ---------------------------------------------------------------------------
// Proto Loading
// ---------------------------------------------------------------------------

const PROTO_PATH = resolve(
  join(__dirname, "../../../../proto/interdict/policy/v1/policy_distribution.proto"),
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: Number,
  defaults: true,
  oneofs: true,
});

interface PolicyDistributionProtoDescriptor {
  interdict: {
    policy: {
      v1: {
        PolicyDistribution: {
          service: grpc.ServiceDefinition<grpc.UntypedServiceImplementation>;
        };
      };
    };
  };
}

const protoDescriptor = grpc.loadPackageDefinition(
  packageDefinition,
) as unknown as PolicyDistributionProtoDescriptor;
const PolicyDistributionService = protoDescriptor.interdict.policy.v1.PolicyDistribution.service;

// ---------------------------------------------------------------------------
// Full Snapshot Builder
// ---------------------------------------------------------------------------

/** Parsed scope assignment for a single policy. */
interface PolicyScopeEntry {
  orgId: string;
  deptId: string;
  teamId: string;
  vendorIds: string[];
}

/**
 * Check whether a policy scope matches the requesting kernel's scope.
 *
 * Matching rules (hierarchical):
 * - Org-wide scope (deptId="" && teamId=""): matches any kernel in the same org
 * - Department scope (deptId set, teamId=""): matches kernel with same dept or empty dept (org-level kernels see all)
 * - Team scope (both set): matches kernel with same dept+team, or broader kernels
 */
function scopeMatchesKernel(
  scope: PolicyScopeEntry,
  kernelOrgId: string,
  kernelDeptId: string,
  kernelTeamId: string,
): boolean {
  // Must be same org
  if (scope.orgId !== kernelOrgId) return false;

  // Org-wide policy → matches every kernel in the org
  if (!scope.deptId) return true;

  // Kernel subscribes at org level (no dept filter) → sees all policies
  if (!kernelDeptId) return true;

  // Department-scoped policy
  if (scope.deptId !== kernelDeptId) return false;

  // Department-wide policy (no team) → matches
  if (!scope.teamId) return true;

  // Kernel subscribes at dept level (no team filter) → sees all dept policies
  if (!kernelTeamId) return true;

  // Team-scoped policy
  return scope.teamId === kernelTeamId;
}

/**
 * Build a full snapshot of compiled policies from the database,
 * filtered by the requesting kernel's organizational scope.
 *
 * Phase 18: scope fields are populated truthfully from
 * `policy_scope_assignments`. Policies without scope assignments
 * default to org-wide (backward compatible).
 */
export async function buildFullSnapshot(
  db: AppDb,
  orgId: string,
  deptId: string,
  teamId: string,
): Promise<PolicyUpdateMessage> {
  if (!orgId) throw new Error("orgId required for policy snapshot");

  // Get global version counter: max compiled version
  const versionResult = await db
    .select({ maxVersion: max(policyVersions.version) })
    .from(policyVersions)
    .where(eq(policyVersions.compilationStatus, "compiled"));

  const globalVersion: number = versionResult[0]?.maxVersion ?? 0;

  // Query all active policies joined with their current compiled versions
  const activePolicies = await db
    .select({
      policyId: policies.id,
      policyName: policies.name,
      versionId: policyVersions.id,
      version: policyVersions.version,
      wasmPath: policyVersions.wasmPath,
      wasmHash: policyVersions.wasmHash,
      regoSource: policyVersions.regoSource,
      entrypoint: policyVersions.entrypoint,
    })
    .from(policies)
    .innerJoin(
      policyVersions,
      and(
        eq(policyVersions.policyId, policies.id),
        eq(policyVersions.id, policies.currentVersionId),
      ),
    )
    .where(and(eq(policies.isActive, true), eq(policyVersions.compilationStatus, "compiled")));

  // Bulk-load scope assignments for all active policies
  const policyIds = activePolicies.map((p) => p.policyId as string);
  const scopeRows =
    policyIds.length > 0
      ? await db
          .select()
          .from(policyScopeAssignments)
          .where(inArray(policyScopeAssignments.policyId, policyIds))
      : [];

  // Build policyId → scopes map
  const scopeMap = new Map<string, PolicyScopeEntry[]>();
  for (const row of scopeRows) {
    let vendorIds: string[] = [];
    if (row.vendorIds) {
      try {
        vendorIds = JSON.parse(row.vendorIds);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[distribution] Invalid vendorIds JSON for policy ${row.policyId}: ${message}`,
        );
      }
    }
    const entry: PolicyScopeEntry = {
      orgId: row.orgId ?? "default",
      deptId: row.deptId ?? "",
      teamId: row.teamId ?? "",
      vendorIds,
    };
    const existing = scopeMap.get(row.policyId) ?? [];
    existing.push(entry);
    scopeMap.set(row.policyId, existing);
  }

  const policyEntries: PolicyEntryMessage[] = [];

  for (const row of activePolicies) {
    // Resolve scope — default to org-wide if no assignments exist
    const scopes = scopeMap.get(row.policyId) ?? [
      {
        orgId: orgId, // default to requesting kernel's org
        deptId: "",
        teamId: "",
        vendorIds: [],
      },
    ];

    // Phase 18: filter by kernel scope — include policy if ANY scope matches
    const matchingScope = scopes.find((s) => scopeMatchesKernel(s, orgId, deptId, teamId));
    if (!matchingScope) continue; // policy not in this kernel's scope

    let wasmBytes = Buffer.alloc(0);

    if (row.wasmPath) {
      try {
        const file = Bun.file(row.wasmPath);
        if (await file.exists()) {
          wasmBytes = Buffer.from(await file.arrayBuffer());
        } else {
          console.warn(
            `[distribution] Wasm file not found for policy ${row.policyId}: ${row.wasmPath}`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[distribution] Failed to read wasm file for policy ${row.policyId}: ${msg}`);
      }
    }

    policyEntries.push({
      policy_id: row.policyId,
      name: row.policyName,
      version: row.version,
      wasm_bytes: wasmBytes,
      wasm_hash: row.wasmHash ?? "",
      rego_source: row.regoSource,
      entrypoint: row.entrypoint,
      scope: {
        org_id: matchingScope.orgId,
        dept_id: matchingScope.deptId,
        team_id: matchingScope.teamId,
        vendor_ids: matchingScope.vendorIds,
      },
      fail_mode: 0, // FAIL_CLOSED default
    });
  }

  return {
    version: globalVersion,
    type: 0, // FULL_SNAPSHOT
    policies: policyEntries,
    removed_policy_ids: [],
  };
}

// ---------------------------------------------------------------------------
// gRPC Handlers
// ---------------------------------------------------------------------------

/**
 * Subscribe handler (server-streaming).
 *
 * On connect: registers kernel in tracker, builds and sends full snapshot,
 * keeps the stream open for future delta pushes. Stream stays alive until
 * the client disconnects or an error occurs.
 */
function createSubscribeHandler(db: AppDb) {
  return (call: grpc.ServerWritableStream<SubscribeRequestMessage, PolicyUpdateMessage>) => {
    const request = call.request;
    const kernelId: string = request.kernel_id || "";
    const currentVersion: number = request.current_version || 0;
    const orgId: string = request.org_id || "";
    const deptId: string = request.dept_id || "";
    const teamId: string = request.team_id || "";

    if (!kernelId) {
      call.destroy(new Error("kernel_id is required in SubscribeRequest"));
      return;
    }

    if (!orgId) {
      call.destroy(new Error("org_id is required in SubscribeRequest"));
      return;
    }

    console.log(
      `[distribution] Subscribe request from kernel ${kernelId} (version=${currentVersion}, org=${orgId})`,
    );

    // Register the kernel in the tracker
    kernelTracker.register(kernelId, orgId, deptId, teamId, call);

    // Build and send full snapshot (v1: always full snapshot for simplicity)
    buildFullSnapshot(db, orgId, deptId, teamId)
      .then((snapshot) => {
        try {
          call.write(snapshot);
          console.log(
            `[distribution] Full snapshot v${snapshot.version} sent to kernel ${kernelId} (${snapshot.policies.length} policies)`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[distribution] Failed to send snapshot to kernel ${kernelId}: ${msg}`);
          kernelTracker.unregister(kernelId);
        }
      })
      .catch((err) => {
        console.error(
          `[distribution] Failed to build snapshot for kernel ${kernelId}: ${err.message}`,
        );
        kernelTracker.unregister(kernelId);
        call.destroy(err);
      });

    // Handle client disconnect
    call.on("cancelled", () => {
      console.log(`[distribution] Kernel ${kernelId} cancelled subscription`);
      kernelTracker.unregister(kernelId);
    });

    call.on("error", (err: Error) => {
      // Suppress common disconnect errors from logging at error level
      if (err.message?.includes("CANCELLED")) {
        return; // Already handled by 'cancelled' event
      }
      console.error(`[distribution] Stream error for kernel ${kernelId}: ${err.message}`);
      kernelTracker.unregister(kernelId);
    });

    // Do NOT call call.end() — keep the stream open for future pushes
  };
}

/**
 * Acknowledge handler (unary).
 *
 * Records ACK/NACK from a kernel for a specific policy version.
 */
function createAcknowledgeHandler() {
  return (
    call: grpc.ServerUnaryCall<AckRequestMessage, AckResponseMessage>,
    callback: grpc.sendUnaryData<AckResponseMessage>,
  ) => {
    const request = call.request;
    const kernelId: string = request.kernel_id || "";
    const version: number = request.version || 0;
    const accepted: boolean = request.accepted ?? true;
    const errorMessage: string = request.error_message || "";

    kernelTracker.acknowledge(kernelId, version, accepted, errorMessage);

    callback(null, { acknowledged: true });
  };
}

// ---------------------------------------------------------------------------
// Server Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the gRPC distribution server.
 *
 * Binds to the configured port with insecure credentials (mTLS deferred to Phase 7).
 * Serves the PolicyDistribution service with Subscribe and Acknowledge RPCs.
 */
export function startDistributionServer(
  db: AppDb,
  grpcPort: number,
  maxMessageSize: number,
): grpc.Server {
  const server = new grpc.Server({
    "grpc.max_receive_message_length": maxMessageSize,
    "grpc.max_send_message_length": maxMessageSize,
  });

  server.addService(PolicyDistributionService, {
    Subscribe: createSubscribeHandler(db),
    Acknowledge: createAcknowledgeHandler(),
  });

  const bindAddress = `0.0.0.0:${grpcPort}`;

  // Determine server credentials: mTLS or insecure
  const mtlsEnabled = process.env.MTLS_ENABLED === "true";
  let credentials: grpc.ServerCredentials;

  if (mtlsEnabled) {
    const caCertPath = process.env.MTLS_CA_CERT_PATH;
    const certPath = process.env.MTLS_CERT_PATH;
    const keyPath = process.env.MTLS_KEY_PATH;

    if (!caCertPath || !certPath || !keyPath) {
      throw new Error(
        "[distribution] MTLS_ENABLED=true but MTLS_CA_CERT_PATH, MTLS_CERT_PATH, or MTLS_KEY_PATH is missing",
      );
    }

    const caCert = readFileSync(caCertPath);
    const serverCert = readFileSync(certPath);
    const serverKey = readFileSync(keyPath);

    credentials = grpc.ServerCredentials.createSsl(
      caCert,
      [{ cert_chain: serverCert, private_key: serverKey }],
      true, // checkClientCertificate
    );

    console.log("[distribution] mTLS enabled: requiring client certificates for gRPC connections");
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[distribution] mTLS is required in production. Set MTLS_ENABLED=true.");
    }
    credentials = grpc.ServerCredentials.createInsecure();
    console.warn("[distribution] WARNING: insecure gRPC transport active — dev only");
  }

  server.bindAsync(bindAddress, credentials, (err, port) => {
    if (err) {
      console.error(`[distribution] Failed to bind gRPC server on ${bindAddress}: ${err.message}`);
      throw err;
    }
    console.log(`[distribution] gRPC distribution server bound to port ${port}`);
  });

  return server;
}

/**
 * Stop the gRPC distribution server gracefully.
 *
 * Waits for in-flight RPCs to complete before shutting down.
 */
export function stopDistributionServer(server: grpc.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.tryShutdown((err) => {
      if (err) {
        console.error(`[distribution] Error during gRPC server shutdown: ${err.message}`);
        reject(err);
      } else {
        console.log("[distribution] gRPC distribution server stopped");
        resolve();
      }
    });
  });
}
