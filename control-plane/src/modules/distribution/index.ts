/**
 * Distribution Module
 *
 * gRPC server-streaming distribution of compiled policy modules
 * to connected kernel instances. Provides real-time policy push
 * following the xDS-style pattern.
 */

export { startDistributionServer, stopDistributionServer } from "./server";
export {
  broadcastUpdate,
  type KernelConnection,
  KernelTracker,
  kernelTracker,
  type PolicyEntryMessage,
  type PolicyUpdateMessage,
} from "./tracker";
