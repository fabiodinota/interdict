# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Every AI action an employee takes is routed through a policy-enforcing kernel -- logged, signed, and regulatorily mapped -- before it reaches any model
**Current focus:** Phase 1: Kernel Proxy Foundation

## Current Position

Phase: 1 of 10 (Kernel Proxy Foundation) -- COMPLETE
Plan: 3 of 3 in current phase (all plans complete)
Status: Phase Complete
Last activity: 2026-02-26 -- Plan 01-03 complete (integration tests and benchmarks)

Progress: [██████████] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~24min
- Total execution time: ~1.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3/3 | ~72min | ~24min |

**Recent Trend:**
- Last 5 plans: 01-01 (~45min), 01-02 (~6min), 01-03 (~21min)
- Trend: Accelerating (scaffolded code from 01-01 reduced subsequent effort)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Streaming-first from day one -- no non-streaming throwaway code (from research)
- [Roadmap]: Wasmtime pooling allocator must be correct from first integration (from research pitfall)
- [Roadmap]: Evidence Collector is a separate Rust binary, not TypeScript (from research)
- [Roadmap]: ClickHouse batching (min 1000 rows, max 1 INSERT/sec) is a correctness requirement (from research pitfall)
- [Roadmap]: SAML handled at Control Plane TypeScript boundary, not Rust kernel (from research)
- [Roadmap]: gRPC push follows Envoy xDS pattern for policy distribution (from research)
- [01-02]: TowerToHyperService bridges tower::Service to hyper::Service for serve_connection_with_upgrades
- [01-02]: Phase 1 uses raw byte relay for ALL protocols; WebSocket frame-level relay deferred to Phase 3
- [01-02]: connect_tls for direct TLS connections in Phase 1; full HTTP/2 pooled SendRequest deferred
- [01-03]: ConnectionPool::new_with_roots added for test CA trust -- enables mock backends with CA-signed certs
- [01-03]: TestProxy spawns full server stack with per-test CA to ensure complete isolation
- [01-03]: MockBackend uses StreamBody + mpsc channel for SSE streaming (hyper 1.x removed Body::channel)
- [01-03]: CONNECT tunnel test client built with raw hyper HTTP/1.1 for full CONNECT+upgrade+TLS control
- [01-03]: Allowlist tests send CONNECT directly (not through tunnel) for faster 403 verification

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-26
Stopped at: Phase 1 COMPLETE -- all 3 plans delivered, all success criteria verified. Ready for Phase 2.
Resume file: None
