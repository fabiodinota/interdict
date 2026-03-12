# T02: Plan 02

**Slice:** S01 — **Milestone:** M001

## Description

Implement the core proxy service: CONNECT tunnel handling with TLS interception, zero-copy bidirectional relay, custom HTTP/2 connection pool with multiple connections per vendor, WebSocket upgrade and relay, and the main server accept loop. This is the hot-path data plane -- every proxied AI request flows through these components.

Purpose: This plan delivers the actual proxy functionality that intercepts, inspects (in later phases), and relays AI traffic. It is the core of the kernel and must be streaming-first with zero full-body buffering.

Output: A running proxy binary that accepts HTTP CONNECT requests, terminates TLS, relays bytes to upstream AI vendors via a multi-connection HTTP/2 pool, handles WebSocket upgrades, and returns structured errors on failure.
