/**
 * Distribution Module
 *
 * gRPC server-streaming distribution of compiled policy modules
 * to connected kernel instances. Provides real-time policy push
 * following the xDS-style pattern.
 */

export { startDistributionServer, stopDistributionServer } from "./server";
export {
  kernelTracker,
  broadcastUpdate,
  KernelTracker,
  type KernelConnection,
  type PolicyUpdateMessage,
  type PolicyEntryMessage,
} from "./tracker";
