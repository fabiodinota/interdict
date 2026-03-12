# Decisions

<!-- Append-only register of architectural and pattern decisions -->

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D001 | Rust for Data Plane | Memory safety, zero-copy I/O, sub-ms latency | 2026-02-26 |
| D002 | Bun + Elysia for Control Plane API | TypeScript across full stack, Bun speed | 2026-02-26 |
| D003 | Next.js + React for dashboard | SSR-capable, enterprise ecosystem | 2026-02-26 |
| D004 | Postgres + ClickHouse split | Config vs audit log performance characteristics | 2026-02-26 |
| D005 | Wasmtime for policy execution | CNCF-backed, Rust-native, hot-reloadable | 2026-02-26 |
| D006 | Ed25519 for evidence signing | Fast, small signatures | 2026-02-26 |
| D007 | Streaming-first inspection | No throwaway code, avoid full-buffer | 2026-02-26 |
| D008 | Docker Compose + Helm chart | Both deployment patterns for pilots | 2026-03-02 |
| D009 | 3-layer policy pipeline | Deterministic first, escalate edge cases | 2026-02-27 |
| D010 | gRPC push for policy distribution | Real-time updates, no polling | 2026-03-01 |
| D011 | BFF proxy pattern for dashboard | httpOnly cookie auth, no client-side tokens | 2026-03-03 |
| D012 | SAML cross-origin callback redirect | Avoids cross-origin cookie loss | 2026-03-04 |
| D013 | ECDSA P-256 for internal CA | Broader TLS library compatibility than Ed25519 | 2026-03-03 |
| D014 | ArcSwap for signing key hot-reload | Lock-free atomic swaps, no restart needed | 2026-03-04 |
| D015 | KEP-753 native sidecar pattern | Kubernetes-native lifecycle management | 2026-03-03 |
| D016 | Evidence signature payload = protobuf-encoded bundle with 6 chain/sig fields zeroed | Canonical signed payload format | 2026-03-10 |
| D017 | Postgres single authoritative store for review items; kernel SQLite is local-only | One source of truth for review state | 2026-03-10 |
| D018 | OPA download isolated into multi-stage Dockerfile for air-gapped cache replacement | Air-gap compatibility | 2026-03-10 |
| D019 | Release builds require secure evidence transport (HTTPS + mTLS cert material) | Eliminate implicit trust in release mode | 2026-03-11 |
| D020 | Distribution mTLS server identity is explicit runtime config (tls_server_name) | Deployment-configurable, not hard-coded | 2026-03-11 |
| D021 | Seed/bootstrap operators receive principal + key-prefix metadata only; no plaintext credential reveal | Eliminates secret leak path | 2026-03-11 |
| D022 | Dashboard session cookies store exchanged opaque session tokens, not raw API keys | BFF cookie security | 2026-03-11 |
| D023 | Evidence verification uses two-step bundle fetch plus adjacent-day predecessor window | Avoids ClickHouse partition pruning breaks | 2026-03-11 |
