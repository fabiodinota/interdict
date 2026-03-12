# T02: Plan 02

**Slice:** S06 — **Milestone:** M001

## Description

Wire the kernel's distribution gRPC client, refactor the PolicyPipeline to use ArcSwap-based hot-reload, integrate session context tracking into the proxy request flow, and spawn the distribution client from main.rs.

Purpose: This is the kernel-side integration that enables real-time policy updates from the control plane. After this plan, the kernel can connect to a gRPC distribution server, receive policy pushes, hot-reload them without restart, and track session context for multi-turn violation detection.

Output: Distribution client module (3 files), updated proxy/connect.rs with PolicySetManager, updated main.rs with distribution client spawn and session store.
