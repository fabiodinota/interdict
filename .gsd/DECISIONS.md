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
| D024 | rand_core 0.6 direct dep (not rand 0.9) for crates using ed25519-dalek | rand 0.9 exports rand_core 0.9 traits incompatible with ed25519-dalek 2.x (rand_core 0.6 CryptoRngCore) | 2026-03-12 |
| D025 | Workspace lints: clippy::all + suspicious at warn, unsafe_code warn | Codifies lint policy previously enforced only by CI -D warnings flag | 2026-03-12 |
| D026 | GSD auto.ts: clearPathCache() before each dispatch cycle | paths.ts caches directory listings but never invalidated — causes infinite research-slice loops when artifacts written by agent aren't visible to next cycle. Patch script at scripts/gsd-patch-clearPathCache.sh re-applies after GSD updates. Upstream: gsd-build/gsd-2#433. | 2026-03-15 |
| D027 | Root-level `//dependencies-notes` for package.json dep rationale | Bun resolves `//` keys inside `dependencies` as git package URLs, causing install failures. Root-level JSON objects starting with `//` are safely ignored. | 2026-03-15 |
| D028 | AtomicBool warn-once pattern for hot-path safety diagnostics | One-time `tracing::warn!` via `static AtomicBool` avoids log spam while making silent enforcement bypass visible. Placed inside CONNECT handler scope since only tunnel requests are affected. | 2026-03-15 |
| D029 | Conservative vitest coverage thresholds (60/50/55/60) below Codecov project target (70%) | Local thresholds should catch regression without false-blocking PRs during ratchet-up period. Codecov patch target (80%) remains the aspirational bar; local thresholds will be raised as coverage grows. | 2026-03-15 |
| D030 | CI coverage job hardened from advisory to blocking gate | With T01-T05 expanding coverage to 53 dashboard + 26 control-plane test files, the coverage job is no longer experimental. Failing coverage now blocks the pipeline to prevent regression. | 2026-03-15 |
