# Phase 1: Kernel Proxy Foundation - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A streaming-first Rust proxy that intercepts outbound AI traffic across HTTP/1.1, HTTP/2, SSE, gRPC, and WebSockets. Operates as an explicit forward proxy with TLS inspection via deployment-unique CA. Enforces a vendor allowlist (deny-by-default). Connection pooling, bounded channels, and backpressure are built in from day one. Policy evaluation, PII detection, and evidence collection are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Proxy interception mode
- Explicit forward proxy — clients configure HTTP_PROXY/HTTPS_PROXY environment variables
- Kernel handles CONNECT requests, terminates TLS to inspect, re-encrypts to vendor
- HTTPS CONNECT only — no plaintext HTTP forwarding (all AI vendors use HTTPS)
- Single listening port with protocol auto-detection (HTTP/1.1, HTTP/2, gRPC, WebSocket negotiated on the same port)

### TLS certificate handling
- Deployment-unique CA certificate generated per deployment
- CA installed on client machines via onboarding script (Phase 10 handles the install UX)
- Kernel signs on-the-fly certificates for each AI vendor domain using the deployment CA
- Standard corporate proxy TLS inspection pattern

### Vendor allowlist behavior
- Domain-based matching on CONNECT target hostname (e.g., api.openai.com, api.anthropic.com)
- Deny-by-default — only vendors explicitly on the allowlist can be reached; everything else is blocked
- Blocked requests receive HTTP 403 Forbidden with structured JSON body: `{"error": "vendor_blocked", "vendor": "...", "message": "..."}`
- Allowlist configured via static config file (TOML/YAML) at startup
- Fast string match on domain — no regex in hot path
- Implement as Tower middleware layer

### Connection & resource limits
- Fixed connection pool per vendor with configurable max (e.g., 4 HTTP/2 connections per vendor, each supporting 100+ concurrent streams)
- Bounded request queue (e.g., 1024) for backpressure — return 503 Service Unavailable when queue is full
- Under 128MB steady-state memory target — streaming means no large response buffers
- Per-client rate limiting deferred to Phase 2 (policy engine)

### Error & failure behavior
- Vendor unreachable/timeout: return 502 Bad Gateway with structured JSON body `{"error": "vendor_unreachable", "vendor": "...", "timeout_ms": ...}` — no retries in the proxy
- Mid-stream failure: propagate disconnect with protocol-appropriate error event (SSE error event, gRPC UNAVAILABLE status) before closing — client knows stream broke
- Generous timeout defaults for AI workloads: connect 10s, first byte 30s, overall stream 5min — configurable in config file
- Structured JSON logging to stdout — container-friendly (Docker/K8s), fields: timestamp, level, request_id, vendor, event type

### Claude's Discretion
- Exact Rust crate choices (hyper, tower, tokio, rustls, etc.)
- Connection pool implementation details
- Internal channel sizing and tuning
- Certificate generation library
- Config file format choice (TOML vs YAML)
- Exact JSON error response field names and structure

</decisions>

<specifics>
## Specific Ideas

- Vendor allowlist should be implementable as a Tower middleware layer (per user reference to STACK.md tower-http)
- Test vendor blocking with wiremock mock backends
- For streaming, vendor drops mid-connection should propagate clearly — the client SDK should be able to detect and retry
- Fail-closed on config errors (PLCY-09 principle applies even in Phase 1 for allowlist)
- Hot-reload of allowlist via gRPC push comes in Phase 6 — Phase 1 only needs static config
- Per-dept/user/vendor granularity for allowlist comes in Phase 6 — Phase 1 is org-wide

</specifics>

<deferred>
## Deferred Ideas

- Hot-reload of vendor allowlist via gRPC push from control plane — Phase 6
- Per-department/user/vendor allowlist granularity with inheritance — Phase 6
- Per-client rate limiting — Phase 2 (policy engine)
- DNS/IP range fallback for air-gapped deployments — v2/ADV-04
- Suggested alternatives in block response (`suggested_alternatives` field) — future enhancement
- Mid-stream blocking with `[BLOCKED BY INTERDICT: Vendor Not Allowed]` injection — Phase 2/3 (policy enforcement)

</deferred>

---

*Phase: 01-kernel-proxy-foundation*
*Context gathered: 2026-02-26*
