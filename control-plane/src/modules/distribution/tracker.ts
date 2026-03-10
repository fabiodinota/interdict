/**
 * Kernel Tracker
 *
 * Tracks connected kernel instances and broadcasts policy updates
 * to all active gRPC server-streams. Manages kernel lifecycle:
 * register on Subscribe, unregister on disconnect, acknowledge on ACK/NACK.
 */

import type * as grpc from "@grpc/grpc-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KernelConnection {
  kernelId: string;
  orgId: string;
  deptId: string;
  teamId: string;
  /** Last acknowledged policy version */
  currentVersion: number;
  /** Open server-stream for pushing updates */
  stream: grpc.ServerWritableStream<any, any>;
  connectedAt: Date;
  lastAckAt: Date | null;
}

/**
 * PolicyUpdate message structure matching the proto schema.
 * Used as the wire format for broadcastUpdate.
 */
export interface PolicyUpdateMessage {
  version: number;
  type: number; // 0 = FULL_SNAPSHOT, 1 = DELTA
  policies: PolicyEntryMessage[];
  removed_policy_ids: string[];
}

export interface PolicyEntryMessage {
  policy_id: string;
  name: string;
  version: number;
  wasm_bytes: Buffer;
  wasm_hash: string;
  rego_source: string;
  entrypoint: string;
  scope: {
    org_id: string;
    dept_id: string;
    team_id: string;
    vendor_ids: string[];
  };
  fail_mode: number; // 0 = FAIL_CLOSED, 1 = FAIL_OPEN
}

// ---------------------------------------------------------------------------
// KernelTracker
// ---------------------------------------------------------------------------

export class KernelTracker {
  private connections: Map<string, KernelConnection> = new Map();

  /**
   * Register a kernel connection. Called when a kernel subscribes via gRPC.
   */
  register(
    kernelId: string,
    orgId: string,
    deptId: string,
    teamId: string,
    stream: grpc.ServerWritableStream<any, any>
  ): void {
    // If kernel is already connected, unregister the old connection
    if (this.connections.has(kernelId)) {
      console.log(
        `[distribution] Kernel ${kernelId} reconnected, replacing existing connection`
      );
      this.connections.delete(kernelId);
    }

    this.connections.set(kernelId, {
      kernelId,
      orgId,
      deptId,
      teamId,
      currentVersion: 0,
      stream,
      connectedAt: new Date(),
      lastAckAt: null,
    });

    console.log(
      `[distribution] Kernel ${kernelId} connected (org=${orgId}, dept=${deptId || "all"}, team=${teamId || "all"}). Active connections: ${this.connections.size}`
    );
  }

  /**
   * Unregister a kernel connection. Called on disconnect or stream error.
   */
  unregister(kernelId: string): void {
    const existed = this.connections.delete(kernelId);
    if (existed) {
      console.log(
        `[distribution] Kernel ${kernelId} disconnected. Active connections: ${this.connections.size}`
      );
    }
  }

  /**
   * Process an ACK/NACK from a kernel.
   * Updates the kernel's currentVersion on ACK, logs error on NACK.
   */
  acknowledge(
    kernelId: string,
    version: number,
    accepted: boolean,
    errorMessage: string
  ): void {
    const conn = this.connections.get(kernelId);
    if (!conn) {
      console.warn(
        `[distribution] ACK from unknown kernel ${kernelId} (version=${version}, accepted=${accepted})`
      );
      return;
    }

    if (accepted) {
      conn.currentVersion = version;
      conn.lastAckAt = new Date();
      console.log(
        `[distribution] Kernel ${kernelId} ACK version ${version}`
      );
    } else {
      console.warn(
        `[distribution] Kernel ${kernelId} NACK version ${version}: ${errorMessage}`
      );
    }
  }

  /**
   * Get all active kernel connections.
   */
  getConnected(): KernelConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get a specific kernel connection by ID.
   */
  getConnection(kernelId: string): KernelConnection | undefined {
    return this.connections.get(kernelId);
  }

  /**
   * Get the count of currently connected kernels.
   */
  connectedCount(): number {
    return this.connections.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton + Broadcast
// ---------------------------------------------------------------------------

/** Singleton tracker instance shared across the distribution module */
export const kernelTracker = new KernelTracker();

/**
 * Broadcast a policy update to all connected kernel streams.
 *
 * Iterates all connections and writes the update to each stream.
 * On write error, the kernel is unregistered (connection dropped).
 */
export function broadcastUpdate(update: PolicyUpdateMessage): void {
  const connections = kernelTracker.getConnected();
  let successCount = 0;
  const failedKernels: string[] = [];

  for (const conn of connections) {
    try {
      const written = conn.stream.write(update);
      if (written) {
        successCount++;
      } else {
        // Backpressure: stream buffer full. Still counts as sent
        // (will be flushed), but log for observability.
        successCount++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[distribution] Failed to write to kernel ${conn.kernelId}: ${msg}`
      );
      failedKernels.push(conn.kernelId);
    }
  }

  // Unregister failed kernels after iteration to avoid modifying during loop
  for (const kernelId of failedKernels) {
    kernelTracker.unregister(kernelId);
  }

  console.log(
    `[distribution] Policy update v${update.version} broadcast to ${successCount} kernels` +
      (failedKernels.length > 0
        ? ` (${failedKernels.length} failed: ${failedKernels.join(", ")})`
        : "")
  );
}
