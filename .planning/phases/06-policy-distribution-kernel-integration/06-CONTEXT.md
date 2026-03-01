# Phase 6: Policy Distribution & Kernel Integration - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Control plane pushes compiled Wasm policy modules to the kernel fleet in real-time via gRPC server-streaming (xDS-style), kernels hot-reload policies without restart, policies support org/dept/team hierarchy with most-restrictive-wins inheritance, and session context enables multi-turn policy enforcement across conversations.

</domain>

<decisions>
## Implementation Decisions

### Distribution Protocol
- xDS-style gRPC server-streaming: control plane opens long-lived server-stream per kernel, pushes updates when policies change
- Full snapshot on initial connect/reconnect, delta updates after (only changed/added/removed policies)
- Disconnect handling is configurable: default to fail-closed after timeout, but setting available to keep last-known policies with exponential backoff reconnect
- Policy versioning: monotonic version counter (higher = newer) paired with content hash (SHA-256 of compiled module) for integrity — key-value map of version → content hash

### Policy Hierarchy Model
- Three-level hierarchy: Organization → Department → Team
- No per-user policy overrides — users inherit from their team
- Conflict resolution: most-restrictive-wins (consistent with existing verdict merge pattern). Lower levels can only tighten, never loosen org-level protections
- Per-vendor policy scoping within each hierarchy level

### Session Context Tracking
- Claude's Discretion: session boundary determination (header-based session ID vs inferred from user+vendor+time window — pick what's practical for the proxy architecture)
- Storage: full content hashes (SHA-256) plus complete detection history per session
- Must enable detection of slow-leak data exfiltration across multiple exchanges (KERN-10)
- Session expiry/cleanup mechanism needed to bound memory

### Hot-Reload Mechanics
- Atomic Arc swap (ArcSwap pattern): new policy set behind Arc, atomic swap, in-flight requests finish with old policy, next request uses new. Zero downtime
- Rollback behavior is configurable: default to keeping previous working policy set on load failure (log error, report NACK to control plane), but setting available to fail-closed on bad policy
- Must work with existing RegorusPool and WasmEngine which hold engines in Arc

### Claude's Discretion
- Session boundary detection approach (header-based vs inferred)
- Exact reconnect backoff parameters
- Session storage implementation (in-memory bounded map vs other)
- Delta update wire format details
- gRPC service proto schema design

</decisions>

<specifics>
## Specific Ideas

- Version counter + content hash as key-value map for policy versioning — enables both ordering (counter) and integrity verification (hash)
- Disconnect behavior and rollback behavior should both be configurable settings, not hardcoded — different deployments have different risk tolerances

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WasmEngine` (crates/kernel/src/policy/wasm_engine.rs): Wasmtime pooling allocator wrapper — needs swap mechanism for hot-reload
- `RegorusPool` (crates/kernel/src/policy/layer1/regorus.rs): Engine pool with semaphore — needs swap mechanism
- `PolicyPipeline` (crates/kernel/src/policy/mod.rs): 3-layer orchestrator — needs to accept dynamic policy sets
- Evidence gRPC infrastructure (tonic already in use for evidence-collector) — reuse for distribution service

### Established Patterns
- Arc-based sharing across async tasks (RegorusPool, WasmEngine, ReviewQueue all use Arc)
- Most-restrictive-wins verdict merge (VerdictAction ordering) — reuse for hierarchy conflict resolution
- Bounded channels with backpressure (evidence buffer, background L2) — apply to policy update notifications
- Fire-and-forget try_send pattern (evidence emission) — may apply to policy reload notifications

### Integration Points
- `PolicyPipeline` in `proxy/connect.rs` — currently static, needs to reference swappable policy set
- `main.rs` — pipeline initialization at startup, needs gRPC client for policy distribution
- `PolicyConfig` — needs hierarchy-aware fields (org_id, dept_id, team_id)
- `RequestContext` — needs session_id field for multi-turn tracking

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-policy-distribution-kernel-integration*
*Context gathered: 2026-03-01*
